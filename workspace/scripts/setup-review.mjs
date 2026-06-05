import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const required = [
  ".pi/extensions/review/index.ts",
  ".pi/review.config.json",
  "workspace/lib/review_profiles.mjs",
];

let ok = true;
for (const rel of required) {
  const path = resolve(projectRoot, rel);
  if (!existsSync(path)) {
    ok = false;
    console.error(`Missing: ${rel}`);
  }
}

const profilesDir = resolve(projectRoot, "workspace/review_profiles");
if (!existsSync(profilesDir)) mkdirSync(profilesDir, { recursive: true });

if (!ok) {
  process.exitCode = 1;
} else {
  console.log("Review assistant setup checks passed.");
  console.log("");
  console.log("Start pi from the project root:");
  console.log('  cd "C:\\Users\\25173\\Desktop\\面向对象程序设计"');
  console.log("  pi");
  console.log("");
  console.log("Then use:");
  console.log("  /review       choose an active subject and review");
  console.log("  /review-init  create a draft subject profile");
  console.log("  /review-fix   revise a draft profile");
}
