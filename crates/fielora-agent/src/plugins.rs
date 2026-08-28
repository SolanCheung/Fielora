use crate::sha256;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use thiserror::Error;

pub const LOCAL_UNPACKED_PLUGIN_MANIFEST: &str = "fielora.json";
pub const MAX_LOCAL_UNPACKED_PLUGINS: usize = 16;
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
const MAX_PLUGIN_ID_BYTES: usize = 128;
const MAX_PLUGIN_NAME_CHARS: usize = 120;
const MAX_PUBLISHER_BYTES: usize = 64;
const MAX_VERSION_BYTES: usize = 64;
const MAX_ENGINE_EXPRESSION_BYTES: usize = 64;
const MAX_SKILL_CONTRIBUTIONS: usize = 16;
const MAX_CONTRIBUTION_PATH_CHARS: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum PluginSourceKind {
    LocalUnpackedPlugin,
}

impl PluginSourceKind {
    pub fn id(self) -> &'static str {
        match self {
            Self::LocalUnpackedPlugin => "LOCAL_UNPACKED_PLUGIN",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum PluginTrust {
    UntrustedLocalPlugin,
}

impl PluginTrust {
    pub fn id(self) -> &'static str {
        match self {
            Self::UntrustedLocalPlugin => "UNTRUSTED_LOCAL_PLUGIN",
        }
    }
}

/// The authoritative typed shape for the first declarative Plugin slice.
/// Unknown fields are rejected because future fields may carry execution
/// semantics that this host does not implement.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub engines: PluginEngines,
    pub contributes: PluginContributions,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginEngines {
    pub fielora: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PluginContributions {
    pub skills: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PluginSkillContributionSnapshot {
    pub name: String,
    pub relative_path: String,
    pub content_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PluginSnapshot {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub engine_requirement: String,
    pub source_kind: String,
    pub trust: String,
    pub manifest_digest: String,
    pub skills: Vec<PluginSkillContributionSnapshot>,
    pub plugin_snapshot_digest: String,
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum PluginError {
    #[error("PLUGIN_ROOT_INVALID")]
    RootInvalid,
    #[error("PLUGIN_MANIFEST_NOT_FOUND")]
    ManifestNotFound,
    #[error("PLUGIN_MANIFEST_TOO_LARGE")]
    ManifestTooLarge,
    #[error("PLUGIN_MANIFEST_INVALID")]
    ManifestInvalid,
    #[error("PLUGIN_MANIFEST_UNSUPPORTED")]
    ManifestUnsupported,
    #[error("PLUGIN_ID_INVALID")]
    IdInvalid,
    #[error("PLUGIN_ID_RESERVED")]
    IdReserved,
    #[error("PLUGIN_ID_DUPLICATE")]
    DuplicateId,
    #[error("PLUGIN_NAME_INVALID")]
    NameInvalid,
    #[error("PLUGIN_VERSION_INVALID")]
    VersionInvalid,
    #[error("PLUGIN_ENGINE_RANGE_UNSUPPORTED")]
    EngineRangeUnsupported,
    #[error("PLUGIN_ENGINE_INCOMPATIBLE")]
    EngineIncompatible,
    #[error("PLUGIN_CONTRIBUTION_INVALID")]
    ContributionInvalid,
    #[error("PLUGIN_CONTRIBUTION_DUPLICATE")]
    DuplicateContribution,
    #[error("PLUGIN_PATH_ESCAPE")]
    PathEscape,
    #[error("PLUGIN_SKILL_INVALID")]
    SkillInvalid,
    #[error("PLUGIN_SKILL_COLLISION")]
    SkillCollision,
    #[error("PLUGIN_CHANGED")]
    Changed,
    #[error("PLUGIN_IO_FAILED")]
    IoFailed,
}

impl PluginError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::RootInvalid => "PLUGIN_ROOT_INVALID",
            Self::ManifestNotFound => "PLUGIN_MANIFEST_NOT_FOUND",
            Self::ManifestTooLarge => "PLUGIN_MANIFEST_TOO_LARGE",
            Self::ManifestInvalid => "PLUGIN_MANIFEST_INVALID",
            Self::ManifestUnsupported => "PLUGIN_MANIFEST_UNSUPPORTED",
            Self::IdInvalid => "PLUGIN_ID_INVALID",
            Self::IdReserved => "PLUGIN_ID_RESERVED",
            Self::DuplicateId => "PLUGIN_ID_DUPLICATE",
            Self::NameInvalid => "PLUGIN_NAME_INVALID",
            Self::VersionInvalid => "PLUGIN_VERSION_INVALID",
            Self::EngineRangeUnsupported => "PLUGIN_ENGINE_RANGE_UNSUPPORTED",
            Self::EngineIncompatible => "PLUGIN_ENGINE_INCOMPATIBLE",
            Self::ContributionInvalid => "PLUGIN_CONTRIBUTION_INVALID",
            Self::DuplicateContribution => "PLUGIN_CONTRIBUTION_DUPLICATE",
            Self::PathEscape => "PLUGIN_PATH_ESCAPE",
            Self::SkillInvalid => "PLUGIN_SKILL_INVALID",
            Self::SkillCollision => "PLUGIN_SKILL_COLLISION",
            Self::Changed => "PLUGIN_CHANGED",
            Self::IoFailed => "PLUGIN_IO_FAILED",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct PluginSkillDeclaration {
    pub relative_path: String,
    pub canonical_directory: PathBuf,
    pub canonical_skill_file: PathBuf,
}

#[derive(Debug, Clone)]
pub(crate) struct DiscoveredPlugin {
    pub requested_root: PathBuf,
    pub canonical_root: PathBuf,
    pub canonical_manifest_path: PathBuf,
    pub manifest: PluginManifest,
    pub manifest_bytes: Vec<u8>,
    pub manifest_digest: String,
    pub declarations: Vec<PluginSkillDeclaration>,
}

pub(crate) fn discover_local_unpacked_plugin(
    requested_root: &Path,
) -> Result<DiscoveredPlugin, PluginError> {
    let canonical_root = requested_root
        .canonicalize()
        .map_err(|_| PluginError::RootInvalid)?;
    if !fs::metadata(&canonical_root).is_ok_and(|metadata| metadata.is_dir()) {
        return Err(PluginError::RootInvalid);
    }
    let manifest_path = exact_manifest_path(&canonical_root)?;
    let canonical_manifest_path = manifest_path
        .canonicalize()
        .map_err(|_| PluginError::ManifestNotFound)?;
    if !canonical_manifest_path.starts_with(&canonical_root)
        || !fs::metadata(&canonical_manifest_path).is_ok_and(|metadata| metadata.is_file())
    {
        return Err(PluginError::PathEscape);
    }
    let manifest_bytes = read_bounded_manifest(&canonical_manifest_path)?;
    let manifest = parse_manifest(&manifest_bytes)?;
    validate_manifest(&manifest)?;

    let mut seen_paths = HashSet::new();
    let mut seen_canonical = HashSet::new();
    let mut declarations = Vec::with_capacity(manifest.contributes.skills.len());
    for relative_path in &manifest.contributes.skills {
        validate_contribution_path(relative_path)?;
        if !seen_paths.insert(relative_path.clone()) {
            return Err(PluginError::DuplicateContribution);
        }
        let directory = relative_path
            .split('/')
            .fold(canonical_root.clone(), |path, segment| path.join(segment));
        let canonical_directory = directory
            .canonicalize()
            .map_err(|_| PluginError::SkillInvalid)?;
        if !canonical_directory.starts_with(&canonical_root)
            || !fs::metadata(&canonical_directory).is_ok_and(|metadata| metadata.is_dir())
        {
            return Err(PluginError::PathEscape);
        }
        if !seen_canonical.insert(canonical_directory.clone()) {
            return Err(PluginError::DuplicateContribution);
        }
        let canonical_skill_file = exact_skill_path(&canonical_directory)?
            .canonicalize()
            .map_err(|_| PluginError::SkillInvalid)?;
        if !canonical_skill_file.starts_with(&canonical_root)
            || !canonical_skill_file.starts_with(&canonical_directory)
            || !fs::metadata(&canonical_skill_file).is_ok_and(|metadata| metadata.is_file())
        {
            return Err(PluginError::PathEscape);
        }
        declarations.push(PluginSkillDeclaration {
            relative_path: relative_path.clone(),
            canonical_directory,
            canonical_skill_file,
        });
    }

    Ok(DiscoveredPlugin {
        requested_root: requested_root.to_path_buf(),
        canonical_root,
        canonical_manifest_path,
        manifest_bytes: manifest_bytes.clone(),
        manifest_digest: sha256(&manifest_bytes),
        manifest,
        declarations,
    })
}

pub(crate) fn revalidate_manifest(plugin: &DiscoveredPlugin) -> Result<(), PluginError> {
    let current_root = plugin
        .requested_root
        .canonicalize()
        .map_err(|_| PluginError::Changed)?;
    if current_root != plugin.canonical_root {
        return Err(PluginError::Changed);
    }
    let current_manifest = exact_manifest_path(&current_root).map_err(|_| PluginError::Changed)?;
    let canonical_manifest = current_manifest
        .canonicalize()
        .map_err(|_| PluginError::Changed)?;
    if canonical_manifest != plugin.canonical_manifest_path
        || !canonical_manifest.starts_with(&current_root)
    {
        return Err(PluginError::Changed);
    }
    let bytes = read_bounded_manifest(&canonical_manifest).map_err(|_| PluginError::Changed)?;
    if sha256(&bytes) != plugin.manifest_digest {
        return Err(PluginError::Changed);
    }
    Ok(())
}

pub(crate) fn build_plugin_snapshot(
    plugin: &DiscoveredPlugin,
    skills: Vec<PluginSkillContributionSnapshot>,
) -> PluginSnapshot {
    let mut hasher = Sha256::new();
    hasher.update(b"fielora-plugin-snapshot-v1\0");
    hash_field(&mut hasher, &plugin.manifest_bytes);
    for skill in &skills {
        hash_field(&mut hasher, b"skill");
        hash_field(&mut hasher, skill.relative_path.as_bytes());
        hash_field(&mut hasher, skill.name.as_bytes());
        hash_field(&mut hasher, skill.content_digest.as_bytes());
    }
    PluginSnapshot {
        id: plugin.manifest.id.clone(),
        name: plugin.manifest.name.clone(),
        version: plugin.manifest.version.clone(),
        publisher: plugin.manifest.publisher.clone(),
        engine_requirement: plugin.manifest.engines.fielora.clone(),
        source_kind: PluginSourceKind::LocalUnpackedPlugin.id().into(),
        trust: PluginTrust::UntrustedLocalPlugin.id().into(),
        manifest_digest: plugin.manifest_digest.clone(),
        skills,
        plugin_snapshot_digest: format!("{:x}", hasher.finalize()),
    }
}

fn parse_manifest(bytes: &[u8]) -> Result<PluginManifest, PluginError> {
    let text = std::str::from_utf8(bytes).map_err(|_| PluginError::ManifestInvalid)?;
    serde_json::from_str(text).map_err(|error| {
        if error.to_string().contains("unknown field") {
            PluginError::ManifestUnsupported
        } else {
            PluginError::ManifestInvalid
        }
    })
}

fn validate_manifest(manifest: &PluginManifest) -> Result<(), PluginError> {
    if !valid_plugin_id(&manifest.id) || manifest.publisher.len() > MAX_PUBLISHER_BYTES {
        return Err(PluginError::IdInvalid);
    }
    let publisher = manifest.id.split('.').next().unwrap_or_default();
    if publisher != manifest.publisher || !valid_identifier_segment(&manifest.publisher) {
        return Err(PluginError::IdInvalid);
    }
    if publisher == "fielora" {
        return Err(PluginError::IdReserved);
    }
    let name_chars = manifest.name.chars().count();
    if manifest.name.trim().is_empty()
        || manifest.name.chars().any(char::is_control)
        || !(1..=MAX_PLUGIN_NAME_CHARS).contains(&name_chars)
    {
        return Err(PluginError::NameInvalid);
    }
    parse_core_version(&manifest.version).ok_or(PluginError::VersionInvalid)?;
    if manifest.version.len() > MAX_VERSION_BYTES {
        return Err(PluginError::VersionInvalid);
    }
    let minimum = parse_engine_minimum(&manifest.engines.fielora)?;
    let current = parse_core_version(env!("CARGO_PKG_VERSION"))
        .expect("workspace package version must be a SemVer core version");
    if current < minimum {
        return Err(PluginError::EngineIncompatible);
    }
    if !(1..=MAX_SKILL_CONTRIBUTIONS).contains(&manifest.contributes.skills.len()) {
        return Err(PluginError::ContributionInvalid);
    }
    Ok(())
}

fn valid_plugin_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    if !(3..=MAX_PLUGIN_ID_BYTES).contains(&bytes.len()) || !value.is_ascii() {
        return false;
    }
    let mut segments = value.split('.');
    let first = segments.next();
    let second = segments.next();
    first.is_some_and(valid_identifier_segment)
        && second.is_some_and(valid_identifier_segment)
        && segments.next().is_none()
}

fn valid_identifier_segment(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && !value.ends_with('-')
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn parse_core_version(value: &str) -> Option<(u64, u64, u64)> {
    let mut parts = value.split('.');
    let major = parse_version_component(parts.next()?)?;
    let minor = parse_version_component(parts.next()?)?;
    let patch = parse_version_component(parts.next()?)?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

fn parse_version_component(value: &str) -> Option<u64> {
    if value.is_empty()
        || !value.bytes().all(|byte| byte.is_ascii_digit())
        || (value.len() > 1 && value.starts_with('0'))
    {
        return None;
    }
    value.parse().ok()
}

fn parse_engine_minimum(value: &str) -> Result<(u64, u64, u64), PluginError> {
    if value.len() > MAX_ENGINE_EXPRESSION_BYTES || !value.starts_with(">=") {
        return Err(PluginError::EngineRangeUnsupported);
    }
    let version = &value[2..];
    let parts = version.split('.').collect::<Vec<_>>();
    match parts.as_slice() {
        [major, minor] => Ok((
            parse_version_component(major).ok_or(PluginError::EngineRangeUnsupported)?,
            parse_version_component(minor).ok_or(PluginError::EngineRangeUnsupported)?,
            0,
        )),
        [major, minor, patch] => Ok((
            parse_version_component(major).ok_or(PluginError::EngineRangeUnsupported)?,
            parse_version_component(minor).ok_or(PluginError::EngineRangeUnsupported)?,
            parse_version_component(patch).ok_or(PluginError::EngineRangeUnsupported)?,
        )),
        _ => Err(PluginError::EngineRangeUnsupported),
    }
}

fn validate_contribution_path(value: &str) -> Result<(), PluginError> {
    if value.chars().count() > MAX_CONTRIBUTION_PATH_CHARS
        || value.is_empty()
        || value.contains('\0')
        || value.contains('\\')
        || value.contains(':')
        || Path::new(value).is_absolute()
    {
        return Err(PluginError::ContributionInvalid);
    }
    let segments = value.split('/').collect::<Vec<_>>();
    if segments.len() != 2
        || segments[0] != "skills"
        || segments.iter().any(|segment| {
            segment.is_empty()
                || *segment == "."
                || *segment == ".."
                || !segment.is_ascii()
                || !segment.bytes().all(|byte| {
                    byte.is_ascii_lowercase()
                        || byte.is_ascii_digit()
                        || byte == b'-'
                        || byte == b'_'
                })
        })
        || Path::new(value)
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(PluginError::ContributionInvalid);
    }
    Ok(())
}

fn exact_manifest_path(root: &Path) -> Result<PathBuf, PluginError> {
    let entries = fs::read_dir(root).map_err(|_| PluginError::IoFailed)?;
    for entry in entries {
        let entry = entry.map_err(|_| PluginError::IoFailed)?;
        if entry.file_name().to_str() == Some(LOCAL_UNPACKED_PLUGIN_MANIFEST) {
            return Ok(entry.path());
        }
    }
    Err(PluginError::ManifestNotFound)
}

fn exact_skill_path(directory: &Path) -> Result<PathBuf, PluginError> {
    let entries = fs::read_dir(directory).map_err(|_| PluginError::SkillInvalid)?;
    for entry in entries {
        let entry = entry.map_err(|_| PluginError::SkillInvalid)?;
        if entry.file_name().to_str() == Some("SKILL.md") {
            return Ok(entry.path());
        }
    }
    Err(PluginError::SkillInvalid)
}

fn read_bounded_manifest(path: &Path) -> Result<Vec<u8>, PluginError> {
    let metadata = fs::metadata(path).map_err(|_| PluginError::ManifestNotFound)?;
    if !metadata.is_file() {
        return Err(PluginError::ManifestNotFound);
    }
    if metadata.len() > MAX_MANIFEST_BYTES {
        return Err(PluginError::ManifestTooLarge);
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(path)
        .map_err(|_| PluginError::IoFailed)?
        .take(MAX_MANIFEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| PluginError::IoFailed)?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(PluginError::ManifestTooLarge);
    }
    Ok(bytes)
}

fn hash_field(hasher: &mut Sha256, value: &[u8]) {
    hasher.update((value.len() as u64).to_le_bytes());
    hasher.update(value);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[cfg(windows)]
    use std::process::Command;
    use uuid::Uuid;

    fn plugin_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("fielora-plugin-{}", Uuid::now_v7()));
        fs::create_dir_all(root.join("skills/fixture-plugin-skill")).unwrap();
        fs::write(
            root.join("skills/fixture-plugin-skill/SKILL.md"),
            "---\nname: fixture-plugin-skill\ndescription: Declarative fixture Skill.\n---\nfixture body",
        )
        .unwrap();
        root
    }

    fn valid_manifest() -> serde_json::Value {
        serde_json::json!({
            "id":"fixture.plugin",
            "name":"Fixture Plugin",
            "version":"1.0.0",
            "publisher":"fixture",
            "engines":{"fielora":">=0.1"},
            "contributes":{"skills":["skills/fixture-plugin-skill"]}
        })
    }

    fn write_manifest(root: &Path, value: &serde_json::Value) {
        fs::write(root.join(LOCAL_UNPACKED_PLUGIN_MANIFEST), value.to_string()).unwrap();
    }

    #[test]
    fn parses_the_bounded_first_slice_manifest() {
        let root = plugin_root();
        write_manifest(&root, &valid_manifest());
        let plugin = discover_local_unpacked_plugin(&root).unwrap();
        assert_eq!(plugin.manifest.id, "fixture.plugin");
        assert_eq!(plugin.declarations.len(), 1);
        assert_eq!(plugin.manifest_digest.len(), 64);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_missing_malformed_unknown_and_oversized_manifests() {
        let root = plugin_root();
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::ManifestNotFound
        );
        fs::write(root.join(LOCAL_UNPACKED_PLUGIN_MANIFEST), b"{").unwrap();
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::ManifestInvalid
        );
        let mut unknown = valid_manifest();
        unknown["mcp"] = serde_json::json!([]);
        write_manifest(&root, &unknown);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::ManifestUnsupported
        );
        fs::write(
            root.join(LOCAL_UNPACKED_PLUGIN_MANIFEST),
            vec![b'x'; MAX_MANIFEST_BYTES as usize + 1],
        )
        .unwrap();
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::ManifestTooLarge
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_each_missing_required_manifest_field() {
        for field in [
            "id",
            "name",
            "version",
            "publisher",
            "engines",
            "contributes",
        ] {
            let root = plugin_root();
            let mut manifest = valid_manifest();
            manifest.as_object_mut().unwrap().remove(field);
            write_manifest(&root, &manifest);
            assert_eq!(
                discover_local_unpacked_plugin(&root).unwrap_err(),
                PluginError::ManifestInvalid,
                "missing {field} must fail closed"
            );
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn rejects_invalid_identity_version_and_engine_claims() {
        let cases = [
            (
                "id",
                serde_json::json!("Fixture.plugin"),
                PluginError::IdInvalid,
            ),
            (
                "publisher",
                serde_json::json!("other"),
                PluginError::IdInvalid,
            ),
            (
                "version",
                serde_json::json!("1.0"),
                PluginError::VersionInvalid,
            ),
        ];
        for (field, value, expected) in cases {
            let root = plugin_root();
            let mut manifest = valid_manifest();
            manifest[field] = value;
            write_manifest(&root, &manifest);
            assert_eq!(discover_local_unpacked_plugin(&root).unwrap_err(), expected);
            fs::remove_dir_all(root).unwrap();
        }

        let root = plugin_root();
        let mut reserved = valid_manifest();
        reserved["id"] = serde_json::json!("fielora.plugin");
        reserved["publisher"] = serde_json::json!("fielora");
        write_manifest(&root, &reserved);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::IdReserved
        );
        fs::remove_dir_all(root).unwrap();

        let root = plugin_root();
        let mut manifest = valid_manifest();
        manifest["engines"]["fielora"] = serde_json::json!("^0.1");
        write_manifest(&root, &manifest);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::EngineRangeUnsupported
        );
        manifest["engines"]["fielora"] = serde_json::json!(">=999.0");
        write_manifest(&root, &manifest);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::EngineIncompatible
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_duplicate_and_non_contained_contribution_paths() {
        let cases = [
            "../outside",
            "C:/outside",
            "skills/../outside",
            "skills\\outside",
        ];
        for path in cases {
            let root = plugin_root();
            let mut manifest = valid_manifest();
            manifest["contributes"]["skills"] = serde_json::json!([path]);
            write_manifest(&root, &manifest);
            assert_eq!(
                discover_local_unpacked_plugin(&root).unwrap_err(),
                PluginError::ContributionInvalid
            );
            fs::remove_dir_all(root).unwrap();
        }

        let root = plugin_root();
        let mut manifest = valid_manifest();
        manifest["contributes"]["skills"] =
            serde_json::json!(["skills/fixture-plugin-skill", "skills/fixture-plugin-skill"]);
        write_manifest(&root, &manifest);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::DuplicateContribution
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_missing_declared_directory_and_missing_exact_skill_file() {
        let root = plugin_root();
        let mut manifest = valid_manifest();
        manifest["contributes"]["skills"] = serde_json::json!(["skills/missing-skill"]);
        write_manifest(&root, &manifest);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::SkillInvalid
        );

        manifest["contributes"]["skills"] = serde_json::json!(["skills/fixture-plugin-skill"]);
        fs::rename(
            root.join("skills/fixture-plugin-skill/SKILL.md"),
            root.join("skills/fixture-plugin-skill/NOT_SKILL.md"),
        )
        .unwrap();
        write_manifest(&root, &manifest);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::SkillInvalid
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn enforces_field_path_and_contribution_count_bounds() {
        let root = plugin_root();
        let mut manifest = valid_manifest();
        manifest["name"] = serde_json::json!("n".repeat(MAX_PLUGIN_NAME_CHARS + 1));
        write_manifest(&root, &manifest);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::NameInvalid
        );

        manifest = valid_manifest();
        manifest["contributes"]["skills"] = serde_json::json!([]);
        write_manifest(&root, &manifest);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::ContributionInvalid
        );

        manifest["contributes"]["skills"] = serde_json::json!(
            (0..=MAX_SKILL_CONTRIBUTIONS)
                .map(|index| format!("skills/fixture-{index}"))
                .collect::<Vec<_>>()
        );
        write_manifest(&root, &manifest);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::ContributionInvalid
        );

        manifest = valid_manifest();
        manifest["contributes"]["skills"] = serde_json::json!([format!(
            "skills/{}",
            "a".repeat(MAX_CONTRIBUTION_PATH_CHARS)
        )]);
        write_manifest(&root, &manifest);
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::ContributionInvalid
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn rejects_junction_escape() {
        let root = plugin_root();
        let outside = plugin_root();
        fs::remove_dir_all(root.join("skills/fixture-plugin-skill")).unwrap();
        let status = Command::new("cmd.exe")
            .args(["/D", "/C", "mklink", "/J"])
            .arg(root.join("skills").join("fixture-plugin-skill"))
            .arg(outside.join("skills").join("fixture-plugin-skill"))
            .status()
            .unwrap();
        assert!(status.success());
        write_manifest(&root, &valid_manifest());
        assert_eq!(
            discover_local_unpacked_plugin(&root).unwrap_err(),
            PluginError::PathEscape
        );
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn manifest_snapshot_revalidation_is_fail_closed() {
        let root = plugin_root();
        write_manifest(&root, &valid_manifest());
        let plugin = discover_local_unpacked_plugin(&root).unwrap();
        revalidate_manifest(&plugin).unwrap();
        let mut changed = valid_manifest();
        changed["name"] = serde_json::json!("Changed Fixture");
        write_manifest(&root, &changed);
        assert_eq!(
            revalidate_manifest(&plugin).unwrap_err(),
            PluginError::Changed
        );
        fs::remove_dir_all(root).unwrap();
    }
}
