# Review Kit

This directory documents the lightweight setup flow for the cross-subject review assistant.

## Install

From the project root:

```powershell
cd "C:\Users\25173\Desktop\面向对象程序设计"
npm --prefix workspace run setup-review
```

The setup script performs minimal checks:

- verifies `.pi/extensions/review/index.ts` exists
- verifies `.pi/review.config.json` exists
- verifies `workspace/review_profiles/` exists
- prints the commands a user can run next

## Commands

- `/review` starts review and asks the user to choose an active subject profile.
- `/review-init` creates a draft profile from `.md` / `.txt` notes.
- `/review-fix` lets the user choose a draft profile and revise it with natural-language feedback.

## Profile Lifecycle

1. `/review-init` creates `workspace/review_profiles/{subjectId}` with status `draft`.
2. The agent writes normalized files through `review_profile_write`.
3. The user reviews `quality_report.md`.
4. `/review-fix` updates the draft until the user confirms it is usable.
5. The agent calls `review_profile_enable`; then `/review` can use the profile.

## Builder Skill Notes

The current implementation uses command prompts plus controlled tools rather than a heavy installer.
Future subject-specific builder skills can be added here and copied into `.pi/skills/` by extending the setup script.
