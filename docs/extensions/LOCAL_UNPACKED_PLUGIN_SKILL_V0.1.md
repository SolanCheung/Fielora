# Local unpacked Plugin Skill — V0.1 authoring note

**Status:** FIRST SLICE / DECLARATIVE ONLY

Fielora V0.1 can admit a local unpacked Plugin root only when trusted product
or test code supplies that exact root explicitly. It does not scan, install,
enable, persist, or execute Plugin code.

The root contains an exact `fielora.json` and one or more declared standard
Agent Skill directories:

```text
plugin-root/
├── fielora.json
└── skills/
    └── example-skill/
        └── SKILL.md
```

The First Slice manifest is strict:

```json
{
  "id": "example.plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "publisher": "example",
  "engines": { "fielora": ">=0.1" },
  "contributes": { "skills": ["skills/example-skill"] }
}
```

Only these fields and only `contributes.skills` are supported. Unknown fields,
unsupported engine expressions, invalid or escaping paths, duplicate identity,
and Skill-name collisions fail closed. The `publisher` value is only an
unverified namespace. Every admitted package and Skill has
`UNTRUSTED_LOCAL_PLUGIN` trust.

Discovery admits metadata only. `SKILL.md` body text enters Context only through
the existing `load_skill` path. Skill resources and `allowed-tools` are passive
metadata: they grant no Tool, permission, credential, MCP, process, subagent, or
Verification authority.
