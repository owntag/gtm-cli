/**
 * Local workspaces: in-memory indexing and reference resolution.
 */

import type { EntityKind, UsageContext } from "./kinds.ts";
import { KIND_ORDER, KINDS } from "./kinds.ts";
import type { Entity, GtmCondition, GtmParameter, LocalEntity, LocalWorkspace } from "./types.ts";
import { TRIGGER_PARAMETER_FIELDS, TRIGGER_REF_FIELDS } from "./params.ts";
import { builtInVariableName } from "./schema/built-ins.ts";

export interface BuiltInTrigger {
  id: string;
  name: string;
  /** Trigger type as GTM shows it */
  type: string;
}

/** Built-in triggers that GTM provides per container type (they never appear in the API) */
export const BUILT_IN_TRIGGERS: Record<UsageContext, BuiltInTrigger[]> = {
  web: [
    { id: "2147479553", name: "All Pages", type: "pageview" },
    { id: "2147479572", name: "Consent Initialization - All Pages", type: "consentInit" },
    { id: "2147479573", name: "Initialization - All Pages", type: "init" },
  ],
  server: [{ id: "2147479574", name: "All Pages", type: "always" }],
  other: [
    { id: "2147479553", name: "All Pages", type: "pageview" },
    { id: "2147479572", name: "Consent Initialization - All Pages", type: "consentInit" },
    { id: "2147479573", name: "Initialization - All Pages", type: "init" },
  ],
};

export function builtInTriggerById(context: UsageContext, id: string): BuiltInTrigger | undefined {
  return BUILT_IN_TRIGGERS[context].find((t) => t.id === id);
}

export function builtInTriggerByName(
  context: UsageContext,
  name: string,
): BuiltInTrigger | undefined {
  const lower = name.trim().toLowerCase();
  return BUILT_IN_TRIGGERS[context].find((t) => t.name.toLowerCase() === lower);
}

export function isNumericId(value: unknown): boolean {
  return typeof value === "string" && /^\d+$/.test(value);
}

export function entityId(e: LocalEntity): string | undefined {
  const v = e.entity[KINDS[e.kind].idField];
  return v === undefined || v === null ? undefined : String(v);
}

export function entityName(e: LocalEntity): string {
  return typeof e.entity.name === "string" ? e.entity.name : "";
}

export function entitiesOfKind(ws: LocalWorkspace, kind: EntityKind): LocalEntity[] {
  return ws.entities.filter((e) => e.kind === kind && !e.parseError);
}

/**
 * Find an entity by ID, exact name, case-insensitive unique name, or file name.
 */
export function findEntity(
  ws: LocalWorkspace,
  kind: EntityKind,
  ref: string,
): LocalEntity | undefined {
  const list = entitiesOfKind(ws, kind);
  const r = ref.trim();
  if (isNumericId(r)) {
    const byId = list.find((e) => entityId(e) === r);
    if (byId) return byId;
  }
  const exact = list.find((e) => entityName(e) === r);
  if (exact) return exact;
  const ci = list.filter((e) => entityName(e).toLowerCase() === r.toLowerCase());
  if (ci.length === 1) return ci[0];
  const fileRef = r.replace(/\.json$/, "");
  const byFile = list.find((e) => {
    const base = e.file.split("/").pop()!.replace(/\.json$/, "");
    return base === fileRef || e.file === r;
  });
  return byFile;
}

export interface ResolvedTrigger {
  /** The ID to send to the API (undefined when the target is a local trigger that has no ID yet) */
  id?: string;
  name: string;
  builtIn?: BuiltInTrigger;
  entity?: LocalEntity;
}

/**
 * Resolve a trigger reference (numeric ID, local trigger name, or built-in trigger name/ID).
 */
export function resolveTriggerRef(ws: LocalWorkspace, ref: string): ResolvedTrigger | undefined {
  const triggers = entitiesOfKind(ws, "trigger");
  const r = String(ref).trim();
  if (isNumericId(r)) {
    const bi = builtInTriggerById(ws.context, r);
    if (bi) return { id: bi.id, name: bi.name, builtIn: bi };
    const local = triggers.find((t) => entityId(t) === r);
    if (local) return { id: r, name: entityName(local), entity: local };
    return undefined;
  }
  const local = triggers.find((t) => entityName(t) === r) ??
    (() => {
      const ci = triggers.filter((t) => entityName(t).toLowerCase() === r.toLowerCase());
      return ci.length === 1 ? ci[0] : undefined;
    })();
  if (local) return { id: entityId(local), name: entityName(local), entity: local };
  const bi = builtInTriggerByName(ws.context, r);
  if (bi) return { id: bi.id, name: bi.name, builtIn: bi };
  return undefined;
}

export function resolveFolderRef(ws: LocalWorkspace, ref: string): LocalEntity | undefined {
  return findEntity(ws, "folder", ref);
}

/** Find a custom template by name, templateId, file name, or its cvt_ type id */
export function findTemplate(ws: LocalWorkspace, ref: string): LocalEntity | undefined {
  const direct = findEntity(ws, "template", ref);
  if (direct) return direct;
  if (/^cvt_/.test(ref)) {
    return entitiesOfKind(ws, "template").find((t) => templateTypeId(ws, t) === ref);
  }
  return undefined;
}

/**
 * The entity type id a template is referenced by: cvt_<galleryTemplateId> for gallery templates,
 * cvt_<containerId>_<templateId> otherwise (undefined while a new template has no ID yet).
 */
export function templateTypeId(
  ws: LocalWorkspace,
  template: LocalEntity,
  idOverrides: Map<string, string> = new Map(),
): string | undefined {
  const gallery = template.entity.galleryReference as { galleryTemplateId?: string } | undefined;
  if (gallery?.galleryTemplateId) return `cvt_${gallery.galleryTemplateId}`;
  const id = entityId(template) ?? idOverrides.get(`template:${entityName(template)}`);
  return id ? `cvt_${ws.meta.containerId}_${id}` : undefined;
}

/** Names that can be referenced with {{...}}: variables, enabled built-ins, and GTM specials */
export function availableVariableNames(ws: LocalWorkspace): Set<string> {
  const names = new Set<string>();
  for (const v of entitiesOfKind(ws, "variable")) names.add(entityName(v));
  for (const b of ws.builtInVariables) {
    const n = b.name ?? builtInVariableName(b.type);
    if (n) names.add(n);
  }
  // Special references that always exist
  names.add("_event");
  names.add("_triggers");
  names.add("_url");
  return names;
}

const VAR_REF_RE = /\{\{([^{}]+)\}\}/g;

/** Extract variable names referenced as {{name}} in a string */
export function extractVariableRefs(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(VAR_REF_RE)) out.push(m[1].trim());
  return out;
}

export interface TemplateValue {
  path: string;
  value: string;
}

function walkParams(params: unknown, path: string, out: TemplateValue[]): void {
  if (!Array.isArray(params)) return;
  (params as GtmParameter[]).forEach((p, i) => {
    if (!p || typeof p !== "object") return;
    const here = p.key ? `${path}[${p.key}]` : `${path}[${i}]`;
    if (typeof p.value === "string" && p.type !== "triggerReference" && p.type !== "tagReference") {
      out.push({ path: here, value: p.value });
    }
    if (p.list) walkParams(p.list, `${here}.list`, out);
    if (p.map) walkParams(p.map, `${here}.map`, out);
  });
}

function walkConditions(conditions: unknown, path: string, out: TemplateValue[]): void {
  if (!Array.isArray(conditions)) return;
  (conditions as GtmCondition[]).forEach((c, i) => {
    if (c && typeof c === "object") walkParams(c.parameter, `${path}[${i}].parameter`, out);
  });
}

/**
 * Collect every template string in an entity that may contain {{variable}} references.
 */
export function collectTemplateValues(kind: EntityKind, entity: Entity): TemplateValue[] {
  const out: TemplateValue[] = [];
  walkParams(entity.parameter, "parameter", out);
  if (kind === "trigger") {
    for (const f of ["filter", "customEventFilter", "autoEventFilter"]) {
      walkConditions(entity[f], f, out);
    }
    for (const f of Object.keys(TRIGGER_PARAMETER_FIELDS)) {
      const p = entity[f] as GtmParameter | undefined;
      if (p && typeof p === "object" && typeof p.value === "string") {
        out.push({ path: f, value: p.value });
      }
    }
  }
  if (kind === "tag") {
    const mm = entity.monitoringMetadata as GtmParameter | undefined;
    if (mm && typeof mm === "object") walkParams(mm.map, "monitoringMetadata.map", out);
    const cs = entity.consentSettings as { consentType?: GtmParameter } | undefined;
    if (cs && typeof cs === "object" && cs.consentType) {
      walkParams(cs.consentType.list, "consentSettings.consentType.list", out);
    }
  }
  if (kind === "variable") {
    const fv = entity.formatValue as Record<string, GtmParameter> | undefined;
    if (fv && typeof fv === "object") {
      for (const [k, p] of Object.entries(fv)) {
        if (p && typeof p === "object" && typeof p.value === "string") {
          out.push({ path: `formatValue.${k}`, value: p.value });
        }
      }
    }
  }
  if (kind === "zone") {
    const b = entity.boundary as { condition?: unknown } | undefined;
    if (b && typeof b === "object") walkConditions(b.condition, "boundary.condition", out);
  }
  return out;
}

/** All trigger references of an entity: [fieldPath, ref] */
export function collectTriggerRefs(
  kind: EntityKind,
  entity: Entity,
): Array<{ path: string; ref: string }> {
  const out: Array<{ path: string; ref: string }> = [];
  for (const f of TRIGGER_REF_FIELDS[kind]) {
    const list = entity[f];
    if (Array.isArray(list)) {
      list.forEach((r, i) => out.push({ path: `${f}[${i}]`, ref: String(r) }));
    }
  }
  if (kind === "zone") {
    const b = entity.boundary as { customEvaluationTriggerId?: unknown } | undefined;
    if (b && Array.isArray(b.customEvaluationTriggerId)) {
      b.customEvaluationTriggerId.forEach((r, i) =>
        out.push({ path: `boundary.customEvaluationTriggerId[${i}]`, ref: String(r) })
      );
    }
  }
  const walk = (params: unknown, path: string) => {
    if (!Array.isArray(params)) return;
    (params as GtmParameter[]).forEach((p, i) => {
      if (!p || typeof p !== "object") return;
      const here = p.key ? `${path}[${p.key}]` : `${path}[${i}]`;
      if (p.type === "triggerReference" && typeof p.value === "string") {
        out.push({ path: here, ref: p.value });
      }
      if (p.list) walk(p.list, `${here}.list`);
      if (p.map) walk(p.map, `${here}.map`);
    });
  };
  walk(entity.parameter, "parameter");
  return out;
}

/** All tag-name references of a tag (setup/teardown tags, tagReference parameters) */
export function collectTagRefs(entity: Entity): Array<{ path: string; ref: string }> {
  const out: Array<{ path: string; ref: string }> = [];
  for (const f of ["setupTag", "teardownTag"]) {
    const list = entity[f];
    if (Array.isArray(list)) {
      list.forEach((s, i) => {
        if (
          s && typeof s === "object" && typeof (s as { tagName?: unknown }).tagName === "string"
        ) {
          out.push({ path: `${f}[${i}].tagName`, ref: (s as { tagName: string }).tagName });
        }
      });
    }
  }
  const walk = (params: unknown, path: string) => {
    if (!Array.isArray(params)) return;
    (params as GtmParameter[]).forEach((p, i) => {
      if (!p || typeof p !== "object") return;
      const here = p.key ? `${path}[${p.key}]` : `${path}[${i}]`;
      if (p.type === "tagReference" && typeof p.value === "string") {
        out.push({ path: here, ref: p.value });
      }
      if (p.list) walk(p.list, `${here}.list`);
      if (p.map) walk(p.map, `${here}.map`);
    });
  };
  walk(entity.parameter, "parameter");
  return out;
}

/**
 * Produce a copy of the entity where trigger/folder references given as names are replaced by IDs.
 * Unresolvable references are left untouched (the validator reports them).
 * `idOverrides` maps "kind:name" -> id for entities created during a push.
 */
export function resolveReferencesToIds(
  ws: LocalWorkspace,
  kind: EntityKind,
  entity: Entity,
  idOverrides: Map<string, string> = new Map(),
): Entity {
  const out: Entity = structuredClone(entity);
  const triggerId = (ref: string): string => {
    if (isNumericId(ref)) return ref;
    const resolved = resolveTriggerRef(ws, ref);
    if (resolved?.id) return resolved.id;
    const override = idOverrides.get(`trigger:${resolved?.name ?? ref}`);
    return override ?? ref;
  };
  for (const f of TRIGGER_REF_FIELDS[kind]) {
    if (Array.isArray(out[f])) out[f] = (out[f] as unknown[]).map((r) => triggerId(String(r)));
  }
  if (kind === "zone") {
    const b = out.boundary as { customEvaluationTriggerId?: unknown[] } | undefined;
    if (b && Array.isArray(b.customEvaluationTriggerId)) {
      b.customEvaluationTriggerId = b.customEvaluationTriggerId.map((r) => triggerId(String(r)));
    }
  }
  const walk = (params: unknown) => {
    if (!Array.isArray(params)) return;
    for (const p of params as GtmParameter[]) {
      if (!p || typeof p !== "object") continue;
      if (p.type === "triggerReference" && typeof p.value === "string") {
        p.value = triggerId(p.value);
      }
      if (p.list) walk(p.list);
      if (p.map) walk(p.map);
    }
  };
  walk(out.parameter);
  // "template": "<name or id>" is resolved to the template's type id (cvt_...)
  if (
    typeof out.template === "string" && (kind === "tag" || kind === "variable" || kind === "client")
  ) {
    const tmpl = findTemplate(ws, out.template);
    const typeId = tmpl ? templateTypeId(ws, tmpl, idOverrides) : undefined;
    if (typeId) {
      out.type = typeId;
      delete out.template;
    }
  }
  if (typeof out.parentFolderId === "string" && !isNumericId(out.parentFolderId)) {
    const folder = resolveFolderRef(ws, out.parentFolderId);
    const id = folder ? entityId(folder) : undefined;
    out.parentFolderId = id ??
      idOverrides.get(`folder:${folder ? entityName(folder) : out.parentFolderId}`) ??
      out.parentFolderId;
  }
  return out;
}

/** Entities (other than `self`) that reference the given trigger, by name or id */
export function findTriggerDependents(ws: LocalWorkspace, trigger: LocalEntity): LocalEntity[] {
  const id = entityId(trigger);
  const name = entityName(trigger);
  const out: LocalEntity[] = [];
  for (const e of ws.entities) {
    if (e === trigger || e.parseError) continue;
    const refs = collectTriggerRefs(e.kind, e.entity);
    if (refs.some((r) => r.ref === name || (id !== undefined && r.ref === id))) out.push(e);
  }
  return out;
}

/** Entities that reference a variable via {{name}} */
export function findVariableDependents(ws: LocalWorkspace, name: string): LocalEntity[] {
  const out: LocalEntity[] = [];
  for (const e of ws.entities) {
    if (e.parseError) continue;
    const refs = collectTemplateValues(e.kind, e.entity).flatMap((t) =>
      extractVariableRefs(t.value)
    );
    if (refs.includes(name) && !(e.kind === "variable" && entityName(e) === name)) out.push(e);
  }
  return out;
}

/** Order kinds for display/processing */
export function sortedKinds(): EntityKind[] {
  return [...KIND_ORDER];
}
