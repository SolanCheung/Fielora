use fielora_agent::{CommandCancellation, ToolExecutor, ToolRuntime};
use office_oxide::create::create_from_ir_to_writer;
use office_oxide::docx::write::DocxWriter;
use office_oxide::ir::{Image, ImageFormat, ImagePositioning};
use office_oxide::pptx::write::PptxWriter;
use office_oxide::xlsx::write::{CellData, CellStyle, NumberFormat, XlsxWriter};
use office_oxide::xlsx::{Cell, CellValue, XlsxDocument};
use office_oxide::{Document, DocumentFormat, DocumentIR};
use quick_xml::events::{BytesStart, Event as XmlEvent};
use quick_xml::{Reader as XmlReader, XmlVersion};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{Cursor, Error, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use zip::ZipArchive;

const PNG_WIDTH: u32 = 32;
const PNG_HEIGHT: u32 = 24;
const PNG_SHA256: &str = "168d44cf7d4439c70e924e5bd4c0a49e8be9afeff76732f28a265ea7da318c10";
const PNG_FIXTURE: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 32, 0, 0, 0, 24, 8, 6,
    0, 0, 0, 155, 83, 255, 52, 0, 0, 0, 76, 73, 68, 65, 84, 120, 218, 237, 208, 49, 17, 0, 64, 8,
    3, 65, 228, 68, 9, 53, 74, 80, 247, 114, 240, 146, 31, 44, 144, 54, 213, 149, 55, 179, 129, 46,
    162, 31, 175, 157, 46, 142, 208, 80, 230, 16, 231, 219, 176, 128, 5, 44, 96, 1, 11, 32, 139,
    200, 199, 107, 39, 139, 35, 52, 148, 57, 196, 249, 214, 2, 22, 176, 128, 5, 44, 240, 1, 229,
    70, 23, 106, 123, 142, 143, 121, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];
const DOCX_IMAGE_WIDTH_EMU: u64 = 1_219_200;
const DOCX_IMAGE_HEIGHT_EMU: u64 = 914_400;
const PPTX_IMAGE_X_EMU: i64 = 1_000_000;
const PPTX_IMAGE_Y_EMU: i64 = 1_500_000;
const PPTX_IMAGE_WIDTH_EMU: u64 = 3_200_000;
const PPTX_IMAGE_HEIGHT_EMU: u64 = 2_400_000;
const MAX_PROBE_IMAGE_AXIS_EMU: u64 = 12_192_000;
const IMAGE_REL_TYPE: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

#[derive(Debug, Clone, PartialEq, Eq)]
struct RelationshipFact {
    id: String,
    rel_type: String,
    target: String,
    target_mode: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PptxPictureFact {
    relationship_id: String,
    x: i64,
    y: i64,
    width: u64,
    height: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MediaProbeFacts {
    media_paths: Vec<String>,
    relationship_targets: Vec<String>,
    media_sha256: Vec<String>,
    content_type: String,
}

fn fixture_sha256() -> String {
    format!("{:x}", Sha256::digest(PNG_FIXTURE))
}

fn package_entries(bytes: &[u8]) -> BTreeMap<String, Vec<u8>> {
    assert!(
        bytes.len() <= 16 * 1024 * 1024,
        "Office probe package exceeded bound"
    );
    let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("valid Office ZIP package");
    assert!(
        archive.len() <= 256,
        "Office probe package has too many entries"
    );
    let mut entries = BTreeMap::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).expect("read Office package entry");
        let name = entry.name().replace('\\', "/");
        if entry.is_dir() {
            continue;
        }
        assert!(
            !name.starts_with('/')
                && !name.contains(':')
                && name
                    .split('/')
                    .all(|segment| !segment.is_empty() && segment != "." && segment != ".."),
            "unsafe OPC part name: {name}"
        );
        let mut data = Vec::new();
        entry
            .read_to_end(&mut data)
            .expect("read Office package bytes");
        assert!(
            entries.insert(name.clone(), data).is_none(),
            "duplicate OPC part: {name}"
        );
    }
    entries
}

fn xml_attribute(
    reader: &XmlReader<&[u8]>,
    element: &BytesStart<'_>,
    key: &[u8],
) -> Option<String> {
    for value in element.attributes().with_checks(true) {
        let value = value.expect("well-formed XML attribute");
        if value.key.local_name().as_ref() == key {
            return Some(
                value
                    .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
                    .expect("decoded XML attribute")
                    .into_owned(),
            );
        }
    }
    None
}

fn parse_relationships(bytes: &[u8]) -> Vec<RelationshipFact> {
    let mut reader = XmlReader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut relationships = Vec::new();
    let mut ids = BTreeSet::new();
    loop {
        match reader.read_event().expect("well-formed relationships XML") {
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if element.local_name().as_ref() == b"Relationship" =>
            {
                let id = xml_attribute(&reader, &element, b"Id").expect("relationship id");
                assert!(ids.insert(id.clone()), "duplicate relationship id");
                relationships.push(RelationshipFact {
                    id,
                    rel_type: xml_attribute(&reader, &element, b"Type").expect("relationship type"),
                    target: xml_attribute(&reader, &element, b"Target")
                        .expect("relationship target"),
                    target_mode: xml_attribute(&reader, &element, b"TargetMode"),
                });
            }
            XmlEvent::DocType(_) | XmlEvent::PI(_) | XmlEvent::CData(_) => {
                panic!("active or ambiguous relationship XML")
            }
            XmlEvent::Eof => break,
            _ => {}
        }
    }
    relationships
}

fn source_part_for_relationships(path: &str) -> String {
    if path == "_rels/.rels" {
        return String::new();
    }
    let (directory, filename) = path
        .split_once("/_rels/")
        .expect("canonical relationship part path");
    let filename = filename
        .strip_suffix(".rels")
        .expect("relationship part suffix");
    format!("{directory}/{filename}")
}

fn try_resolve_opc_target(source_part: &str, target: &str) -> Result<String, String> {
    let folded = target.to_ascii_lowercase();
    if target.is_empty()
        || target.starts_with('/')
        || target.starts_with('\\')
        || target.contains('\\')
        || target.contains(':')
        || folded.starts_with("http://")
        || folded.starts_with("https://")
        || folded.starts_with("file://")
    {
        return Err(format!(
            "external or absolute OPC relationship target: {target}"
        ));
    }
    let mut segments = source_part
        .rsplit_once('/')
        .map(|(directory, _)| directory.split('/').collect::<Vec<_>>())
        .unwrap_or_default();
    for segment in target.split('/') {
        match segment {
            "" | "." => {
                return Err(format!("non-canonical OPC relationship target: {target}"));
            }
            ".." => {
                if segments.pop().is_none() {
                    return Err("OPC relationship escaped package root".into());
                }
            }
            value => segments.push(value),
        }
    }
    Ok(segments.join("/"))
}

fn resolve_opc_target(source_part: &str, target: &str) -> String {
    try_resolve_opc_target(source_part, target).expect("safe internal OPC relationship target")
}

fn validate_all_relationships_internal(entries: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    for (path, bytes) in entries.iter().filter(|(path, _)| path.ends_with(".rels")) {
        let source = source_part_for_relationships(path);
        for relationship in parse_relationships(bytes) {
            if !relationship
                .target_mode
                .as_deref()
                .is_none_or(|mode| mode.eq_ignore_ascii_case("internal"))
            {
                return Err(format!("external relationship in {path}"));
            }
            let resolved = try_resolve_opc_target(&source, &relationship.target)?;
            if !entries.contains_key(&resolved) {
                return Err(format!("missing relationship target {resolved}"));
            }
        }
    }
    Ok(())
}

fn assert_png_content_type(content_types: &[u8], media_paths: &[String]) {
    let mut reader = XmlReader::from_reader(content_types);
    reader.config_mut().trim_text(true);
    let mut defaults = BTreeMap::new();
    let mut overrides = BTreeMap::new();
    loop {
        match reader.read_event().expect("well-formed content-types XML") {
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if element.local_name().as_ref() == b"Default" =>
            {
                defaults.insert(
                    xml_attribute(&reader, &element, b"Extension")
                        .expect("default content-type extension")
                        .to_ascii_lowercase(),
                    xml_attribute(&reader, &element, b"ContentType").expect("default content type"),
                );
            }
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if element.local_name().as_ref() == b"Override" =>
            {
                overrides.insert(
                    xml_attribute(&reader, &element, b"PartName")
                        .expect("override part name")
                        .trim_start_matches('/')
                        .to_owned(),
                    xml_attribute(&reader, &element, b"ContentType")
                        .expect("override content type"),
                );
            }
            XmlEvent::DocType(_) | XmlEvent::PI(_) | XmlEvent::CData(_) => {
                panic!("active or ambiguous content-types XML")
            }
            XmlEvent::Eof => break,
            _ => {}
        }
    }
    for media_path in media_paths {
        let extension = media_path.rsplit_once('.').expect("media extension").1;
        let content_type = overrides
            .get(media_path)
            .or_else(|| defaults.get(extension))
            .expect("media content type");
        assert_eq!(content_type, "image/png");
    }
}

fn parse_docx_drawing_facts(bytes: &[u8]) -> (Vec<String>, Vec<(u64, u64)>) {
    let mut reader = XmlReader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut relationship_ids = Vec::new();
    let mut extents = Vec::new();
    loop {
        match reader.read_event().expect("well-formed DOCX document XML") {
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if element.local_name().as_ref() == b"blip" =>
            {
                relationship_ids.push(
                    xml_attribute(&reader, &element, b"embed")
                        .expect("DOCX drawing relationship id"),
                );
            }
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if element.local_name().as_ref() == b"extent" =>
            {
                let width = xml_attribute(&reader, &element, b"cx")
                    .expect("DOCX image width")
                    .parse::<u64>()
                    .expect("bounded DOCX image width");
                let height = xml_attribute(&reader, &element, b"cy")
                    .expect("DOCX image height")
                    .parse::<u64>()
                    .expect("bounded DOCX image height");
                extents.push((width, height));
            }
            XmlEvent::DocType(_) | XmlEvent::PI(_) | XmlEvent::CData(_) => {
                panic!("active or ambiguous DOCX document XML")
            }
            XmlEvent::Eof => break,
            _ => {}
        }
    }
    (relationship_ids, extents)
}

fn parse_pptx_picture_facts(bytes: &[u8]) -> Vec<PptxPictureFact> {
    #[derive(Default)]
    struct PendingPicture {
        relationship_id: Option<String>,
        x: Option<i64>,
        y: Option<i64>,
        width: Option<u64>,
        height: Option<u64>,
    }

    let mut reader = XmlReader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut current: Option<PendingPicture> = None;
    let mut pictures = Vec::new();
    loop {
        match reader.read_event().expect("well-formed PPTX slide XML") {
            XmlEvent::Start(element) if element.local_name().as_ref() == b"pic" => {
                assert!(current.replace(PendingPicture::default()).is_none());
            }
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if current.is_some() && element.local_name().as_ref() == b"blip" =>
            {
                current.as_mut().expect("picture").relationship_id =
                    xml_attribute(&reader, &element, b"embed");
            }
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if current.is_some() && element.local_name().as_ref() == b"off" =>
            {
                let pending = current.as_mut().expect("picture");
                pending.x = Some(
                    xml_attribute(&reader, &element, b"x")
                        .expect("PPTX image x")
                        .parse()
                        .expect("bounded PPTX image x"),
                );
                pending.y = Some(
                    xml_attribute(&reader, &element, b"y")
                        .expect("PPTX image y")
                        .parse()
                        .expect("bounded PPTX image y"),
                );
            }
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if current.is_some() && element.local_name().as_ref() == b"ext" =>
            {
                let pending = current.as_mut().expect("picture");
                pending.width = Some(
                    xml_attribute(&reader, &element, b"cx")
                        .expect("PPTX image width")
                        .parse()
                        .expect("bounded PPTX image width"),
                );
                pending.height = Some(
                    xml_attribute(&reader, &element, b"cy")
                        .expect("PPTX image height")
                        .parse()
                        .expect("bounded PPTX image height"),
                );
            }
            XmlEvent::End(element) if element.local_name().as_ref() == b"pic" => {
                let pending = current.take().expect("open picture");
                pictures.push(PptxPictureFact {
                    relationship_id: pending.relationship_id.expect("PPTX image relationship"),
                    x: pending.x.expect("PPTX image x"),
                    y: pending.y.expect("PPTX image y"),
                    width: pending.width.expect("PPTX image width"),
                    height: pending.height.expect("PPTX image height"),
                });
            }
            XmlEvent::DocType(_) | XmlEvent::PI(_) | XmlEvent::CData(_) => {
                panic!("active or ambiguous PPTX slide XML")
            }
            XmlEvent::Eof => break,
            _ => {}
        }
    }
    assert!(current.is_none(), "unterminated PPTX picture");
    pictures
}

fn trusted_fixture_image_with(
    data: Option<&[u8]>,
    width_emu: u64,
    height_emu: u64,
) -> Result<Image, &'static str> {
    let data = data.ok_or("missing test-owned PNG probe bytes")?;
    if data.is_empty()
        || format!("{:x}", Sha256::digest(data)) != PNG_SHA256
        || width_emu == 0
        || height_emu == 0
        || width_emu > MAX_PROBE_IMAGE_AXIS_EMU
        || height_emu > MAX_PROBE_IMAGE_AXIS_EMU
    {
        return Err("invalid test-owned PNG probe input");
    }
    Ok(Image {
        alt_text: Some("Fielora deterministic 32 by 24 PNG probe".into()),
        data: Some(data.to_vec()),
        format: Some(ImageFormat::Png),
        display_width_emu: Some(width_emu),
        display_height_emu: Some(height_emu),
        pixel_width: Some(PNG_WIDTH),
        pixel_height: Some(PNG_HEIGHT),
        decorative: false,
        positioning: ImagePositioning::Inline,
    })
}

fn trusted_fixture_image(width_emu: u64, height_emu: u64) -> Result<Image, &'static str> {
    trusted_fixture_image_with(Some(PNG_FIXTURE), width_emu, height_emu)
}

fn docx_png_bytes(image_count: usize) -> Vec<u8> {
    assert!((1..=2).contains(&image_count));
    let mut writer = DocxWriter::new();
    writer
        .add_heading("Office PNG Media Reality", 1)
        .add_paragraph("Text before the deterministic PNG fixture.");
    for _ in 0..image_count {
        writer.add_ir_image(
            &trusted_fixture_image(DOCX_IMAGE_WIDTH_EMU, DOCX_IMAGE_HEIGHT_EMU)
                .expect("trusted fixture input"),
        );
    }
    writer.add_paragraph("Text after the deterministic PNG fixture.");
    let mut output = Cursor::new(Vec::new());
    writer.write_to(&mut output).expect("render DOCX with PNG");
    output.into_inner()
}

fn pptx_png_bytes() -> Vec<u8> {
    let mut writer = PptxWriter::new();
    let slide = writer.add_slide();
    slide.set_title("Office PNG Media Reality").add_image(
        PNG_FIXTURE.to_vec(),
        ImageFormat::Png,
        PPTX_IMAGE_X_EMU,
        PPTX_IMAGE_Y_EMU,
        PPTX_IMAGE_WIDTH_EMU,
        PPTX_IMAGE_HEIGHT_EMU,
    );
    let mut output = Cursor::new(Vec::new());
    writer.write_to(&mut output).expect("render PPTX with PNG");
    output.into_inner()
}

fn assert_docx_png_package(bytes: &[u8], expected_images: usize) -> MediaProbeFacts {
    let entries = package_entries(bytes);
    validate_all_relationships_internal(&entries)
        .expect("DOCX relationships remain package-internal");
    let media_paths = entries
        .keys()
        .filter(|path| path.starts_with("word/media/"))
        .cloned()
        .collect::<Vec<_>>();
    assert_eq!(media_paths.len(), expected_images);
    assert!(media_paths.iter().all(|path| path.ends_with(".png")));
    assert_png_content_type(
        entries
            .get("[Content_Types].xml")
            .expect("DOCX content types"),
        &media_paths,
    );
    let relationships = parse_relationships(
        entries
            .get("word/_rels/document.xml.rels")
            .expect("DOCX document relationships"),
    );
    let image_relationships = relationships
        .iter()
        .filter(|relationship| relationship.rel_type == IMAGE_REL_TYPE)
        .collect::<Vec<_>>();
    assert_eq!(image_relationships.len(), expected_images);
    let relationship_targets = image_relationships
        .iter()
        .map(|relationship| resolve_opc_target("word/document.xml", &relationship.target))
        .collect::<Vec<_>>();
    assert_eq!(
        relationship_targets
            .iter()
            .cloned()
            .collect::<BTreeSet<_>>()
            .len(),
        expected_images
    );
    assert!(
        relationship_targets
            .iter()
            .all(|target| media_paths.contains(target))
    );
    let (drawing_relationship_ids, extents) =
        parse_docx_drawing_facts(entries.get("word/document.xml").expect("DOCX document XML"));
    assert_eq!(drawing_relationship_ids.len(), expected_images);
    assert_eq!(
        extents,
        vec![(DOCX_IMAGE_WIDTH_EMU, DOCX_IMAGE_HEIGHT_EMU); expected_images]
    );
    assert_eq!(
        drawing_relationship_ids
            .into_iter()
            .collect::<BTreeSet<_>>(),
        image_relationships
            .iter()
            .map(|relationship| relationship.id.clone())
            .collect::<BTreeSet<_>>()
    );
    let media_sha256 = media_paths
        .iter()
        .map(|path| {
            let media = entries.get(path).expect("DOCX PNG media bytes");
            assert_eq!(media.as_slice(), PNG_FIXTURE);
            format!("{:x}", Sha256::digest(media))
        })
        .collect::<Vec<_>>();
    assert!(media_sha256.iter().all(|digest| digest == PNG_SHA256));
    let reopened = Document::from_reader(Cursor::new(bytes.to_vec()), DocumentFormat::Docx)
        .expect("independently reopen DOCX with PNG");
    let text = reopened.plain_text();
    assert!(text.contains("Office PNG Media Reality"));
    assert!(text.contains("Text before the deterministic PNG fixture."));
    assert!(text.contains("Text after the deterministic PNG fixture."));
    MediaProbeFacts {
        media_paths,
        relationship_targets,
        media_sha256,
        content_type: "image/png".into(),
    }
}

fn assert_pptx_png_package(bytes: &[u8]) -> MediaProbeFacts {
    let entries = package_entries(bytes);
    validate_all_relationships_internal(&entries)
        .expect("PPTX relationships remain package-internal");
    let media_paths = entries
        .keys()
        .filter(|path| path.starts_with("ppt/media/"))
        .cloned()
        .collect::<Vec<_>>();
    assert_eq!(media_paths.len(), 1);
    assert!(media_paths[0].ends_with(".png"));
    assert_png_content_type(
        entries
            .get("[Content_Types].xml")
            .expect("PPTX content types"),
        &media_paths,
    );
    let relationships = parse_relationships(
        entries
            .get("ppt/slides/_rels/slide1.xml.rels")
            .expect("PPTX slide relationships"),
    );
    let image_relationships = relationships
        .iter()
        .filter(|relationship| relationship.rel_type == IMAGE_REL_TYPE)
        .collect::<Vec<_>>();
    assert_eq!(image_relationships.len(), 1);
    let relationship_targets = image_relationships
        .iter()
        .map(|relationship| resolve_opc_target("ppt/slides/slide1.xml", &relationship.target))
        .collect::<Vec<_>>();
    assert_eq!(relationship_targets, media_paths);
    let pictures = parse_pptx_picture_facts(
        entries
            .get("ppt/slides/slide1.xml")
            .expect("PPTX slide XML"),
    );
    assert_eq!(
        pictures,
        vec![PptxPictureFact {
            relationship_id: image_relationships[0].id.clone(),
            x: PPTX_IMAGE_X_EMU,
            y: PPTX_IMAGE_Y_EMU,
            width: PPTX_IMAGE_WIDTH_EMU,
            height: PPTX_IMAGE_HEIGHT_EMU,
        }]
    );
    let media_sha256 = media_paths
        .iter()
        .map(|path| {
            let media = entries.get(path).expect("PPTX PNG media bytes");
            assert_eq!(media.as_slice(), PNG_FIXTURE);
            format!("{:x}", Sha256::digest(media))
        })
        .collect::<Vec<_>>();
    assert_eq!(media_sha256, vec![PNG_SHA256.to_owned()]);
    let reopened = Document::from_reader(Cursor::new(bytes.to_vec()), DocumentFormat::Pptx)
        .expect("independently reopen PPTX with PNG");
    assert!(reopened.plain_text().contains("Office PNG Media Reality"));
    MediaProbeFacts {
        media_paths,
        relationship_targets,
        media_sha256,
        content_type: "image/png".into(),
    }
}

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
fn docx_png_media_is_deterministic_exact_internal_and_text_safe() {
    assert_eq!(PNG_FIXTURE.len(), 133);
    assert_eq!(fixture_sha256(), PNG_SHA256);

    let first = docx_png_bytes(1);
    let second = docx_png_bytes(1);
    assert_eq!(
        first, second,
        "DOCX PNG writer output must be deterministic"
    );
    let facts = assert_docx_png_package(&first, 1);
    assert_eq!(facts.media_paths, vec!["word/media/image1.png"]);
    assert_eq!(facts.relationship_targets, facts.media_paths);
    assert_eq!(facts.media_sha256, vec![PNG_SHA256.to_owned()]);
    assert_eq!(facts.content_type, "image/png");

    let two_first = docx_png_bytes(2);
    let two_second = docx_png_bytes(2);
    assert_eq!(
        two_first, two_second,
        "DOCX repeated PNG writer output must be deterministic"
    );
    let two_facts = assert_docx_png_package(&two_first, 2);
    assert_eq!(
        two_facts.media_paths,
        vec!["word/media/image1.png", "word/media/image2.png"]
    );
    assert_eq!(two_facts.relationship_targets, two_facts.media_paths);
    assert_eq!(
        two_facts.media_sha256,
        vec![PNG_SHA256.to_owned(), PNG_SHA256.to_owned()]
    );
}

#[test]
fn pptx_png_media_is_structurally_deterministic_exact_internal_and_bounded() {
    let first = pptx_png_bytes();
    let second = pptx_png_bytes();
    let first_entries = package_entries(&first);
    let second_entries = package_entries(&second);
    let differing_parts = first_entries
        .iter()
        .filter_map(|(path, bytes)| {
            (second_entries.get(path) != Some(bytes)).then_some(path.as_str())
        })
        .collect::<Vec<_>>();
    assert_eq!(
        differing_parts,
        Vec::<&str>::new(),
        "PPTX PNG writer parts must be deterministic"
    );
    // office_oxide stores part relationship builders in a HashMap, so ZIP
    // entry ordering (and therefore whole-package byte identity) is not part
    // of this dependency-level guarantee. Exact decompressed parts and all
    // parsed structural facts are the deterministic boundary proved here.
    let facts = assert_pptx_png_package(&first);
    assert_eq!(facts.media_paths, vec!["ppt/media/image1.png"]);
    assert_eq!(facts.relationship_targets, facts.media_paths);
    assert_eq!(facts.media_sha256, vec![PNG_SHA256.to_owned()]);
    assert_eq!(facts.content_type, "image/png");
}

#[test]
fn png_probe_rejects_missing_corrupt_zero_or_oversized_fixture_intent_before_write() {
    assert!(trusted_fixture_image_with(None, 1, 1).is_err());
    assert!(trusted_fixture_image_with(Some(b"not PNG"), 1, 1).is_err());
    assert!(trusted_fixture_image_with(Some(PNG_FIXTURE), 0, DOCX_IMAGE_HEIGHT_EMU).is_err());
    assert!(trusted_fixture_image_with(Some(PNG_FIXTURE), DOCX_IMAGE_WIDTH_EMU, 0).is_err());
    assert!(
        trusted_fixture_image_with(
            Some(PNG_FIXTURE),
            MAX_PROBE_IMAGE_AXIS_EMU + 1,
            DOCX_IMAGE_HEIGHT_EMU,
        )
        .is_err()
    );

    // The dependency itself silently omits an IR image whose data is absent.
    // Record that exact reality so a future Fielora adapter cannot rely on the
    // writer for admission or error classification.
    let mut writer = DocxWriter::new();
    writer
        .add_heading("Missing media dependency behavior", 1)
        .add_ir_image(&Image {
            data: None,
            format: Some(ImageFormat::Png),
            display_width_emu: Some(DOCX_IMAGE_WIDTH_EMU),
            display_height_emu: Some(DOCX_IMAGE_HEIGHT_EMU),
            ..Image::default()
        });
    let mut output = Cursor::new(Vec::new());
    writer
        .write_to(&mut output)
        .expect("dependency writes a complete text-only DOCX");
    let bytes = output.into_inner();
    let entries = package_entries(&bytes);
    assert!(entries.keys().all(|path| !path.starts_with("word/media/")));
    let reopened = Document::from_reader(Cursor::new(bytes), DocumentFormat::Docx)
        .expect("missing image data does not leave a partial DOCX");
    assert!(
        reopened
            .plain_text()
            .contains("Missing media dependency behavior")
    );
}

#[test]
fn relationship_security_validator_rejects_external_absolute_unc_and_escape_targets() {
    assert_eq!(
        resolve_opc_target("word/document.xml", "media/image1.png"),
        "word/media/image1.png"
    );
    assert_eq!(
        resolve_opc_target("ppt/slides/slide1.xml", "../media/image1.png"),
        "ppt/media/image1.png"
    );

    for target in [
        "http://example.test/image.png",
        "https://example.test/image.png",
        "file:///C:/image.png",
        r"\\server\share\image.png",
        "/word/media/image.png",
        "C:/image.png",
        "../../image.png",
    ] {
        assert!(
            try_resolve_opc_target("word/document.xml", target).is_err(),
            "validator accepted unsafe relationship target: {target}"
        );
    }

    let external_relationship = br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
    Target="https://example.test/image.png"
    TargetMode="External"/>
</Relationships>"#;
    let entries = BTreeMap::from([("_rels/.rels".to_owned(), external_relationship.to_vec())]);
    assert!(
        validate_all_relationships_internal(&entries).is_err(),
        "validator accepted TargetMode=External"
    );
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
