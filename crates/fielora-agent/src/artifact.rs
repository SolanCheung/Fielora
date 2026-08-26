//! Request-scoped semantic Artifact export through the existing Tool backend.
//!
//! The types in this module are Fielora-owned and intentionally private to the
//! built-in Tool. `office_oxide` is an adapter detail, not an Agent contract.

use crate::{
    AgentError, CommandCancellation, ToolExecution, ToolRuntime, atomic_write, deny_sensitive,
    normalize_relative, relative_text, resolve_for_write, sha256,
};
use office_oxide::docx::write::DocxWriter;
use office_oxide::pptx::write::PptxWriter;
use office_oxide::{Document, DocumentFormat};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use std::fs;
use std::io::Cursor;
use std::path::Path;
use std::time::{Duration, Instant};
use uuid::Uuid;
use zip::ZipArchive;

const ARTIFACT_SCHEMA_VERSION: u16 = 1;
const ARTIFACT_REVISION: u16 = 1;
const RENDERER_VERSION: &str = "0.1.0+office_oxide.0.1.8";
const MAX_DEFINITION_BYTES: usize = 256 * 1024;
const MAX_TOTAL_TEXT_BYTES: usize = 128 * 1024;
const MAX_TEXT_ITEM_BYTES: usize = 16 * 1024;
const MAX_DOCUMENT_BLOCKS: usize = 256;
const MAX_LISTS: usize = 64;
const MAX_LIST_ITEMS_PER_LIST: usize = 64;
const MAX_TOTAL_LIST_ITEMS: usize = 1_024;
const MAX_TABLES: usize = 16;
const MAX_TABLE_ROWS: usize = 64;
const MAX_TABLE_COLUMNS: usize = 16;
const MAX_TABLE_CELLS: usize = 4_096;
const MAX_SLIDES: usize = 32;
const MAX_REGIONS_PER_SLIDE: usize = 3;
const MAX_BLOCKS_PER_REGION: usize = 16;
const MAX_ELEMENTS_PER_SLIDE: usize = 32;
const MAX_SLIDE_TEXT_BYTES: usize = 16 * 1024;
const MAX_OUTPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_TOOL_RESULT_BYTES: usize = 64 * 1024;
const EXPORT_DEADLINE: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ArtifactType {
    Document,
    Presentation,
}

impl ArtifactType {
    fn id(self) -> &'static str {
        match self {
            Self::Document => "DOCUMENT",
            Self::Presentation => "PRESENTATION",
        }
    }

    fn format(self) -> DocumentFormat {
        match self {
            Self::Document => DocumentFormat::Docx,
            Self::Presentation => DocumentFormat::Pptx,
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Document => "docx",
            Self::Presentation => "pptx",
        }
    }

    fn renderer_id(self) -> &'static str {
        match self {
            Self::Document => "fielora.office.docx",
            Self::Presentation => "fielora.office.pptx",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ExportArgs {
    #[serde(rename = "type")]
    artifact_type: ArtifactType,
    content: Value,
    output_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct DocumentArtifact {
    #[serde(default)]
    title: Option<String>,
    blocks: Vec<DocumentBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE", deny_unknown_fields)]
enum DocumentBlock {
    Heading { level: u8, text: String },
    Paragraph { text: String },
    BulletList { items: Vec<String> },
    Table { rows: Vec<Vec<String>> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PresentationArtifact {
    slides: Vec<PresentationSlide>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PresentationSlide {
    layout: PresentationLayout,
    title: String,
    #[serde(default)]
    regions: Vec<SlideRegion>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum PresentationLayout {
    Title,
    TitleAndBody,
    TwoColumn,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SlideRegion {
    slot: SlideSlot,
    blocks: Vec<PresentationBlock>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum SlideSlot {
    Body,
    Left,
    Right,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE", deny_unknown_fields)]
enum PresentationBlock {
    Paragraph { text: String },
    BulletList { items: Vec<String> },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "content", rename_all = "snake_case")]
enum ArtifactDefinition {
    Document(DocumentArtifact),
    Presentation(PresentationArtifact),
}

impl ArtifactDefinition {
    fn artifact_type(&self) -> ArtifactType {
        match self {
            Self::Document(_) => ArtifactType::Document,
            Self::Presentation(_) => ArtifactType::Presentation,
        }
    }

    fn semantic_count(&self) -> usize {
        match self {
            Self::Document(document) => document.blocks.len(),
            Self::Presentation(presentation) => presentation.slides.len(),
        }
    }

    fn expected_text(&self) -> Vec<&str> {
        let mut expected = Vec::new();
        match self {
            Self::Document(document) => {
                if let Some(title) = &document.title {
                    expected.push(title.as_str());
                }
                for block in &document.blocks {
                    match block {
                        DocumentBlock::Heading { text, .. } | DocumentBlock::Paragraph { text } => {
                            expected.push(text.as_str())
                        }
                        DocumentBlock::BulletList { items } => {
                            expected.extend(items.iter().map(String::as_str));
                        }
                        DocumentBlock::Table { rows } => {
                            expected.extend(
                                rows.iter()
                                    .flatten()
                                    .filter(|cell| !cell.is_empty())
                                    .map(String::as_str),
                            );
                        }
                    }
                }
            }
            Self::Presentation(presentation) => {
                for slide in &presentation.slides {
                    expected.push(slide.title.as_str());
                    for region in &slide.regions {
                        for block in &region.blocks {
                            match block {
                                PresentationBlock::Paragraph { text } => {
                                    expected.push(text.as_str())
                                }
                                PresentationBlock::BulletList { items } => {
                                    expected.extend(items.iter().map(String::as_str));
                                }
                            }
                        }
                    }
                }
            }
        }
        expected
    }
}

struct ExportGuard<'a> {
    cancellation: &'a CommandCancellation,
    started: Instant,
}

impl<'a> ExportGuard<'a> {
    fn new(cancellation: &'a CommandCancellation) -> Self {
        Self {
            cancellation,
            started: Instant::now(),
        }
    }

    fn check(&self) -> Result<(), AgentError> {
        if self.cancellation.is_cancelled() {
            return Err(AgentError::Cancelled);
        }
        if self.started.elapsed() > EXPORT_DEADLINE {
            return Err(AgentError::CommandTimeout);
        }
        Ok(())
    }
}

struct RenderedArtifact {
    bytes: Vec<u8>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ExportStage {
    Validated,
    Rendered,
    BeforeAtomicWrite,
}

pub(super) fn input_schema() -> Value {
    let document_block = json!({
        "oneOf":[
            {"type":"object","properties":{"kind":{"const":"HEADING"},"level":{"type":"integer","minimum":1,"maximum":3},"text":{"type":"string","minLength":1,"maxLength":16384}},"required":["kind","level","text"],"additionalProperties":false},
            {"type":"object","properties":{"kind":{"const":"PARAGRAPH"},"text":{"type":"string","minLength":1,"maxLength":16384}},"required":["kind","text"],"additionalProperties":false},
            {"type":"object","properties":{"kind":{"const":"BULLET_LIST"},"items":{"type":"array","minItems":1,"maxItems":64,"items":{"type":"string","minLength":1,"maxLength":16384}}},"required":["kind","items"],"additionalProperties":false},
            {"type":"object","properties":{"kind":{"const":"TABLE"},"rows":{"type":"array","minItems":1,"maxItems":64,"items":{"type":"array","minItems":1,"maxItems":16,"items":{"type":"string","maxLength":16384}}}},"required":["kind","rows"],"additionalProperties":false}
        ]
    });
    let presentation_block = json!({
        "oneOf":[
            {"type":"object","properties":{"kind":{"const":"PARAGRAPH"},"text":{"type":"string","minLength":1,"maxLength":16384}},"required":["kind","text"],"additionalProperties":false},
            {"type":"object","properties":{"kind":{"const":"BULLET_LIST"},"items":{"type":"array","minItems":1,"maxItems":64,"items":{"type":"string","minLength":1,"maxLength":16384}}},"required":["kind","items"],"additionalProperties":false}
        ]
    });
    let region = json!({
        "type":"object",
        "properties":{
            "slot":{"type":"string","enum":["BODY","LEFT","RIGHT"]},
            "blocks":{"type":"array","minItems":1,"maxItems":16,"items":presentation_block}
        },
        "required":["slot","blocks"],
        "additionalProperties":false
    });
    json!({
        "type":"object",
        "properties":{
            "type":{"type":"string","enum":["document","presentation"]},
            "content":{"oneOf":[
                {
                    "type":"object",
                    "properties":{
                        "title":{"type":"string","minLength":1,"maxLength":16384},
                        "blocks":{"type":"array","minItems":1,"maxItems":256,"items":document_block}
                    },
                    "required":["blocks"],
                    "additionalProperties":false
                },
                {
                    "type":"object",
                    "properties":{
                        "slides":{"type":"array","minItems":1,"maxItems":32,"items":{
                            "type":"object",
                            "properties":{
                                "layout":{"type":"string","enum":["TITLE","TITLE_AND_BODY","TWO_COLUMN"]},
                                "title":{"type":"string","minLength":1,"maxLength":16384},
                                "regions":{"type":"array","maxItems":3,"items":region}
                            },
                            "required":["layout","title"],
                            "additionalProperties":false
                        }}
                    },
                    "required":["slides"],
                    "additionalProperties":false
                }
            ]},
            "output_path":{"type":"string","minLength":1,"maxLength":4096}
        },
        "required":["type","content","output_path"],
        "additionalProperties":false
    })
}

pub(super) fn export(
    runtime: &ToolRuntime,
    arguments: &Value,
    cancellation: &CommandCancellation,
) -> Result<ToolExecution, AgentError> {
    export_with(runtime, arguments, cancellation, render, |_, _| {})
}

fn export_with<R, H>(
    runtime: &ToolRuntime,
    arguments: &Value,
    cancellation: &CommandCancellation,
    renderer: R,
    hook: H,
) -> Result<ToolExecution, AgentError>
where
    R: FnOnce(&ArtifactDefinition) -> Result<RenderedArtifact, AgentError>,
    H: Fn(ExportStage, &Path),
{
    let guard = ExportGuard::new(cancellation);
    guard.check()?;
    let encoded_arguments =
        serde_json::to_vec(arguments).map_err(|_| AgentError::ToolArgumentsInvalid)?;
    if encoded_arguments.len() > MAX_DEFINITION_BYTES {
        return Err(AgentError::ToolArgumentsInvalid);
    }
    let args: ExportArgs =
        serde_json::from_value(arguments.clone()).map_err(|_| AgentError::ToolArgumentsInvalid)?;
    validate_output_path(&args)?;
    let relative = normalize_relative(&args.output_path)?;
    deny_sensitive(&relative)?;
    let target = resolve_for_write(&runtime.root, &relative)?;
    if target.exists() {
        return Err(AgentError::FileChanged);
    }
    let definition = parse_definition(args.artifact_type, args.content)?;
    validate_definition(&definition)?;
    let definition_bytes = serde_json::to_vec(&json!({
        "schema_version": ARTIFACT_SCHEMA_VERSION,
        "artifact": definition,
    }))
    .map_err(|_| AgentError::ToolArgumentsInvalid)?;
    if definition_bytes.len() > MAX_DEFINITION_BYTES {
        return Err(AgentError::ToolArgumentsInvalid);
    }
    let definition_sha256 = sha256(&definition_bytes);
    hook(ExportStage::Validated, &target);
    guard.check()?;

    let rendered = renderer(&definition)?;
    hook(ExportStage::Rendered, &target);
    guard.check()?;
    if rendered.bytes.is_empty() || rendered.bytes.len() > MAX_OUTPUT_BYTES {
        return Err(AgentError::FileTooLarge);
    }
    validate_rendered(&definition, &rendered.bytes)?;
    guard.check()?;

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|_| AgentError::IoFailed)?;
    }
    let target = resolve_for_write(&runtime.root, &relative)?;
    if target.exists() {
        return Err(AgentError::FileChanged);
    }
    hook(ExportStage::BeforeAtomicWrite, &target);
    guard.check()?;
    atomic_write(&target, &rendered.bytes, true)?;

    let final_bytes = fs::read(&target).map_err(|_| AgentError::IoFailed)?;
    let final_check = if final_bytes.len() == rendered.bytes.len()
        && sha256(&final_bytes) == sha256(&rendered.bytes)
    {
        validate_rendered(&definition, &final_bytes)
    } else {
        Err(AgentError::IoFailed)
    };
    if let Err(error) = final_check {
        let _ = fs::remove_file(&target);
        return Err(error);
    }

    let artifact_type = definition.artifact_type();
    let output_sha256 = sha256(&final_bytes);
    let artifact_id = Uuid::now_v7().to_string();
    let semantic_count = definition.semantic_count();
    let receipt = json!({
        "kind":"ARTIFACT_EXPORTED",
        "artifact_id":artifact_id,
        "artifact_type":artifact_type.id(),
        "artifact_revision":ARTIFACT_REVISION,
        "artifact_definition_sha256":definition_sha256,
        "semantic_unit_count":semantic_count,
        "renderer_id":artifact_type.renderer_id(),
        "renderer_version":RENDERER_VERSION,
        "output_format":artifact_type.extension().to_ascii_uppercase(),
        "path":relative_text(&relative),
        "output_bytes":final_bytes.len(),
        "output_sha256":output_sha256,
        "structural_reopen":"STRUCTURAL_VALID",
        "roundtrip":"SEMANTIC_CONTENT_PRESENT",
    });
    let observation = serde_json::to_string(&json!({
        "artifact_id":artifact_id,
        "artifact_type":artifact_type.id(),
        "artifact_revision":ARTIFACT_REVISION,
        "path":relative_text(&relative),
        "output_bytes":final_bytes.len(),
        "output_sha256":output_sha256,
        "structural_reopen":"STRUCTURAL_VALID",
        "roundtrip":"SEMANTIC_CONTENT_PRESENT",
        "visual_compatibility":"NOT_VERIFIED",
    }))
    .map_err(|_| AgentError::IoFailed)?;
    if serde_json::to_vec(&receipt)
        .map_err(|_| AgentError::IoFailed)?
        .len()
        > MAX_TOOL_RESULT_BYTES
        || observation.len() > MAX_TOOL_RESULT_BYTES
    {
        let _ = fs::remove_file(&target);
        return Err(AgentError::IoFailed);
    }
    Ok(ToolExecution {
        receipt,
        observation,
    })
}

fn parse_definition(
    artifact_type: ArtifactType,
    content: Value,
) -> Result<ArtifactDefinition, AgentError> {
    match artifact_type {
        ArtifactType::Document => serde_json::from_value(content)
            .map(ArtifactDefinition::Document)
            .map_err(|_| AgentError::ToolArgumentsInvalid),
        ArtifactType::Presentation => serde_json::from_value(content)
            .map(ArtifactDefinition::Presentation)
            .map_err(|_| AgentError::ToolArgumentsInvalid),
    }
}

fn validate_output_path(args: &ExportArgs) -> Result<(), AgentError> {
    if args.output_path.len() > 4_096
        || args.output_path.contains("://")
        || Path::new(&args.output_path)
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
            != Some(args.artifact_type.extension())
    {
        return Err(AgentError::ToolArgumentsInvalid);
    }
    Ok(())
}

fn validate_definition(definition: &ArtifactDefinition) -> Result<(), AgentError> {
    let mut text_bytes = 0usize;
    let mut lists = 0usize;
    let mut list_items = 0usize;
    match definition {
        ArtifactDefinition::Document(document) => {
            if document.blocks.is_empty() || document.blocks.len() > MAX_DOCUMENT_BLOCKS {
                return Err(AgentError::ToolArgumentsInvalid);
            }
            if let Some(title) = &document.title {
                admit_text(title, &mut text_bytes)?;
            }
            let mut tables = 0usize;
            let mut cells = 0usize;
            for block in &document.blocks {
                match block {
                    DocumentBlock::Heading { level, text } => {
                        if !(1..=3).contains(level) {
                            return Err(AgentError::ToolArgumentsInvalid);
                        }
                        admit_text(text, &mut text_bytes)?;
                    }
                    DocumentBlock::Paragraph { text } => admit_text(text, &mut text_bytes)?,
                    DocumentBlock::BulletList { items } => {
                        admit_list(items, &mut lists, &mut list_items, &mut text_bytes)?;
                    }
                    DocumentBlock::Table { rows } => {
                        tables += 1;
                        if tables > MAX_TABLES || rows.is_empty() || rows.len() > MAX_TABLE_ROWS {
                            return Err(AgentError::ToolArgumentsInvalid);
                        }
                        let columns = rows.first().map_or(0, Vec::len);
                        if columns == 0
                            || columns > MAX_TABLE_COLUMNS
                            || rows.iter().any(|row| row.len() != columns)
                        {
                            return Err(AgentError::ToolArgumentsInvalid);
                        }
                        cells = cells
                            .checked_add(rows.len() * columns)
                            .ok_or(AgentError::ToolArgumentsInvalid)?;
                        if cells > MAX_TABLE_CELLS {
                            return Err(AgentError::ToolArgumentsInvalid);
                        }
                        for cell in rows.iter().flatten() {
                            admit_text_allow_empty(cell, &mut text_bytes)?;
                        }
                    }
                }
            }
        }
        ArtifactDefinition::Presentation(presentation) => {
            if presentation.slides.is_empty() || presentation.slides.len() > MAX_SLIDES {
                return Err(AgentError::ToolArgumentsInvalid);
            }
            for slide in &presentation.slides {
                let before_slide = text_bytes;
                admit_text(&slide.title, &mut text_bytes)?;
                if slide.regions.len() > MAX_REGIONS_PER_SLIDE {
                    return Err(AgentError::ToolArgumentsInvalid);
                }
                let slots = slide
                    .regions
                    .iter()
                    .map(|region| region.slot)
                    .collect::<HashSet<_>>();
                if slots.len() != slide.regions.len()
                    || match slide.layout {
                        PresentationLayout::Title => !slide.regions.is_empty(),
                        PresentationLayout::TitleAndBody => {
                            slots != HashSet::from([SlideSlot::Body])
                        }
                        PresentationLayout::TwoColumn => {
                            slots != HashSet::from([SlideSlot::Left, SlideSlot::Right])
                        }
                    }
                {
                    return Err(AgentError::ToolArgumentsInvalid);
                }
                let mut elements = 0usize;
                for region in &slide.regions {
                    if region.blocks.is_empty() || region.blocks.len() > MAX_BLOCKS_PER_REGION {
                        return Err(AgentError::ToolArgumentsInvalid);
                    }
                    elements += region.blocks.len();
                    if elements > MAX_ELEMENTS_PER_SLIDE {
                        return Err(AgentError::ToolArgumentsInvalid);
                    }
                    for block in &region.blocks {
                        match block {
                            PresentationBlock::Paragraph { text } => {
                                admit_text(text, &mut text_bytes)?;
                            }
                            PresentationBlock::BulletList { items } => {
                                admit_list(items, &mut lists, &mut list_items, &mut text_bytes)?;
                            }
                        }
                    }
                }
                if text_bytes - before_slide > MAX_SLIDE_TEXT_BYTES {
                    return Err(AgentError::ToolArgumentsInvalid);
                }
            }
        }
    }
    if text_bytes > MAX_TOTAL_TEXT_BYTES {
        return Err(AgentError::ToolArgumentsInvalid);
    }
    Ok(())
}

fn admit_text(text: &str, total: &mut usize) -> Result<(), AgentError> {
    if text.trim().is_empty() || text.contains('\0') {
        return Err(AgentError::ToolArgumentsInvalid);
    }
    admit_text_allow_empty(text, total)
}

fn admit_text_allow_empty(text: &str, total: &mut usize) -> Result<(), AgentError> {
    if text.contains('\0') || text.len() > MAX_TEXT_ITEM_BYTES {
        return Err(AgentError::ToolArgumentsInvalid);
    }
    *total = total
        .checked_add(text.len())
        .ok_or(AgentError::ToolArgumentsInvalid)?;
    if *total > MAX_TOTAL_TEXT_BYTES {
        return Err(AgentError::ToolArgumentsInvalid);
    }
    Ok(())
}

fn admit_list(
    items: &[String],
    lists: &mut usize,
    total_items: &mut usize,
    text_bytes: &mut usize,
) -> Result<(), AgentError> {
    *lists += 1;
    *total_items = total_items
        .checked_add(items.len())
        .ok_or(AgentError::ToolArgumentsInvalid)?;
    if *lists > MAX_LISTS
        || items.is_empty()
        || items.len() > MAX_LIST_ITEMS_PER_LIST
        || *total_items > MAX_TOTAL_LIST_ITEMS
    {
        return Err(AgentError::ToolArgumentsInvalid);
    }
    for item in items {
        admit_text(item, text_bytes)?;
    }
    Ok(())
}

fn render(definition: &ArtifactDefinition) -> Result<RenderedArtifact, AgentError> {
    let mut output = Cursor::new(Vec::new());
    match definition {
        ArtifactDefinition::Document(document) => {
            let mut writer = DocxWriter::new();
            if let Some(title) = &document.title {
                writer.add_heading(title, 1);
            }
            for block in &document.blocks {
                match block {
                    DocumentBlock::Heading { level, text } => {
                        writer.add_heading(text, *level);
                    }
                    DocumentBlock::Paragraph { text } => {
                        writer.add_paragraph(text);
                    }
                    DocumentBlock::BulletList { items } => {
                        let items = items.iter().map(String::as_str).collect::<Vec<_>>();
                        writer.add_list(&items, false);
                    }
                    DocumentBlock::Table { rows } => {
                        let rows = rows
                            .iter()
                            .map(|row| row.iter().map(String::as_str).collect::<Vec<_>>())
                            .collect::<Vec<_>>();
                        writer.add_table(&rows);
                    }
                }
            }
            writer
                .write_to(&mut output)
                .map_err(|_| AgentError::IoFailed)?;
        }
        ArtifactDefinition::Presentation(presentation) => {
            let mut writer = PptxWriter::new();
            for definition_slide in &presentation.slides {
                let slide = writer.add_slide();
                slide.set_title(&definition_slide.title);
                match definition_slide.layout {
                    PresentationLayout::Title => {}
                    PresentationLayout::TitleAndBody => {
                        render_body_region(slide, &definition_slide.regions[0]);
                    }
                    PresentationLayout::TwoColumn => {
                        let left = definition_slide
                            .regions
                            .iter()
                            .find(|region| region.slot == SlideSlot::Left)
                            .ok_or(AgentError::ToolArgumentsInvalid)?;
                        let right = definition_slide
                            .regions
                            .iter()
                            .find(|region| region.slot == SlideSlot::Right)
                            .ok_or(AgentError::ToolArgumentsInvalid)?;
                        slide
                            .add_text_box(
                                &region_text(left),
                                640_000,
                                1_650_000,
                                5_250_000,
                                3_900_000,
                            )
                            .add_text_box(
                                &region_text(right),
                                6_300_000,
                                1_650_000,
                                5_250_000,
                                3_900_000,
                            );
                    }
                }
            }
            writer
                .write_to(&mut output)
                .map_err(|_| AgentError::IoFailed)?;
        }
    }
    Ok(RenderedArtifact {
        bytes: output.into_inner(),
    })
}

fn render_body_region(slide: &mut office_oxide::pptx::write::SlideData, region: &SlideRegion) {
    for block in &region.blocks {
        match block {
            PresentationBlock::Paragraph { text } => {
                slide.add_text(text);
            }
            PresentationBlock::BulletList { items } => {
                let items = items.iter().map(String::as_str).collect::<Vec<_>>();
                slide.add_bullet_list(&items);
            }
        }
    }
}

fn region_text(region: &SlideRegion) -> String {
    let mut lines = Vec::new();
    for block in &region.blocks {
        match block {
            PresentationBlock::Paragraph { text } => lines.push(text.clone()),
            PresentationBlock::BulletList { items } => {
                lines.extend(items.iter().map(|item| format!("• {item}")));
            }
        }
    }
    lines.join("\n")
}

fn validate_rendered(definition: &ArtifactDefinition, bytes: &[u8]) -> Result<(), AgentError> {
    if !bytes.starts_with(b"PK\x03\x04") {
        return Err(AgentError::IoFailed);
    }
    let artifact_type = definition.artifact_type();
    let required = match artifact_type {
        ArtifactType::Document => vec!["[Content_Types].xml", "_rels/.rels", "word/document.xml"],
        ArtifactType::Presentation => vec![
            "[Content_Types].xml",
            "_rels/.rels",
            "ppt/presentation.xml",
            "ppt/slides/slide1.xml",
        ],
    };
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|_| AgentError::IoFailed)?;
    for name in required {
        archive.by_name(name).map_err(|_| AgentError::IoFailed)?;
    }
    drop(archive);
    let reopened = Document::from_reader(Cursor::new(bytes.to_vec()), artifact_type.format())
        .map_err(|_| AgentError::IoFailed)?;
    if reopened.format() != artifact_type.format() {
        return Err(AgentError::IoFailed);
    }
    let plain_text = reopened.plain_text();
    if definition
        .expected_text()
        .iter()
        .any(|expected| !plain_text.contains(expected))
    {
        return Err(AgentError::IoFailed);
    }
    if let ArtifactDefinition::Presentation(presentation) = definition
        && reopened.to_ir().sections.len() != presentation.slides.len()
    {
        return Err(AgentError::IoFailed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{PolicyEngine, ToolExecutor, coding_tool_catalog};
    use fielora_contracts::{AgentPermission, AgentPolicyDecision, AgentToolEffect};

    #[cfg(windows)]
    fn create_directory_link(link: &Path, target: &Path) {
        let status = std::process::Command::new("cmd.exe")
            .args(["/D", "/C", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .status()
            .unwrap();
        assert!(status.success());
    }

    #[cfg(unix)]
    fn create_directory_link(link: &Path, target: &Path) {
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    fn fixture_runtime() -> (std::path::PathBuf, ToolRuntime) {
        let root = std::env::temp_dir().join(format!("fielora-artifact-export-{}", Uuid::now_v7()));
        fs::create_dir_all(&root).unwrap();
        let runtime = ToolRuntime::new(&root, &root.join("tool-artifacts")).unwrap();
        (root, runtime)
    }

    fn document_args(path: &str) -> Value {
        json!({
            "type":"document",
            "output_path":path,
            "content":{
                "title":"Artifact Export",
                "blocks":[
                    {"kind":"HEADING","level":2,"text":"Document Section"},
                    {"kind":"PARAGRAPH","text":"A bounded semantic paragraph."},
                    {"kind":"BULLET_LIST","items":["First item","Second item"]},
                    {"kind":"TABLE","rows":[["Metric","Value"],["Roundtrip","Present"]]}
                ]
            }
        })
    }

    fn presentation_args(path: &str) -> Value {
        json!({
            "type":"presentation",
            "output_path":path,
            "content":{"slides":[
                {"layout":"TITLE","title":"Artifact Export","regions":[]},
                {"layout":"TITLE_AND_BODY","title":"Title and body","regions":[
                    {"slot":"BODY","blocks":[
                        {"kind":"PARAGRAPH","text":"A bounded slide paragraph."},
                        {"kind":"BULLET_LIST","items":["First slide item","Second slide item"]}
                    ]}
                ]},
                {"layout":"TWO_COLUMN","title":"Two columns","regions":[
                    {"slot":"LEFT","blocks":[{"kind":"PARAGRAPH","text":"Left content"}]},
                    {"slot":"RIGHT","blocks":[{"kind":"BULLET_LIST","items":["Right content"]}]}
                ]}
            ]}
        })
    }

    fn assert_no_temporary_files(root: &Path) {
        let mut pending = vec![root.to_path_buf()];
        while let Some(directory) = pending.pop() {
            for entry in fs::read_dir(directory).unwrap() {
                let entry = entry.unwrap();
                if entry.file_type().unwrap().is_dir() {
                    pending.push(entry.path());
                } else {
                    assert!(!entry.file_name().to_string_lossy().starts_with(".fielora-"));
                }
            }
        }
    }

    #[test]
    fn catalog_and_policy_reuse_workspace_write_boundary() {
        let tools = coding_tool_catalog();
        let matches = tools
            .iter()
            .filter(|tool| tool.definition.name == "artifact.export")
            .collect::<Vec<_>>();
        assert_eq!(matches.len(), 1);
        let spec = matches[0];
        assert_eq!(spec.effect, AgentToolEffect::WorkspaceWrite);
        let schema = spec.definition.input_schema.to_string();
        assert!(schema.contains("TITLE_AND_BODY"));
        assert!(schema.contains("TWO_COLUMN"));
        assert!(!schema.contains("\"x\""));
        assert!(!schema.contains("\"template\""));
        assert_eq!(
            PolicyEngine.decide(AgentPermission::ReadOnly, spec, &document_args("out.docx")),
            AgentPolicyDecision::Ask
        );
        assert_eq!(
            PolicyEngine.decide(
                AgentPermission::ReviewChanges,
                spec,
                &document_args("out.docx")
            ),
            AgentPolicyDecision::Allow
        );
    }

    #[test]
    fn document_and_presentation_export_roundtrip_through_file_extract() {
        let (root, runtime) = fixture_runtime();
        for (arguments, path, format, expected) in [
            (
                document_args("exports/report.docx"),
                "exports/report.docx",
                "DOCX",
                vec!["Document Section", "First item", "Roundtrip", "Present"],
            ),
            (
                presentation_args("exports/deck.pptx"),
                "exports/deck.pptx",
                "PPTX",
                vec![
                    "Title and body",
                    "First slide item",
                    "Left content",
                    "Right content",
                ],
            ),
        ] {
            let exported = runtime
                .execute(
                    "artifact.export",
                    &arguments,
                    false,
                    &CommandCancellation::default(),
                )
                .unwrap();
            assert_eq!(exported.receipt["kind"], "ARTIFACT_EXPORTED");
            assert_eq!(exported.receipt["structural_reopen"], "STRUCTURAL_VALID");
            assert_eq!(exported.receipt["roundtrip"], "SEMANTIC_CONTENT_PRESENT");
            assert!(exported.receipt.get("verification_eligible").is_none());
            let receipt_text = exported.receipt.to_string();
            assert!(!receipt_text.contains("First item"));
            assert!(!receipt_text.contains("Right content"));

            let extracted = runtime
                .execute(
                    "file.extract",
                    &json!({"path":path}),
                    false,
                    &CommandCancellation::default(),
                )
                .unwrap();
            assert_eq!(extracted.receipt["format"], format);
            for text in expected {
                assert!(extracted.observation.contains(text), "missing {text}");
            }
        }
        assert_no_temporary_files(&root);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn semantic_digest_is_stable_and_excludes_path_and_identity() {
        let (root, runtime) = fixture_runtime();
        let first = runtime
            .execute(
                "artifact.export",
                &document_args("first.docx"),
                false,
                &CommandCancellation::default(),
            )
            .unwrap();
        let second = runtime
            .execute(
                "artifact.export",
                &document_args("second.docx"),
                false,
                &CommandCancellation::default(),
            )
            .unwrap();
        assert_eq!(
            first.receipt["artifact_definition_sha256"],
            second.receipt["artifact_definition_sha256"]
        );
        assert_ne!(first.receipt["artifact_id"], second.receipt["artifact_id"]);
        assert_no_temporary_files(&root);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_definition_bounds_layout_and_paths_fail_closed() {
        let (root, runtime) = fixture_runtime();
        let cancellation = CommandCancellation::default();
        for invalid in [
            json!({"type":"spreadsheet","content":{},"output_path":"out.xlsx"}),
            json!({"type":"document","content":{"blocks":[]},"output_path":"out.docx"}),
            json!({"type":"document","content":{"blocks":[{"kind":"HEADING","level":4,"text":"No"}]},"output_path":"out.docx"}),
            json!({"type":"presentation","content":{"slides":[{"layout":"TITLE","title":"Title","regions":[{"slot":"BODY","blocks":[{"kind":"PARAGRAPH","text":"Illegal"}]}]}]},"output_path":"out.pptx"}),
            json!({"type":"presentation","content":{"slides":[{"layout":"CUSTOM","title":"Title","regions":[]}]},"output_path":"out.pptx"}),
            document_args("wrong.pptx"),
        ] {
            assert_eq!(
                runtime.execute("artifact.export", &invalid, false, &cancellation),
                Err(AgentError::ToolArgumentsInvalid)
            );
        }
        for invalid_path in ["../out.docx", "C:/out.docx", "https://example.com/out.docx"] {
            assert!(
                runtime
                    .execute(
                        "artifact.export",
                        &document_args(invalid_path),
                        false,
                        &cancellation
                    )
                    .is_err()
            );
        }
        let oversized_items = (0..=MAX_LIST_ITEMS_PER_LIST)
            .map(|index| format!("item {index}"))
            .collect::<Vec<_>>();
        let oversized = json!({
            "type":"document",
            "output_path":"oversized.docx",
            "content":{"blocks":[{"kind":"BULLET_LIST","items":oversized_items}]}
        });
        assert_eq!(
            runtime.execute("artifact.export", &oversized, false, &cancellation),
            Err(AgentError::ToolArgumentsInvalid)
        );
        let oversized_input = json!({
            "type":"document",
            "output_path":"oversized-input.docx",
            "content":{"blocks":[{"kind":"PARAGRAPH","text":"x".repeat(MAX_DEFINITION_BYTES)}]}
        });
        assert_eq!(
            runtime.execute("artifact.export", &oversized_input, false, &cancellation),
            Err(AgentError::ToolArgumentsInvalid)
        );
        let too_many_rows = (0..=MAX_TABLE_ROWS)
            .map(|index| vec![format!("row {index}")])
            .collect::<Vec<_>>();
        let oversized_table = json!({
            "type":"document",
            "output_path":"oversized-table.docx",
            "content":{"blocks":[{"kind":"TABLE","rows":too_many_rows}]}
        });
        assert_eq!(
            runtime.execute("artifact.export", &oversized_table, false, &cancellation),
            Err(AgentError::ToolArgumentsInvalid)
        );
        assert_eq!(
            runtime.execute(
                "artifact.export",
                &document_args(".env.docx"),
                false,
                &cancellation
            ),
            Err(AgentError::SensitivePathDenied)
        );
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn existing_destination_is_not_overwritten() {
        let (root, runtime) = fixture_runtime();
        fs::write(root.join("existing.docx"), b"user bytes").unwrap();
        assert_eq!(
            runtime.execute(
                "artifact.export",
                &document_args("existing.docx"),
                false,
                &CommandCancellation::default()
            ),
            Err(AgentError::FileChanged)
        );
        assert_eq!(fs::read(root.join("existing.docx")).unwrap(), b"user bytes");
        assert_no_temporary_files(&root);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn canonical_containment_rejects_directory_link_escape() {
        let (root, runtime) = fixture_runtime();
        let outside = std::env::temp_dir().join(format!(
            "fielora-artifact-export-outside-{}",
            Uuid::now_v7()
        ));
        fs::create_dir_all(&outside).unwrap();
        let link = root.join("escape");
        create_directory_link(&link, &outside);
        assert_eq!(
            runtime.execute(
                "artifact.export",
                &document_args("escape/out.docx"),
                false,
                &CommandCancellation::default()
            ),
            Err(AgentError::WorkspaceEscape)
        );
        assert!(!outside.join("out.docx").exists());
        fs::remove_dir(&link).unwrap();
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn renderer_structural_and_output_bound_failures_leave_no_output() {
        let (root, runtime) = fixture_runtime();
        let cancellation = CommandCancellation::default();
        let renderer_error = export_with(
            &runtime,
            &document_args("renderer-error.docx"),
            &cancellation,
            |_| Err(AgentError::IoFailed),
            |_, _| {},
        );
        assert_eq!(renderer_error, Err(AgentError::IoFailed));
        let malformed = export_with(
            &runtime,
            &document_args("malformed.docx"),
            &cancellation,
            |_| {
                Ok(RenderedArtifact {
                    bytes: b"not OOXML".to_vec(),
                })
            },
            |_, _| {},
        );
        assert_eq!(malformed, Err(AgentError::IoFailed));
        let oversized = export_with(
            &runtime,
            &document_args("too-large.docx"),
            &cancellation,
            |_| {
                Ok(RenderedArtifact {
                    bytes: vec![0; MAX_OUTPUT_BYTES + 1],
                })
            },
            |_, _| {},
        );
        assert_eq!(oversized, Err(AgentError::FileTooLarge));
        assert!(!root.join("renderer-error.docx").exists());
        assert!(!root.join("malformed.docx").exists());
        assert!(!root.join("too-large.docx").exists());
        assert_no_temporary_files(&root);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cancellation_boundaries_and_atomic_race_leave_no_partial_export() {
        let (root, runtime) = fixture_runtime();
        let before = CommandCancellation::default();
        before.cancel();
        assert_eq!(
            runtime.execute(
                "artifact.export",
                &document_args("before.docx"),
                false,
                &before
            ),
            Err(AgentError::Cancelled)
        );

        let during = CommandCancellation::default();
        let during_hook = during.clone();
        let cancelled = export_with(
            &runtime,
            &document_args("during.docx"),
            &during,
            render,
            move |stage, _| {
                if stage == ExportStage::Rendered {
                    during_hook.cancel();
                }
            },
        );
        assert_eq!(cancelled, Err(AgentError::Cancelled));

        let raced = export_with(
            &runtime,
            &document_args("race.docx"),
            &CommandCancellation::default(),
            render,
            |stage, target| {
                if stage == ExportStage::BeforeAtomicWrite {
                    fs::write(target, b"racing writer").unwrap();
                }
            },
        );
        assert_eq!(raced, Err(AgentError::FileChanged));
        assert_eq!(fs::read(root.join("race.docx")).unwrap(), b"racing writer");
        assert!(!root.join("before.docx").exists());
        assert!(!root.join("during.docx").exists());
        assert_no_temporary_files(&root);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn interrupted_export_is_fail_closed_manual_recovery() {
        let (root, runtime) = fixture_runtime();
        let reconciliation = runtime
            .reconcile_unknown(
                "artifact.export",
                AgentToolEffect::WorkspaceWrite,
                &document_args("unknown.docx"),
            )
            .unwrap();
        assert_eq!(
            reconciliation.status,
            crate::ToolReconciliationStatus::ManualReview
        );
        assert!(!root.join("unknown.docx").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
