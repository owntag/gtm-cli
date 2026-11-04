/**
 * Local workspaces: all remote (GTM API) interactions, with rate-limit aware retries.
 */

import type { TagManager } from "../api/mod.ts";
import { getTagManagerClient, paginateAll } from "../api/mod.ts";
import type { EntityKind, KindSpec } from "./kinds.ts";
import { KINDS, supportedKinds, usageContextOf } from "./kinds.ts";
import type { BuiltInVariableEntry, Entity, Snapshot, WorkspaceMeta } from "./types.ts";

export interface RemoteIds {
  accountId: string;
  containerId: string;
  workspaceId: string;
}

export interface RemoteState {
  container: Entity;
  workspace: Entity;
  entities: Partial<Record<EntityKind, Entity[]>>;
  builtInVariables: BuiltInVariableEntry[];
  kinds: KindSpec[];
}

export function workspacePath(ids: RemoteIds): string {
  return `accounts/${ids.accountId}/containers/${ids.containerId}/workspaces/${ids.workspaceId}`;
}

// ---------------------------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------------------------

export interface ApiErrorInfo {
  status?: number;
  reason?: string;
  message: string;
}

export function describeApiError(err: unknown): ApiErrorInfo {
  const e = err as {
    code?: number | string;
    message?: string;
    response?: {
      status?: number;
      data?: {
        error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> };
      };
    };
    errors?: Array<{ reason?: string; message?: string }>;
  };
  const status = e.response?.status ??
    (typeof e.code === "number" ? e.code : Number(e.code) || undefined);
  const errors = e.response?.data?.error?.errors ?? e.errors;
  const reason = errors?.[0]?.reason;
  const message = e.response?.data?.error?.message ??
    errors?.map((x) => x.message).filter(Boolean).join("; ") ??
    e.message ?? String(err);
  return { status, reason, message: message.trim() };
}

function isRetryable(info: ApiErrorInfo): boolean {
  if (
    info.status === 429 || info.status === 500 || info.status === 502 || info.status === 503 ||
    info.status === 504
  ) return true;
  if (info.status === 403 && info.reason && /rate|quota/i.test(info.reason)) return true;
  return false;
}

export type RetryNotifier = (message: string) => void;

let notifier: RetryNotifier | undefined;
export function setRetryNotifier(fn: RetryNotifier | undefined): void {
  notifier = fn;
}

/**
 * Run an API call, retrying with exponential backoff on rate-limit and transient server errors.
 * GTM's per-project quota is small and shared by everyone using the public OAuth client, so this
 * matters a lot for pushes with many operations.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label = "request",
  maxAttempts = 7,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const info = describeApiError(err);
      attempt++;
      if (!isRetryable(info) || attempt >= maxAttempts) throw err;
      const delay = Math.min(30_000, 1000 * Math.pow(2, attempt - 1)) +
        Math.floor(Math.random() * 400);
      notifier?.(
        `${label}: ${
          info.status === 429 || /rate|quota/i.test(info.reason ?? "")
            ? "API rate limit hit"
            : `transient error ${info.status}`
        }, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt}/${maxAttempts - 1})`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type AnyResource = any;

function resource(tm: TagManager, kind: EntityKind): AnyResource {
  return (tm.accounts.containers.workspaces as AnyResource)[KINDS[kind].apiResource];
}

export async function fetchContainer(tm: TagManager, ids: RemoteIds): Promise<Entity> {
  const res = await withRetry(
    () =>
      tm.accounts.containers.get({
        path: `accounts/${ids.accountId}/containers/${ids.containerId}`,
      }),
    "get container",
  );
  return res.data as Entity;
}

export async function fetchWorkspace(tm: TagManager, ids: RemoteIds): Promise<Entity> {
  const res = await withRetry(
    () => tm.accounts.containers.workspaces.get({ path: workspacePath(ids) }),
    "get workspace",
  );
  return res.data as Entity;
}

export async function listEntities(
  tm: TagManager,
  ids: RemoteIds,
  kind: EntityKind,
): Promise<Entity[]> {
  const spec = KINDS[kind];
  return await withRetry(
    () =>
      paginateAll<Entity>(
        (pageToken) => resource(tm, kind).list({ parent: workspacePath(ids), pageToken }),
        spec.listKey,
      ),
    `list ${spec.labelPlural}`,
  );
}

export async function listBuiltInVariables(
  tm: TagManager,
  ids: RemoteIds,
): Promise<BuiltInVariableEntry[]> {
  const items = await withRetry(
    () =>
      paginateAll<Entity>(
        (pageToken) =>
          tm.accounts.containers.workspaces.built_in_variables.list({
            parent: workspacePath(ids),
            pageToken,
          }),
        "builtInVariable",
      ),
    "list built-in variables",
  );
  return items.map((b) => ({
    type: String(b.type),
    name: typeof b.name === "string" ? b.name : undefined,
  }));
}

/**
 * Fetch everything that makes up a remote workspace. Entity kinds are chosen from the
 * container's feature flags so server containers get clients/transformations and web containers get zones.
 */
export async function fetchRemoteState(
  ids: RemoteIds,
  options: { container?: Entity; onProgress?: (msg: string) => void } = {},
): Promise<RemoteState> {
  const tm = await getTagManagerClient();
  const container = options.container ?? (await fetchContainer(tm, ids));
  const context = usageContextOf(container.usageContext as string[] | undefined);
  const kinds = supportedKinds(container.features as Record<string, boolean> | undefined, context);
  const workspace = await fetchWorkspace(tm, ids);
  const entities: Partial<Record<EntityKind, Entity[]>> = {};
  for (const spec of kinds) {
    options.onProgress?.(`Fetching ${spec.labelPlural}...`);
    entities[spec.kind] = await listEntities(tm, ids, spec.kind);
  }
  options.onProgress?.("Fetching built-in variables...");
  const builtInVariables = await listBuiltInVariables(tm, ids);
  return { container, workspace, entities, builtInVariables, kinds };
}

export function snapshotFromRemote(state: RemoteState): Snapshot {
  return {
    takenAt: new Date().toISOString(),
    workspaceFingerprint: typeof state.workspace.fingerprint === "string"
      ? state.workspace.fingerprint
      : undefined,
    entities: state.entities,
    builtInVariables: state.builtInVariables,
  };
}

/** Fetch the live (published) version as a snapshot; undefined when nothing was published yet */
export async function fetchLiveSnapshot(ids: RemoteIds): Promise<Snapshot | undefined> {
  const tm = await getTagManagerClient();
  try {
    const res = await withRetry(
      () =>
        tm.accounts.containers.versions.live({
          parent: `accounts/${ids.accountId}/containers/${ids.containerId}`,
        }),
      "get live version",
    );
    const v = res.data as Entity;
    const entities: Partial<Record<EntityKind, Entity[]>> = {};
    for (const spec of Object.values(KINDS)) {
      const list = v[spec.versionKey];
      if (Array.isArray(list)) entities[spec.kind] = list as Entity[];
    }
    const builtIns = Array.isArray(v.builtInVariable) ? (v.builtInVariable as Entity[]) : [];
    return {
      takenAt: new Date().toISOString(),
      containerVersionId: typeof v.containerVersionId === "string"
        ? v.containerVersionId
        : undefined,
      versionName: typeof v.name === "string" ? v.name : undefined,
      entities,
      builtInVariables: builtIns.map((b) => ({
        type: String(b.type),
        name: typeof b.name === "string" ? b.name : undefined,
      })),
    };
  } catch (err) {
    const info = describeApiError(err);
    if (
      info.status === 404 || /no live version|not found|has not been published/i.test(info.message)
    ) return undefined;
    throw err;
  }
}

export function metaFromRemote(
  ids: RemoteIds,
  state: RemoteState,
  previous?: WorkspaceMeta,
): WorkspaceMeta {
  const c = state.container;
  return {
    formatVersion: 1,
    accountId: ids.accountId,
    containerId: ids.containerId,
    workspaceId: ids.workspaceId,
    container: {
      name: c.name as string | undefined,
      publicId: c.publicId as string | undefined,
      usageContext: c.usageContext as string[] | undefined,
      features: c.features as Record<string, boolean> | undefined,
      domainName: c.domainName as string[] | undefined,
      taggingServerUrls: c.taggingServerUrls as string[] | undefined,
      tagIds: c.tagIds as string[] | undefined,
      fingerprint: c.fingerprint as string | undefined,
    },
    workspace: {
      name: state.workspace.name as string | undefined,
      description: state.workspace.description as string | undefined,
    },
    pulledAt: new Date().toISOString(),
    pushedAt: previous?.pushedAt,
  };
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

export async function createEntity(
  tm: TagManager,
  ids: RemoteIds,
  kind: EntityKind,
  body: Entity,
): Promise<Entity> {
  const res = await withRetry<{ data: unknown }>(
    () => resource(tm, kind).create({ parent: workspacePath(ids), requestBody: body }),
    `create ${KINDS[kind].label} "${body.name}"`,
  );
  return res.data as Entity;
}

export async function updateEntity(
  tm: TagManager,
  ids: RemoteIds,
  kind: EntityKind,
  id: string,
  fingerprint: string | undefined,
  body: Entity,
): Promise<Entity> {
  const path = `${workspacePath(ids)}/${KINDS[kind].apiResource}/${id}`;
  const res = await withRetry<{ data: unknown }>(
    () => resource(tm, kind).update({ path, fingerprint, requestBody: body }),
    `update ${KINDS[kind].label} "${body.name}"`,
  );
  return res.data as Entity;
}

export async function deleteEntity(
  tm: TagManager,
  ids: RemoteIds,
  kind: EntityKind,
  id: string,
  label: string,
): Promise<void> {
  const path = `${workspacePath(ids)}/${KINDS[kind].apiResource}/${id}`;
  await withRetry(
    () => resource(tm, kind).delete({ path }),
    `delete ${KINDS[kind].label} "${label}"`,
  );
}

export async function enableBuiltInVariables(
  tm: TagManager,
  ids: RemoteIds,
  types: string[],
): Promise<BuiltInVariableEntry[]> {
  if (types.length === 0) return [];
  const res = await withRetry(
    () =>
      tm.accounts.containers.workspaces.built_in_variables.create({
        parent: workspacePath(ids),
        type: types,
      }),
    "enable built-in variables",
  );
  const list = (res.data as { builtInVariable?: Entity[] }).builtInVariable ?? [];
  return list.map((b) => ({
    type: String(b.type),
    name: typeof b.name === "string" ? b.name : undefined,
  }));
}

/**
 * Disable built-in variables.
 *
 * IMPORTANT: for `built_in_variables.delete` the API's `path` parameter must END IN `/built_in_variables`
 * (the request is `DELETE tagmanager/v2/{+path}`). Passing the bare workspace path deletes the whole
 * workspace (verified 2026-11-04). Never pass the workspace path here.
 */
export async function disableBuiltInVariables(
  tm: TagManager,
  ids: RemoteIds,
  types: string[],
): Promise<void> {
  if (types.length === 0) return;
  const path = `${workspacePath(ids)}/built_in_variables`;
  if (!path.endsWith("/built_in_variables")) {
    throw new Error("refusing to delete: built-in variable path is malformed");
  }
  await withRetry(
    () => tm.accounts.containers.workspaces.built_in_variables.delete({ path, type: types }),
    "disable built-in variables",
  );
}

export async function createRemoteWorkspace(
  ids: Omit<RemoteIds, "workspaceId">,
  name: string,
  description?: string,
): Promise<Entity> {
  const tm = await getTagManagerClient();
  const res = await withRetry(
    () =>
      tm.accounts.containers.workspaces.create({
        parent: `accounts/${ids.accountId}/containers/${ids.containerId}`,
        requestBody: { name, description },
      }),
    "create workspace",
  );
  return res.data as Entity;
}

export async function listRemoteWorkspaces(ids: Omit<RemoteIds, "workspaceId">): Promise<Entity[]> {
  const tm = await getTagManagerClient();
  return await withRetry(
    () =>
      paginateAll<Entity>(
        (pageToken) =>
          tm.accounts.containers.workspaces.list({
            parent: `accounts/${ids.accountId}/containers/${ids.containerId}`,
            pageToken,
          }),
        "workspace",
      ),
    "list workspaces",
  );
}
