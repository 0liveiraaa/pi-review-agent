import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");

// ─── Paths ───
const EXTENSION_DIR = resolve(workspaceRoot, ".pi/extensions/review");
const SKILLS_DIR = resolve(workspaceRoot, ".pi/skills");
const LIB_DIR = resolve(workspaceRoot, "lib");
const PROFILES_DIR = resolve(workspaceRoot, "review_profiles");
const CONFIG_PATH = resolve(workspaceRoot, ".pi/review.config.json");
const PACKAGE_PATH = resolve(workspaceRoot, "package.json");
const EXTENSION_ENTRY = join(EXTENSION_DIR, "index.ts");
const SOURCE_SKILLS = resolve(workspaceRoot, "docs/review-kit/skills");

let errors = 0;
const report = [];

const rel = (abs) => abs.replace(/\\/g, "/").replace(/^.*?(?=(workspace|\.pi|lib|review_profiles|scripts)\/)/, "");

function ok(msg) { report.push(`  ${"✅"} ${msg}`); }
function fail(msg) { report.push(`  ${"❌"} ${msg}`); errors++; }

// ─── Scan skills ───
report.push("");
report.push("━".repeat(50));
report.push("  🔍 Pi 复习助手 元数据检查");
report.push("━".repeat(50));
report.push("");

// 1. Skill 目录
if (existsSync(SOURCE_SKILLS)) {
  mkdirSync(SKILLS_DIR, { recursive: true });
  let installed = 0;
  for (const entry of readdirSync(SOURCE_SKILLS, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = join(SOURCE_SKILLS, entry.name);
    const dst = join(SKILLS_DIR, entry.name);
    if (!existsSync(dst)) {
      cpSync(src, dst, { recursive: true });
      report.push(`  📦 Installed skill template: ${entry.name}`);
      installed++;
    }
  }
  if (installed === 0) ok("All skill templates up-to-date");
} else {
  ok("No skill templates source (docs/review-kit/skills) — skipping install");
}

// 2. Extension entry point
if (existsSync(EXTENSION_ENTRY)) {
  ok(`Extension entry: ${rel(EXTENSION_ENTRY)}`);
} else {
  fail(`Extension entry missing: ${rel(EXTENSION_ENTRY)}`);
}

// 3. Config
if (existsSync(CONFIG_PATH)) {
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  ok(`Config: ${rel(CONFIG_PATH)} (course: ${cfg.courseName || "?"}, profile: ${cfg.profile || "?"})`);
} else {
  fail(`Config missing: ${rel(CONFIG_PATH)}`);
}

// 4. Required skills
const REQUIRED_SKILLS = [
  "review-core", "review-question", "review-grade", "review-discuss",
  "review-summary", "review-init", "review-fix",
  "review-profile-structure", "review-profile-index", "review-profile-cards",
  "review-profile-exam-points", "review-profile-quality",
];
let skillCount = 0;
for (const skill of REQUIRED_SKILLS) {
  const skillPath = join(SKILLS_DIR, skill, "SKILL.md");
  if (existsSync(skillPath)) skillCount++;
  else fail(`Skill missing: ${skill}`);
}
// Count additional skills beyond required
if (existsSync(SKILLS_DIR)) {
  const all = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  for (const d of all) if (!REQUIRED_SKILLS.includes(d.name)) skillCount++;
}
ok(`${skillCount} skills installed in .pi/skills/`);

// 5. Lib modules
const REQUIRED_LIBS = [
  "state.mjs", "cards.mjs", "chapters.mjs",
  "review_engine.mjs", "review_config.mjs", "review_question.mjs",
  "review_profiles.mjs", "review_materials.mjs",
];
let libCount = 0;
for (const lib of REQUIRED_LIBS) {
  if (existsSync(join(LIB_DIR, lib))) libCount++;
  else fail(`Lib missing: ${lib}`);
}
ok(`${libCount} lib modules in lib/`);

// 6. Profiles
const profiles = [];
if (existsSync(PROFILES_DIR)) {
  for (const entry of readdirSync(PROFILES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pf = join(PROFILES_DIR, entry.name, "profile.json");
    if (existsSync(pf)) {
      try {
        const p = JSON.parse(readFileSync(pf, "utf-8"));
        profiles.push(`${entry.name} [${p.status || "unknown"}]`);
      } catch {
        profiles.push(`${entry.name} [broken]`);
      }
    }
  }
}
if (profiles.length > 0) {
  ok(`${profiles.length} review profile(s): ${profiles.join(", ")}`);
} else {
  fail("No review profiles found — run /review-init to create one");
}

// 7. Package integrity
if (existsSync(PACKAGE_PATH)) {
  const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf-8"));
  if (pkg.name === "pi-review") ok(`Package: ${pkg.name} v${pkg.version}`);
  else fail(`Unexpected package name: ${pkg.name}`);
} else {
  fail("package.json not found");
}

// ─── Summary ───
report.push("");
report.push("━".repeat(50));
if (errors === 0) {
  report.push("  ✅ All checks passed");
} else {
  report.push(`  ❌ ${errors} check(s) failed — review the list above`);
}
report.push("━".repeat(50));
report.push("");

// ─── Usage guidance ───
report.push("  🚀 How to use");
report.push("");
report.push("  1. Enter the project's workspace directory and start pi-agent:");
report.push("     cd workspace");
report.push("     pi");
report.push("");
report.push("  2. Inside pi, type:");
report.push("     /review       Start a review session (choose profile, mode, scope)");
report.push("     /review-init  Create a new review profile from your notes");
report.push("     /review-fix   Revise an existing profile");
report.push("");
report.push("  ℹ️  This is a pi-agent extension, not a standalone app.");
report.push("     Entry point: .pi/extensions/review/index.ts");
report.push("     All review commands (/review, /review-init, /review-fix)");
report.push("     are registered by that extension and run inside pi.");

console.log(report.join("\n"));

if (errors > 0) process.exitCode = 1;
