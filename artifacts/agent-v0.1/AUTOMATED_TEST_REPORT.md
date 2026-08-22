# Complete Agent V0.1 Automated Test Report

Date: 2026-08-18
Overall for this desktop remediation: **PASS_WITH_PROVIDER_CONFIGURATION_BLOCKER**

## Passing gates

- TypeScript unit: 51 passed, 0 failed.
- Rust workspace: 42 passed, 0 failed.
- Core integration: 8 passed, 0 failed.
- Desktop Phase 02 dev regression: PASS.
- Agent Desktop Foundation: dev PASS, packaged PASS, fresh-extracted portable PASS. This now covers custom controls, Provider refresh/probe, rename/delete, Git environment actions, responsive narrow headers, and persisted message-dot navigation.
- Unified shell: PASS. Only navigation + main + optional right utility may be visible; Files/Review closes Browser utility before opening. Conversation header no longer duplicates Files/Review, and Browser exists only in the right utility list.
- Focus/sidebar semantics: PASS. Utility focus preserves the left Project navigation and expands the right tool surface across the remaining work area; the top-left control independently collapses navigation through a nonzero grid/opacity/transform transition.
- Window-right controls: PASS. The same control DOM stays anchored to the window right edge before and after utility expansion (measured shift <= 0.5 CSS px). The group has no border/background/shadow; only the hovered icon receives a light raised shadow, and the utility-focus icon exists only while the right utility is open.
- Real right-panel motion: PASS. The utility mounts at zero width before `utility-open`; 10 consecutive animation-frame samples measured more than 80 CSS px of progressive main-content width change instead of a one-frame appearance.
- Divider/background treatment: PASS. Project/Chrome/File hard dividers are removed; menu chrome and left navigation use the same background, and the right utility edge is exactly one 1px divider at alpha 0.055 with no shadow double-line.
- Shared workspace component: PASS. Project and Settings now render through the same `WorkspaceSurface`, use the same real `ResizableDivider`, and persist one shared navigation width. The E2E drags Settings, verifies contiguous navigation/divider/content geometry, returns to Project, and proves the final width is reused.
- Terminal scope: PASS. Terminal exists in the desktop-level bottom layer after the left navigation, never inside the Conversation column or the left sidebar. The navigation itself continues to the bottom of the work area while the Terminal starts exactly at the Conversation left edge. Ctrl+backtick in Settings stays in Settings and does not create/navigate to “新对话”.
- Unified top actions: PASS. Environment is portalled into the same window-right control dock as Terminal and the right-sidebar toggle. Runtime geometry measures all three at 34px with <=0.5 CSS px center-line delta, and their computed hover color, background, shadow and transform are identical.
- Quiet Workbench design contract: PASS. `FIELORA_DESIGN_LANGUAGE_V0.1.md` defines the product principles, Surface grammar, typography, geometry, motion, primitives and maintenance rules used by the desktop.
- Semantic design layers: PASS. Renderer load order is tokens → foundation → legacy feature compatibility → canonical controls; tokens cover color/type/geometry/motion/elevation, while foundation and shared controls contain no raw color literals.
- Shared UI primitives: PASS. Button, IconButton, ToolbarAction, SelectMenu and TextActionDialog are canonical React controls; Environment/Terminal/sidebar actions and the Conversation action menu consume them.
- Migration guard: PASS. Legacy raw-color occurrences fell from the audit baseline of 479 to 408 and a static non-increasing budget prevents new debt while existing Surfaces migrate incrementally.
- Settings and motion: PASS. Settings and Project navigation share the same 12px UI font stack, resizable shell, rounded workspace language and motion rules; right-utility controls remain absent in Settings, and OS `prefers-reduced-motion` is authoritative.
- Windows icon: PASS. Alpha-bound fitting produces a 228×226 visible mark in the 256px frame; the packaged EXE associated icon was extracted and visually checked.
- Conversation action menu: PASS. It is attached to the title and dismisses on outside pointer or Escape.
- Browse: dev PASS, release packaged PASS, and fresh-extracted portable PASS, including native WebContents geometry, utility resize, system clipboard, security and session flows.
- Full `pnpm verify:premerge`: PASS, including Context/Contracts, TypeScript, Rust fmt/unit/clippy, Core integration, Phase 02, Browse with native Clipboard, and Desktop Foundation.
- Packaged upgrade-collision/single-instance lifecycle: PASS.
- Release Core build and Windows x64 Electron package: PASS.
- Quiet Workbench supplemental package: PASS in release packaged and fresh-extracted portable Desktop Foundation + complete Browse regression. ZIP: `artifacts/design-system-v0.1/Fielora-Quiet-Workbench-V0.1-win-x64.zip`; bytes `153198902`; SHA-256 `ae077c0859cd2571d5ff1843934f03d0fed4c358e087632cfb8c0ce61a9d7251`.

The Agent Desktop E2E proves native tool proposal, one-time approval, a real project file write, command verification, persisted assistant output, timeline rendering, and restart recovery. Machine evidence is in `DEV_DESKTOP_FOUNDATION_ACCEPTANCE.json`, `PACKAGED_DESKTOP_FOUNDATION_ACCEPTANCE.json`, and `PORTABLE_DESKTOP_FOUNDATION_ACCEPTANCE.json`.

## Remaining blockers / environment notes

- Saved-provider live probe: FAIL with redacted `PROVIDER_UNAVAILABLE`. The persisted record is `OPENAI` with model `Qwen3.7-plus` and no custom Base URL, which is not a coherent OpenAI-compatible Qwen configuration. Credential bytes and response bodies were never read or printed by the probe script.
- Golden model-quality tasks: NOT_PASS. Deterministic harness/security/recovery tasks are recorded individually, but model-dependent coding quality, compaction-and-continue, and no-native-tool proposal fallback remain open.

Therefore this UI/workflow/package remediation is engineering-verified, while a leading/live coding-quality claim remains blocked until an actually reachable Provider configuration passes the same probe and golden tasks.
