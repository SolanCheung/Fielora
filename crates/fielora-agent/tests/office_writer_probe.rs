use fielora_agent::{CommandCancellation, ToolExecutor, ToolRuntime};
use office_oxide::create::create_from_ir_to_writer;
use office_oxide::docx::write::DocxWriter;
use office_oxide::pptx::write::PptxWriter;
use office_oxide::xlsx::write::{CellData, CellStyle, NumberFormat, XlsxWriter};
use office_oxide::xlsx::{Cell, CellValue, XlsxDocument};
use office_oxide::{Document, DocumentFormat, DocumentIR};
use serde_json::{Value, json};
use std::fs;
use std::io::{Cursor, Error, Read, Seek, SeekFrom, Write};
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

fn xlsx_bytes() -> Vec<u8> {
    let mut writer = XlsxWriter::new();
    {
        let mut sheet = writer.add_sheet("Probe A");
        sheet.set_cell(0, 0, CellData::String("文本 safe".into()));
        sheet.set_cell_styled(
            1,
            2,
            CellData::Number(42.5),
            CellStyle::new().number_format(NumberFormat::Decimal2),
        );
        sheet.set_cell(3, 4, CellData::Boolean(true));
        sheet.set_cell(5, 6, CellData::String("=SUM(A1:A2)".into()));
    }
    {
        let mut sheet = writer.add_sheet("Probe B");
        sheet.set_cell(0, 0, CellData::String("Summary 中英".into()));
    }
    let mut output = Cursor::new(Vec::new());
    writer.write_to(&mut output).expect("render XLSX");
    output.into_inner()
}

fn xlsx_cell(document: &XlsxDocument, sheet: usize, row: u32, column: u32) -> &Cell {
    document.worksheets[sheet]
        .rows
        .iter()
        .flat_map(|row| &row.cells)
        .find(|cell| cell.reference.row == row && cell.reference.col == column)
        .unwrap_or_else(|| panic!("missing XLSX cell sheet={sheet} row={row} column={column}"))
}

fn assert_safe_xlsx_package(bytes: &[u8]) {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("valid XLSX ZIP package");
    let mut formula_count = 0usize;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).expect("read XLSX package entry");
        let name = entry.name().replace('\\', "/");
        let folded = name.to_ascii_lowercase();
        assert!(
            !folded.contains("vbaproject")
                && !folded.contains("externallinks")
                && !folded.contains("connections")
                && !folded.contains("querytables")
                && !folded.contains("embeddings")
                && !folded.contains("activex")
                && !folded.contains("drawings")
                && !folded.contains("media"),
            "unsafe or out-of-scope XLSX package part: {name}"
        );
        if folded.ends_with(".rels") || folded.ends_with(".xml") {
            let mut xml = String::new();
            entry.read_to_string(&mut xml).expect("read XLSX XML");
            assert!(
                !xml.contains("TargetMode=\"External\"") && !xml.contains("TargetMode='External'"),
                "external XLSX relationship in {name}"
            );
            if folded.starts_with("xl/worksheets/") {
                formula_count += xml.matches("<f>").count()
                    + xml.matches("<f ").count()
                    + xml.matches("<formula").count();
            }
        }
    }
    assert_eq!(formula_count, 0, "writer probe must contain zero formulas");
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
fn xlsx_writer_probe_multisheet_typed_literals_and_safe_reopen() {
    let root = probe_root();
    let first = xlsx_bytes();
    let second = xlsx_bytes();
    assert!(!first.is_empty());
    assert_package_parts(
        &first,
        &[
            "[Content_Types].xml",
            "_rels/.rels",
            "xl/workbook.xml",
            "xl/styles.xml",
            "xl/worksheets/sheet1.xml",
            "xl/worksheets/sheet2.xml",
        ],
    );
    assert_safe_xlsx_package(&first);
    assert_safe_xlsx_package(&second);

    let reopened =
        XlsxDocument::from_reader(Cursor::new(first.clone())).expect("office_oxide reopens XLSX");
    assert_eq!(reopened.worksheets.len(), 2);
    assert_eq!(reopened.worksheets[0].name, "Probe A");
    assert_eq!(reopened.worksheets[1].name, "Probe B");
    assert!(reopened.chart_text.is_empty());
    assert!(reopened.embedded_fonts.is_empty());
    assert!(
        reopened
            .worksheets
            .iter()
            .all(|sheet| sheet.hyperlinks.is_empty()
                && sheet.merged_cells.is_empty()
                && sheet.images.is_empty()
                && sheet.text_shapes.is_empty())
    );

    assert!(matches!(
        &xlsx_cell(&reopened, 0, 0, 0).value,
        CellValue::String(value) if value == "文本 safe"
    ));
    assert!(matches!(
        xlsx_cell(&reopened, 0, 1, 2).value,
        CellValue::Number(value) if value == 42.5
    ));
    assert!(matches!(
        xlsx_cell(&reopened, 0, 3, 4).value,
        CellValue::Boolean(true)
    ));
    let formula_like = xlsx_cell(&reopened, 0, 5, 6);
    assert!(matches!(
        &formula_like.value,
        CellValue::String(value) if value == "=SUM(A1:A2)"
    ));
    assert!(formula_like.formula.is_none());
    assert!(matches!(
        &xlsx_cell(&reopened, 1, 0, 0).value,
        CellValue::String(value) if value == "Summary 中英"
    ));
    assert!(
        reopened
            .worksheets
            .iter()
            .flat_map(|sheet| &sheet.rows)
            .flat_map(|row| &row.cells)
            .all(|cell| cell.formula.is_none())
    );

    let first_extract = extract(&root, "first.xlsx", &first);
    let second_extract = extract(&root, "second.xlsx", &second);
    assert_eq!(first_extract["content"]["format"], "XLSX");
    assert_eq!(first_extract["content"]["metadata"]["sheet_count"], 2);
    assert_eq!(
        first_extract["result_sha256"],
        second_extract["result_sha256"]
    );
    eprintln!("XLSX_BYTE_IDENTICAL={}", first == second);
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
