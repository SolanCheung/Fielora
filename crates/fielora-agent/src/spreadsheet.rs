//! Typed literal workbook validation and XLSX rendering for durable Spreadsheet Artifacts.
//!
//! Spreadsheet semantics remain in `fielora-contracts`. This adapter admits no
//! formula language, external relationship, macro, or executable package part.

use crate::AgentError;
use fielora_contracts::{
    SpreadsheetArtifactV1, SpreadsheetCellAlignment, SpreadsheetCellEmphasis,
    SpreadsheetCellPresentationIntentV1, SpreadsheetCellV1, SpreadsheetFormatIntentV1,
    SpreadsheetLiteralV1,
};
use office_oxide::DocumentFormat;
use office_oxide::ir::Metadata;
use office_oxide::xlsx::write::{CellData, CellStyle, HAlign, NumberFormat, XlsxWriter};
use quick_xml::events::{BytesRef, BytesStart, Event as XmlEvent};
use quick_xml::{Reader as XmlReader, XmlVersion};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{Cursor, Read};
use zip::ZipArchive;

pub(crate) const RENDERER_ID: &str = "fielora.spreadsheet.xlsx";
pub(crate) const RENDERER_VERSION: &str = "0.1.0+office_oxide.0.1.8";
pub(crate) const CALCULATION_AUTHORITY: &str = "NONE";

const MAX_SHEETS: usize = 32;
const MAX_ROWS: u32 = 2_000;
const MAX_COLUMNS: u16 = 256;
const MAX_CELLS: usize = 4_096;
const MAX_CELL_TEXT_BYTES: usize = 1_024;
const MAX_TOTAL_TEXT_BYTES: usize = 128 * 1024;
const MAX_SHEET_NAME_SCALARS: usize = 31;
const MAX_TITLE_SCALARS: usize = 120;
const MAX_TITLE_BYTES: usize = 1_024;
const MAX_DECIMAL_SIGNIFICANT_DIGITS: usize = 15;
const MAX_DECIMAL_SCALE: usize = 6;
const MAX_PACKAGE_ENTRIES: usize = 128;
const MAX_PACKAGE_ENTRY_BYTES: u64 = 16 * 1024 * 1024;
const MAX_PACKAGE_TOTAL_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SpreadsheetSemanticFacts {
    pub sheet_count: usize,
    pub cell_count: usize,
    pub string_count: usize,
    pub decimal_count: usize,
    pub boolean_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SpreadsheetRenderFacts {
    pub sheet_count: usize,
    pub cell_count: usize,
    pub string_count: usize,
    pub decimal_count: usize,
    pub boolean_count: usize,
    pub formula_count: usize,
    pub external_relationship_count: usize,
    pub macro_part_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RenderedSpreadsheet {
    pub bytes: Vec<u8>,
    pub facts: SpreadsheetRenderFacts,
    canonical: SpreadsheetArtifactV1,
}

pub(crate) fn canonicalize(
    workbook: &mut SpreadsheetArtifactV1,
) -> Result<SpreadsheetSemanticFacts, AgentError> {
    if workbook.sheets.is_empty() || workbook.sheets.len() > MAX_SHEETS {
        return Err(AgentError::ArtifactContentInvalid);
    }

    let mut total_text_bytes = 0usize;
    if let Some(title) = &workbook.title {
        admit_text(
            title,
            MAX_TITLE_SCALARS,
            MAX_TITLE_BYTES,
            &mut total_text_bytes,
        )?;
    }

    let mut sheet_ids = BTreeSet::new();
    let mut sheet_names = BTreeSet::new();
    let mut facts = SpreadsheetSemanticFacts {
        sheet_count: workbook.sheets.len(),
        cell_count: 0,
        string_count: 0,
        decimal_count: 0,
        boolean_count: 0,
    };

    for sheet in &mut workbook.sheets {
        admit_local_id(&sheet.sheet_id.0)?;
        if !sheet_ids.insert(sheet.sheet_id.0.clone()) {
            return Err(AgentError::ArtifactContentInvalid);
        }
        admit_sheet_name(&sheet.name, &mut total_text_bytes)?;
        if !sheet_names.insert(sheet.name.to_lowercase()) {
            return Err(AgentError::ArtifactContentInvalid);
        }

        let mut coordinates = BTreeSet::new();
        for cell in &mut sheet.cells {
            if cell.row == 0
                || cell.row > MAX_ROWS
                || cell.column == 0
                || cell.column > MAX_COLUMNS
                || !coordinates.insert((cell.row, cell.column))
            {
                return Err(AgentError::ArtifactContentInvalid);
            }
            facts.cell_count = facts
                .cell_count
                .checked_add(1)
                .ok_or(AgentError::ArtifactContentInvalid)?;
            if facts.cell_count > MAX_CELLS {
                return Err(AgentError::ArtifactContentInvalid);
            }

            match &mut cell.value {
                SpreadsheetLiteralV1::String { value } => {
                    admit_cell_text(value, &mut total_text_bytes)?;
                    facts.string_count += 1;
                }
                SpreadsheetLiteralV1::Decimal { value } => {
                    value.0 = canonical_decimal(&value.0)?;
                    facts.decimal_count += 1;
                }
                SpreadsheetLiteralV1::Boolean { .. } => facts.boolean_count += 1,
            }
            normalize_cell_intent(cell)?;
        }
        sheet.cells.sort_by_key(|cell| (cell.row, cell.column));
    }
    workbook
        .sheets
        .sort_by(|left, right| left.sheet_id.0.cmp(&right.sheet_id.0));
    Ok(facts)
}

pub(crate) fn render(workbook: &SpreadsheetArtifactV1) -> Result<RenderedSpreadsheet, AgentError> {
    let mut canonical = workbook.clone();
    let semantic = canonicalize(&mut canonical)?;
    let mut writer = XlsxWriter::new();
    if let Some(title) = &canonical.title {
        writer.set_metadata(&Metadata {
            format: DocumentFormat::Xlsx,
            title: Some(title.clone()),
            ..Metadata::default()
        });
    }

    for sheet in &canonical.sheets {
        let sheet_index = writer.add_sheet_get_index(&sheet.name);
        for cell in &sheet.cells {
            let data = cell_data(cell)?;
            if let Some(style) = cell_style(cell) {
                writer.sheet_set_cell_styled(
                    sheet_index,
                    (cell.row - 1) as usize,
                    (cell.column - 1) as usize,
                    data,
                    style,
                );
            } else {
                writer.sheet_set_cell(
                    sheet_index,
                    (cell.row - 1) as usize,
                    (cell.column - 1) as usize,
                    data,
                );
            }
        }
    }

    let mut output = Cursor::new(Vec::new());
    writer
        .write_to(&mut output)
        .map_err(|_| AgentError::IoFailed)?;
    let bytes = output.into_inner();
    let facts = validate_xlsx_bytes(&canonical, &bytes)?;
    if facts.sheet_count != semantic.sheet_count
        || facts.cell_count != semantic.cell_count
        || facts.string_count != semantic.string_count
        || facts.decimal_count != semantic.decimal_count
        || facts.boolean_count != semantic.boolean_count
    {
        return Err(AgentError::IoFailed);
    }
    Ok(RenderedSpreadsheet {
        bytes,
        facts,
        canonical,
    })
}

pub(crate) fn reopen(rendered: &RenderedSpreadsheet, bytes: &[u8]) -> Result<(), AgentError> {
    let facts = validate_xlsx_bytes(&rendered.canonical, bytes)?;
    if facts != rendered.facts {
        return Err(AgentError::IoFailed);
    }
    Ok(())
}

fn admit_local_id(value: &str) -> Result<(), AgentError> {
    let bytes = value.as_bytes();
    if bytes.is_empty()
        || bytes.len() > 64
        || !bytes[0].is_ascii_lowercase()
        || bytes[1..].iter().any(|byte| {
            !(byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'_' || *byte == b'-')
        })
    {
        return Err(AgentError::ArtifactContentInvalid);
    }
    Ok(())
}

fn admit_sheet_name(value: &str, total: &mut usize) -> Result<(), AgentError> {
    if value.trim().is_empty()
        || value.chars().count() > MAX_SHEET_NAME_SCALARS
        || value.chars().any(|character| {
            character.is_control() || matches!(character, '\\' | '/' | '?' | '*' | '[' | ']' | ':')
        })
        || value.starts_with('\'')
        || value.ends_with('\'')
    {
        return Err(AgentError::ArtifactContentInvalid);
    }
    *total = total
        .checked_add(value.len())
        .ok_or(AgentError::ArtifactContentInvalid)?;
    if *total > MAX_TOTAL_TEXT_BYTES {
        return Err(AgentError::ArtifactContentInvalid);
    }
    Ok(())
}

fn admit_text(
    value: &str,
    max_scalars: usize,
    max_bytes: usize,
    total: &mut usize,
) -> Result<(), AgentError> {
    if value.trim().is_empty()
        || value.chars().count() > max_scalars
        || value.len() > max_bytes
        || value.chars().any(char::is_control)
    {
        return Err(AgentError::ArtifactContentInvalid);
    }
    *total = total
        .checked_add(value.len())
        .ok_or(AgentError::ArtifactContentInvalid)?;
    if *total > MAX_TOTAL_TEXT_BYTES {
        return Err(AgentError::ArtifactContentInvalid);
    }
    Ok(())
}

fn admit_cell_text(value: &str, total: &mut usize) -> Result<(), AgentError> {
    if value.is_empty()
        || value.len() > MAX_CELL_TEXT_BYTES
        || value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\t' | '\n' | '\r'))
    {
        return Err(AgentError::ArtifactContentInvalid);
    }
    *total = total
        .checked_add(value.len())
        .ok_or(AgentError::ArtifactContentInvalid)?;
    if *total > MAX_TOTAL_TEXT_BYTES {
        return Err(AgentError::ArtifactContentInvalid);
    }
    Ok(())
}

fn canonical_decimal(input: &str) -> Result<String, AgentError> {
    if input.is_empty() || input.trim() != input || input.starts_with('+') {
        return Err(AgentError::ArtifactContentInvalid);
    }
    let (negative, unsigned) = input
        .strip_prefix('-')
        .map_or((false, input), |value| (true, value));
    let mut parts = unsigned.split('.');
    let integer = parts.next().unwrap_or_default();
    let fraction = parts.next();
    if integer.is_empty()
        || !integer.bytes().all(|byte| byte.is_ascii_digit())
        || parts.next().is_some()
        || fraction.is_some_and(|value| {
            value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit())
        })
    {
        return Err(AgentError::ArtifactContentInvalid);
    }

    let integer = integer.trim_start_matches('0');
    let integer = if integer.is_empty() { "0" } else { integer };
    let fraction = fraction.unwrap_or_default().trim_end_matches('0');
    if fraction.len() > MAX_DECIMAL_SCALE {
        return Err(AgentError::ArtifactContentInvalid);
    }
    let significant_digits = format!("{integer}{fraction}")
        .trim_start_matches('0')
        .len()
        .max(1);
    if significant_digits > MAX_DECIMAL_SIGNIFICANT_DIGITS {
        return Err(AgentError::ArtifactContentInvalid);
    }
    let unsigned = if fraction.is_empty() {
        integer.to_owned()
    } else {
        format!("{integer}.{fraction}")
    };
    let canonical = if negative && unsigned != "0" {
        format!("-{unsigned}")
    } else {
        unsigned
    };
    let numeric = canonical
        .parse::<f64>()
        .map_err(|_| AgentError::ArtifactContentInvalid)?;
    if !numeric.is_finite() || numeric.to_string() != canonical {
        return Err(AgentError::ArtifactContentInvalid);
    }
    Ok(canonical)
}

fn normalize_cell_intent(cell: &mut SpreadsheetCellV1) -> Result<(), AgentError> {
    cell.format = match (cell.format, &cell.value) {
        (None | Some(SpreadsheetFormatIntentV1::General), _) => None,
        (Some(SpreadsheetFormatIntentV1::Text), SpreadsheetLiteralV1::String { .. }) => None,
        (
            Some(
                format @ (SpreadsheetFormatIntentV1::Integer
                | SpreadsheetFormatIntentV1::Decimal2
                | SpreadsheetFormatIntentV1::Percent2),
            ),
            SpreadsheetLiteralV1::Decimal { .. },
        ) => Some(format),
        _ => return Err(AgentError::ArtifactContentInvalid),
    };
    if cell.presentation
        == Some(SpreadsheetCellPresentationIntentV1 {
            emphasis: SpreadsheetCellEmphasis::Normal,
            alignment: SpreadsheetCellAlignment::Auto,
            wrap: false,
        })
    {
        cell.presentation = None;
    }
    Ok(())
}

fn cell_data(cell: &SpreadsheetCellV1) -> Result<CellData, AgentError> {
    match &cell.value {
        SpreadsheetLiteralV1::String { value } => Ok(CellData::String(value.clone())),
        SpreadsheetLiteralV1::Decimal { value } => value
            .0
            .parse::<f64>()
            .map(CellData::Number)
            .map_err(|_| AgentError::ArtifactContentInvalid),
        SpreadsheetLiteralV1::Boolean { value } => Ok(CellData::Boolean(*value)),
    }
}

fn cell_style(cell: &SpreadsheetCellV1) -> Option<CellStyle> {
    let mut style = CellStyle::new();
    let mut changed = false;
    match cell.format {
        Some(SpreadsheetFormatIntentV1::Integer) => {
            style = style.number_format(NumberFormat::Integer);
            changed = true;
        }
        Some(SpreadsheetFormatIntentV1::Decimal2) => {
            style = style.number_format(NumberFormat::Decimal2);
            changed = true;
        }
        Some(SpreadsheetFormatIntentV1::Percent2) => {
            style = style.number_format(NumberFormat::Percent2);
            changed = true;
        }
        None | Some(SpreadsheetFormatIntentV1::General | SpreadsheetFormatIntentV1::Text) => {}
    }
    if let Some(presentation) = cell.presentation {
        match presentation.emphasis {
            SpreadsheetCellEmphasis::Normal => {}
            SpreadsheetCellEmphasis::Header => {
                style = style.bold().background("D9EAF7");
                changed = true;
            }
            SpreadsheetCellEmphasis::Total => {
                style = style.bold().background("E8E8E8");
                changed = true;
            }
        }
        match presentation.alignment {
            SpreadsheetCellAlignment::Auto => {}
            SpreadsheetCellAlignment::Left => {
                style = style.align(HAlign::Left);
                changed = true;
            }
            SpreadsheetCellAlignment::Center => {
                style = style.align(HAlign::Center);
                changed = true;
            }
            SpreadsheetCellAlignment::Right => {
                style = style.align(HAlign::Right);
                changed = true;
            }
        }
        if presentation.wrap {
            style = style.wrap();
            changed = true;
        }
    }
    changed.then_some(style)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ReopenedValue {
    String(String),
    Decimal(String),
    Boolean(bool),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ReopenedCell {
    reference: String,
    style_index: Option<u32>,
    value: ReopenedValue,
}

#[derive(Default)]
struct CellBuilder {
    reference: String,
    cell_type: Option<String>,
    style_index: Option<u32>,
    value: String,
}

fn validate_xlsx_bytes(
    workbook: &SpreadsheetArtifactV1,
    bytes: &[u8],
) -> Result<SpreadsheetRenderFacts, AgentError> {
    let parts = read_package(bytes)?;
    for required in [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
    ] {
        if !parts.contains_key(required) {
            return Err(AgentError::IoFailed);
        }
    }
    if parts.len() != 5 + workbook.sheets.len() + usize::from(workbook.title.is_some()) {
        return Err(AgentError::IoFailed);
    }
    for (name, data) in &parts {
        let allowed = matches!(
            name.as_str(),
            "[Content_Types].xml"
                | "_rels/.rels"
                | "xl/workbook.xml"
                | "xl/_rels/workbook.xml.rels"
                | "xl/styles.xml"
                | "docProps/core.xml"
        ) || name
            .strip_prefix("xl/worksheets/sheet")
            .and_then(|tail| tail.strip_suffix(".xml"))
            .is_some_and(|index| index.parse::<usize>().is_ok());
        if !allowed
            || contains_forbidden_xml_marker(data)
            || (name == "[Content_Types].xml" && contains_forbidden_content_type(data))
        {
            return Err(AgentError::IoFailed);
        }
        if name.ends_with(".rels") {
            validate_relationships(data)?;
        }
    }

    let sheet_names = parse_workbook_sheet_names(&parts["xl/workbook.xml"])?;
    if sheet_names
        != workbook
            .sheets
            .iter()
            .map(|sheet| sheet.name.clone())
            .collect::<Vec<_>>()
    {
        return Err(AgentError::IoFailed);
    }
    match (&workbook.title, parts.get("docProps/core.xml")) {
        (Some(expected), Some(core)) if parse_core_title(core)?.as_deref() == Some(expected) => {}
        (None, None) => {}
        _ => return Err(AgentError::IoFailed),
    }

    let mut facts = SpreadsheetRenderFacts {
        sheet_count: workbook.sheets.len(),
        cell_count: 0,
        string_count: 0,
        decimal_count: 0,
        boolean_count: 0,
        formula_count: 0,
        external_relationship_count: 0,
        macro_part_count: 0,
    };
    for (sheet_index, expected_sheet) in workbook.sheets.iter().enumerate() {
        let part_name = format!("xl/worksheets/sheet{}.xml", sheet_index + 1);
        let actual_cells = parse_worksheet(
            parts.get(&part_name).ok_or(AgentError::IoFailed)?,
            &mut facts,
        )?;
        if actual_cells.len() != expected_sheet.cells.len() {
            return Err(AgentError::IoFailed);
        }
        for (expected, actual) in expected_sheet.cells.iter().zip(&actual_cells) {
            if actual.reference != coordinate_to_a1(expected.row, expected.column)? {
                return Err(AgentError::IoFailed);
            }
            let expected_styled = cell_style(expected).is_some();
            if expected_styled != actual.style_index.is_some() {
                return Err(AgentError::IoFailed);
            }
            let matches = match (&expected.value, &actual.value) {
                (
                    SpreadsheetLiteralV1::String { value: expected },
                    ReopenedValue::String(actual),
                ) => expected == actual,
                (
                    SpreadsheetLiteralV1::Decimal { value: expected },
                    ReopenedValue::Decimal(actual),
                ) => expected.0 == *actual,
                (
                    SpreadsheetLiteralV1::Boolean { value: expected },
                    ReopenedValue::Boolean(actual),
                ) => expected == actual,
                _ => false,
            };
            if !matches {
                return Err(AgentError::IoFailed);
            }
        }
    }
    Ok(facts)
}

fn read_package(bytes: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, AgentError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|_| AgentError::IoFailed)?;
    if archive.is_empty() || archive.len() > MAX_PACKAGE_ENTRIES {
        return Err(AgentError::IoFailed);
    }
    let mut parts = BTreeMap::new();
    let mut folded_names = BTreeSet::new();
    let mut total = 0u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|_| AgentError::IoFailed)?;
        let name = entry.name().replace('\\', "/");
        if name.starts_with('/')
            || name.ends_with('/')
            || name
                .split('/')
                .any(|part| part.is_empty() || part == "." || part == "..")
            || entry.size() > MAX_PACKAGE_ENTRY_BYTES
        {
            return Err(AgentError::IoFailed);
        }
        total = total
            .checked_add(entry.size())
            .ok_or(AgentError::IoFailed)?;
        if total > MAX_PACKAGE_TOTAL_BYTES || !folded_names.insert(name.to_ascii_lowercase()) {
            return Err(AgentError::IoFailed);
        }
        let mut data = Vec::with_capacity(entry.size() as usize);
        entry
            .read_to_end(&mut data)
            .map_err(|_| AgentError::IoFailed)?;
        parts.insert(name, data);
    }
    Ok(parts)
}

fn contains_forbidden_xml_marker(data: &[u8]) -> bool {
    let folded = String::from_utf8_lossy(data).to_ascii_lowercase();
    ["<!doctype", "<!entity"]
        .iter()
        .any(|marker| folded.contains(marker))
}

fn contains_forbidden_content_type(data: &[u8]) -> bool {
    let folded = String::from_utf8_lossy(data).to_ascii_lowercase();
    [
        "vbaproject",
        "macroenabled",
        "externallink",
        "oleobject",
        "activex",
        "querytable",
        "connection",
    ]
    .iter()
    .any(|marker| folded.contains(marker))
}

fn validate_relationships(bytes: &[u8]) -> Result<(), AgentError> {
    let mut reader = XmlReader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    loop {
        match reader.read_event().map_err(|_| AgentError::IoFailed)? {
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if element.local_name().as_ref() == b"Relationship" =>
            {
                if attribute(&reader, &element, b"TargetMode")?
                    .is_some_and(|value| value.eq_ignore_ascii_case("external"))
                {
                    return Err(AgentError::IoFailed);
                }
                for key in [b"Type".as_slice(), b"Target".as_slice()] {
                    if attribute(&reader, &element, key)?.is_some_and(|value| {
                        let folded = value.to_ascii_lowercase();
                        folded.contains("externallink")
                            || folded.contains("hyperlink")
                            || folded.contains("oleobject")
                    }) {
                        return Err(AgentError::IoFailed);
                    }
                }
            }
            XmlEvent::DocType(_) | XmlEvent::PI(_) => return Err(AgentError::IoFailed),
            XmlEvent::Eof => break,
            _ => {}
        }
    }
    Ok(())
}

fn parse_workbook_sheet_names(bytes: &[u8]) -> Result<Vec<String>, AgentError> {
    let mut reader = XmlReader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut names = Vec::new();
    loop {
        match reader.read_event().map_err(|_| AgentError::IoFailed)? {
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if element.local_name().as_ref() == b"sheet" =>
            {
                names.push(attribute(&reader, &element, b"name")?.ok_or(AgentError::IoFailed)?);
            }
            XmlEvent::DocType(_) | XmlEvent::PI(_) => return Err(AgentError::IoFailed),
            XmlEvent::Eof => break,
            _ => {}
        }
    }
    Ok(names)
}

fn parse_core_title(bytes: &[u8]) -> Result<Option<String>, AgentError> {
    let mut reader = XmlReader::from_reader(bytes);
    reader.config_mut().trim_text(false);
    let mut in_title = false;
    let mut title = String::new();
    loop {
        match reader.read_event().map_err(|_| AgentError::IoFailed)? {
            XmlEvent::Start(element) if element.local_name().as_ref() == b"title" => {
                in_title = true;
            }
            XmlEvent::Text(text) if in_title => {
                title.push_str(&text.decode().map_err(|_| AgentError::IoFailed)?);
            }
            XmlEvent::GeneralRef(reference) if in_title => {
                title.push(resolve_reference(&reference)?);
            }
            XmlEvent::End(element) if element.local_name().as_ref() == b"title" => {
                return Ok(Some(title));
            }
            XmlEvent::DocType(_) | XmlEvent::PI(_) => return Err(AgentError::IoFailed),
            XmlEvent::Eof => break,
            _ => {}
        }
    }
    Ok(None)
}

fn parse_worksheet(
    bytes: &[u8],
    facts: &mut SpreadsheetRenderFacts,
) -> Result<Vec<ReopenedCell>, AgentError> {
    let mut reader = XmlReader::from_reader(bytes);
    reader.config_mut().trim_text(false);
    let mut cells = Vec::new();
    let mut current: Option<CellBuilder> = None;
    let mut reading_value = false;
    loop {
        match reader.read_event().map_err(|_| AgentError::IoFailed)? {
            XmlEvent::Start(element) if element.local_name().as_ref() == b"c" => {
                if current.is_some() {
                    return Err(AgentError::IoFailed);
                }
                current = Some(CellBuilder {
                    reference: attribute(&reader, &element, b"r")?.ok_or(AgentError::IoFailed)?,
                    cell_type: attribute(&reader, &element, b"t")?,
                    style_index: attribute(&reader, &element, b"s")?
                        .map(|value| value.parse::<u32>().map_err(|_| AgentError::IoFailed))
                        .transpose()?,
                    value: String::new(),
                });
            }
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if element.local_name().as_ref() == b"f" =>
            {
                facts.formula_count += 1;
                return Err(AgentError::IoFailed);
            }
            XmlEvent::Start(element)
                if matches!(element.local_name().as_ref(), b"v" | b"t") && current.is_some() =>
            {
                reading_value = true;
            }
            XmlEvent::Text(text) if reading_value => {
                current
                    .as_mut()
                    .ok_or(AgentError::IoFailed)?
                    .value
                    .push_str(&text.decode().map_err(|_| AgentError::IoFailed)?);
            }
            XmlEvent::GeneralRef(reference) if reading_value => {
                current
                    .as_mut()
                    .ok_or(AgentError::IoFailed)?
                    .value
                    .push(resolve_reference(&reference)?);
            }
            XmlEvent::End(element) if matches!(element.local_name().as_ref(), b"v" | b"t") => {
                reading_value = false;
            }
            XmlEvent::End(element) if element.local_name().as_ref() == b"c" => {
                let cell = current.take().ok_or(AgentError::IoFailed)?;
                let value = match cell.cell_type.as_deref() {
                    Some("inlineStr" | "str") => {
                        facts.string_count += 1;
                        ReopenedValue::String(cell.value)
                    }
                    Some("b") => {
                        facts.boolean_count += 1;
                        ReopenedValue::Boolean(match cell.value.as_str() {
                            "1" | "true" => true,
                            "0" | "false" => false,
                            _ => return Err(AgentError::IoFailed),
                        })
                    }
                    None => {
                        let canonical =
                            canonical_decimal(&cell.value).map_err(|_| AgentError::IoFailed)?;
                        if canonical != cell.value {
                            return Err(AgentError::IoFailed);
                        }
                        facts.decimal_count += 1;
                        ReopenedValue::Decimal(cell.value)
                    }
                    _ => return Err(AgentError::IoFailed),
                };
                facts.cell_count += 1;
                cells.push(ReopenedCell {
                    reference: cell.reference,
                    style_index: cell.style_index,
                    value,
                });
            }
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if matches!(
                    element.local_name().as_ref(),
                    b"mergeCell" | b"hyperlink" | b"drawing" | b"oleObject"
                ) =>
            {
                return Err(AgentError::IoFailed);
            }
            XmlEvent::DocType(_) | XmlEvent::PI(_) | XmlEvent::CData(_) => {
                return Err(AgentError::IoFailed);
            }
            XmlEvent::Eof => break,
            _ => {}
        }
    }
    if current.is_some() || reading_value {
        return Err(AgentError::IoFailed);
    }
    Ok(cells)
}

fn attribute(
    reader: &XmlReader<&[u8]>,
    element: &BytesStart<'_>,
    key: &[u8],
) -> Result<Option<String>, AgentError> {
    for value in element.attributes().with_checks(true) {
        let value = value.map_err(|_| AgentError::IoFailed)?;
        if value.key.local_name().as_ref() == key {
            return value
                .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
                .map(|value| Some(value.into_owned()))
                .map_err(|_| AgentError::IoFailed);
        }
    }
    Ok(None)
}

fn resolve_reference(reference: &BytesRef<'_>) -> Result<char, AgentError> {
    if let Some(character) = reference
        .resolve_char_ref()
        .map_err(|_| AgentError::IoFailed)?
    {
        return Ok(character);
    }
    match reference
        .decode()
        .map_err(|_| AgentError::IoFailed)?
        .as_ref()
    {
        "amp" => Ok('&'),
        "lt" => Ok('<'),
        "gt" => Ok('>'),
        "quot" => Ok('"'),
        "apos" => Ok('\''),
        _ => Err(AgentError::IoFailed),
    }
}

fn coordinate_to_a1(row: u32, column: u16) -> Result<String, AgentError> {
    if row == 0 || row > MAX_ROWS || column == 0 || column > MAX_COLUMNS {
        return Err(AgentError::ArtifactContentInvalid);
    }
    let mut index = u32::from(column);
    let mut letters = Vec::new();
    while index > 0 {
        index -= 1;
        letters.push((b'A' + (index % 26) as u8) as char);
        index /= 26;
    }
    letters.reverse();
    Ok(format!("{}{row}", letters.into_iter().collect::<String>()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use fielora_contracts::{
        SpreadsheetCellV1, SpreadsheetDecimalV1, SpreadsheetLiteralV1, SpreadsheetSheetId,
        SpreadsheetSheetV1,
    };

    fn cell(row: u32, column: u16, value: SpreadsheetLiteralV1) -> SpreadsheetCellV1 {
        SpreadsheetCellV1 {
            row,
            column,
            value,
            format: None,
            presentation: None,
        }
    }

    fn workbook() -> SpreadsheetArtifactV1 {
        SpreadsheetArtifactV1 {
            title: Some("季度 & <Sales>".into()),
            sheets: vec![
                SpreadsheetSheetV1 {
                    sheet_id: SpreadsheetSheetId::new("summary"),
                    name: "Summary 中英".into(),
                    cells: vec![cell(2, 3, SpreadsheetLiteralV1::Boolean { value: true })],
                },
                SpreadsheetSheetV1 {
                    sheet_id: SpreadsheetSheetId::new("quarter_sales"),
                    name: "季度 & <销售>".into(),
                    cells: vec![
                        cell(
                            5,
                            7,
                            SpreadsheetLiteralV1::String {
                                value: "=WEBSERVICE(\"https://example.com?a=1&b=2\")".into(),
                            },
                        ),
                        cell(
                            6,
                            7,
                            SpreadsheetLiteralV1::String {
                                value: "=HYPERLINK(\"https://example.com\")".into(),
                            },
                        ),
                        cell(
                            7,
                            7,
                            SpreadsheetLiteralV1::String {
                                value: "+1+1".into(),
                            },
                        ),
                        cell(
                            8,
                            7,
                            SpreadsheetLiteralV1::String {
                                value: "-2+3".into(),
                            },
                        ),
                        cell(
                            9,
                            7,
                            SpreadsheetLiteralV1::String {
                                value: "@something".into(),
                            },
                        ),
                        cell(
                            1,
                            1,
                            SpreadsheetLiteralV1::String {
                                value: "中文产品 <Alpha> & English".into(),
                            },
                        ),
                        cell(
                            3,
                            4,
                            SpreadsheetLiteralV1::Decimal {
                                value: SpreadsheetDecimalV1("01.2500".into()),
                            },
                        ),
                    ],
                },
            ],
        }
    }

    #[test]
    fn canonicalizes_sheet_cell_order_and_decimal_lexemes() {
        let mut first = workbook();
        let mut second = workbook();
        second.sheets.reverse();
        for sheet in &mut second.sheets {
            sheet.cells.reverse();
        }
        let first_facts = canonicalize(&mut first).unwrap();
        let second_facts = canonicalize(&mut second).unwrap();
        assert_eq!(first, second);
        assert_eq!(first_facts, second_facts);
        assert_eq!(first.sheets[0].sheet_id.0, "quarter_sales");
        assert!(matches!(
            &first.sheets[0].cells[1].value,
            SpreadsheetLiteralV1::Decimal { value } if value.0 == "1.25"
        ));
    }

    #[test]
    fn decimal_contract_is_exact_and_bounded() {
        for (input, expected) in [
            ("1", "1"),
            ("1.0", "1"),
            ("01.000", "1"),
            ("-0.0", "0"),
            ("-12.3400", "-12.34"),
            ("0.000001", "0.000001"),
            ("999999999999999", "999999999999999"),
        ] {
            assert_eq!(canonical_decimal(input).unwrap(), expected);
        }
        for invalid in [
            "NaN",
            "Infinity",
            "-Infinity",
            "+1",
            "1e3",
            ".5",
            "1.",
            "0.0000001",
            "9999999999999999",
        ] {
            assert_eq!(
                canonical_decimal(invalid),
                Err(AgentError::ArtifactContentInvalid),
                "{invalid}"
            );
        }
    }

    #[test]
    fn rejects_identity_name_coordinate_and_value_collisions() {
        let mut cases = Vec::new();
        let mut duplicate_id = workbook();
        duplicate_id.sheets[1].sheet_id = duplicate_id.sheets[0].sheet_id.clone();
        cases.push(duplicate_id);
        let mut duplicate_name = workbook();
        duplicate_name.sheets[1].name = duplicate_name.sheets[0].name.to_uppercase();
        cases.push(duplicate_name);
        let mut invalid_name = workbook();
        invalid_name.sheets[0].name = "bad/name".into();
        cases.push(invalid_name);
        let mut long_name = workbook();
        long_name.sheets[0].name = "表".repeat(32);
        cases.push(long_name);
        let mut duplicate_cell = workbook();
        let repeated_cell = duplicate_cell.sheets[0].cells[0].clone();
        duplicate_cell.sheets[0].cells.push(repeated_cell);
        cases.push(duplicate_cell);
        let mut zero_row = workbook();
        zero_row.sheets[0].cells[0].row = 0;
        cases.push(zero_row);
        let mut zero_column = workbook();
        zero_column.sheets[0].cells[0].column = 0;
        cases.push(zero_column);
        for mut invalid in cases {
            assert_eq!(
                canonicalize(&mut invalid),
                Err(AgentError::ArtifactContentInvalid)
            );
        }
    }

    #[test]
    fn semantic_bounds_fail_closed_before_rendering() {
        let mut too_many_sheets = workbook();
        too_many_sheets.sheets = (0..33)
            .map(|index| SpreadsheetSheetV1 {
                sheet_id: SpreadsheetSheetId::new(format!("sheet_{index}")),
                name: format!("Sheet {index}"),
                cells: Vec::new(),
            })
            .collect();

        let mut too_many_cells = workbook();
        too_many_cells.sheets = vec![SpreadsheetSheetV1 {
            sheet_id: SpreadsheetSheetId::new("bounded"),
            name: "Bounded".into(),
            cells: (0..4_097)
                .map(|index| {
                    cell(
                        index / 256 + 1,
                        (index % 256 + 1) as u16,
                        SpreadsheetLiteralV1::Boolean { value: true },
                    )
                })
                .collect(),
        }];

        let mut oversized_text = workbook();
        oversized_text.sheets[0].cells[0].value = SpreadsheetLiteralV1::String {
            value: "x".repeat(MAX_CELL_TEXT_BYTES + 1),
        };

        let mut excessive_total_text = workbook();
        excessive_total_text.sheets = vec![SpreadsheetSheetV1 {
            sheet_id: SpreadsheetSheetId::new("text_budget"),
            name: "Text budget".into(),
            cells: (0..129)
                .map(|index| {
                    cell(
                        index + 1,
                        1,
                        SpreadsheetLiteralV1::String {
                            value: "x".repeat(1_024),
                        },
                    )
                })
                .collect(),
        }];

        let mut row_overflow = workbook();
        row_overflow.sheets[0].cells[0].row = MAX_ROWS + 1;
        let mut column_overflow = workbook();
        column_overflow.sheets[0].cells[0].column = MAX_COLUMNS + 1;

        for mut invalid in [
            too_many_sheets,
            too_many_cells,
            oversized_text,
            excessive_total_text,
            row_overflow,
            column_overflow,
        ] {
            assert_eq!(
                canonicalize(&mut invalid),
                Err(AgentError::ArtifactContentInvalid)
            );
        }
    }

    #[test]
    fn closed_format_and_presentation_intents_map_to_writer_styles() {
        let styled = SpreadsheetCellV1 {
            row: 1,
            column: 1,
            value: SpreadsheetLiteralV1::Decimal {
                value: SpreadsheetDecimalV1("12.5".into()),
            },
            format: Some(SpreadsheetFormatIntentV1::Percent2),
            presentation: Some(SpreadsheetCellPresentationIntentV1 {
                emphasis: SpreadsheetCellEmphasis::Header,
                alignment: SpreadsheetCellAlignment::Center,
                wrap: true,
            }),
        };
        let style = cell_style(&styled).unwrap();
        assert!(matches!(style.number_format, NumberFormat::Percent2));
        assert!(style.bold);
        assert_eq!(style.background_color.as_deref(), Some("D9EAF7"));
        assert!(matches!(style.h_align, Some(HAlign::Center)));
        assert!(style.wrap_text);

        let total = SpreadsheetCellV1 {
            presentation: Some(SpreadsheetCellPresentationIntentV1 {
                emphasis: SpreadsheetCellEmphasis::Total,
                alignment: SpreadsheetCellAlignment::Right,
                wrap: false,
            }),
            format: Some(SpreadsheetFormatIntentV1::Decimal2),
            ..styled
        };
        let style = cell_style(&total).unwrap();
        assert!(matches!(style.number_format, NumberFormat::Decimal2));
        assert!(style.bold);
        assert_eq!(style.background_color.as_deref(), Some("E8E8E8"));
        assert!(matches!(style.h_align, Some(HAlign::Right)));
        assert!(!style.wrap_text);
    }

    #[test]
    fn structural_security_checks_reject_formula_external_and_macro_content() {
        let worksheet = br#"<?xml version="1.0" encoding="UTF-8"?>
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <sheetData><row r="1"><c r="A1"><f>WEBSERVICE("https://example.com")</f><v>1</v></c></row></sheetData>
            </worksheet>"#;
        let mut facts = SpreadsheetRenderFacts {
            sheet_count: 1,
            cell_count: 0,
            string_count: 0,
            decimal_count: 0,
            boolean_count: 0,
            formula_count: 0,
            external_relationship_count: 0,
            macro_part_count: 0,
        };
        assert_eq!(
            parse_worksheet(worksheet, &mut facts),
            Err(AgentError::IoFailed)
        );
        assert_eq!(facts.formula_count, 1);

        let external_relationship = br#"<?xml version="1.0" encoding="UTF-8"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
            </Relationships>"#;
        assert_eq!(
            validate_relationships(external_relationship),
            Err(AgentError::IoFailed)
        );
        assert!(contains_forbidden_content_type(
            br#"<Override ContentType="application/vnd.ms-office.vbaProject"/>"#
        ));
    }

    #[test]
    fn renders_and_independently_reopens_special_and_formula_like_literals() {
        let mut workbook = workbook();
        let expected = canonicalize(&mut workbook).unwrap();
        let first = render(&workbook).unwrap();
        let second = render(&workbook).unwrap();
        assert_eq!(first.bytes, second.bytes);
        assert_eq!(first.facts.sheet_count, expected.sheet_count);
        assert_eq!(first.facts.cell_count, expected.cell_count);
        assert_eq!(first.facts.formula_count, 0);
        assert_eq!(first.facts.external_relationship_count, 0);
        assert_eq!(first.facts.macro_part_count, 0);
        reopen(&first, &first.bytes).unwrap();
    }
}
