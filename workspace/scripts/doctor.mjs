import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadReviewConfig } from "../lib/review_config.mjs";
import { listActiveProfiles } from "../lib/review_profiles.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE_ROOT = resolve(__dirname, "..");
const DEFAULT_REPO_ROOT = resolve(DEFAULT_WORKSPACE_ROOT, "..");

function readJSONOptional(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    return { __error: error instanceof Error ? error.message : String(error) };
  }
}

function checkWritableDir(path) {
  const result = { path, exists: existsSync(path), writable: false, error: "" };
  const tempPath = join(path, `.doctor-write-test-${process.pid}-${Date.now()}.tmp`);
  try {
    mkdirSync(path, { recursive: true });
    writeFileSync(tempPath, "ok", "utf-8");
    result.writable = readFileSync(tempPath, "utf-8") === "ok";
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup only.
    }
    result.exists = existsSync(path);
  }
  return result;
}

function resolveExtensionEntry(packageRoot, entry) {
  const raw = String(entry || "");
  if (!raw) return "";
  const full = resolve(packageRoot, raw);
  if (raw.endsWith(".ts") || raw.endsWith(".js") || raw.endsWith(".mjs")) return full;
  return join(full, "index.ts");
}

function packageExtensionSources(packageRoot, kind) {
  const pkgPath = join(packageRoot, "package.json");
  const pkg = readJSONOptional(pkgPath);
  if (!pkg || pkg.__error || !pkg.pi || !Array.isArray(pkg.pi.extensions)) return [];
  return pkg.pi.extensions
    .map((entry) => ({
      kind,
      source: entry,
      path: resolveExtensionEntry(packageRoot, entry),
      exists: existsSync(resolveExtensionEntry(packageRoot, entry)),
    }))
    .filter((entry) => /review/i.test(`${entry.source} ${entry.path}`));
}

function globalReviewExtensionSources(homeDir) {
  const base = join(homeDir, ".pi", "agent", "extensions");
  const sources = [];
  if (!existsSync(base)) return sources;
  const candidates = [
    join(base, "review.ts"),
    join(base, "review.js"),
    join(base, "review", "index.ts"),
    join(base, "review", "index.js"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) sources.push({ kind: "global-extension", source: path, path, exists: true });
  }
  return sources;
}

function settingsPackageSources(homeDir) {
  const settingsPath = join(homeDir, ".pi", "agent", "settings.json");
  const settings = readJSONOptional(settingsPath);
  if (!settings || settings.__error || !Array.isArray(settings.packages)) return [];
  return settings.packages
    .filter((entry) => /pi-review|review-agent/i.test(JSON.stringify(entry)))
    .map((entry) => ({
      kind: "settings-package",
      source: typeof entry === "string" ? entry : JSON.stringify(entry),
      path: settingsPath,
      exists: true,
    }));
}

function legacyWorkspaceSources(workspaceRoot) {
  const path = join(workspaceRoot, ".pi", "extensions", "review", "index.ts");
  return existsSync(path) ? [{ kind: "legacy-workspace-extension", source: ".pi/extensions/review/index.ts", path, exists: true }] : [];
}

function collectRegistrationSources({ workspaceRoot, repoRoot, homeDir }) {
  const sources = [
    ...legacyWorkspaceSources(workspaceRoot),
    ...globalReviewExtensionSources(homeDir),
    ...settingsPackageSources(homeDir),
    ...packageExtensionSources(workspaceRoot, "workspace-package"),
    ...packageExtensionSources(repoRoot, "root-package"),
  ];
  const existingSources = sources.filter((source) => source.exists);
  return {
    sources,
    hasDuplicateRisk: existingSources.length > 1,
    recommendation: existingSources.length > 1
      ? "Keep one canonical package source. Prefer the installed git package for normal use, or remove/disable it while testing this local checkout."
      : "No duplicate review extension source detected.",
  };
}

function buildProfileReports(config) {
  const profiles = [];
  try {
    for (const profile of listActiveProfiles(config)) {
      const userCheck = checkWritableDir(profile.userRoot);
      profiles.push({
        subjectId: profile.subjectId,
        status: profile.status,
        root: profile.root,
        familyRoot: profile.familyRoot,
        userRoot: profile.userRoot,
        userWritable: userCheck.writable,
        userError: userCheck.error,
      });
    }
  } catch (error) {
    profiles.push({
      subjectId: "",
      status: "error",
      root: "",
      familyRoot: "",
      userRoot: "",
      userWritable: false,
      userError: error instanceof Error ? error.message : String(error),
    });
  }
  return profiles;
}

export function buildDoctorReport(options = {}) {
  const config = options.config || loadReviewConfig();
  const workspaceRoot = options.workspaceRoot || config.workspaceRoot || DEFAULT_WORKSPACE_ROOT;
  const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT;
  const homeDir = options.homeDir || homedir();
  const paths = {
    dataRoot: checkWritableDir(config.dataRoot),
    profilesDirAbs: checkWritableDir(config.profilesDirAbs),
    archiveDirAbs: checkWritableDir(config.archiveDirAbs),
    stateDirAbs: checkWritableDir(config.stateDirAbs),
  };
  const profiles = buildProfileReports(config);
  const registration = collectRegistrationSources({ workspaceRoot, repoRoot, homeDir });
  const failures = [
    ...Object.entries(paths)
      .filter(([, value]) => !value.writable)
      .map(([key, value]) => `${key} is not writable: ${value.error || value.path}`),
    ...profiles
      .filter((profile) => !profile.userWritable)
      .map((profile) => `${profile.subjectId || "profile"} _user is not writable: ${profile.userError || profile.userRoot}`),
  ];
  return { paths, profiles, registration, failures };
}

function yesNo(value) {
  return value ? "yes" : "no";
}

export function formatDoctorReport(report) {
  const lines = [];
  lines.push("Pi Review Doctor");
  lines.push("");
  lines.push("Data roots:");
  for (const [key, value] of Object.entries(report.paths)) {
    lines.push(`- ${key}: ${value.path}`);
    lines.push(`  writable: ${yesNo(value.writable)}${value.error ? ` (${value.error})` : ""}`);
  }
  lines.push("");
  lines.push("Active profiles:");
  if (report.profiles.length === 0) {
    lines.push("- none");
  } else {
    for (const profile of report.profiles) {
      lines.push(`- ${profile.subjectId || "(unknown)"} (${profile.status})`);
      lines.push(`  root: ${profile.root}`);
      lines.push(`  familyRoot: ${profile.familyRoot}`);
      lines.push(`  userRoot: ${profile.userRoot}`);
      lines.push(`  ${profile.subjectId || "profile"} _user writable: ${yesNo(profile.userWritable)}${profile.userError ? ` (${profile.userError})` : ""}`);
    }
  }
  lines.push("");
  lines.push("Review extension sources:");
  if (report.registration.sources.length === 0) {
    lines.push("- none detected");
  } else {
    for (const source of report.registration.sources) {
      lines.push(`- ${source.kind}: ${source.source}`);
      lines.push(`  path: ${source.path}`);
      lines.push(`  exists: ${yesNo(source.exists)}`);
    }
  }
  lines.push(`duplicate registration risk: ${yesNo(report.registration.hasDuplicateRisk)}`);
  lines.push(`recommendation: ${report.registration.recommendation}`);
  if (report.failures.length) {
    lines.push("");
    lines.push("Failures:");
    for (const failure of report.failures) lines.push(`- ${failure}`);
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = buildDoctorReport();
  process.stdout.write(formatDoctorReport(report));
  if (report.failures.length) process.exitCode = 1;
}
