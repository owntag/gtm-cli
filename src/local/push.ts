/**
 * Local workspaces: planning and executing a push (local -> remote GTM workspace).
 *
 * 1. Validate (errors abort).
 * 2. Fetch the current remote state and detect conflicts against the base snapshot.
 * 3. Plan operations in dependency order (folders, templates, triggers, variables, clients,
 *    transformations, tags, zones; deletions in reverse, dependents first).
 * 4. Execute sequentially with retries, resolving name references to IDs as entities get created.
 * 5. Write IDs back into local files and refresh the base snapshot.
 */

import { getTagManagerClient } from "../api/mod.ts";
import type { EntityKind } from "./kinds.ts";
import { KIND_ORDER, KINDS } from "./kinds.ts";
import type {
  BuiltInVariableEntry,
  Entity,
  FieldChange,
  LocalEntity,
  LocalWorkspace,
  Snapshot,
} from "./types.ts";
import { normalizeEntity } from "./params.ts";
import { deepEqual, diffEntities } from "./diff.ts";
import {
  createEntity,
  deleteEntity,
  describeApiError,
  disableBuiltInVariables,
  enableBuiltInVariables,
  fetchRemoteState,
  type RemoteIds,
  type RemoteState,
  snapshotFromRemote,
  updateEntity,
} from "./remote.ts";
import {
  collectTagRefs,
  collectTemplateValues,
  collectTriggerRefs,
  entitiesOfKind,
  entityId,
  entityName,
  extractVariableRefs,
  isNumericId,
  resolveReferencesToIds,
  resolveTriggerRef,
} from "./workspace.ts";
import {
  toFileEntity,
  writeBuiltInVariables,
  writeEntityFile,
  writeMeta,
  writeSnapshot,
} from "./store.ts";

export type OperationType = "create" | "update" | "delete" | "enableBuiltIns" | "disableBuiltIns";

export interface Operation {
  op: OperationType;
  kind: EntityKind | "builtInVariable";
  name: string;
  id?: string;
  /** Local entity (create/update) */
  local?: LocalEntity;
  /** Remote entity as of the pre-push fetch (update/delete) */
  remote?: Entity;
  /** Built-in variable types (enable/disable) */
  types?: string[];
}

export interface Conflict {
  kind: EntityKind | "builtInVariable";
  name: string;
  id?: string;
  reason: string;
  hint: string;
}

export interface PushPlan {
  operations: Operation[];
  conflicts: Conflict[];
  /** Entities that exist remotely but were added after the last pull (left untouched) */
  remoteOnly: Array<{ kind: EntityKind; name: string; id: string }>;
  remote: RemoteState;
}

export interface OperationResult {
  op: Operation;
  ok: boolean;
  id?: string;
  error?: string;
  durationMs: number;
  /** Differences between what was sent and what GTM stored (e.g. silently dropped parameters) */
  drift?: FieldChange[];
}

export interface PushResult {
  plan: PushPlan;
  results: OperationResult[];
  ok: boolean;
  /** Set when execution stopped early */
  stoppedAt?: number;
}

function idsOf(ws: LocalWorkspace): RemoteIds {
  return {
    accountId: ws.meta.accountId,
    containerId: ws.meta.containerId,
    workspaceId: ws.meta.workspaceId,
  };
}

// ---------------------------------------------------------------------------------------------
// Dependency ordering
// ---------------------------------------------------------------------------------------------

/** Names (same kind) that `e` depends on, for topological ordering within a kind */
function sameKindDependencies(ws: LocalWorkspace, e: LocalEntity): string[] {
  const deps: string[] = [];
  if (e.kind === "trigger") {
    for (const { ref } of collectTriggerRefs("trigger", e.entity)) {
      const r = resolveTriggerRef(ws, ref);
      if (r?.entity) deps.push(entityName(r.entity));
    }
  }
  if (e.kind === "tag") {
    for (const { ref } of collectTagRefs(e.entity)) deps.push(ref);
  }
  if (e.kind === "variable") {
    const names = new Set(entitiesOfKind(ws, "variable").map(entityName));
    for (const { value } of collectTemplateValues("variable", e.entity)) {
      for (const ref of extractVariableRefs(value)) {
        if (names.has(ref) && ref !== entityName(e)) deps.push(ref);
      }
    }
  }
  return deps;
}

/** Topologically sort entities of one kind so dependencies come first (cycles keep file order) */
function topoSort(ws: LocalWorkspace, list: LocalEntity[]): LocalEntity[] {
  const byName = new Map(list.map((e) => [entityName(e), e]));
  const visited = new Set<LocalEntity>();
  const out: LocalEntity[] = [];
  const visit = (e: LocalEntity, stack: Set<LocalEntity>) => {
    if (visited.has(e) || stack.has(e)) return;
    stack.add(e);
    for (const dep of sameKindDependencies(ws, e)) {
      const d = byName.get(dep);
      if (d) visit(d, stack);
    }
    stack.delete(e);
    visited.add(e);
    out.push(e);
  };
  for (const e of list) visit(e, new Set());
  return out;
}

// ---------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------

export async function planPush(
  ws: LocalWorkspace,
  options: { force?: boolean; onProgress?: (msg: string) => void } = {},
): Promise<PushPlan> {
  const remote = await fetchRemoteState(idsOf(ws), { onProgress: options.onProgress });
  const conflicts: Conflict[] = [];
  const operations: Operation[] = [];
  const remoteOnly: PushPlan["remoteOnly"] = [];
  const base = ws.base;

  // Creates and updates, in kind order
  for (const kind of KIND_ORDER) {
    const spec = KINDS[kind];
    const remoteList = remote.entities[kind] ?? [];
    const remoteById = new Map(remoteList.map((r) => [String(r[spec.idField]), r]));
    const baseById = new Map((base?.entities[kind] ?? []).map((r) => [String(r[spec.idField]), r]));
    const localList = topoSort(ws, entitiesOfKind(ws, kind));
    const seenRemote = new Set<string>();

    for (const local of localList) {
      const id = entityId(local);
      const name = entityName(local);
      if (id === undefined) {
        // New entity: name must not collide with something that exists remotely
        const collision = remoteList.find((r) => r.name === name);
        if (collision) {
          const inBase = baseById.has(String(collision[spec.idField]));
          conflicts.push({
            kind,
            name,
            reason: inBase
              ? `A ${spec.label} named "${name}" already exists remotely (id ${
                collision[spec.idField]
              }) but your local file has no ${spec.idField}.`
              : `A ${spec.label} named "${name}" was created remotely since your last pull (id ${
                collision[spec.idField]
              }).`,
            hint: inBase
              ? `Run \`gtm local pull\` to get the remote version, or add "${spec.idField}": "${
                collision[spec.idField]
              }" to the local file to update it instead.`
              : `Rename the local ${spec.label}, or run \`gtm local pull\` to merge the remote state first.`,
          });
          continue;
        }
        operations.push({ op: "create", kind, name, local });
        continue;
      }
      seenRemote.add(id);
      const remoteEntity = remoteById.get(id);
      const baseEntity = baseById.get(id);
      if (!remoteEntity) {
        conflicts.push({
          kind,
          name,
          id,
          reason: `${spec.label} "${name}" (id ${id}) was deleted remotely since your last pull.`,
          hint: options.force
            ? `--force: it will be re-created.`
            : `Run \`gtm local pull\` to accept the deletion, or push with --force to re-create it.`,
        });
        if (options.force) operations.push({ op: "create", kind, name, local: stripId(local) });
        continue;
      }
      const localCanonical = resolveReferencesToIds(ws, kind, local.entity);
      const remoteCanonical = normalizeEntity(kind, remoteEntity);
      if (deepEqual(stripIdField(kind, localCanonical), stripIdField(kind, remoteCanonical))) {
        continue; // unchanged vs remote now
      }
      const changedRemotely = baseEntity && remoteEntity.fingerprint !== baseEntity.fingerprint;
      const changedLocally = !baseEntity ||
        !deepEqual(
          stripIdField(kind, localCanonical),
          stripIdField(kind, normalizeEntity(kind, baseEntity)),
        );
      if (changedRemotely && changedLocally && !options.force) {
        conflicts.push({
          kind,
          name,
          id,
          reason:
            `${spec.label} "${name}" (id ${id}) was modified both locally and remotely since your last pull.`,
          hint:
            `Run \`gtm local diff\` to review your local change, then \`gtm local pull --force\` to take the remote version, or push with --force to overwrite the remote version.`,
        });
        continue;
      }
      if (!changedLocally && changedRemotely) continue; // only remote changed: keep remote
      operations.push({ op: "update", kind, name, id, local, remote: remoteEntity });
    }

    // Deletions: in base and remote, but not local
    for (const [id, remoteEntity] of remoteById) {
      if (seenRemote.has(id)) continue;
      const baseEntity = baseById.get(id);
      const name = String(remoteEntity.name ?? id);
      if (!baseEntity) {
        remoteOnly.push({ kind, name, id });
        continue;
      }
      if (remoteEntity.fingerprint !== baseEntity.fingerprint && !options.force) {
        conflicts.push({
          kind,
          name,
          id,
          reason:
            `${spec.label} "${name}" (id ${id}) was deleted locally but modified remotely since your last pull.`,
          hint:
            `Run \`gtm local pull\` to see the remote change, or push with --force to delete it anyway.`,
        });
        continue;
      }
      operations.push({ op: "delete", kind, name, id, remote: remoteEntity });
    }
  }

  // Built-in variables
  const remoteBuiltIns = new Set(remote.builtInVariables.map((b) => b.type));
  const localBuiltIns = new Set(ws.builtInVariables.map((b) => b.type));
  const baseBuiltIns = new Set((base?.builtInVariables ?? []).map((b) => b.type));
  const toEnable = [...localBuiltIns].filter((t) => !remoteBuiltIns.has(t));
  const toDisable = [...remoteBuiltIns].filter((t) => !localBuiltIns.has(t) && baseBuiltIns.has(t));
  if (toEnable.length) {
    operations.push({
      op: "enableBuiltIns",
      kind: "builtInVariable",
      name: toEnable.join(", "),
      types: toEnable,
    });
  }
  if (toDisable.length) {
    operations.push({
      op: "disableBuiltIns",
      kind: "builtInVariable",
      name: toDisable.join(", "),
      types: toDisable,
    });
  }

  return { operations: orderOperations(operations), conflicts, remoteOnly, remote };
}

function stripId(local: LocalEntity): LocalEntity {
  const entity = { ...local.entity };
  delete entity[KINDS[local.kind].idField];
  return { ...local, entity };
}

function stripIdField(kind: EntityKind, e: Entity): Entity {
  const copy = { ...e };
  delete copy[KINDS[kind].idField];
  return copy;
}

/**
 * Final operation order:
 *   built-in enables, creates+updates in KIND_ORDER (already topo-sorted per kind),
 *   deletes in reverse KIND_ORDER (dependents first), built-in disables.
 */
function orderOperations(ops: Operation[]): Operation[] {
  const rank = (o: Operation): number => {
    if (o.op === "enableBuiltIns") return 0;
    if (o.op === "disableBuiltIns") return 1000;
    const kindIndex = KIND_ORDER.indexOf(o.kind as EntityKind);
    if (o.op === "delete") return 500 + (KIND_ORDER.length - kindIndex);
    return 10 + kindIndex;
  };
  const sorted = ops.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .map((x) => x.o);
  // Within deletions of the same kind, delete dependents (e.g. trigger groups) before their dependencies.
  const deletes = sorted.filter((o) => o.op === "delete");
  const others = sorted.filter((o) => o.op !== "delete");
  const orderedDeletes: Operation[] = [];
  for (const kind of [...KIND_ORDER].reverse()) {
    const group = deletes.filter((d) => d.kind === kind);
    const visited = new Set<Operation>();
    const out: Operation[] = [];
    const dependentsOf = (d: Operation): Operation[] => {
      // operations whose remote entity references d
      return group.filter((other) => {
        if (other === d) return false;
        const refs = [
          ...collectTriggerRefs(kind, other.remote!).map((r) => r.ref),
          ...(kind === "tag" ? collectTagRefs(other.remote!).map((r) => r.ref) : []),
        ];
        return refs.includes(d.id!) || refs.includes(d.name);
      });
    };
    const visit = (d: Operation, stack: Set<Operation>) => {
      if (visited.has(d) || stack.has(d)) return;
      stack.add(d);
      for (const dep of dependentsOf(d)) visit(dep, stack);
      stack.delete(d);
      visited.add(d);
      out.push(d);
    };
    for (const d of group) visit(d, new Set());
    orderedDeletes.push(...out);
  }
  const firstDeleteIndex = sorted.findIndex((o) => o.op === "delete");
  if (firstDeleteIndex < 0) return others;
  const before = others.filter((o) => o.op !== "disableBuiltIns");
  const after = others.filter((o) => o.op === "disableBuiltIns");
  return [...before, ...orderedDeletes, ...after];
}

// ---------------------------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------------------------

/** Build the request body for create/update: canonical entity with references resolved, no IDs */
export function buildRequestBody(
  ws: LocalWorkspace,
  local: LocalEntity,
  idOverrides: Map<string, string>,
): Entity {
  const body = resolveReferencesToIds(ws, local.kind, local.entity, idOverrides);
  delete body[KINDS[local.kind].idField];
  // Tag references by name to tags created in this push keep their names (GTM references tags by name).
  return body;
}

export interface ExecuteOptions {
  onOperation?: (op: Operation, index: number, total: number) => void;
  onResult?: (result: OperationResult, index: number, total: number) => void;
  /** Stop at the first failed operation (default true) */
  stopOnError?: boolean;
}

export async function executePush(
  ws: LocalWorkspace,
  plan: PushPlan,
  options: ExecuteOptions = {},
): Promise<PushResult> {
  const tm = await getTagManagerClient();
  const ids = idsOf(ws);
  const results: OperationResult[] = [];
  const idOverrides = new Map<string, string>(); // "kind:name" -> new id
  const createdOrUpdated: Array<{ local: LocalEntity; remote: Entity }> = [];
  const total = plan.operations.length;
  let stoppedAt: number | undefined;
  let builtInsAfter: BuiltInVariableEntry[] = [...plan.remote.builtInVariables];

  for (let i = 0; i < total; i++) {
    const op = plan.operations[i];
    options.onOperation?.(op, i, total);
    const started = Date.now();
    try {
      switch (op.op) {
        case "create": {
          const body = buildRequestBody(ws, op.local!, idOverrides);
          const created = await createEntity(tm, ids, op.kind as EntityKind, body);
          const newId = String(created[KINDS[op.kind as EntityKind].idField]);
          idOverrides.set(`${op.kind}:${op.name}`, newId);
          createdOrUpdated.push({ local: op.local!, remote: created });
          results.push({
            op,
            ok: true,
            id: newId,
            durationMs: Date.now() - started,
            drift: detectDrift(op.kind as EntityKind, body, created),
          });
          break;
        }
        case "update": {
          const body = buildRequestBody(ws, op.local!, idOverrides);
          const fingerprint = typeof op.remote?.fingerprint === "string"
            ? op.remote.fingerprint
            : undefined;
          const updated = await updateEntity(
            tm,
            ids,
            op.kind as EntityKind,
            op.id!,
            fingerprint,
            body,
          );
          createdOrUpdated.push({ local: op.local!, remote: updated });
          results.push({
            op,
            ok: true,
            id: op.id,
            durationMs: Date.now() - started,
            drift: detectDrift(op.kind as EntityKind, body, updated),
          });
          break;
        }
        case "delete": {
          await deleteEntity(tm, ids, op.kind as EntityKind, op.id!, op.name);
          results.push({ op, ok: true, id: op.id, durationMs: Date.now() - started });
          break;
        }
        case "enableBuiltIns": {
          const enabled = await enableBuiltInVariables(tm, ids, op.types!);
          const known = new Map(builtInsAfter.map((b) => [b.type, b]));
          for (const b of enabled) known.set(b.type, b);
          for (const t of op.types!) if (!known.has(t)) known.set(t, { type: t });
          builtInsAfter = [...known.values()];
          results.push({ op, ok: true, durationMs: Date.now() - started });
          break;
        }
        case "disableBuiltIns": {
          await disableBuiltInVariables(tm, ids, op.types!);
          builtInsAfter = builtInsAfter.filter((b) => !op.types!.includes(b.type));
          results.push({ op, ok: true, durationMs: Date.now() - started });
          break;
        }
      }
      options.onResult?.(results[results.length - 1], i, total);
    } catch (err) {
      const info = describeApiError(err);
      const result: OperationResult = {
        op,
        ok: false,
        error: info.message,
        durationMs: Date.now() - started,
      };
      results.push(result);
      options.onResult?.(result, i, total);
      if (options.stopOnError !== false) {
        stoppedAt = i;
        break;
      }
    }
  }

  // Persist what we know: IDs for created entities, refreshed base snapshot from the latest remote data.
  await persistAfterPush(ws, plan, results, createdOrUpdated, builtInsAfter);

  const ok = results.every((r) => r.ok) && stoppedAt === undefined;
  return { plan, results, ok, stoppedAt };
}

/**
 * GTM silently drops parameters it does not know and normalizes some values. Compare what we sent
 * with what came back so the user learns about it instead of seeing a mysterious "modified" later.
 */
function detectDrift(kind: EntityKind, sent: Entity, stored: Entity): FieldChange[] | undefined {
  const a = normalizeEntity(kind, sent);
  const b = normalizeEntity(kind, stored);
  delete a[KINDS[kind].idField];
  delete b[KINDS[kind].idField];
  const fields = diffEntities(a, b);
  return fields.length ? fields : undefined;
}

async function persistAfterPush(
  ws: LocalWorkspace,
  plan: PushPlan,
  results: OperationResult[],
  createdOrUpdated: Array<{ local: LocalEntity; remote: Entity }>,
  builtInsAfter: BuiltInVariableEntry[],
): Promise<void> {
  // 1. Write IDs into local files of newly created entities (keep the user's representation otherwise).
  //    Entities that GTM stored differently than requested are rewritten from the remote version so the
  //    workspace is clean after the push (the drift is reported to the user).
  const allFiles = ws.entities.map((e) => e.file);
  const drifted = new Set(results.filter((r) => r.ok && r.drift).map((r) => r.op.local));
  for (const { local, remote } of createdOrUpdated) {
    const idField = KINDS[local.kind].idField;
    if (drifted.has(local)) {
      await writeEntityFile(
        ws.root,
        local.kind,
        toFileEntity(remote),
        local.file,
        allFiles.filter((f) => f !== local.file),
      );
    } else if (local.raw[idField] === undefined && remote[idField] !== undefined) {
      const updated: Entity = { [idField]: String(remote[idField]), ...local.raw };
      await writeEntityFile(
        ws.root,
        local.kind,
        updated,
        local.file,
        allFiles.filter((f) => f !== local.file),
      );
    }
  }

  // 2. New base snapshot = remote state before push, patched with the results
  const entities: Snapshot["entities"] = {};
  for (const kind of KIND_ORDER) {
    const list = [...(plan.remote.entities[kind] ?? [])];
    const idField = KINDS[kind].idField;
    for (const r of results) {
      if (!r.ok || r.op.kind !== kind) continue;
      if (r.op.op === "delete") {
        const idx = list.findIndex((e) => String(e[idField]) === r.op.id);
        if (idx >= 0) list.splice(idx, 1);
      }
    }
    for (const { local, remote } of createdOrUpdated) {
      if (local.kind !== kind) continue;
      const idx = list.findIndex((e) => String(e[idField]) === String(remote[idField]));
      if (idx >= 0) list[idx] = remote;
      else list.push(remote);
    }
    if (plan.remote.entities[kind] !== undefined) entities[kind] = list;
  }
  const snapshot: Snapshot = {
    ...snapshotFromRemote(plan.remote),
    takenAt: new Date().toISOString(),
    entities,
    builtInVariables: builtInsAfter,
  };
  await writeSnapshot(ws.root, "base", snapshot);
  // Normalize local built-in variable names to what GTM reports
  if (results.some((r) => r.ok && r.op.kind === "builtInVariable")) {
    const byType = new Map(builtInsAfter.map((b) => [b.type, b]));
    await writeBuiltInVariables(ws.root, ws.builtInVariables.map((b) => byType.get(b.type) ?? b));
  }
  await writeMeta(ws.root, { ...ws.meta, pulledAt: snapshot.takenAt, pushedAt: snapshot.takenAt });
}

/** Human-readable label for an operation */
export function describeOperation(op: Operation): string {
  const label = op.kind === "builtInVariable"
    ? "built-in variables"
    : KINDS[op.kind as EntityKind].label;
  switch (op.op) {
    case "create":
      return `create ${label} "${op.name}"`;
    case "update":
      return `update ${label} "${op.name}" (id ${op.id})`;
    case "delete":
      return `delete ${label} "${op.name}" (id ${op.id})`;
    case "enableBuiltIns":
      return `enable ${label}: ${op.name}`;
    case "disableBuiltIns":
      return `disable ${label}: ${op.name}`;
  }
}

export { isNumericId };
