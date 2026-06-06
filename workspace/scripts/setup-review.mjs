import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const required = [
  ".pi/extensions/review/index.ts",
  ".pi/review.config.json",
  "lib/review_profiles.mjs",
];
const requiredSkills = [
  "review-core",
  "review-question",
  "review-grade",
  "review-discuss",
  "review-summary",
  "review-init",
  "review-fix",
];

let ok = true;
const sourceSkillsDir = resolve(workspaceRoot, "docs/review-kit/skills");
const targetSkillsDir = resolve(workspaceRoot, ".pi/skills");

if (existsSync(sourceSkillsDir)) {
  mkdirSync(targetSkillsDir, { recursive: true });
  for (const entry of readdirSync(sourceSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = join(sourceSkillsDir, entry.name);
    const target = join(targetSkillsDir, entry.name);
    if (!existsSync(target)) {
      cpSync(source, target, { recursive: true });
      console.log(`Installed missing skill template: ${entry.name}`);
    }
  }
} else {
  ok = false;
  console.error("Missing: docs/review-kit/skills");
}

for (const rel of required) {
  const path = resolve(workspaceRoot, rel);
  if (!existsSync(path)) {
    ok = false;
    console.error(`Missing: ${rel}`);
  }
}

for (const skill of requiredSkills) {
  const rel = `.pi/skills/${skill}/SKILL.md`;
  const path = resolve(workspaceRoot, rel);
  if (!existsSync(path)) {
    ok = false;
    console.error(`Missing: ${rel}`);
  }
}

const profilesDir = resolve(workspaceRoot, "review_profiles");
if (!existsSync(profilesDir)) mkdirSync(profilesDir, { recursive: true });
if (!existsSync(resolve(profilesDir, "demo-review", "profile.json"))) {
  ok = false;
  console.error("Missing: review_profiles/demo-review/profile.json");
}

if (!ok) {
  process.exitCode = 1;
} else {
  console.log("Review assistant setup checks passed.");
  console.log("");
  console.log("Start pi from the workspace directory:");
  console.log(`  cd "${workspaceRoot}"`);
  console.log("  pi");
  console.log("");
  console.log("Then use:");
  console.log("  /review       choose an active subject and review");
  console.log("  /review-init  create a draft subject profile");
  console.log("  /review-fix   revise a draft profile or create a safe revision draft from an active profile");
}
