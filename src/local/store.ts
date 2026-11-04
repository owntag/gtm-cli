/**
 * Local workspaces: on-disk layout and file I/O.
 *
 *   <workspace>/
 *     gtm-workspace.json        metadata: account/container/workspace IDs, container info
 *     tags/<name>.json          one file per entity, GTM API format
 *     triggers/<name>.json
 *     variables/<name>.json
 *     folders/, templates/, clients/, transformations/, zones/, gtag-configs/
 *     built-in-variables.json   enabled built-in variables: [{ "type": "pageUrl", "name": "Page URL" }]
 *     .gtm/base.json            snapshot of the remote workspace at the last pull/push
 *     .gtm/live.json            snapshot of the live (published) container version
 */

import { dirname, isAbsolute, join, relative, resolve } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import {
  BASE_SNAPSHOT_FILE,
  BUILT_IN_VARIABLES_FILE,
  type EntityKind,
  FORMAT_VERSION,
  KIND_ORDER,
  KINDS,
  LIVE_SNAPSHOT_FILE,
  READ_ONLY_FIELDS,
  SNAPSHOT_DIR,
  usageContextOf,
  WORKSPACE_FILE,
} from "./kinds.ts";
import type {
  BuiltInVariableEntry,
  Entity,
  LocalEntity,
  LocalWorkspace,
  Snapshot,
  WorkspaceMeta,
} from "./types.ts";
import { normalizeEntity, stripEmptyDefaults } from "./params.ts";

export class LocalWorkspaceError extends Error {
  constructor(message: string, public hint?: string) {
    super(message);
    this.name = "LocalWorkspaceError";
  }
}

// ---------------------------------------------------------------------------------------------
// Locating workspaces
// ---------------------------------------------------------------------------------------------

export async function isWorkspaceDir(dir: string): Promise<boolean> {
  return await exists(join(dir, WORKSPACE_FILE), { isFile: true });
}

/** Walk up from `start` looking for a directory containing gtm-workspace.json */
export async function findWorkspaceRoot(start: string): Promise<string | undefined> {
  let dir = resolve(start);
  while (true) {
    if (await isWorkspaceDir(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Direct child directories of `dir` that are local workspaces */
export async function findChildWorkspaces(dir: string): Promise<string[]> {
  const found: string[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isDirectory || entry.name.startsWith(".")) continue;
      const child = join(dir, entry.name);
      if (await isWorkspaceDir(child)) found.push(child);
    }
  } catch {
    // unreadable directory: no children
  }
  return found.sort();
}

/**
 * Resolve which workspace directories a command should operate on.
 *
 *  - `--dir` pointing at a workspace: that one
 *  - `--dir` pointing at a folder that contains workspaces: all of them (multi-container mode)
 *  - no `--dir`: $GTM_LOCAL_WORKSPACE, then the workspace enclosing the current directory,
 *    then workspaces directly inside the current directory
 */
export async function resolveWorkspaceRoots(
  dirOption: string | undefined,
  options: { allowMany?: boolean } = {},
): Promise<string[]> {
  const candidates: string[] = [];
  const envDir = Deno.env.get("GTM_LOCAL_WORKSPACE");
  const explicit = dirOption ?? envDir;

  if (explicit) {
    const abs = resolve(explicit);
    if (!(await exists(abs, { isDirectory: true }))) {
      throw new LocalWorkspaceError(
        `Directory not found: ${abs}`,
        "Run `gtm local init` to create a local workspace, or pass --dir with an existing one.",
      );
    }
    if (await isWorkspaceDir(abs)) return [abs];
    candidates.push(...(await findChildWorkspaces(abs)));
    if (candidates.length === 0) {
      throw new LocalWorkspaceError(
        `${abs} is not a local workspace (no ${WORKSPACE_FILE}) and contains none.`,
        "Run `gtm local init --dir <dir>` first, or point --dir at a folder that contains local workspaces.",
      );
    }
  } else {
    const enclosing = await findWorkspaceRoot(Deno.cwd());
    if (enclosing) return [enclosing];
    candidates.push(...(await findChildWorkspaces(Deno.cwd())));
    if (candidates.length === 0) {
      throw new LocalWorkspaceError(
        `No local workspace found in ${Deno.cwd()} or any parent directory.`,
        "Run `gtm local init --account-id <id> --container-id <id>` to create one, or pass --dir <path>.",
      );
    }
  }

  if (candidates.length > 1 && !options.allowMany) {
    throw new LocalWorkspaceError(
      `Found ${candidates.length} local workspaces: ${
        candidates.map((c) => relative(Deno.cwd(), c) || ".").join(", ")
      }.`,
      "This command works on one workspace at a time. Pass --dir <path> to pick one.",
    );
  }
  return candidates;
}

// ---------------------------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------------------------

async function readJson<T>(path: string): Promise<T> {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text) as T;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2) + "\n");
}

/** Preferred key order for readable entity files */
const KEY_ORDER = [
  "tagId",
  "triggerId",
  "variableId",
  "folderId",
  "templateId",
  "clientId",
  "transformationId",
  "zoneId",
  "gtagConfigId",
  "name",
  "type",
  "notes",
  "parentFolderId",
  "paused",
  "firingTriggerId",
  "blockingTriggerId",
  "parameter",
];

export function orderEntityKeys(entity: Entity): Entity {
  const out: Entity = {};
  for (const k of KEY_ORDER) if (k in entity) out[k] = entity[k];
  for (const k of Object.keys(entity).sort()) if (!(k in out)) out[k] = entity[k];
  return out;
}

/** Turn an API entity into the content of a local entity file */
export function toFileEntity(apiEntity: Entity): Entity {
  const out: Entity = {};
  for (const [k, v] of Object.entries(apiEntity)) {
    if (READ_ONLY_FIELDS.includes(k)) continue;
    out[k] = v;
  }
  return orderEntityKeys(stripEmptyDefaults(out));
}

// ---------------------------------------------------------------------------------------------
// File naming
// ---------------------------------------------------------------------------------------------

/** Characters that are unsafe in file names on common file systems */
// deno-lint-ignore no-control-regex
const UNSAFE_FILE_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

export function fileNameForEntity(name: string, fallback: string): string {
  let base = String(name ?? "").trim().replace(UNSAFE_FILE_CHARS, "_").replace(/\s+/g, " ").trim();
  base = base.replace(/^\.+/, "").replace(/\.+$/, "");
  if (base.length > 120) base = base.slice(0, 120).trim();
  if (!base) base = fallback;
  return `${base}.json`;
}

// ---------------------------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------------------------

export function metaPath(root: string): string {
  return join(root, WORKSPACE_FILE);
}

export async function readMeta(root: string): Promise<WorkspaceMeta> {
  let meta: WorkspaceMeta;
  try {
    meta = await readJson<WorkspaceMeta>(metaPath(root));
  } catch (e) {
    throw new LocalWorkspaceError(
      `Could not read ${WORKSPACE_FILE} in ${root}: ${(e as Error).message}`,
      "The file must be valid JSON. If it is damaged, re-run `gtm local init` in this directory.",
    );
  }
  if (!meta.accountId || !meta.containerId || !meta.workspaceId) {
    throw new LocalWorkspaceError(
      `${WORKSPACE_FILE} in ${root} is missing accountId, containerId or workspaceId.`,
      "Re-run `gtm local init` with the correct IDs.",
    );
  }
  if (meta.formatVersion !== undefined && meta.formatVersion > FORMAT_VERSION) {
    throw new LocalWorkspaceError(
      `This local workspace uses format version ${meta.formatVersion}, but this CLI supports up to ${FORMAT_VERSION}.`,
      "Run `gtm upgrade` to update the CLI.",
    );
  }
  return meta;
}

export async function writeMeta(root: string, meta: WorkspaceMeta): Promise<void> {
  await writeJson(metaPath(root), { ...meta, formatVersion: FORMAT_VERSION });
}

// ---------------------------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------------------------

export async function readSnapshot(
  root: string,
  which: "base" | "live",
): Promise<Snapshot | undefined> {
  const path = join(root, SNAPSHOT_DIR, which === "base" ? BASE_SNAPSHOT_FILE : LIVE_SNAPSHOT_FILE);
  try {
    return await readJson<Snapshot>(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return undefined;
    throw new LocalWorkspaceError(
      `Could not read snapshot ${path}: ${(e as Error).message}`,
      "Run `gtm local pull` to recreate it.",
    );
  }
}

export async function writeSnapshot(
  root: string,
  which: "base" | "live",
  snapshot: Snapshot,
): Promise<void> {
  const path = join(root, SNAPSHOT_DIR, which === "base" ? BASE_SNAPSHOT_FILE : LIVE_SNAPSHOT_FILE);
  await writeJson(path, snapshot);
}

// ---------------------------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------------------------

export async function readEntityFiles(root: string, kind: EntityKind): Promise<LocalEntity[]> {
  const dir = join(root, KINDS[kind].dir);
  const out: LocalEntity[] = [];
  let entries: Deno.DirEntry[] = [];
  try {
    for await (const e of Deno.readDir(dir)) entries.push(e);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return out;
    throw e;
  }
  entries = entries.filter((e) => e.isFile && e.name.endsWith(".json") && !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const file = join(KINDS[kind].dir, e.name);
    const full = join(root, file);
    let raw: Entity;
    try {
      const text = await Deno.readTextFile(full);
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        out.push({
          kind,
          file,
          raw: {},
          entity: {},
          parseError: "The file must contain a single JSON object.",
        });
        continue;
      }
      raw = parsed as Entity;
    } catch (err) {
      out.push({ kind, file, raw: {}, entity: {}, parseError: describeJsonError(err as Error) });
      continue;
    }
    out.push({ kind, file, raw, entity: normalizeEntity(kind, raw) });
  }
  return out;
}

function describeJsonError(err: Error): string {
  const m = err.message;
  // V8: "Unexpected token } in JSON at position 123" / Deno: "... at line 3 column 5"
  return `Invalid JSON: ${m}`;
}

export async function readBuiltInVariables(root: string): Promise<BuiltInVariableEntry[]> {
  const path = join(root, BUILT_IN_VARIABLES_FILE);
  try {
    const data = await readJson<unknown>(path);
    if (Array.isArray(data)) {
      return data.map((d) => (typeof d === "string" ? { type: d } : d as BuiltInVariableEntry));
    }
    throw new LocalWorkspaceError(
      `${BUILT_IN_VARIABLES_FILE} must contain a JSON array of built-in variable entries.`,
      'Example: [{ "type": "pageUrl", "name": "Page URL" }, "pagePath"]',
    );
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return [];
    if (e instanceof LocalWorkspaceError) throw e;
    throw new LocalWorkspaceError(
      `Could not read ${path}: ${(e as Error).message}`,
      "The file must contain a JSON array.",
    );
  }
}

export async function writeBuiltInVariables(
  root: string,
  entries: BuiltInVariableEntry[],
): Promise<void> {
  const sorted = [...entries].sort((a, b) => a.type.localeCompare(b.type));
  await writeJson(join(root, BUILT_IN_VARIABLES_FILE), sorted);
}

/**
 * Write an entity file. When `existingFile` is given and the derived file name differs
 * (e.g. after a rename), the old file is removed.
 */
export async function writeEntityFile(
  root: string,
  kind: EntityKind,
  entity: Entity,
  existingFile?: string,
  otherFiles: string[] = [],
): Promise<string> {
  const spec = KINDS[kind];
  const id = entity[spec.idField];
  const fallback = `${spec.label}-${id ?? Date.now()}`;
  let fileName = fileNameForEntity(String(entity.name ?? ""), fallback);
  let file = join(spec.dir, fileName);
  // Avoid clobbering a different entity's file that happens to normalize to the same name.
  if (file !== existingFile && otherFiles.includes(file)) {
    fileName = fileNameForEntity(`${entity.name} (${id ?? "new"})`, fallback);
    file = join(spec.dir, fileName);
    let n = 2;
    while (otherFiles.includes(file) && file !== existingFile) {
      file = join(spec.dir, fileNameForEntity(`${entity.name} (${n++})`, fallback));
    }
  }
  await writeJson(join(root, file), orderEntityKeys(entity));
  if (existingFile && existingFile !== file) {
    try {
      await Deno.remove(join(root, existingFile));
    } catch {
      // already gone
    }
  }
  return file;
}

export async function deleteEntityFile(root: string, file: string): Promise<void> {
  try {
    await Deno.remove(join(root, file));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}

/** Remove all entity files and the built-in variables file (used by pull --force) */
export async function clearEntityFiles(root: string): Promise<void> {
  for (const kind of KIND_ORDER) {
    const dir = join(root, KINDS[kind].dir);
    try {
      for await (const e of Deno.readDir(dir)) {
        if (e.isFile && e.name.endsWith(".json")) await Deno.remove(join(dir, e.name));
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  try {
    await Deno.remove(join(root, BUILT_IN_VARIABLES_FILE));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Loading a whole workspace
// ---------------------------------------------------------------------------------------------

export async function loadWorkspace(
  root: string,
  options: { snapshots?: boolean } = {},
): Promise<LocalWorkspace> {
  const absRoot = isAbsolute(root) ? root : resolve(root);
  const meta = await readMeta(absRoot);
  const entities: LocalEntity[] = [];
  for (const kind of KIND_ORDER) entities.push(...(await readEntityFiles(absRoot, kind)));
  const builtInVariables = await readBuiltInVariables(absRoot);
  const ws: LocalWorkspace = {
    root: absRoot,
    meta,
    context: usageContextOf(meta.container?.usageContext),
    entities,
    builtInVariables,
  };
  if (options.snapshots !== false) {
    ws.base = await readSnapshot(absRoot, "base");
    ws.live = await readSnapshot(absRoot, "live");
  }
  return ws;
}

/** Workspace-relative path for display */
export function displayPath(root: string, file?: string): string {
  const rel = relative(Deno.cwd(), root) || ".";
  // Far-away directories read better as absolute paths than as a chain of "../"
  const shown = rel.startsWith("..") && rel.split("/").filter((p) => p === "..").length > 2
    ? root
    : rel;
  return file ? join(shown, file) : shown;
}
