// Pi package integrity check.
// Usage: npm run check-package
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const pkgPath = join(packageRoot, "package.json");
const gitignorePath = join(packageRoot, "..", ".gitignore");
const legacyLocalExtension = join(packageRoot, ".pi", "extensions", "review", "index.ts");

let errors = 0;
let warnings = 0;

function ok(msg) { console.log(`  ${"✅"} ${msg}`); }
function warn(msg) { console.log(`  ${"⚠️"} ${msg}`); warnings++; }
function fail(msg) { console.log(`  ${"❌"} ${msg}`); errors++; }

// ─── 1. package.json integrity ───
console.log("");
console.log("━".repeat(50));
console.log("  📦 Pi Package Integrity Check");
console.log("━".repeat(50));
console.log("");

if (!existsSync(pkgPath)) {
  fail("package.json not found");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

// 1a. pi field
if (pkg.pi && typeof pkg.pi === "object") {
  ok("pi manifest present");

  // extensions
  if (Array.isArray(pkg.pi.extensions) && pkg.pi.extensions.length > 0) {
    let found = 0;
    for (const ext of pkg.pi.extensions) {
      // Resolve relative to package root, strip index.ts if not ending with .ts
      const extPath = join(packageRoot, ext.replace(/\/?$/, ext.endsWith(".ts") ? "" : "/index.ts"));
      if (existsSync(extPath)) found++;
      else fail(`Extension entry not found: ${ext}`);
    }
    if (found > 0) ok(`${found}/${pkg.pi.extensions.length} extension entry(s) resolvable`);
  } else {
    warn("No extensions declared in pi manifest — package has no runtime entry");
  }

  // skills
  if (Array.isArray(pkg.pi.skills) && pkg.pi.skills.length > 0) {
    let skillDirs = 0;
    for (const s of pkg.pi.skills) {
      const skillsDir = join(packageRoot, s);
      if (existsSync(skillsDir) && readdirSync(skillsDir, { withFileTypes: true }).some((d) => d.isDirectory())) {
        const count = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
        skillDirs += count;
      }
    }
    if (skillDirs > 0) ok(`${skillDirs} skill directories found`);
    else fail(`No skill directories found under ${pkg.pi.skills.join(", ")}`);
  } else {
    warn("No skills declared in pi manifest");
  }
} else {
  fail("No pi manifest in package.json — add \"pi\": { \"extensions\": [...], \"skills\": [...] }");
}

// 1b. keywords
if (Array.isArray(pkg.keywords) && pkg.keywords.includes("pi-package")) {
  ok("keywords includes 'pi-package'");
} else {
  warn("keywords missing 'pi-package' — won't appear in pi package gallery");
}

// 1c. peerDependencies
const requiredPeers = {
  "@earendil-works/pi-coding-agent": false,
  "@earendil-works/pi-tui": false,
  "typebox": false,
};
const peers = pkg.peerDependencies || {};
for (const dep of Object.keys(requiredPeers)) {
  if (peers[dep] && peers[dep] === "*") requiredPeers[dep] = true;
}
const missingPeers = Object.entries(requiredPeers).filter(([, v]) => !v).map(([k]) => k);
if (missingPeers.length === 0) {
  ok("All required peerDependencies declared with '*' range");
} else {
  fail(`Missing/wrong peerDependencies: ${missingPeers.join(", ")} (need '*' range)`);
}

// Check no SDK deps in dependencies
const sdkDeps = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"];
for (const dep of sdkDeps) {
  if (pkg.dependencies && pkg.dependencies[dep]) {
    fail(`${dep} should be in peerDependencies, not dependencies`);
  }
}

// 1d. files field (publish whitelist)
if (pkg.files) {
  ok(`"files" field present: ${pkg.files.length} entries`);
} else {
  warn("No \"files\" field in package.json — npm publish will include everything not in .gitignore (consider adding)");
}

// ─── 2. Core resource reachability ───
console.log("");
console.log("━".repeat(50));
console.log("  🔍 Core Resources");
console.log("━".repeat(50));
console.log("");

// 2a. Skills: review-core must exist
const CORE_SKILLS = ["review-core", "review-question", "review-grade", "review-discuss", "review-summary", "review-init", "review-fix"];
// Try pi.skills paths first, then convention directory
const skillsDirs = (pkg.pi?.skills || []).map((s) => join(packageRoot, s));
if (skillsDirs.length === 0) skillsDirs.push(join(packageRoot, "skills"));

for (const skill of CORE_SKILLS) {
  let found = false;
  for (const dir of skillsDirs) {
    if (existsSync(join(dir, skill, "SKILL.md"))) { found = true; break; }
  }
  if (found) continue;
  fail(`Core skill missing: ${skill}/SKILL.md`);
}

// 2b. Demo profile
let demoFound = false;
const profileDirs = [join(packageRoot, "review_profiles"), join(packageRoot, "profiles"), join(packageRoot, "templates", "profiles")];
for (const dir of profileDirs) {
  const demoPath = existsSync(join(dir, "demo-review", "active", "profile.json"))
    ? join(dir, "demo-review", "active", "profile.json")
    : join(dir, "demo-review", "profile.json");
  if (existsSync(demoPath)) {
    const demo = JSON.parse(readFileSync(demoPath, "utf-8"));
    if (demo.status === "active") { demoFound = true; break; }
  }
}
if (demoFound) ok("demo-review profile present and active");
else fail("demo-review profile not found or not active — check review_profiles/ or profiles/");

// 2c. Legacy local .pi extension must not be shipped.
// Pi auto-discovers it during local runs, which conflicts with the package manifest entry.
if (existsSync(legacyLocalExtension)) {
  fail("Legacy workspace/.pi/extensions/review/index.ts found; remove it to avoid duplicate tool registration");
} else {
  ok("No legacy workspace/.pi extension entry");
}

// ─── 3. Publish blacklist check ───
console.log("");
console.log("━".repeat(50));
console.log("  🚫 Publish Safety Check");
console.log("━".repeat(50));
console.log("");

const DANGEROUS_DIRS = ["archive", "state"];
for (const d of DANGEROUS_DIRS) {
  const dirPath = join(packageRoot, d);
  if (existsSync(dirPath)) {
    // Check if gitignored
    const rel = d + "/";
    if (existsSync(gitignorePath) && readFileSync(gitignorePath, "utf-8").includes(rel)) {
      ok(`${rel} is gitignored`);
    } else {
      warn(`${rel} not in .gitignore — may be published`);
    }
  }
}

// Check .gitignore covers critical patterns
if (existsSync(gitignorePath)) {
  const gi = readFileSync(gitignorePath, "utf-8");
  const patterns = ["workspace/node_modules/", "workspace/archive/", "workspace/state/", "workspace/__pycache__/"];
  for (const pat of patterns) {
    if (gi.includes(pat)) continue;
    warn(`.gitignore missing: ${pat}`);
  }
}

// ─── Summary ───
console.log("");
console.log("━".repeat(50));
if (errors === 0 && warnings === 0) {
  console.log("  ✅ All package checks passed");
} else if (errors === 0) {
  console.log(`  ✅ Package checks passed (${warnings} warning(s))`);
} else {
  console.log(`  ❌ ${errors} error(s), ${warnings} warning(s)`);
}
console.log("━".repeat(50));

if (errors > 0) process.exitCode = 1;
