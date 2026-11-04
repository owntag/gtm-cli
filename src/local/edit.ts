/**
 * Local workspaces: editing operations used by `gtm local <kind> add|set|rm` and the rename logic
 * that keeps references consistent (like the GTM UI does when you rename a variable).
 */

import type { EntityKind } from "./kinds.ts";
import { KINDS } from "./kinds.ts";
import type {
  Entity,
  GtmParameter,
  LocalEntity,
  LocalWorkspace,
  ValidationResult,
} from "./types.ts";
import {
  fromSimpleValue,
  normalizeEntity,
  normalizeParameterList,
  removeParam,
  setParam,
} from "./params.ts";
import {
  deleteEntityFile,
  LocalWorkspaceError,
  orderEntityKeys,
  writeEntityFile,
} from "./store.ts";
import { validateEntityInWorkspace } from "./validate.ts";
import {
  collectTagRefs,
  collectTriggerRefs,
  entityId,
  entityName,
  findTriggerDependents,
  findVariableDependents,
  isNumericId,
} from "./workspace.ts";

export interface EditResult {
  file: string;
  entity: Entity;
  validation: ValidationResult;
  /** Files that were rewritten because they referenced a renamed entity */
  updatedReferences?: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Canonical file content for an entity about to be written */
function toCanonical(kind: EntityKind, raw: Entity): Entity {
  const idField = KINDS[kind].idField;
  const canonical = normalizeEntity(kind, raw);
  if (raw[idField] !== undefined) canonical[idField] = String(raw[idField]);
  return orderEntityKeys(canonical);
}

function otherFiles(ws: LocalWorkspace, except?: string): string[] {
  return ws.entities.map((e) => e.file).filter((f) => f !== except);
}

function throwOnErrors(validation: ValidationResult, what: string): void {
  if (validation.ok) return;
  const errors = validation.issues.filter((i) => i.severity === "error");
  const lines = errors.map((i) =>
    `  - ${i.path ? `${i.path}: ` : ""}${i.message}${i.hint ? `\n    → ${i.hint}` : ""}`
  );
  throw new LocalWorkspaceError(
    `${what} has ${errors.length} validation error${
      errors.length === 1 ? "" : "s"
    }; nothing was written:\n${lines.join("\n")}`,
    "Fix the errors and retry, or pass --force to write the file anyway (the push will still refuse until it validates).",
  );
}

/**
 * Add a new entity. `raw` may use the simplified notation; the canonical GTM form is written.
 */
export async function addEntity(
  ws: LocalWorkspace,
  kind: EntityKind,
  raw: Entity,
  options: { force?: boolean } = {},
): Promise<EditResult> {
  const spec = KINDS[kind];
  const canonical = toCanonical(kind, raw);
  if (typeof canonical.name !== "string" || !canonical.name) {
    throw new LocalWorkspaceError(
      `A ${spec.label} needs a name.`,
      `Pass --name "<name>" or include "name" in the JSON.`,
    );
  }
  if (
    spec.hasType && typeof canonical.type !== "string" && typeof canonical.template !== "string"
  ) {
    throw new LocalWorkspaceError(
      `A ${spec.label} needs a type.`,
      `Pass --type <type> (or --template <custom template name>), or include "type" / "template" in the JSON.`,
    );
  }
  const candidate: LocalEntity = {
    kind,
    file: `${spec.dir}/__new__.json`,
    raw: canonical,
    entity: normalizeEntity(kind, canonical),
  };
  const validation = validateEntityInWorkspace(ws, candidate);
  if (!options.force) throwOnErrors(validation, `The new ${spec.label} "${canonical.name}"`);
  const file = await writeEntityFile(ws.root, kind, canonical, undefined, otherFiles(ws));
  validation.issues.forEach((i) => (i.file = file));
  return { file, entity: canonical, validation };
}

export interface Patch {
  /** Top-level fields to set (simplified notation allowed); `parameter` as object merges by key */
  fields?: Entity;
  /** Parameters to upsert */
  params?: GtmParameter[];
  /** Parameter keys to remove */
  unsetParams?: string[];
  /** Top-level fields to remove */
  unsetFields?: string[];
  /** Tag trigger list manipulation */
  addTriggers?: string[];
  removeTriggers?: string[];
}

/**
 * Apply a patch to an existing entity and rewrite its file. Renames propagate to references.
 */
export async function updateEntity(
  ws: LocalWorkspace,
  local: LocalEntity,
  patch: Patch,
  options: { force?: boolean } = {},
): Promise<EditResult> {
  const kind = local.kind;
  const spec = KINDS[kind];
  const oldName = entityName(local);
  // Start from the canonical form of the current file so simplified input gets normalized too.
  const working: Entity = toCanonical(kind, local.raw);

  if (patch.fields) {
    for (const [k, v] of Object.entries(patch.fields)) {
      if (k === spec.idField) continue; // IDs are managed by the CLI
      if (k === "parameter" && isPlainObject(v) && Array.isArray(working.parameter)) {
        // simplified object: merge by key
        for (const [pk, pv] of Object.entries(v)) setParam(working, fromSimpleValue(pk, pv));
      } else if (k === "parameter") {
        working.parameter = normalizeParameterList(v);
      } else {
        working[k] = v;
      }
    }
  }
  for (const p of patch.params ?? []) setParam(working, p);
  for (const key of patch.unsetParams ?? []) {
    if (!removeParam(working, key)) {
      throw new LocalWorkspaceError(
        `The ${spec.label} has no parameter "${key}" to remove.`,
        `Current parameters: ${
          (Array.isArray(working.parameter) ? working.parameter as GtmParameter[] : []).map((p) =>
            p.key
          ).join(", ") || "none"
        }.`,
      );
    }
  }
  for (const f of patch.unsetFields ?? []) delete working[f];
  if (patch.addTriggers?.length || patch.removeTriggers?.length) {
    const list = Array.isArray(working.firingTriggerId)
      ? (working.firingTriggerId as string[]).map(String)
      : [];
    const resolvedId = (ref: string): string | undefined => {
      const r = resolveRef(ws, ref);
      return r;
    };
    for (const ref of patch.addTriggers ?? []) {
      if (!list.includes(ref) && !list.includes(resolvedId(ref) ?? "\u0000")) list.push(ref);
    }
    for (const ref of patch.removeTriggers ?? []) {
      const id = resolvedId(ref);
      const before = list.length;
      const filtered = list.filter((x) =>
        x !== ref && x !== id && !(id && resolveRef(ws, x) === id)
      );
      if (filtered.length === before) {
        throw new LocalWorkspaceError(
          `Trigger "${ref}" is not a firing trigger of this tag.`,
          `Current firing triggers: ${list.join(", ") || "none"}.`,
        );
      }
      list.length = 0;
      list.push(...filtered);
    }
    working.firingTriggerId = list;
  }

  const canonical = toCanonical(kind, working);
  const candidate: LocalEntity = {
    kind,
    file: local.file,
    raw: canonical,
    entity: normalizeEntity(kind, canonical),
  };
  const newName = entityName(candidate);
  const renamed = newName !== oldName;

  // Validate with the rename already applied to dependents (so references resolve)
  let wsForValidation = ws;
  let referenceUpdates: Array<{ entity: LocalEntity; raw: Entity }> = [];
  if (renamed) {
    referenceUpdates = planReferenceUpdates(ws, local, oldName, newName);
    wsForValidation = {
      ...ws,
      entities: ws.entities.map((e) => {
        const upd = referenceUpdates.find((u) => u.entity === e);
        return upd ? { ...e, raw: upd.raw, entity: normalizeEntity(e.kind, upd.raw) } : e;
      }),
    };
  }
  const validation = validateEntityInWorkspace(wsForValidation, candidate);
  if (!options.force) throwOnErrors(validation, `The updated ${spec.label} "${newName}"`);

  const file = await writeEntityFile(
    ws.root,
    kind,
    canonical,
    local.file,
    otherFiles(ws, local.file),
  );
  const updatedReferences: string[] = [];
  for (const u of referenceUpdates) {
    await writeEntityFile(
      ws.root,
      u.entity.kind,
      orderEntityKeys(u.raw),
      u.entity.file,
      otherFiles(ws, u.entity.file),
    );
    updatedReferences.push(u.entity.file);
  }
  validation.issues.forEach((i) => (i.file = file));
  return { file, entity: canonical, validation, updatedReferences };
}

function resolveRef(ws: LocalWorkspace, ref: string): string | undefined {
  if (isNumericId(ref)) return ref;
  const t = ws.entities.find((e) => e.kind === "trigger" && entityName(e) === ref);
  return t ? entityId(t) : undefined;
}

/**
 * Compute the files that must change when an entity is renamed:
 *  - variables: every {{old}} becomes {{new}} in template values
 *  - triggers: name references in firingTriggerId/blockingTriggerId/triggerReference parameters
 *  - tags: setupTag/teardownTag tagName and tagReference parameters
 *  - folders: parentFolderId given as a name
 */
export function planReferenceUpdates(
  ws: LocalWorkspace,
  target: LocalEntity,
  oldName: string,
  newName: string,
): Array<{ entity: LocalEntity; raw: Entity }> {
  const updates: Array<{ entity: LocalEntity; raw: Entity }> = [];
  if (!oldName || oldName === newName) return updates;
  const dependents = target.kind === "variable"
    ? findVariableDependents(ws, oldName)
    : target.kind === "trigger"
    ? findTriggerDependents(ws, target).filter((e) =>
      collectTriggerRefs(e.kind, e.entity).some((r) => r.ref === oldName)
    )
    : target.kind === "tag"
    ? ws.entities.filter((e) =>
      e.kind === "tag" && e !== target && collectTagRefs(e.entity).some((r) => r.ref === oldName)
    )
    : target.kind === "folder"
    ? ws.entities.filter((e) => e !== target && e.entity.parentFolderId === oldName)
    : [];
  for (const dep of dependents) {
    const raw = structuredClone(dep.raw);
    rewriteReferences(raw, target.kind, oldName, newName);
    updates.push({ entity: dep, raw });
  }
  return updates;
}

function rewriteReferences(
  node: unknown,
  kind: EntityKind,
  oldName: string,
  newName: string,
): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      if (typeof item === "string") node[i] = rewriteString(item, kind, oldName, newName, "list");
      else rewriteReferences(item, kind, oldName, newName);
    });
    return;
  }
  if (!isPlainObject(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === "string") node[k] = rewriteString(v, kind, oldName, newName, k);
    else rewriteReferences(v, kind, oldName, newName);
  }
}

function rewriteString(
  value: string,
  kind: EntityKind,
  oldName: string,
  newName: string,
  key: string,
): string {
  switch (kind) {
    case "variable":
      return value.split(`{{${oldName}}}`).join(`{{${newName}}}`);
    case "trigger":
      return value === oldName &&
          (key === "list" || key === "value" || key === "firingTriggerId" ||
            key === "blockingTriggerId")
        ? newName
        : value;
    case "tag":
      return value === oldName && (key === "tagName" || key === "value") ? newName : value;
    case "folder":
      return value === oldName && key === "parentFolderId" ? newName : value;
    default:
      return value;
  }
}

export interface RemoveResult {
  file: string;
  dependents: LocalEntity[];
}

/**
 * Delete an entity file. Refuses when other entities still reference it, unless forced.
 */
export async function removeEntity(
  ws: LocalWorkspace,
  local: LocalEntity,
  options: { force?: boolean } = {},
): Promise<RemoveResult> {
  const name = entityName(local);
  const id = entityId(local);
  let dependents: LocalEntity[] = [];
  switch (local.kind) {
    case "trigger":
      dependents = findTriggerDependents(ws, local);
      break;
    case "variable":
      dependents = findVariableDependents(ws, name);
      break;
    case "tag":
      dependents = ws.entities.filter((e) =>
        e.kind === "tag" && e !== local && collectTagRefs(e.entity).some((r) => r.ref === name)
      );
      break;
    case "folder":
      dependents = ws.entities.filter((e) =>
        e !== local &&
        (e.entity.parentFolderId === name || (id !== undefined && e.entity.parentFolderId === id))
      );
      break;
    case "template": {
      const gallery = local.entity.galleryReference as { galleryTemplateId?: string } | undefined;
      const types = new Set<string>();
      if (gallery?.galleryTemplateId) types.add(`cvt_${gallery.galleryTemplateId}`);
      if (id) types.add(`cvt_${ws.meta.containerId}_${id}`);
      dependents = ws.entities.filter((e) =>
        typeof e.entity.type === "string" && types.has(e.entity.type)
      );
      break;
    }
    default:
      break;
  }
  if (dependents.length > 0 && !options.force) {
    throw new LocalWorkspaceError(
      `${KINDS[local.kind].label} "${name}" is still referenced by: ${
        dependents.map((d) => `${KINDS[d.kind].label} "${entityName(d)}" (${d.file})`).join(", ")
      }.`,
      "Update or delete those first, or pass --force to delete anyway (the references will then fail validation).",
    );
  }
  await deleteEntityFile(ws.root, local.file);
  return { file: local.file, dependents };
}
