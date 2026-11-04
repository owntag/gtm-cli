/**
 * Local workspaces: init and pull (remote -> local).
 */

import { join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import { getTagManagerClient } from "../api/mod.ts";
import { KIND_ORDER, KINDS, SNAPSHOT_DIR } from "./kinds.ts";
import type { LocalWorkspace, Snapshot, WorkspaceMeta } from "./types.ts";
import {
  clearEntityFiles,
  isWorkspaceDir,
  loadWorkspace,
  LocalWorkspaceError,
  readMeta,
  toFileEntity,
  writeBuiltInVariables,
  writeEntityFile,
  writeMeta,
  writeSnapshot,
} from "./store.ts";
import {
  describeApiError,
  fetchContainer,
  fetchLiveSnapshot,
  fetchRemoteState,
  listRemoteWorkspaces,
  metaFromRemote,
  type RemoteIds,
  type RemoteState,
  snapshotFromRemote,
} from "./remote.ts";
import { computeDiff, hasChanges } from "./diff.ts";

export interface PullOptions {
  /** Overwrite local changes */
  force?: boolean;
  /** Also refresh the live version snapshot (default true) */
  live?: boolean;
  onProgress?: (msg: string) => void;
}

export interface PullResult {
  root: string;
  meta: WorkspaceMeta;
  counts: Record<string, number>;
  builtInVariables: number;
  live?: Snapshot;
}

/** Write a remote state into a workspace directory (entity files, built-ins, base snapshot, meta) */
export async function writeRemoteState(
  root: string,
  ids: RemoteIds,
  state: RemoteState,
  previous?: WorkspaceMeta,
): Promise<PullResult> {
  await ensureDir(root);
  await ensureDir(join(root, SNAPSHOT_DIR));
  await clearEntityFiles(root);
  const counts: Record<string, number> = {};
  for (const kind of KIND_ORDER) {
    const list = state.entities[kind];
    if (!list) continue;
    const spec = KINDS[kind];
    const written: string[] = [];
    for (const apiEntity of list) {
      const file = await writeEntityFile(root, kind, toFileEntity(apiEntity), undefined, written);
      written.push(file);
    }
    counts[spec.labelPlural] = list.length;
  }
  await writeBuiltInVariables(root, state.builtInVariables);
  await writeSnapshot(root, "base", snapshotFromRemote(state));
  const meta = metaFromRemote(ids, state, previous);
  await writeMeta(root, meta);
  return { root, meta, counts, builtInVariables: state.builtInVariables.length };
}

export async function refreshLiveSnapshot(
  root: string,
  ids: RemoteIds,
): Promise<Snapshot | undefined> {
  const live = await fetchLiveSnapshot(ids);
  if (live) await writeSnapshot(root, "live", live);
  return live;
}

/**
 * Pull the remote workspace into an existing local workspace.
 * Refuses to overwrite unpushed local changes unless `force` is set.
 */
export async function pullWorkspace(root: string, options: PullOptions = {}): Promise<PullResult> {
  const meta = await readMeta(root);
  const ids: RemoteIds = {
    accountId: meta.accountId,
    containerId: meta.containerId,
    workspaceId: meta.workspaceId,
  };

  if (!options.force) {
    const ws = await loadWorkspace(root);
    if (ws.base) {
      const diff = computeDiff(ws, ws.base, "remote");
      if (hasChanges(diff)) {
        throw new LocalWorkspaceError(
          `The local workspace has ${
            diff.summary.added + diff.summary.modified + diff.summary.deleted
          } unpushed change(s); pulling would overwrite them.`,
          "Run `gtm local status` to review them, `gtm local push` to upload them, or `gtm local pull --force` to discard them.",
        );
      }
    }
  }

  options.onProgress?.("Fetching remote workspace...");
  let state: RemoteState;
  try {
    state = await fetchRemoteState(ids, { onProgress: options.onProgress });
  } catch (err) {
    if (describeApiError(err).status === 404) {
      const workspaces = await listRemoteWorkspaces({
        accountId: ids.accountId,
        containerId: ids.containerId,
      });
      const list = workspaces.map((w) => `  ${w.workspaceId}  ${w.name}`).join("\n");
      throw new LocalWorkspaceError(
        `Remote workspace ${ids.workspaceId} no longer exists in container ${
          meta.container.publicId ?? ids.containerId
        }. Existing workspaces:\n${list}`,
        'Point this local workspace at another one by changing "workspaceId" in gtm-workspace.json, or run `gtm local init` in a new directory.',
      );
    }
    throw err;
  }
  const result = await writeRemoteState(root, ids, state, meta);
  if (options.live !== false) {
    options.onProgress?.("Fetching live version...");
    result.live = await refreshLiveSnapshot(root, ids);
  }
  return result;
}

export interface InitOptions {
  accountId: string;
  containerId: string;
  workspaceId?: string;
  /** Create a new remote workspace with this name and link to it */
  createWorkspace?: string;
  dir?: string;
  pull?: boolean;
  onProgress?: (msg: string) => void;
}

/**
 * Create a local workspace directory linked to a remote GTM workspace and pull it.
 */
export async function initWorkspace(
  options: InitOptions,
): Promise<PullResult & { workspaceId: string; created: boolean }> {
  const tm = await getTagManagerClient();
  const base = { accountId: options.accountId, containerId: options.containerId };
  const container = await fetchContainer(tm, { ...base, workspaceId: "0" });

  let workspaceId = options.workspaceId;
  let created = false;
  if (options.createWorkspace) {
    const { createRemoteWorkspace } = await import("./remote.ts");
    const ws = await createRemoteWorkspace(base, options.createWorkspace);
    workspaceId = String(ws.workspaceId);
    created = true;
  }
  if (workspaceId && !created) {
    const workspaces = await listRemoteWorkspaces(base);
    if (!workspaces.some((w) => String(w.workspaceId) === workspaceId)) {
      const list = workspaces.map((w) => `  ${w.workspaceId}  ${w.name}`).join("\n");
      throw new LocalWorkspaceError(
        `Workspace ${workspaceId} does not exist in container ${
          container.publicId ?? options.containerId
        } (it may have been deleted). Existing workspaces:\n${list}`,
        "Pass one of these with --workspace-id, omit it when there is only one, or create a new one with --create-workspace <name>.",
      );
    }
  }
  if (!workspaceId) {
    const workspaces = await listRemoteWorkspaces(base);
    if (workspaces.length === 1) {
      workspaceId = String(workspaces[0].workspaceId);
    } else {
      const list = workspaces.map((w) => `  ${w.workspaceId}  ${w.name}`).join("\n");
      throw new LocalWorkspaceError(
        `Container ${
          container.publicId ?? options.containerId
        } has ${workspaces.length} workspaces; pass --workspace-id to pick one.\n${list}`,
        "Or create a dedicated one with --create-workspace <name>.",
      );
    }
  }

  const publicId = typeof container.publicId === "string"
    ? container.publicId
    : `container-${options.containerId}`;
  const root = resolve(options.dir ?? publicId);
  if (await isWorkspaceDir(root)) {
    const existing = await readMeta(root);
    if (existing.containerId !== options.containerId || existing.workspaceId !== workspaceId) {
      throw new LocalWorkspaceError(
        `${root} is already a local workspace for container ${existing.containerId} / workspace ${existing.workspaceId}.`,
        "Choose another --dir, or delete the existing gtm-workspace.json first.",
      );
    }
  }
  const ids: RemoteIds = { ...base, workspaceId };
  if (options.pull === false) {
    await ensureDir(root);
    const state: RemoteState = {
      container,
      workspace: { workspaceId },
      entities: {},
      builtInVariables: [],
      kinds: [],
    };
    const meta = metaFromRemote(ids, state);
    delete meta.pulledAt;
    await writeMeta(root, meta);
    return { root, meta, counts: {}, builtInVariables: 0, workspaceId, created };
  }
  options.onProgress?.("Fetching remote workspace...");
  const state = await fetchRemoteState(ids, { container, onProgress: options.onProgress });
  const result = await writeRemoteState(root, ids, state);
  options.onProgress?.("Fetching live version...");
  result.live = await refreshLiveSnapshot(root, ids);
  return { ...result, workspaceId, created };
}

export function workspaceIds(ws: LocalWorkspace): RemoteIds {
  return {
    accountId: ws.meta.accountId,
    containerId: ws.meta.containerId,
    workspaceId: ws.meta.workspaceId,
  };
}
