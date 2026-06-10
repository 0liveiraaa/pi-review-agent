import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { loadReviewConfig } from "../lib/review_config.mjs";

const PROFILE_FILE = "profile.json";
const apply = process.argv.includes("--apply");
const config = loadReviewConfig();
const profilesRoot = config.profilesDirAbs;

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJSON(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function stripDraftSuffix(subjectId) {
  let id = String(subjectId || "");
  let next = id.replace(/__draft_\d{8}(?:_v\d+)?$/i, "");
  while (next !== id) {
    id = next;
    next = id.replace(/__draft_\d{8}(?:_v\d+)?$/i, "");
  }
  return id;
}

function cleanSubjectId(value) {
  const id = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!id) throw new Error("subjectId is required.");
  return id;
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function uniqueTarget(path) {
  if (!existsSync(path)) return path;
  let n = 2;
  while (existsSync(`${path}_v${n}`)) n += 1;
  return `${path}_v${n}`;
}

function log(action, detail = "") {
  console.log(`${apply ? "DO" : "DRY"} ${action}${detail ? ` ${detail}` : ""}`);
}

function moveDir(source, target) {
  log("MOVE", `${source} -> ${target}`);
  if (!apply) return;
  ensureDir(dirname(target));
  renameSync(source, target);
}

function updateProfile(path, updates) {
  log("WRITE", path);
  if (!apply) return;
  const raw = readJSON(path);
  writeJSON(path, { ...raw, ...updates });
}

function rootFor(raw, dirName) {
  return cleanSubjectId(stripDraftSuffix(raw.revisionRoot || raw.subjectId || dirName));
}

function migrationItems() {
  if (!existsSync(profilesRoot)) return [];
  const out = [];
  for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(profilesRoot, entry.name);
    if (existsSync(join(dir, "active", PROFILE_FILE))) continue;
    const profilePath = join(dir, PROFILE_FILE);
    if (!existsSync(profilePath)) continue;
    try {
      const raw = readJSON(profilePath);
      out.push({
        dirName: entry.name,
        path: dir,
        raw,
        root: rootFor(raw, entry.name),
        updatedAt: Date.parse(raw.updatedAt || raw.revisionEnabledAt || raw.createdAt || "") || 0,
      });
    } catch (err) {
      console.warn(`SKIP ${dir}: ${err.message}`);
    }
  }
  return out;
}

function pickActive(items) {
  const active = items.filter((item) => item.raw.status === "active");
  const candidates = active.length ? active : items;
  return [...candidates].sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function migrateGroup(root, items) {
  const familyRoot = join(profilesRoot, root);
  const userRoot = join(familyRoot, "_user");
  const activeRoot = join(familyRoot, "active");
  const archivedRoot = join(familyRoot, "archived");
  const stamp = timestampForPath();
  const active = pickActive(items);

  console.log("");
  console.log(`== ${root} ==`);
  console.log(`active source: ${active.dirName}`);

  const tempItems = items.map((item) => {
    if (item.path !== familyRoot) return item;
    const temp = uniqueTarget(join(profilesRoot, `.__migrating_${root}_${stamp}`));
    moveDir(item.path, temp);
    return { ...item, path: temp };
  });
  const activeItem = tempItems.find((item) => item.dirName === active.dirName) || tempItems[0];

  log("MKDIR", userRoot);
  if (apply) ensureDir(userRoot);

  if (existsSync(activeRoot)) {
    const target = uniqueTarget(join(archivedRoot, `${stamp}-preexisting-active`));
    moveDir(activeRoot, target);
  }

  moveDir(activeItem.path, activeRoot);
  updateProfile(join(activeRoot, PROFILE_FILE), {
    subjectId: root,
    legacySubjectId: activeItem.raw.subjectId || activeItem.dirName,
    status: "active",
    slot: "active",
    familyMigratedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  for (const item of tempItems) {
    if (item.dirName === activeItem.dirName) continue;
    const target = uniqueTarget(join(archivedRoot, `${stamp}-${item.dirName}`));
    moveDir(item.path, target);
    updateProfile(join(target, PROFILE_FILE), {
      subjectId: root,
      legacySubjectId: item.raw.subjectId || item.dirName,
      status: "archived",
      slot: "archived",
      archivedAt: new Date().toISOString(),
      familyMigratedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

const groups = new Map();
for (const item of migrationItems()) {
  if (!groups.has(item.root)) groups.set(item.root, []);
  groups.get(item.root).push(item);
}

console.log(`Profile root: ${profilesRoot}`);
console.log(apply ? "Mode: APPLY" : "Mode: DRY-RUN (pass --apply to move files)");

for (const [root, items] of groups) {
  migrateGroup(root, items);
}

if (!groups.size) console.log("No legacy top-level profiles found.");
