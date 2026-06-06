# Changelog

## v3.0.0 (2026-06-06)

### Breaking Changes

- **New entry point:** Project is now a **pi-agent extension**, no longer a standalone CLI. Use `/review` inside pi-agent TUI.
- Removed `review_cli.mjs`, `review_cli.py`, `lib/session.mjs`, `lib/terminal.mjs` — archived to `workspace/docs/legacy/`.
- `package.json` renamed from `cpp-review-assistant` to `pi-review`.

### Added

- Pi-agent extension (`extensions/review/index.ts`) registering 3 commands (`/review`, `/review-init`, `/review-fix`) and 9 tools (`review_card`, `review_exam_points`, `review_chapter`, `review_answer`, `review_archive`, `review_turn_action`, `review_summary`, `review_profile_write`, `review_profile_enable`).
- **Three review modes:** concept card + practice, direct practice, chapter study — all with unified post-question action menu.
- **5-level difficulty system:** S-R / S-U / M-U / M-A / C-A (breadth × cognitive depth).
- **14 skill files** (`skills/`) for agent guidance: core, question generation, grading, discussion, summary, init, fix, and profile building sub-skills.
- **Profile lifecycle:** `draft → active → archived` with safe revision draft mechanism.
- **Built-in `demo-review` profile** for first-time user experience.
- **`DATA_ROOT` separation** for user-writable data (profiles, archive, state) vs read-only package resources.
- **`npm run check-package`** — pi package integrity validation.
- **`npm run reset-demo-profile`** — restore demo profile to release state.
- **`npm run setup-review`** — enhanced doctor with package health checks, demo profile validation, and DATA_ROOT display.
- Regression tests for demo-review seed profile active state.
- Pi package manifest (`"pi"` field in package.json) with standard directory layout.
- MIT License, `.gitattributes`, repository metadata.

### Changed

- `DESIGN.md` updated to v4.0 reflecting extension architecture.
- `README.md` rewritten for pi-agent extension user experience.
- Knowledge index covers 20 chapters / 74 knowledge points.
- Card system supports structured frontmatter and fuzzy bidirectional matching.
- All documentation paths synchronized to new directory layout.

---

## v2.0.0

Python CLI prototype calling `pi -p` as subprocess. (No longer maintained.)

## v1.0.0

Initial Python prototype with direct pi SDK integration.
