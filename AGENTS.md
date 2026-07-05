# AGENTS.md

This file gives Codex working context for this repository. Keep it short, factual, and aligned with the current code.

## Project Overview

Pi Review Agent is a pi-agent package that adds a structured course review assistant. It is not a standalone web app. Users run `pi` and interact through slash commands:

- `/review` starts an active review session.
- `/review-init` creates a draft review profile from Markdown/text source notes.
- `/review-fix` revises a draft profile or creates a safe revision draft from an active profile.

The bundled real profile is for C++ Object-Oriented Programming (`cpp-oop`), and there is also a smaller `demo-review` profile.

## Pi-Agent Development Reference

For pi-agent SDK, extension, package, and TUI details, use the installed package as the local source of truth:

`C:\Users\25173\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent`

Especially useful files/directories:

- `README.md` for commands, package manifest behavior, extension loading, and high-level concepts.
- `docs/extensions.md` for `ExtensionAPI`, `registerCommand`, `registerTool`, events, `ctx.ui`, custom rendering, and extension locations.
- `examples/extensions/` for practical TypeScript extension patterns.

Current pi facts relevant to this repo:

- Extensions are TypeScript modules with a default factory receiving `ExtensionAPI`.
- Tools are registered with `pi.registerTool(...)`; slash commands with `pi.registerCommand(...)`.
- Use `typebox` for tool parameter schemas.
- Use `@earendil-works/pi-tui` for interactive terminal UI.
- Pi packages expose resources through the `pi` field in `package.json`.

## Common Commands

From repository root:

```bash
npm run setup-review
npm run check
npm run test
npm run check-package
```

Equivalent package-local commands from `workspace/`:

```bash
cd workspace
npm run setup-review
npm run check
npm run test
npm run check-package
npm run reset-demo-profile
npm run migrate-profile-family
```

Run the extension with pi from the repository root or `workspace/`:

```bash
pi
```

Node requirement: `>=22`.

## Current Package Layout

Root `package.json` is a wrapper package:

- `pi.extensions`: `./workspace/extensions/review/index.ts`
- `pi.skills`: `./workspace/skills`
- scripts delegate to `npm --prefix workspace ...`

`workspace/package.json` is the actual pi package layout:

- `pi.extensions`: `./extensions/review`
- `pi.skills`: `./skills`
- published files include `extensions/`, `skills/`, `lib/`, `profiles/`, `scripts/`, `data/`, and tests.

There is currently no `workspace/.pi` directory. Do not assume the extension lives under `.pi/extensions`.

## Main Code Paths

- `workspace/extensions/review/index.ts` is the main extension. It registers `/review`, `/review-init`, `/review-fix`, and all review tools.
- `workspace/lib/review_config.mjs` resolves package resources and the user-writable data root.
- `workspace/lib/review_profiles.mjs` owns profile lifecycle, profile family layout, bundled-profile seeding, path safety, and draft writes.
- `workspace/lib/review_engine.mjs` resolves review targets and builds start prompts.
- `workspace/lib/review_question.mjs` normalizes question payloads and parses answers.
- `workspace/lib/review_materials.mjs`, `cards.mjs`, and `chapters.mjs` load cards, chapter notes, exam points, and related materials.
- `workspace/lib/state.mjs` handles learning state support.
- `workspace/docs/legacy/` contains legacy CLI material. Treat it as reference, not the supported runtime path.

## Registered Review Tools

The extension currently registers these tool names:

- `review_card`: render a concept card before card practice.
- `review_exam_points`: render chapter exam-point summaries before direct practice.
- `review_chapter`: render chapter/section notes before chapter-study practice.
- `review_answer`: render a structured question and collect the user's answer.
- `review_archive`: archive a graded question and update progress/wrong-book/knowledge-chain state.
- `review_turn_action`: show the post-question action menu.
- `review_summary`: save the final session summary to the selected profile's private `_user/summaries` area.
- `review_profile_write`: safely write files inside a draft profile.
- `review_profile_enable`: enable a draft profile for `/review`.

Do not replace these tool calls with plain assistant narration when implementing review flows. The code drives UI and persistence; the agent generates content, grades, and explanations.

## Profiles And Data

Bundled read-only profiles live in:

```text
workspace/profiles/{subject_id}/
```

On first use, `review_profiles.mjs` seeds bundled profiles into the user data root:

```text
%USERPROFILE%\.pi\agent\review-data\review_profiles\{subject_id}\
├── active\
├── draft\
├── archived\
└── _user\
```

`PI_REVIEW_DATA` overrides the data root for tests or advanced local runs. Runtime archives, summaries, learning state, and writable profile revisions should be under this user data root, not committed bundled profiles.

Each profile contains:

```text
profile.json
subject.md
knowledge_index.json
cards/
chapters/
exam_points/
source_map.json
quality_report.md
```

Lifecycle:

- `draft`: editable, hidden from normal `/review`.
- `active`: reviewable, treated as immutable.
- `archived`: superseded profile revisions.

Only draft profiles may be modified through the runtime profile-writing flow. In code, preserve the guard in `writeProfileFile`: reject non-draft writes and reject unsafe relative paths.

## Review Flow

Supported modes:

- `card_practice`: `review_card` first, then question generation and `review_answer`.
- `practice`: optional `review_exam_points` for chapter targets, then question generation and `review_answer`.
- `chapter_study`: `review_chapter` first, then question generation and `review_answer`.

After each answered question, the normal flow is:

```text
grade/explain -> review_archive -> review_turn_action -> next action
```

Question difficulty ladder:

- `S-R`: single concept recall.
- `S-U`: single concept understanding.
- `M-U`: multi-concept understanding.
- `M-A`: multi-concept analysis.
- `C-A`: chained analysis.

Question types: `judgment`, `choice`, `multi_choice`, `short_answer`.

## Knowledge Index Contract

`knowledge_index.json` must use this shape:

```json
{
  "chapters": {
    "1": {
      "title": "...",
      "knowledge_points": []
    }
  }
}
```

Do not change it to a flat `knowledge_points` array or `chapters.*.sections`. Each knowledge point should include at least:

- `id`
- `name`
- `question_types`
- `difficulty_baseline`
- `related`
- `common_misconceptions`

## Skills

Runtime review behavior is governed by skills in `workspace/skills/`.

Current skill directories:

- `review-core`
- `review-question`
- `review-grade`
- `review-discuss`
- `review-summary`
- `review-init`
- `review-fix`
- `review-profile-structure`
- `review-profile-index`
- `review-profile-cards`
- `review-profile-exam-points`
- `review-profile-quality`
- `review-profile-training-assets`

The extension reads `workspace/skills/review-core/SKILL.md` and injects it into review prompts. There is no `SYSTEM.md` contract to maintain for this package.

## Development Rules

- Prefer current `workspace/` code and the installed pi-agent package docs over older archived docs.
- Keep profile data writes behind `review_profile_write`/profile library safeguards in runtime behavior.
- Keep bundled profiles deterministic; put user-specific runtime data in the data root.
- When touching extension APIs, verify against `C:\Users\25173\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent`.
- When changing profile layout or lifecycle, update tests and migration/setup scripts together.
- Run `npm run check` and `npm run test` before claiming code changes are complete.
