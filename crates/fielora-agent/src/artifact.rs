//! Semantic Artifact validation and export through the existing Tool backend.
//!
//! Fielora-owned semantic DTOs live in `fielora-contracts`; `office_oxide`
//! remains a stateless renderer adapter detail, not persisted authority.

use crate::{
    AgentError, CommandCancellation, ToolExecution, ToolRuntime, atomic_write, deny_sensitive,
    normalize_relative, relative_text, resolve_for_write, sha256,
};
use fielora_contracts::{
    ArtifactContentV1, ArtifactReadView, ArtifactType as DurableArtifactType, DocumentArtifact,
    DocumentBlock, PresentationArtifact, PresentationBlock, PresentationLayout, PresentationSlide,
    SlideRegion, SlideSlot,
};
use office_oxide::docx::write::DocxWriter;
use office_oxide::pptx::write::{PptxWriter, Run, SlideData};
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
const DOCUMENT_RENDERER_VERSION: &str = "0.1.0+office_oxide.0.1.8";
const PRESENTATION_RENDERER_VERSION: &str = "0.2.0+office_oxide.0.1.8";
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

const EMU_PER_POINT: f64 = 12_700.0;
const PRESENTATION_WIDTH_EMU: i64 = 12_192_000;
const PRESENTATION_HEIGHT_EMU: i64 = 6_858_000;
const LATIN_FONT: &str = "Arial";
const CJK_FONT: &str = "Microsoft YaHei";
const PRIMARY_TEXT_COLOR: &str = "172033";
const SECONDARY_TEXT_COLOR: &str = "526273";
const ACCENT_TEXT_COLOR: &str = "315A80";

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

    fn renderer_version(self) -> &'static str {
        match self {
            Self::Document => DOCUMENT_RENDERER_VERSION,
            Self::Presentation => PRESENTATION_RENDERER_VERSION,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SlideRect {
    x: i64,
    y: i64,
    width: i64,
    height: i64,
}

impl SlideRect {
    fn right(self) -> i64 {
        self.x + self.width
    }

    fn bottom(self) -> i64 {
        self.y + self.height
    }

    fn contains(self, other: Self) -> bool {
        other.x >= self.x
            && other.y >= self.y
            && other.right() <= self.right()
            && other.bottom() <= self.bottom()
    }

    fn overlaps(self, other: Self) -> bool {
        self.x < other.right()
            && self.right() > other.x
            && self.y < other.bottom()
            && self.bottom() > other.y
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SlideMetrics {
    slide: SlideRect,
    margin_left: i64,
    margin_right: i64,
    margin_top: i64,
    margin_bottom: i64,
    cover_title: SlideRect,
    cover_subtitle: SlideRect,
    title: SlideRect,
    body: SlideRect,
    left: SlideRect,
    right: SlideRect,
    column_gap: i64,
    column_padding: i64,
}

impl SlideMetrics {
    fn widescreen() -> Self {
        let slide = SlideRect {
            x: 0,
            y: 0,
            width: PRESENTATION_WIDTH_EMU,
            height: PRESENTATION_HEIGHT_EMU,
        };
        let margin_left = 777_240;
        let margin_right = 777_240;
        let margin_top = 457_200;
        let margin_bottom = 618_000;
        let body = SlideRect {
            x: margin_left,
            y: 1_520_000,
            width: PRESENTATION_WIDTH_EMU - margin_left - margin_right,
            height: PRESENTATION_HEIGHT_EMU - 1_520_000 - margin_bottom,
        };
        let column_gap = 457_200;
        let column_padding = 95_250;
        let column_width = (body.width - column_padding * 2 - column_gap) / 2;
        Self {
            slide,
            margin_left,
            margin_right,
            margin_top,
            margin_bottom,
            cover_title: SlideRect {
                x: 1_097_280,
                y: 1_500_000,
                width: 9_997_440,
                height: 1_250_000,
            },
            cover_subtitle: SlideRect {
                x: 1_097_280,
                y: 3_050_000,
                width: 9_997_440,
                height: 1_450_000,
            },
            title: SlideRect {
                x: margin_left,
                y: margin_top,
                width: PRESENTATION_WIDTH_EMU - margin_left - margin_right,
                height: 850_000,
            },
            body,
            left: SlideRect {
                x: body.x + column_padding,
                y: body.y,
                width: column_width,
                height: body.height,
            },
            right: SlideRect {
                x: body.x + column_padding + column_width + column_gap,
                y: body.y,
                width: column_width,
                height: body.height,
            },
            column_gap,
            column_padding,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum ContentDensity {
    Low,
    Normal,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PresentationTextRole {
    CoverTitle,
    CoverSubtitle,
    SlideTitle,
    ColumnHeading,
    Body,
    BulletMarker,
    Bullet,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PresentationTextStyle {
    role: PresentationTextRole,
    font_size_pt: u16,
    bold: bool,
    color: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PlannedTextLine {
    text: String,
    rect: SlideRect,
    style: PresentationTextStyle,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SlideLayoutPlan {
    layout: PresentationLayout,
    density: ContentDensity,
    lines: Vec<PlannedTextLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ExportArgs {
    #[serde(rename = "type")]
    artifact_type: ArtifactType,
    content: Value,
    output_path: String,
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

fn legacy_input_schema() -> Value {
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

pub fn input_schema() -> Value {
    json!({
        "oneOf":[
            legacy_input_schema(),
            {
                "type":"object",
                "properties":{
                    "artifact_id":{"type":"string","minLength":1,"maxLength":128},
                    "revision_id":{"type":"string","minLength":1,"maxLength":128},
                    "output_path":{"type":"string","minLength":1,"maxLength":4096}
                },
                "required":["artifact_id","output_path"],
                "additionalProperties":false
            }
        ]
    })
}

pub fn create_input_schema() -> Value {
    let legacy = legacy_input_schema();
    json!({
        "type":"object",
        "properties":{
            "type":legacy["properties"]["type"].clone(),
            "title":{"type":"string","minLength":1,"maxLength":512},
            "content":legacy["properties"]["content"].clone(),
            "associate_with_current_project":{"type":"boolean"}
        },
        "required":["type","content"],
        "additionalProperties":false
    })
}

pub fn update_input_schema() -> Value {
    let legacy = legacy_input_schema();
    json!({
        "type":"object",
        "properties":{
            "artifact_id":{"type":"string","minLength":1,"maxLength":128},
            "expected_revision_id":{"type":"string","minLength":1,"maxLength":128},
            "content":legacy["properties"]["content"].clone()
        },
        "required":["artifact_id","expected_revision_id","content"],
        "additionalProperties":false
    })
}

pub fn read_input_schema() -> Value {
    json!({
        "type":"object",
        "properties":{
            "artifact_id":{"type":"string","minLength":1,"maxLength":128},
            "revision_id":{"type":"string","minLength":1,"maxLength":128}
        },
        "required":["artifact_id"],
        "additionalProperties":false
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct CanonicalArtifactContent {
    pub content: ArtifactContentV1,
    pub canonical_json: String,
    pub semantic_sha256: String,
    pub semantic_unit_count: usize,
}

pub fn canonicalize_content(
    artifact_type: DurableArtifactType,
    content: Value,
) -> Result<CanonicalArtifactContent, AgentError> {
    let definition = match artifact_type {
        DurableArtifactType::Document => serde_json::from_value(content)
            .map(ArtifactDefinition::Document)
            .map_err(|_| AgentError::ArtifactContentInvalid)?,
        DurableArtifactType::Presentation => serde_json::from_value(content)
            .map(ArtifactDefinition::Presentation)
            .map_err(|_| AgentError::ArtifactContentInvalid)?,
    };
    validate_definition(&definition).map_err(|_| AgentError::ArtifactContentInvalid)?;
    let semantic_unit_count = definition.semantic_count();
    let content = match definition {
        ArtifactDefinition::Document(value) => ArtifactContentV1::Document(value),
        ArtifactDefinition::Presentation(value) => ArtifactContentV1::Presentation(value),
    };
    let canonical_json =
        serde_json::to_string(&content).map_err(|_| AgentError::ArtifactContentInvalid)?;
    if canonical_json.len() > MAX_DEFINITION_BYTES {
        return Err(AgentError::ArtifactContentInvalid);
    }
    let semantic_sha256 = sha256(canonical_json.as_bytes());
    Ok(CanonicalArtifactContent {
        content,
        canonical_json,
        semantic_sha256,
        semantic_unit_count,
    })
}

pub fn export_saved(
    runtime: &ToolRuntime,
    artifact: &ArtifactReadView,
    output_path: &str,
    cancellation: &CommandCancellation,
) -> Result<ToolExecution, AgentError> {
    let (artifact_type, content) = match &artifact.revision.content {
        ArtifactContentV1::Document(value) => (
            "document",
            serde_json::to_value(value).map_err(|_| AgentError::ArtifactContentInvalid)?,
        ),
        ArtifactContentV1::Presentation(value) => (
            "presentation",
            serde_json::to_value(value).map_err(|_| AgentError::ArtifactContentInvalid)?,
        ),
    };
    let mut execution = export(
        runtime,
        &json!({"type":artifact_type,"content":content,"output_path":output_path}),
        cancellation,
    )?;
    if let Some(receipt) = execution.receipt.as_object_mut() {
        receipt.insert("artifact_id".into(), json!(artifact.artifact.artifact_id));
        receipt.insert(
            "artifact_revision_id".into(),
            json!(artifact.revision.revision_id),
        );
        receipt.insert(
            "exported_revision_id".into(),
            json!(artifact.revision.revision_id),
        );
        receipt.insert(
            "artifact_revision".into(),
            json!(artifact.revision.sequence),
        );
        receipt.insert("artifact_persistence".into(), json!("DURABLE"));
        receipt.insert(
            "artifact_semantic_sha256".into(),
            json!(artifact.revision.semantic_sha256),
        );
    }
    let receipt = &execution.receipt;
    execution.observation = json!({
        "artifact_id":artifact.artifact.artifact_id,
        "artifact_revision_id":artifact.revision.revision_id,
        "artifact_revision":artifact.revision.sequence,
        "artifact_persistence":"DURABLE",
        "path":receipt.get("path"),
        "output_bytes":receipt.get("output_bytes"),
        "output_sha256":receipt.get("output_sha256"),
        "structural_reopen":"STRUCTURAL_VALID",
        "roundtrip":"SEMANTIC_CONTENT_PRESENT",
        "visual_compatibility":"NOT_VERIFIED"
    })
    .to_string();
    Ok(execution)
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
        "artifact_persistence":"REQUEST_SCOPED",
        "artifact_type":artifact_type.id(),
        "artifact_revision":ARTIFACT_REVISION,
        "artifact_definition_sha256":definition_sha256,
        "semantic_unit_count":semantic_count,
        "renderer_id":artifact_type.renderer_id(),
        "renderer_version":artifact_type.renderer_version(),
        "output_format":artifact_type.extension().to_ascii_uppercase(),
        "path":relative_text(&relative),
        "output_bytes":final_bytes.len(),
        "output_sha256":output_sha256,
        "structural_reopen":"STRUCTURAL_VALID",
        "roundtrip":"SEMANTIC_CONTENT_PRESENT",
    });
    let observation = serde_json::to_string(&json!({
        "artifact_id":artifact_id,
        "artifact_persistence":"REQUEST_SCOPED",
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
            let plans = plan_presentation(presentation)?;
            let mut writer = PptxWriter::new();
            writer.set_presentation_size(
                PRESENTATION_WIDTH_EMU as u64,
                PRESENTATION_HEIGHT_EMU as u64,
            );
            for plan in &plans {
                let slide = writer.add_slide();
                render_presentation_plan(slide, plan);
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

fn plan_presentation(
    presentation: &PresentationArtifact,
) -> Result<Vec<SlideLayoutPlan>, AgentError> {
    let metrics = SlideMetrics::widescreen();
    if !metrics.slide.contains(metrics.cover_title)
        || !metrics.slide.contains(metrics.cover_subtitle)
        || !metrics.slide.contains(metrics.title)
        || !metrics.slide.contains(metrics.body)
        || !metrics.body.contains(metrics.left)
        || !metrics.body.contains(metrics.right)
        || metrics.title.overlaps(metrics.body)
        || metrics.left.overlaps(metrics.right)
        || metrics.right.x - metrics.left.right() != metrics.column_gap
        || metrics.body.x != metrics.margin_left
        || metrics.slide.right() - metrics.body.right() != metrics.margin_right
        || metrics.title.y != metrics.margin_top
        || metrics.slide.bottom() - metrics.body.bottom() != metrics.margin_bottom
        || metrics.left.x - metrics.body.x != metrics.column_padding
        || metrics.body.right() - metrics.right.right() != metrics.column_padding
    {
        return Err(AgentError::IoFailed);
    }
    presentation
        .slides
        .iter()
        .map(|slide| plan_slide(slide, metrics))
        .collect()
}

fn plan_slide(
    slide: &PresentationSlide,
    metrics: SlideMetrics,
) -> Result<SlideLayoutPlan, AgentError> {
    match slide.layout {
        PresentationLayout::Title => plan_cover_slide(slide, metrics),
        PresentationLayout::TitleAndBody => {
            let region = slide
                .regions
                .iter()
                .find(|region| region.slot == SlideSlot::Body)
                .ok_or(AgentError::ToolArgumentsInvalid)?;
            let density = region_density(region, metrics.body, false);
            let mut lines = fit_text_box(
                &slide.title,
                metrics.title,
                &[28, 27, 26],
                2,
                PresentationTextRole::SlideTitle,
                true,
                PRIMARY_TEXT_COLOR,
            )?;
            for font_size_pt in body_font_candidates(density) {
                if let Some(mut body) = plan_region(region, metrics.body, *font_size_pt, false) {
                    lines.append(&mut body);
                    return Ok(SlideLayoutPlan {
                        layout: slide.layout,
                        density,
                        lines,
                    });
                }
            }
            Err(AgentError::PresentationContentOverflow)
        }
        PresentationLayout::TwoColumn => {
            let left = slide
                .regions
                .iter()
                .find(|region| region.slot == SlideSlot::Left)
                .ok_or(AgentError::ToolArgumentsInvalid)?;
            let right = slide
                .regions
                .iter()
                .find(|region| region.slot == SlideSlot::Right)
                .ok_or(AgentError::ToolArgumentsInvalid)?;
            let density = region_density(left, metrics.left, true).max(region_density(
                right,
                metrics.right,
                true,
            ));
            let title = fit_text_box(
                &slide.title,
                metrics.title,
                &[28, 27, 26],
                2,
                PresentationTextRole::SlideTitle,
                true,
                PRIMARY_TEXT_COLOR,
            )?;
            for font_size_pt in body_font_candidates(density) {
                let Some(mut left_lines) = plan_region(left, metrics.left, *font_size_pt, true)
                else {
                    continue;
                };
                let Some(mut right_lines) = plan_region(right, metrics.right, *font_size_pt, true)
                else {
                    continue;
                };
                let mut lines = title.clone();
                lines.append(&mut left_lines);
                lines.append(&mut right_lines);
                return Ok(SlideLayoutPlan {
                    layout: slide.layout,
                    density,
                    lines,
                });
            }
            Err(AgentError::PresentationContentOverflow)
        }
    }
}

fn plan_cover_slide(
    slide: &PresentationSlide,
    metrics: SlideMetrics,
) -> Result<SlideLayoutPlan, AgentError> {
    let mut explicit_lines = slide
        .title
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty());
    let title = explicit_lines
        .next()
        .ok_or(AgentError::ToolArgumentsInvalid)?;
    let subtitle = explicit_lines.collect::<Vec<_>>().join("\n");
    let mut lines = fit_text_box(
        title,
        metrics.cover_title,
        &[40, 38, 36, 34],
        2,
        PresentationTextRole::CoverTitle,
        true,
        PRIMARY_TEXT_COLOR,
    )?;
    if !subtitle.is_empty() {
        lines.append(&mut fit_text_box(
            &subtitle,
            metrics.cover_subtitle,
            &[22, 20, 18, 17],
            3,
            PresentationTextRole::CoverSubtitle,
            false,
            SECONDARY_TEXT_COLOR,
        )?);
    }
    Ok(SlideLayoutPlan {
        layout: slide.layout,
        density: ContentDensity::Low,
        lines,
    })
}

fn body_font_candidates(density: ContentDensity) -> &'static [u16] {
    match density {
        ContentDensity::Low => &[20, 18, 16, 15],
        ContentDensity::Normal => &[18, 16, 15],
        ContentDensity::High => &[16, 15],
    }
}

fn region_density(region: &SlideRegion, bounds: SlideRect, column: bool) -> ContentDensity {
    let bullet_indent = if column { 285_750 } else { 323_850 };
    let mut lines = 0usize;
    for (index, block) in region.blocks.iter().enumerate() {
        match block {
            PresentationBlock::Paragraph { text } => {
                let size = if column && index == 0 { 22 } else { 20 };
                lines += wrap_text(text, bounds.width, size).len();
            }
            PresentationBlock::BulletList { items } => {
                lines += items
                    .iter()
                    .map(|item| wrap_text(item, bounds.width - bullet_indent, 20).len())
                    .sum::<usize>();
            }
        }
    }
    if lines <= 6 {
        ContentDensity::Low
    } else if lines <= 11 {
        ContentDensity::Normal
    } else {
        ContentDensity::High
    }
}

fn plan_region(
    region: &SlideRegion,
    bounds: SlideRect,
    font_size_pt: u16,
    column: bool,
) -> Option<Vec<PlannedTextLine>> {
    let mut planned = Vec::new();
    let mut y = bounds.y;
    let bullet_indent = if column { 285_750 } else { 323_850 };
    let marker_width = 177_800;
    for (block_index, block) in region.blocks.iter().enumerate() {
        match block {
            PresentationBlock::Paragraph { text } => {
                let is_column_heading = column && block_index == 0;
                let paragraph_size = if is_column_heading {
                    (font_size_pt + 2).min(22)
                } else {
                    font_size_pt
                };
                let role = if is_column_heading {
                    PresentationTextRole::ColumnHeading
                } else {
                    PresentationTextRole::Body
                };
                let style = PresentationTextStyle {
                    role,
                    font_size_pt: paragraph_size,
                    bold: is_column_heading,
                    color: if is_column_heading {
                        ACCENT_TEXT_COLOR
                    } else {
                        PRIMARY_TEXT_COLOR
                    },
                };
                let wrapped = wrap_text(text, bounds.width, paragraph_size);
                let line_height = line_height_emu(paragraph_size);
                for text in wrapped {
                    let rect = SlideRect {
                        x: bounds.x,
                        y,
                        width: bounds.width,
                        height: line_height,
                    };
                    if !bounds.contains(rect) {
                        return None;
                    }
                    planned.push(PlannedTextLine { text, rect, style });
                    y += line_height;
                }
                y += if is_column_heading {
                    points_to_emu((font_size_pt as f64) * 0.65)
                } else {
                    points_to_emu((font_size_pt as f64) * 0.8)
                };
            }
            PresentationBlock::BulletList { items } => {
                let bullet_font_size_pt = font_size_pt.saturating_sub(1).max(15);
                let marker_style = PresentationTextStyle {
                    role: PresentationTextRole::BulletMarker,
                    font_size_pt: bullet_font_size_pt,
                    bold: false,
                    color: ACCENT_TEXT_COLOR,
                };
                let bullet_style = PresentationTextStyle {
                    role: PresentationTextRole::Bullet,
                    font_size_pt: bullet_font_size_pt,
                    bold: false,
                    color: PRIMARY_TEXT_COLOR,
                };
                for item in items {
                    let wrapped =
                        wrap_text(item, bounds.width - bullet_indent, bullet_font_size_pt);
                    let line_height = line_height_emu(bullet_font_size_pt);
                    let marker_rect = SlideRect {
                        x: bounds.x,
                        y,
                        width: marker_width,
                        height: line_height,
                    };
                    if !bounds.contains(marker_rect) {
                        return None;
                    }
                    planned.push(PlannedTextLine {
                        text: "•".into(),
                        rect: marker_rect,
                        style: marker_style,
                    });
                    for text in wrapped {
                        let rect = SlideRect {
                            x: bounds.x + bullet_indent,
                            y,
                            width: bounds.width - bullet_indent,
                            height: line_height,
                        };
                        if !bounds.contains(rect) {
                            return None;
                        }
                        planned.push(PlannedTextLine {
                            text,
                            rect,
                            style: bullet_style,
                        });
                        y += line_height;
                    }
                    y += points_to_emu((bullet_font_size_pt as f64) * 0.38);
                }
                y += points_to_emu((bullet_font_size_pt as f64) * 0.35);
            }
        }
    }
    Some(planned)
}

fn fit_text_box(
    text: &str,
    bounds: SlideRect,
    font_sizes: &[u16],
    max_lines: usize,
    role: PresentationTextRole,
    bold: bool,
    color: &'static str,
) -> Result<Vec<PlannedTextLine>, AgentError> {
    for font_size_pt in font_sizes {
        let wrapped = wrap_text(text, bounds.width, *font_size_pt);
        let line_height = line_height_emu(*font_size_pt);
        if wrapped.is_empty()
            || wrapped.len() > max_lines
            || line_height * wrapped.len() as i64 > bounds.height
        {
            continue;
        }
        let style = PresentationTextStyle {
            role,
            font_size_pt: *font_size_pt,
            bold,
            color,
        };
        return Ok(wrapped
            .into_iter()
            .enumerate()
            .map(|(index, text)| PlannedTextLine {
                text,
                rect: SlideRect {
                    x: bounds.x,
                    y: bounds.y + line_height * index as i64,
                    width: bounds.width,
                    height: line_height,
                },
                style,
            })
            .collect());
    }
    Err(AgentError::PresentationContentOverflow)
}

fn wrap_text(text: &str, width_emu: i64, font_size_pt: u16) -> Vec<String> {
    let mut output = Vec::new();
    for explicit_line in text.lines() {
        let characters = explicit_line.trim().chars().collect::<Vec<_>>();
        if characters.is_empty() {
            continue;
        }
        let mut start = 0usize;
        while start < characters.len() {
            let mut end = start;
            let mut measured = 0f64;
            let mut last_break = None;
            while end < characters.len() {
                let next = glyph_width_emu(characters[end], font_size_pt);
                if measured + next > width_emu as f64 {
                    break;
                }
                measured += next;
                if is_break_opportunity(characters[end]) {
                    last_break = Some(end + 1);
                }
                end += 1;
            }
            if end == start {
                end += 1;
            } else if end < characters.len()
                && let Some(preferred) = last_break
                && preferred > start
            {
                end = preferred;
            }
            let line = characters[start..end]
                .iter()
                .collect::<String>()
                .trim()
                .to_owned();
            if !line.is_empty() {
                output.push(line);
            }
            start = end;
            while start < characters.len() && characters[start].is_whitespace() {
                start += 1;
            }
        }
    }
    output
}

fn glyph_width_emu(character: char, font_size_pt: u16) -> f64 {
    let factor = if is_cjk(character) {
        1.0
    } else if character.is_whitespace() {
        0.32
    } else if character.is_ascii_uppercase() {
        0.64
    } else if character.is_ascii_lowercase() {
        0.54
    } else if character.is_ascii_digit() {
        0.56
    } else {
        0.42
    };
    font_size_pt as f64 * factor * EMU_PER_POINT
}

fn is_break_opportunity(character: char) -> bool {
    character.is_whitespace()
        || matches!(
            character,
            '-' | '/' | '—' | '，' | '。' | '、' | '；' | '：' | ',' | '.' | ';' | ':'
        )
}

fn is_cjk(character: char) -> bool {
    matches!(
        character as u32,
        0x3000..=0x30ff | 0x3400..=0x9fff | 0xac00..=0xd7af | 0xf900..=0xfaff | 0xff00..=0xffef
    )
}

fn points_to_emu(points: f64) -> i64 {
    (points * EMU_PER_POINT).ceil() as i64
}

fn line_height_emu(font_size_pt: u16) -> i64 {
    points_to_emu(font_size_pt as f64 * 1.28)
}

fn styled_runs(line: &PlannedTextLine) -> Vec<Run> {
    let mut groups = Vec::<(bool, String)>::new();
    for character in line.text.chars() {
        let cjk = is_cjk(character);
        if let Some((last_cjk, text)) = groups.last_mut()
            && *last_cjk == cjk
        {
            text.push(character);
        } else {
            groups.push((cjk, character.to_string()));
        }
    }
    groups
        .into_iter()
        .map(|(cjk, text)| {
            let mut run = Run::new(text)
                .font(if cjk { CJK_FONT } else { LATIN_FONT })
                .font_size(line.style.font_size_pt as f64)
                .color(line.style.color);
            if line.style.bold {
                run = run.bold();
            }
            run
        })
        .collect()
}

fn render_presentation_plan(slide: &mut SlideData, plan: &SlideLayoutPlan) {
    for line in &plan.lines {
        slide.add_rich_text_box(
            &styled_runs(line),
            line.rect.x,
            line.rect.y,
            line.rect.width,
            line.rect.height,
        );
    }
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
    let missing_semantic_text = match artifact_type {
        ArtifactType::Document => definition
            .expected_text()
            .iter()
            .any(|expected| !plain_text.contains(expected)),
        ArtifactType::Presentation => {
            let compact_plain_text = compact_whitespace(&plain_text);
            definition
                .expected_text()
                .iter()
                .any(|expected| !compact_plain_text.contains(&compact_whitespace(expected)))
        }
    };
    if missing_semantic_text {
        return Err(AgentError::IoFailed);
    }
    if let ArtifactDefinition::Presentation(presentation) = definition
        && reopened.to_ir().sections.len() != presentation.slides.len()
    {
        return Err(AgentError::IoFailed);
    }
    Ok(())
}

fn compact_whitespace(text: &str) -> String {
    text.chars()
        .filter(|character| !character.is_whitespace())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{PolicyEngine, ToolExecutor, coding_tool_catalog};
    use fielora_contracts::{
        AgentPermission, AgentPolicyDecision, AgentRunId, AgentToolEffect, ArtifactId,
        ArtifactMutationKind, ArtifactRevisionId, ArtifactRevisionView, ArtifactView,
        ConversationId, DeviceId, ProfileId, ToolCallId,
    };

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

    fn presentation_from(arguments: &Value) -> PresentationArtifact {
        serde_json::from_value(arguments["content"].clone()).unwrap()
    }

    fn overflow_presentation_args(path: &str) -> Value {
        let items = (1..=64)
            .map(|index| format!("Overflow boundary item {index}"))
            .collect::<Vec<_>>();
        json!({
            "type":"presentation",
            "output_path":path,
            "content":{"slides":[{
                "layout":"TITLE_AND_BODY",
                "title":"Bounded overflow",
                "regions":[{"slot":"BODY","blocks":[{"kind":"BULLET_LIST","items":items}]}]
            }]}
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
    fn presentation_metrics_and_layout_plans_are_deterministic_and_bounded() {
        let metrics = SlideMetrics::widescreen();
        assert!(metrics.slide.contains(metrics.cover_title));
        assert!(metrics.slide.contains(metrics.cover_subtitle));
        assert!(metrics.slide.contains(metrics.title));
        assert!(metrics.slide.contains(metrics.body));
        assert!(!metrics.title.overlaps(metrics.body));
        assert_eq!(metrics.left.width, metrics.right.width);
        assert_eq!(metrics.right.x - metrics.left.right(), metrics.column_gap);
        assert!(!metrics.left.overlaps(metrics.right));

        let presentation = presentation_from(&presentation_args("layout.pptx"));
        let first = plan_presentation(&presentation).unwrap();
        let second = plan_presentation(&presentation).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.len(), 3);
        for plan in first {
            for line in &plan.lines {
                assert!(metrics.slide.contains(line.rect), "out of bounds: {line:?}");
            }
            for (index, line) in plan.lines.iter().enumerate() {
                for other in plan.lines.iter().skip(index + 1) {
                    assert!(
                        !line.rect.overlaps(other.rect),
                        "overlap: {line:?} / {other:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn presentation_typography_has_hierarchy_fonts_and_readable_floor() {
        let presentation = presentation_from(&json!({
            "content":{"slides":[
                {"layout":"TITLE","title":"Fielora\nAI-native 工作环境","regions":[]},
                {"layout":"TITLE_AND_BODY","title":"Mixed Typography","regions":[
                    {"slot":"BODY","blocks":[
                        {"kind":"PARAGRAPH","text":"Model + Harness + Tools 统一进入现有 pipeline。"},
                        {"kind":"BULLET_LIST","items":["可读的中英文正文","Provider-neutral execution"]}
                    ]}
                ]}
            ]}
        }));
        let plans = plan_presentation(&presentation).unwrap();
        let cover_title = plans[0]
            .lines
            .iter()
            .find(|line| line.style.role == PresentationTextRole::CoverTitle)
            .unwrap();
        let cover_subtitle = plans[0]
            .lines
            .iter()
            .find(|line| line.style.role == PresentationTextRole::CoverSubtitle)
            .unwrap();
        assert!(cover_title.style.font_size_pt >= 34);
        assert!(cover_title.style.font_size_pt > cover_subtitle.style.font_size_pt);
        assert!(plans[1].lines.iter().any(|line| {
            line.style.role == PresentationTextRole::SlideTitle && line.style.font_size_pt >= 26
        }));
        assert!(plans.iter().flat_map(|plan| &plan.lines).all(|line| {
            !matches!(
                line.style.role,
                PresentationTextRole::Body
                    | PresentationTextRole::Bullet
                    | PresentationTextRole::BulletMarker
            ) || line.style.font_size_pt >= 15
        }));

        let rendered = render(&ArtifactDefinition::Presentation(presentation)).unwrap();
        let mut archive = ZipArchive::new(Cursor::new(rendered.bytes)).unwrap();
        let mut slide_xml = String::new();
        std::io::Read::read_to_string(
            &mut archive.by_name("ppt/slides/slide2.xml").unwrap(),
            &mut slide_xml,
        )
        .unwrap();
        assert!(slide_xml.contains("typeface=\"Arial\""));
        assert!(slide_xml.contains("typeface=\"Microsoft YaHei\""));
        assert!(slide_xml.contains("sz=\"2800\""));
        assert!(slide_xml.contains("<a:off x=\"777240\" y=\"457200\""));
    }

    #[test]
    fn presentation_long_titles_fit_boundedly_or_fail_closed() {
        let metrics = SlideMetrics::widescreen();
        let fitted = fit_text_box(
            "A deliberately long presentation title that wraps across the available safe title region",
            metrics.title,
            &[28, 27, 26],
            2,
            PresentationTextRole::SlideTitle,
            true,
            PRIMARY_TEXT_COLOR,
        )
        .unwrap();
        assert_eq!(fitted.len(), 2);
        assert!(fitted.iter().all(|line| line.style.font_size_pt >= 26));
        assert_eq!(
            fit_text_box(
                &"W".repeat(500),
                metrics.title,
                &[28, 27, 26],
                2,
                PresentationTextRole::SlideTitle,
                true,
                PRIMARY_TEXT_COLOR,
            ),
            Err(AgentError::PresentationContentOverflow)
        );
    }

    #[test]
    fn presentation_stress_layout_fits_normal_content_and_rejects_overflow() {
        let safe = presentation_from(&json!({
            "content":{"slides":[
                {"layout":"TITLE_AND_BODY","title":"面向真实工作的 Fielora Presentation Renderer Quality Foundation 与确定性安全边界","regions":[
                    {"slot":"BODY","blocks":[
                        {"kind":"PARAGRAPH","text":"长标题在受控字号范围内换行，并与正文保持稳定间距。"}
                    ]}
                ]},
                {"layout":"TITLE_AND_BODY","title":"Ten Normal Bullets","regions":[
                    {"slot":"BODY","blocks":[
                        {"kind":"BULLET_LIST","items":[
                            "Project","Conversation","Model","Harness","Tools",
                            "PolicyEngine","Approval","Receipt","Artifact","Verification"
                        ]}
                    ]}
                ]},
                {"layout":"TITLE_AND_BODY","title":"Mixed Long Paragraph","regions":[
                    {"slot":"BODY","blocks":[
                        {"kind":"PARAGRAPH","text":"Fielora keeps Model, Harness, and Tools 与真实执行边界分离。Renderer 使用保守且确定性的 CJK / Latin 字符宽度估算，在固定安全区内规划字号、行高与段落间距；内容不会通过无限缩小字号来勉强容纳，执行成功也不会升级为事实 Verification PASS。This mixed paragraph intentionally exercises wrapping across English words, 中文标点、technical identifiers, and a normal presentation-width text region without relying on an external layout process."}
                    ]}
                ]},
                {"layout":"TWO_COLUMN","title":"Unequal Column Density","regions":[
                    {"slot":"LEFT","blocks":[
                        {"kind":"PARAGRAPH","text":"Small / 小栏"},
                        {"kind":"BULLET_LIST","items":["Coding","Files"]}
                    ]},
                    {"slot":"RIGHT","blocks":[
                        {"kind":"PARAGRAPH","text":"Dense / 长栏"},
                        {"kind":"BULLET_LIST","items":[
                            "External Tool Provider","MCP stdio transport","Agent Skills lazy loading",
                            "Web Intelligence with policy","File Intelligence extraction",
                            "Artifact structural roundtrip","Verification remains separate",
                            "Future plugins use the same Tool execution path"
                        ]}
                    ]}
                ]}
            ]}
        }));
        let plans = plan_presentation(&safe).unwrap();
        assert_eq!(plans.len(), 4);
        assert!(
            plans[0]
                .lines
                .iter()
                .filter(|line| line.style.role == PresentationTextRole::SlideTitle)
                .count()
                >= 2
        );
        assert!(
            plans
                .iter()
                .any(|plan| plan.density == ContentDensity::Normal)
        );
        let high_density_region = SlideRegion {
            slot: SlideSlot::Body,
            blocks: vec![PresentationBlock::BulletList {
                items: (1..=12).map(|index| format!("Item {index}")).collect(),
            }],
        };
        assert_eq!(
            region_density(&high_density_region, SlideMetrics::widescreen().body, false),
            ContentDensity::High
        );
        assert!(
            plan_region(
                &high_density_region,
                SlideMetrics::widescreen().body,
                16,
                false
            )
            .is_some()
        );
        let two_column_sizes = plans[3]
            .lines
            .iter()
            .filter(|line| {
                matches!(
                    line.style.role,
                    PresentationTextRole::Bullet | PresentationTextRole::BulletMarker
                )
            })
            .map(|line| line.style.font_size_pt)
            .collect::<HashSet<_>>();
        assert_eq!(two_column_sizes.len(), 1);

        let (root, runtime) = fixture_runtime();
        assert_eq!(
            runtime.execute(
                "artifact.export",
                &overflow_presentation_args("overflow.pptx"),
                false,
                &CommandCancellation::default()
            ),
            Err(AgentError::PresentationContentOverflow)
        );
        assert!(!root.join("overflow.pptx").exists());
        assert_no_temporary_files(&root);
        fs::remove_dir_all(root).unwrap();
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
        for (arguments, path, format, renderer_version, expected) in [
            (
                document_args("exports/report.docx"),
                "exports/report.docx",
                "DOCX",
                DOCUMENT_RENDERER_VERSION,
                vec!["Document Section", "First item", "Roundtrip", "Present"],
            ),
            (
                presentation_args("exports/deck.pptx"),
                "exports/deck.pptx",
                "PPTX",
                PRESENTATION_RENDERER_VERSION,
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
            assert_eq!(exported.receipt["renderer_version"], renderer_version);
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

    #[test]
    fn saved_document_and_presentation_exports_pin_exact_semantic_revisions() {
        let (root, runtime) = fixture_runtime();
        let cases = [
            (
                DurableArtifactType::Document,
                document_args("unused.docx")["content"].clone(),
                "saved-document.docx",
            ),
            (
                DurableArtifactType::Presentation,
                presentation_args("unused.pptx")["content"].clone(),
                "saved-presentation.pptx",
            ),
        ];
        for (artifact_type, content, output_path) in cases {
            let canonical = canonicalize_content(artifact_type, content).unwrap();
            let artifact_id = ArtifactId::new(Uuid::now_v7().to_string());
            let selected_revision = ArtifactRevisionId::new(Uuid::now_v7().to_string());
            let newer_current_revision = ArtifactRevisionId::new(Uuid::now_v7().to_string());
            let read = ArtifactReadView {
                artifact: ArtifactView {
                    artifact_id: artifact_id.clone(),
                    profile_id: ProfileId::new(Uuid::now_v7().to_string()),
                    artifact_type,
                    title: Some("Saved export".into()),
                    project_field_id: None,
                    // Deliberately point current elsewhere: the selected
                    // historical revision must remain the rendered authority.
                    current_revision_id: newer_current_revision,
                    created_from_conversation_id: None,
                    created_by_agent_run_id: None,
                    updated_by_device: DeviceId::new(Uuid::now_v7().to_string()),
                    created_at: 1,
                    updated_at: 2,
                },
                revision: ArtifactRevisionView {
                    revision_id: selected_revision.clone(),
                    artifact_id: artifact_id.clone(),
                    sequence: 1,
                    parent_revision_id: None,
                    mutation_kind: ArtifactMutationKind::Create,
                    content_schema_version: 1,
                    semantic_sha256: canonical.semantic_sha256.clone(),
                    content: canonical.content,
                    created_from_conversation_id: Some(ConversationId::new(
                        Uuid::now_v7().to_string(),
                    )),
                    created_by_agent_run_id: Some(AgentRunId::new(Uuid::now_v7().to_string())),
                    created_by_tool_call_id: ToolCallId::new(Uuid::now_v7().to_string()),
                    created_at: 1,
                },
            };
            let execution = export_saved(
                &runtime,
                &read,
                output_path,
                &CommandCancellation::default(),
            )
            .unwrap();
            assert_eq!(execution.receipt["artifact_id"], artifact_id.0);
            assert_eq!(
                execution.receipt["artifact_revision_id"],
                selected_revision.0
            );
            assert_eq!(execution.receipt["artifact_revision"], 1);
            assert_eq!(execution.receipt["artifact_persistence"], "DURABLE");
            assert_eq!(
                execution.receipt["artifact_semantic_sha256"],
                canonical.semantic_sha256
            );
            assert!(root.join(output_path).is_file());
            assert_eq!(
                export_saved(
                    &runtime,
                    &read,
                    output_path,
                    &CommandCancellation::default(),
                ),
                Err(AgentError::FileChanged)
            );
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn durable_canonical_content_reuses_strict_renderer_admission() {
        let valid = canonicalize_content(
            DurableArtifactType::Document,
            document_args("unused.docx")["content"].clone(),
        )
        .unwrap();
        assert!(valid.canonical_json.len() <= MAX_DEFINITION_BYTES);
        assert_eq!(
            valid.semantic_sha256,
            sha256(valid.canonical_json.as_bytes())
        );
        assert!(matches!(valid.content, ArtifactContentV1::Document(_)));

        assert_eq!(
            canonicalize_content(
                DurableArtifactType::Document,
                json!({"blocks":[{"kind":"PARAGRAPH","text":"valid"}],"unknown":true}),
            ),
            Err(AgentError::ArtifactContentInvalid)
        );
        assert_eq!(
            canonicalize_content(
                DurableArtifactType::Document,
                json!({"blocks":[{"kind":"PARAGRAPH","text":"x".repeat(MAX_TEXT_ITEM_BYTES + 1)}]}),
            ),
            Err(AgentError::ArtifactContentInvalid)
        );
        assert_eq!(
            canonicalize_content(
                DurableArtifactType::Presentation,
                json!({"slides":[{"layout":"TITLE","title":"bad\0title","regions":[]}]}),
            ),
            Err(AgentError::ArtifactContentInvalid)
        );
    }
}
