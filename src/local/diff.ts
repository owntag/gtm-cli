/**
 * Local workspaces: diffing local entities against a snapshot (remote workspace or live version).
 */

import type { EntityKind } from "./kinds.ts";
import { KIND_ORDER, KINDS } from "./kinds.ts";
import type {
  BuiltInVariableEntry,
  DiffResult,
  Entity,
  EntityChange,
  FieldChange,
  GtmParameter,
  LocalWorkspace,
  Snapshot,
} from "./types.ts";
import { normalizeEntity, simplifyParameter } from "./params.ts";
import { builtInVariableName } from "./schema/built-ins.ts";
import { entityId, entityName, resolveReferencesToIds } from "./workspace.ts";

const SET_FIELDS = new Set([
  "firingTriggerId",
  "blockingTriggerId",
  "enablingTriggerId",
  "disablingTriggerId",
  "customEvaluationTriggerId",
  "whitelistedTypeId",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function isScalarParam(p: unknown): p is GtmParameter {
  return isPlainObject(p) &&
    ["template", "boolean", "integer", "triggerReference", "tagReference"].includes(String(p.type));
}

function paramKeyOf(p: unknown, index: number): string {
  return isPlainObject(p) && typeof p.key === "string" && p.key ? p.key : String(index);
}

function diffParameterArrays(a: unknown[], b: unknown[], path: string, out: FieldChange[]): void {
  const mapA = new Map<string, unknown>();
  const mapB = new Map<string, unknown>();
  a.forEach((p, i) => mapA.set(paramKeyOf(p, i), p));
  b.forEach((p, i) => mapB.set(paramKeyOf(p, i), p));
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  for (const key of keys) {
    const pa = mapA.get(key);
    const pb = mapB.get(key);
    const here = `${path}[${key}]`;
    if (pa === undefined) {
      out.push({ path: here, op: "added", after: isScalarParam(pb) ? simplifyParameter(pb) : pb });
    } else if (pb === undefined) {
      out.push({
        path: here,
        op: "removed",
        before: isScalarParam(pa) ? simplifyParameter(pa) : pa,
      });
    } else if (isScalarParam(pa) && isScalarParam(pb) && pa.type === pb.type) {
      if (pa.value !== pb.value) {
        out.push({ path: here, op: "changed", before: pa.value, after: pb.value });
      }
    } else {
      diffValues(pa, pb, here, out);
    }
  }
}

function diffValues(a: unknown, b: unknown, path: string, out: FieldChange[]): void {
  if (deepEqual(a, b)) return;
  const leaf = path.split(/[.[]/).pop()?.replace("]", "") ?? "";
  if (Array.isArray(a) && Array.isArray(b)) {
    if (leaf === "parameter" || leaf === "map") {
      diffParameterArrays(a, b, path, out);
      return;
    }
    if (SET_FIELDS.has(leaf)) {
      const sa = new Set(a.map(String));
      const sb = new Set(b.map(String));
      const same = sa.size === sb.size && [...sa].every((x) => sb.has(x));
      if (!same) out.push({ path, op: "changed", before: a, after: b });
      return;
    }
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (i >= a.length) out.push({ path: `${path}[${i}]`, op: "added", after: b[i] });
      else if (i >= b.length) out.push({ path: `${path}[${i}]`, op: "removed", before: a[i] });
      else diffValues(a[i], b[i], `${path}[${i}]`, out);
    }
    return;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const here = path ? `${path}.${k}` : k;
      if (!(k in a) || a[k] === undefined) out.push({ path: here, op: "added", after: b[k] });
      else if (!(k in b) || b[k] === undefined) {
        out.push({ path: here, op: "removed", before: a[k] });
      } else diffValues(a[k], b[k], here, out);
    }
    return;
  }
  out.push({ path, op: "changed", before: a, after: b });
}

/** Field-level differences between two canonical entities */
export function diffEntities(before: Entity, after: Entity): FieldChange[] {
  const out: FieldChange[] = [];
  diffValues(before, after, "", out);
  return out;
}

function stripIds(kind: EntityKind, e: Entity): Entity {
  const copy = { ...e };
  delete copy[KINDS[kind].idField];
  return copy;
}

/**
 * Compute the changes between the local workspace and a snapshot.
 */
export function computeDiff(
  ws: LocalWorkspace,
  snapshot: Snapshot | undefined,
  against: "remote" | "live",
): DiffResult {
  const changes: EntityChange[] = [];
  const byKind: DiffResult["summary"]["byKind"] = {};
  const bump = (kind: string, c: "added" | "modified" | "deleted") => {
    byKind[kind] ??= { added: 0, modified: 0, deleted: 0 };
    byKind[kind][c]++;
  };

  for (const kind of KIND_ORDER) {
    const spec = KINDS[kind];
    const remote = (snapshot?.entities[kind] ?? []).map((e) => normalizeEntity(kind, e));
    const remoteById = new Map<string, Entity>();
    for (const r of remote) {
      const id = r[spec.idField];
      if (id !== undefined) remoteById.set(String(id), r);
    }
    const seen = new Set<string>();
    for (const local of ws.entities.filter((e) => e.kind === kind)) {
      if (local.parseError) continue;
      const canonical = resolveReferencesToIds(ws, kind, local.entity);
      const id = entityId(local);
      const name = entityName(local);
      const type = typeof canonical.type === "string" ? canonical.type : undefined;
      if (id !== undefined && remoteById.has(id)) {
        seen.add(id);
        const before = remoteById.get(id)!;
        const fields = diffEntities(stripIds(kind, before), stripIds(kind, canonical));
        if (fields.length === 0) {
          changes.push({ kind, name, id, type, file: local.file, change: "unchanged" });
        } else {
          changes.push({
            kind,
            name,
            id,
            type,
            file: local.file,
            change: "modified",
            fields,
            before,
            after: canonical,
          });
          bump(kind, "modified");
        }
      } else {
        changes.push({ kind, name, id, type, file: local.file, change: "added", after: canonical });
        bump(kind, "added");
      }
    }
    for (const [id, before] of remoteById) {
      if (seen.has(id)) continue;
      changes.push({
        kind,
        name: String(before.name ?? ""),
        id,
        type: typeof before.type === "string" ? before.type : undefined,
        change: "deleted",
        before,
      });
      bump(kind, "deleted");
    }
  }

  // Built-in variables (compared as a set of types)
  const remoteBuiltIns = new Set(
    (snapshot?.builtInVariables ?? []).map((b: BuiltInVariableEntry) => b.type),
  );
  const localBuiltIns = new Set(ws.builtInVariables.map((b) => b.type));
  for (const t of localBuiltIns) {
    if (!remoteBuiltIns.has(t)) {
      changes.push({
        kind: "builtInVariable",
        name: builtInVariableName(t) ?? t,
        type: t,
        change: "added",
      });
      bump("builtInVariable", "added");
    }
  }
  for (const t of remoteBuiltIns) {
    if (!localBuiltIns.has(t)) {
      changes.push({
        kind: "builtInVariable",
        name: builtInVariableName(t) ?? t,
        type: t,
        change: "deleted",
      });
      bump("builtInVariable", "deleted");
    }
  }

  const summary = {
    added: changes.filter((c) => c.change === "added").length,
    modified: changes.filter((c) => c.change === "modified").length,
    deleted: changes.filter((c) => c.change === "deleted").length,
    unchanged: changes.filter((c) => c.change === "unchanged").length,
    byKind,
  };
  return { against, changes, summary };
}

export function hasChanges(diff: DiffResult): boolean {
  return diff.summary.added + diff.summary.modified + diff.summary.deleted > 0;
}

/** Compact one-line description of a field change for humans */
export function describeFieldChange(fc: FieldChange): string {
  const fmt = (v: unknown): string => {
    if (v === undefined) return "∅";
    if (typeof v === "string") return JSON.stringify(v.length > 60 ? v.slice(0, 57) + "..." : v);
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + "..." : s;
  };
  switch (fc.op) {
    case "added":
      return `+ ${fc.path} = ${fmt(fc.after)}`;
    case "removed":
      return `- ${fc.path} (was ${fmt(fc.before)})`;
    default:
      return `~ ${fc.path}: ${fmt(fc.before)} → ${fmt(fc.after)}`;
  }
}
