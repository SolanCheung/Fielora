use fielora_agent::{CommandCancellation, ToolExecutor, ToolRuntime};
use office_oxide::create::create_from_ir_to_writer;
use office_oxide::docx::write::DocxWriter;
use office_oxide::pptx::write::PptxWriter;
use office_oxide::{Document, DocumentFormat, DocumentIR};
use serde_json::{Value, json};
use std::fs;
use std::io::{Cursor, Error, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use zip::ZipArchive;

fn probe_root() -> PathBuf {
    let root = std::env::temp_dir().join(format!("fielora-office-writer-probe-{}", Uuid::now_v7()));
    fs::create_dir_all(&root).expect("create probe root");
    root
}

fn extract(root: &Path, name: &str, bytes: &[u8]) -> Value {
    fs::write(root.join(name), bytes).expect("write probe package");
    let runtime = ToolRuntime::new(root, &root.join("tool-artifacts")).expect("tool runtime");
    let execution = runtime
        .execute(
            "file.extract",
            &json!({"path": name}),
            false,
            &CommandCancellation::default(),
        )
        .expect("file.extract roundtrip");
    serde_json::from_str(&execution.observation).expect("normalized extraction JSON")
}

fn assert_package_parts(bytes: &[u8], required: &[&str]) {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("valid ZIP package");
    for name in required {
        archive
            .by_name(name)
            .unwrap_or_else(|_| panic!("missing OOXML part {name}"));
    }
}

fn docx_bytes() -> Vec<u8> {
    let mut writer = DocxWriter::new();
    writer
        .add_heading("Artifact Writer Probe", 1)
        .add_heading("Document Section", 2)
        .add_paragraph("A bounded semantic paragraph.")
        .add_list(&["First bounded item", "Second bounded item"], false)
        .add_table(&[vec!["Metric", "Value"], vec!["Roundtrip", "Present"]]);
    let mut output = Cursor::new(Vec::new());
    writer.write_to(&mut output).expect("render DOCX");
    output.into_inner()
}

fn pptx_bytes() -> Vec<u8> {
    let mut writer = PptxWriter::new();
    writer.add_slide().set_title("Artifact Writer Probe");
    writer
        .add_slide()
        .set_title("Title and body")
        .add_text("A bounded semantic slide paragraph.")
        .add_bullet_list(&["First slide item", "Second slide item"]);
    writer
        .add_slide()
        .set_title("Two-column content")
        .add_text_box(
            "Left column: Metric",
            640_000,
            1_650_000,
            5_250_000,
            3_900_000,
        )
        .add_text_box(
            "Right column: Present",
            6_300_000,
            1_650_000,
            5_250_000,
            3_900_000,
        );
    let mut output = Cursor::new(Vec::new());
    writer.write_to(&mut output).expect("render PPTX");
    output.into_inner()
}

#[test]
fn docx_writer_probe_structural_and_semantic_roundtrip() {
    let root = probe_root();
    let first = docx_bytes();
    let second = docx_bytes();
    assert_package_parts(
        &first,
        &["[Content_Types].xml", "_rels/.rels", "word/document.xml"],
    );

    let path = root.join("probe.docx");
    fs::write(&path, &first).expect("write DOCX probe");
    let reopened = Document::open(&path).expect("office_oxide reopens DOCX");
    assert_eq!(reopened.format(), DocumentFormat::Docx);
    let plain_text = reopened.plain_text();
    for expected in [
        "Artifact Writer Probe",
        "Document Section",
        "A bounded semantic paragraph.",
        "First bounded item",
        "Metric",
        "Roundtrip",
        "Present",
    ] {
        assert!(plain_text.contains(expected), "missing {expected}");
    }

    let first_extract = extract(&root, "first.docx", &first);
    let second_extract = extract(&root, "second.docx", &second);
    assert_eq!(first_extract["content"]["format"], "DOCX");
    assert_eq!(
        first_extract["result_sha256"],
        second_extract["result_sha256"]
    );
    fs::remove_dir_all(root).expect("clean probe root");
}

#[test]
fn pptx_writer_probe_structural_and_semantic_roundtrip() {
    let root = probe_root();
    let first = pptx_bytes();
    let second = pptx_bytes();
    assert_package_parts(
        &first,
        &[
            "[Content_Types].xml",
            "_rels/.rels",
            "ppt/presentation.xml",
            "ppt/slides/slide1.xml",
            "ppt/slides/slide2.xml",
            "ppt/slides/slide3.xml",
        ],
    );

    let path = root.join("probe.pptx");
    fs::write(&path, &first).expect("write PPTX probe");
    let reopened = Document::open(&path).expect("office_oxide reopens PPTX");
    assert_eq!(reopened.format(), DocumentFormat::Pptx);
    let plain_text = reopened.plain_text();
    for expected in [
        "Artifact Writer Probe",
        "Title and body",
        "A bounded semantic slide paragraph.",
        "First slide item",
        "Two-column content",
        "Left column: Metric",
        "Right column: Present",
    ] {
        assert!(plain_text.contains(expected), "missing {expected}");
    }

    let first_extract = extract(&root, "first.pptx", &first);
    let second_extract = extract(&root, "second.pptx", &second);
    assert_eq!(first_extract["content"]["format"], "PPTX");
    assert_eq!(first_extract["content"]["metadata"]["slide_count"], 3);
    assert_eq!(
        first_extract["result_sha256"],
        second_extract["result_sha256"]
    );
    fs::remove_dir_all(root).expect("clean probe root");
}

#[test]
fn document_ir_creation_path_and_failure_are_bounded_before_final_write() {
    for format in [DocumentFormat::Docx, DocumentFormat::Pptx] {
        let ir = DocumentIR::from_markdown("# IR path probe\n\nBounded body.", format);
        let mut output = Cursor::new(Vec::new());
        create_from_ir_to_writer(&ir, format, &mut output).expect("create from IR");
        let reopened = Document::from_reader(Cursor::new(output.into_inner()), format)
            .expect("reopen IR output");
        assert_eq!(reopened.format(), format);
        assert!(reopened.plain_text().contains("IR path probe"));
    }

    let root = probe_root();
    let final_path = root.join("must-not-exist.docx");
    let ir = DocumentIR::from_markdown("# Forced writer failure", DocumentFormat::Docx);
    let error = create_from_ir_to_writer(
        &ir,
        DocumentFormat::Docx,
        FailAfter {
            cursor: Cursor::new(Vec::new()),
            remaining: 32,
        },
    )
    .expect_err("injected writer failure must propagate");
    assert!(!error.to_string().is_empty());
    assert!(!final_path.exists());
    fs::remove_dir_all(root).expect("clean probe root");
}

struct FailAfter {
    cursor: Cursor<Vec<u8>>,
    remaining: usize,
}

impl Write for FailAfter {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        if self.remaining == 0 {
            return Err(Error::other("injected writer failure"));
        }
        let admitted = buffer.len().min(self.remaining);
        self.remaining -= admitted;
        self.cursor.write(&buffer[..admitted])
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.cursor.flush()
    }
}

impl Seek for FailAfter {
    fn seek(&mut self, position: SeekFrom) -> std::io::Result<u64> {
        self.cursor.seek(position)
    }
}
