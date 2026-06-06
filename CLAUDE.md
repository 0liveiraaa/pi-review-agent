# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-driven final exam review assistant for a C++ Object-Oriented Programming (面向对象程序设计) course. Runs as a **pi-agent extension** inside `workspace/` — not a standalone app. Users interact via `/review`, `/review-init`, and `/review-fix` slash commands within the pi-agent TUI.

## Common Commands

All commands run from `workspace/`:

```bash
cd workspace

# Verify all project files are in place
npm run setup-review

# Syntax check all modules
npm run check

# Run tests
npm run test

# Start pi-agent with the review extension loaded
pi
```

Within pi-agent:
- `/review` — start a review session (choose profile → mode → scope)
- `/review-init` — create a draft review profile from Markdown/text notes
- `/review-fix` — revise a draft profile, or create a safe revision draft from an active profile

## Architecture

### Pi Agent Extension (main entry point)

`.pi/extensions/review/index.ts` (~1000 lines) registers all commands and tools. Uses **pi-tui** (`@earendil-works/pi-tui`) for interactive UI (SelectList, Editor) and **typebox** for JSON schema validation of tool parameters. The extension injects `review-core` SKILL.md text into every command prompt — agent cannot skip it.

**Registered commands:**
- `/review` — interactive selection flow (profile → mode → chapter/knowledge/scope → question type), then sends a mode-specific prompt to the agent
- `/review-init` — creates draft profile, scans source files, sends init prompt to agent
- `/review-fix` — loads editable profile, collects feedback, creates revision draft if source is active

**Registered tools (agent calls these):**
| Tool | Purpose |
|------|---------|
| `review_card` | Render concept card in TUI before card-practice questions |
| `review_exam_points` | Render chapter exam-point summaries before practice questions |
| `review_chapter` | Render chapter/section material before chapter-study questions |
| `review_answer` | Render structured question in TUI, collect user answer |
| `review_archive` | Save graded question to archive, update progress/wrong-book |
| `review_turn_action` | Show post-question unified action menu (next/hint/harder/discuss/summary/exit) |
| `review_summary` | Save final session summary report to `archive/summaries/` |
| `review_profile_write` | Safely write files into draft profile directories (refuses non-draft) |
| `review_profile_enable` | Enable draft profile; if revision draft, archives original |

### Library Modules (`workspace/lib/`)

```
lib/
├── review_config.mjs     # Load .pi/review.config.json, resolve absolute paths
├── review_engine.mjs     # resolveReviewTarget(), buildReviewStartPrompt(), listChapters/listKnowledgePoints
├── review_question.mjs   # normalizeQuestion(), parseChoiceAnswer(), buildQuestionPrompt()
├── review_profiles.mjs   # Profile CRUD — create/load/write/enable/revision-draft, path safety checks
├── review_materials.mjs  # listChapterMaterials(), loadChapterMaterial(), loadExamPoints()
├── state.mjs             # Progress/wrong_book/knowledge_chains/card_progress state, archiving
├── cards.mjs             # Card loading (fuzzy match), buildCardQueue(), normalizeCardMarkdown()
├── chapters.mjs          # Chapter note scanning (YAML frontmatter parse, section extraction)
├── terminal.mjs          # Markdown→ANSI rendering (standalone CLI legacy, pi-tui replaces most in-UI)
└── session.mjs           # pi SDK session wrapper (standalone CLI legacy, extension replaces in-UI)
```

**Key design patterns:**
- `review_profiles.mjs` enforces a strict **draft→active→archived** lifecycle. Only draft profiles can be written to. Enabling a revision draft archives the original. Path traversal (`..`) is blocked for non-legacy profiles.
- `review_engine.mjs` resolves review targets (scope/chapter/knowledge_point) into knowledge point IDs and builds mode-specific prompts that force the agent to respect the `review_core` contract.
- `state.mjs` maintains schema compatibility with the original Python version. All state is in `workspace/state/`; archive in `workspace/archive/`.
- `cards.mjs` supports both legacy freeform cards and new structured cards with frontmatter (`id`, `name`, `aliases`, `difficulty`, `tags`, `chapter`, `source`, `status`). Matching is fuzzy bidirectional.

### Profile System

Review profiles live in `workspace/review_profiles/`. Each profile contains:

```
review_profiles/{subject_id}/
├── profile.json          # subjectId, name, status, paths, revision metadata
├── subject.md            # Course description and exam goals
├── knowledge_index.json  # { chapters: { "1": { title, knowledge_points: [...] } } }
├── cards/                # *.md concept cards (with optional frontmatter)
├── chapters/             # *.md chapter/section notes
├── exam_points/          # *.md exam-point summaries per chapter
├── source_map.json       # Source material mapping
└── quality_report.md     # Quality assessment report
```

**Profile statuses:** `draft` (editable, hidden from /review) → `active` (reviewable, immutable) → `archived` (superseded, kept for rollback).

**Revision workflow:** `/review-fix` on an active profile creates a `{subject_id}__draft_{date}` copy. Agent edits the draft via `review_profile_write`. `/review-fix` + "确认启用" calls `review_profile_enable`, which archives the original and activates the revision.

### Review Modes

| Mode | ID | Flow |
|------|-----|------|
| 概念卡片+练习 | `card_practice` | review_card → card render → user action → generate question → review_answer |
| 直接练习 | `practice` | review_exam_points (if chapter) → generate question → review_answer |
| 章节笔记学习 | `chapter_study` | review_chapter → material render → user action → generate question → review_answer |

All modes follow the same post-question cycle: **review_archive** → **review_turn_action** → next question / hint / discuss / harder / summary / exit.

### Skill Files (`.pi/skills/`)

14 skill directories, each with `SKILL.md` (YAML frontmatter + markdown body):
- `review-core` — master skill: runtime contract, tool contracts, mode-specific flow rules, profile lifecycle
- `review-question` — question generation rules (S-R through C-A difficulty levels, types)
- `review-grade` — grading format and L1-L3 explanation depth
- `review-discuss` — L2 discussion rules and C++ code example style
- `review-summary` — per-question 复盘 JSON format + session summary report template
- `review-init`, `review-fix` — profile initialization and revision workflows
- `review-profile-*` — sub-skills for profile building (structure, index, cards, exam-points, quality)

### Difficulty System (5 levels)

Difficulty = Breadth × Cognitive level:
- **S-R** (Single × Recall) — single concept, memory/recognition
- **S-U** (Single × Understand) — single concept, understand/differentiate
- **M-U** (Multi × Understand) — 2-3 related concepts, compare
- **M-A** (Multi × Analyze) — multi-concept reasoning
- **C-A** (Chain × Analyze) — knowledge chain synthesis

### Data Flow (one question cycle)

```
Agent reads profile materials → generates question JSON
  → calls review_answer (TUI renders, user answers)
  → agent grades (review-grade rules, L1 explanation)
  → optional discussion (review-discuss, L2)
  → calls review_archive (code saves to archive/sessions/, updates progress/wrong_book/chains)
  → calls review_turn_action (TUI shows action menu)
  → user chooses next step → repeat or summary
```

Archives are written to `workspace/archive/sessions/{session_id}/q_{date}_{seq}.json` + `.md`. Summaries to `workspace/archive/summaries/{session_id}_总结.md`.

### Important Conventions

- **No SYSTEM.md**: The extension injects `review-core` SKILL.md directly into prompts. There is no `.pi/SYSTEM.md` file (confirmed by test).
- **No manual file writing**: Agent must use `review_profile_write` (draft profiles) and `review_archive`/`review_summary` (review data). Never Bash/Write/Edit profile files.
- **Code drives UI, agent generates content**: Code tools render cards/chapters/exam-points and collect answers. Agent generates questions, grades, and explains. Never let agent substitute natural language for TUI tool calls.
- **Knowledge index structure**: `knowledge_index.json` must have `chapters.{id}.knowledge_points[]`, not a flat `knowledge_points` array or `chapters.*.sections` structure. Each KP needs `id`, `name`, `question_types`, `difficulty_baseline`, `related`, `common_misconceptions`.
- **Standalone CLI is legacy**: `review_cli.mjs` and `session.mjs` are the pre-extension standalone CLI. They still work but are not the primary interface. The extension-based `/review` command is the supported path.
