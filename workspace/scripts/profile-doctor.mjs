// Profile doctor & dry-run prune.
// Usage: npm run profile-doctor [subjectId] [--dry-run|--prune-report]
// Default: dry-run mode — never deletes.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadReviewConfig } from "../lib/review_config.mjs";
import {
  getProfileFamilyRoot,
  auditProfileFamily,
  planPruneFamily,
  cleanSubjectId,
} from "../lib/review_profiles.mjs";

const config = loadReviewConfig();
const profilesRoot = config.profilesDirAbs;

let exitCode = 0;
const args = process.argv.slice(2);
const targetSubject = args.find((a) => !a.startsWith("--")) || null;
const showPrune = args.includes("--prune-report") || args.includes("--dry-run");

// ─── Helpers ───
function listDirs(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, path: join(root, d.name) }));
}

function printSection(title) {
  console.log("");
  console.log("━".repeat(56));
  console.log(`  ${title}`);
  console.log("━".repeat(56));
}

// ─── Main ───
printSection("Profile Doctor — Dry Run");

console.log(`  Data root: ${profilesRoot}`);
console.log(`  Mode:      ${showPrune ? "dry-run (prune report)" : "audit only"}`);
console.log("");

let families = [];
if (targetSubject) {
  const id = cleanSubjectId(targetSubject);
  const path = getProfileFamilyRoot(id, config);
  if (existsSync(path)) {
    families.push({ name: id, path });
  } else {
    console.log(`  ❌ Profile family not found: ${targetSubject}`);
    process.exit(1);
  }
} else {
  families = listDirs(profilesRoot).filter((f) => !f.name.startsWith("_"));
}

if (families.length === 0) {
  console.log("  No profile families found.");
  process.exit(0);
}

for (const family of families) {
  console.log(`┌─ ${family.name}`);
  console.log(`│  Path: ${family.path}`);

  const audit = auditProfileFamily(family.name, config);
  const s = audit.summary;

  console.log(`│  Active:    ${s.active ? "✅ present" : "absent"}`);
  console.log(`│  Draft:     ${s.draft ? "✅ present" : "absent"}`);
  console.log(`│  Archived:  ${s.archivedCount} version(s)`);
  console.log(`│  _user:     ${s.userFiles} file(s)`);

  // Print issues
  if (audit.issues.length === 0) {
    console.log(`│  ✅ No issues found`);
  } else {
    for (const issue of audit.issues) {
      const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠" : "ℹ";
      console.log(`│  ${icon} [${issue.slot}] ${issue.message}`);
      exitCode = exitCode || (issue.severity === "warning" ? 1 : 0);
    }
  }

  // ─── Prune report (dry-run) ───
  if (showPrune) {
    const { prunePlan } = planPruneFamily(family.name, config);
    console.log(`│`);
    console.log(`│  ── Prune Plan (dry-run) ──`);
    console.log(`│  Keep:  ${prunePlan.summary.keep}`);
    console.log(`│  Clean: ${prunePlan.summary.clean}`);

    for (const entry of prunePlan.keep) {
      console.log(`│  📁 KEEP   ${entry.path}`);
      console.log(`│      └─ ${entry.reason}`);
    }
    for (const entry of prunePlan.clean) {
      console.log(`│  🗑  CLEAN  ${entry.path}`);
      console.log(`│      └─ ${entry.reason}`);
    }
    for (const entry of prunePlan.reasons) {
      console.log(`│  ⚠  NOTE   ${entry.path}`);
      console.log(`│      └─ ${entry.reason}`);
    }
  }

  console.log(`└─`);
  console.log("");
}

// ─── Summary ───
printSection("Summary");
if (exitCode === 0) {
  console.log("  ✅ All profiles clean — no issues found");
} else {
  console.log(`  ⚠  Issues found — review warnings above`);
}
console.log("━".repeat(56));

process.exit(exitCode);
