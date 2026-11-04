/**
 * Local workspaces: deterministic, offline validation of a local workspace.
 *
 * Every check mirrors something the GTM API (or GTM itself) would complain about, but reports it
 * instantly, in plain English, with the file and JSON path and a concrete fix. Errors are things
 * the API would reject; warnings are things the API accepts silently but that are almost
 * certainly mistakes (unknown parameter keys get dropped, dangling {{variable}} references, ...).
 */

import type { EntityKind, UsageContext } from "./kinds.ts";
import { KIND_ORDER, KINDS, supportedKinds } from "./kinds.ts";
import type {
  Entity,
  GtmCondition,
  GtmParameter,
  LocalEntity,
  LocalWorkspace,
  Severity,
  ValidationIssue,
  ValidationResult,
} from "./types.ts";
import {
  CASE_CONVERSION_TYPES,
  CONDITION_TYPES,
  CONSENT_STATUSES,
  CONVERT_TO_NUMBER_TYPES,
  PARAMETER_TYPES,
  TAG_FIRING_OPTIONS,
  TRIGGER_PARAMETER_FIELDS,
  TRIGGER_TYPES,
} from "./params.ts";
import { builtInVariablesFor, builtInVariableType } from "./schema/built-ins.ts";
import {
  CLIENT_TYPES,
  findClientType,
  findTagType,
  findTriggerType,
  findVariableType,
  isCustomTemplateType,
  type ParamSpec,
  TAG_TYPES,
  triggerTypesForContext,
  typesForContext,
  type TypeSpec,
  VARIABLE_TYPES,
} from "./schema/types.ts";
import {
  expectedParameterType,
  isTemplateParamActive,
  type ParsedTemplate,
  parseTemplate,
  splitTemplateSections,
} from "./schema/template.ts";
import {
  availableVariableNames,
  BUILT_IN_TRIGGERS,
  collectTagRefs,
  collectTemplateValues,
  collectTriggerRefs,
  entitiesOfKind,
  entityId,
  entityName,
  extractVariableRefs,
  findTemplate,
  isNumericId,
  resolveFolderRef,
  resolveTriggerRef,
} from "./workspace.ts";

// ---------------------------------------------------------------------------------------------
// Allowed top-level fields per kind (from the GTM API schema)
// ---------------------------------------------------------------------------------------------

const COMMON_FIELDS = ["name", "notes", "parentFolderId"];
const ALLOWED_FIELDS: Record<EntityKind, string[]> = {
  tag: [
    ...COMMON_FIELDS,
    "tagId",
    "type",
    "template",
    "parameter",
    "firingTriggerId",
    "blockingTriggerId",
    "paused",
    "priority",
    "scheduleStartMs",
    "scheduleEndMs",
    "liveOnly",
    "setupTag",
    "teardownTag",
    "tagFiringOption",
    "monitoringMetadata",
    "monitoringMetadataTagNameKey",
    "consentSettings",
  ],
  trigger: [
    ...COMMON_FIELDS,
    "triggerId",
    "type",
    "parameter",
    "filter",
    "customEventFilter",
    "autoEventFilter",
    ...Object.keys(TRIGGER_PARAMETER_FIELDS),
  ],
  variable: [
    ...COMMON_FIELDS,
    "variableId",
    "type",
    "template",
    "parameter",
    "formatValue",
    "enablingTriggerId",
    "disablingTriggerId",
    "scheduleStartMs",
    "scheduleEndMs",
  ],
  folder: ["name", "notes", "folderId"],
  template: ["name", "templateId", "templateData", "galleryReference"],
  client: [...COMMON_FIELDS, "clientId", "type", "template", "parameter", "priority"],
  transformation: [...COMMON_FIELDS, "transformationId", "type", "parameter"],
  zone: ["name", "notes", "zoneId", "boundary", "childContainer", "typeRestriction"],
  gtagConfig: ["gtagConfigId", "type", "parameter"],
};

const NAME_FORBIDDEN = /[{}:;"<\\]/;
// deno-lint-ignore no-control-regex
const NAME_NON_PRINTABLE = /[\x00-\x1f\x7f]/;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Levenshtein distance for "did you mean" suggestions */
function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

export function suggest(input: string, candidates: Iterable<string>, max = 3): string[] {
  const lower = input.toLowerCase();
  const scored: Array<[string, number]> = [];
  for (const c of candidates) {
    const cl = c.toLowerCase();
    let score = distance(lower, cl);
    if (cl.includes(lower) || lower.includes(cl)) score = Math.min(score, 1);
    const limit = Math.max(2, Math.floor(Math.max(lower.length, cl.length) / 3));
    if (score <= limit) scored.push([c, score]);
  }
  return scored.sort((a, b) => a[1] - b[1]).slice(0, max).map(([c]) => c);
}

function quoteList(items: string[], max = 12): string {
  const shown = items.slice(0, max).map((i) => `"${i}"`).join(", ");
  return items.length > max ? `${shown} (and ${items.length - max} more)` : shown;
}

class Collector {
  issues: ValidationIssue[] = [];
  constructor(private ws: LocalWorkspace) {}

  add(
    severity: Severity,
    code: string,
    message: string,
    where: Partial<ValidationIssue> = {},
  ): void {
    this.issues.push({ severity, code, message, ...where });
  }
  error(code: string, message: string, where: Partial<ValidationIssue> = {}): void {
    this.add("error", code, message, where);
  }
  warn(code: string, message: string, where: Partial<ValidationIssue> = {}): void {
    this.add("warning", code, message, where);
  }
  get context(): UsageContext {
    return this.ws.context;
  }
}

interface EntityCtx {
  kind: EntityKind;
  name: string;
  id?: string;
  file: string;
}

function loc(e: LocalEntity, path?: string): Partial<ValidationIssue> {
  return { kind: e.kind, name: entityName(e) || undefined, id: entityId(e), file: e.file, path };
}

// ---------------------------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------------------------

function validateParameterList(
  c: Collector,
  e: LocalEntity,
  params: unknown,
  path: string,
  options: { inList?: boolean; inMap?: boolean } = {},
): void {
  if (!Array.isArray(params)) {
    c.error(
      "PARAM_NOT_ARRAY",
      `${path} must be an array of parameter objects (or an object in the simplified notation).`,
      {
        ...loc(e, path),
        hint:
          'Example: "parameter": [{ "type": "template", "key": "eventName", "value": "purchase" }] or "parameter": { "eventName": "purchase" }.',
      },
    );
    return;
  }
  const seenKeys = new Map<string, number>();
  (params as unknown[]).forEach((raw, i) => {
    const here = isPlainObject(raw) && typeof raw.key === "string" && raw.key
      ? `${path}[${raw.key}]`
      : `${path}[${i}]`;
    if (!isPlainObject(raw)) {
      c.error("PARAM_NOT_OBJECT", `${here} must be an object with "type", "key" and "value".`, {
        ...loc(e, here),
        hint: 'Example: { "type": "template", "key": "eventName", "value": "purchase" }.',
      });
      return;
    }
    const p = raw as GtmParameter & Record<string, unknown>;
    for (const k of Object.keys(p)) {
      if (!["type", "key", "value", "list", "map", "isWeakReference"].includes(k)) {
        c.warn(
          "PARAM_UNKNOWN_FIELD",
          `${here} has an unexpected field "${k}". GTM parameters only have type, key, value, list and map.`,
          {
            ...loc(e, here),
            hint: `Remove "${k}" or move its content into "value", "list" or "map".`,
          },
        );
      }
    }
    if (typeof p.type !== "string" || !p.type) {
      c.error(
        "PARAM_TYPE_MISSING",
        `${here} has no "type". Every parameter needs one of ${quoteList(PARAMETER_TYPES)}.`,
        {
          ...loc(e, here),
          hint:
            'Use "template" for text values, "boolean" for checkboxes, "integer" for whole numbers, "list"/"map" for tables.',
        },
      );
      return;
    }
    if (!PARAMETER_TYPES.includes(p.type)) {
      c.error(
        "PARAM_TYPE_INVALID",
        `${here} has unknown parameter type "${p.type}". Valid types: ${
          quoteList(PARAMETER_TYPES)
        }.`,
        {
          ...loc(e, here),
          hint: suggest(p.type, PARAMETER_TYPES).length
            ? `Did you mean ${quoteList(suggest(p.type, PARAMETER_TYPES))}?`
            : undefined,
        },
      );
      return;
    }
    // keys
    if (options.inList) {
      if (p.key !== undefined) {
        c.warn(
          "PARAM_LIST_ITEM_KEY",
          `${here} is a list item and must not have a "key" (GTM rejects keyed list items).`,
          {
            ...loc(e, here),
            hint:
              'Remove the "key" from list items. Inside a list, use "map" items to hold key/value pairs.',
          },
        );
      }
    } else if (typeof p.key !== "string" || !p.key) {
      c.error(
        "PARAM_KEY_MISSING",
        `${here} has no "key". ${
          options.inMap ? "Map items" : "Top-level parameters"
        } must have a key.`,
        {
          ...loc(e, here),
          hint: 'Add "key": "<parameter name>" (e.g. "html", "eventName", "value").',
        },
      );
    } else {
      const prev = seenKeys.get(p.key);
      if (prev !== undefined) {
        c.error(
          "PARAM_KEY_DUPLICATE",
          `${path} contains the key "${p.key}" more than once (items ${prev} and ${i}). GTM would keep only the last one.`,
          {
            ...loc(e, here),
            hint: "Remove the duplicate parameter.",
          },
        );
      }
      seenKeys.set(p.key, i);
    }
    // values
    const scalar = ["template", "integer", "boolean", "triggerReference", "tagReference"].includes(
      p.type,
    );
    if (scalar) {
      if (p.list !== undefined || p.map !== undefined) {
        c.error(
          "PARAM_SCALAR_WITH_CHILDREN",
          `${here} has type "${p.type}" but also "list"/"map". Scalar parameters only carry a "value".`,
          {
            ...loc(e, here),
            hint: `Either change the type to "list"/"map" or remove the list/map property.`,
          },
        );
      }
      if (p.value !== undefined && typeof p.value !== "string") {
        c.error(
          "PARAM_VALUE_NOT_STRING",
          `${here}: "value" must be a string, got ${typeof p
            .value}. GTM stores every value as a string.`,
          {
            ...loc(e, here),
            hint: `Write "value": ${
              JSON.stringify(String(p.value))
            } (as a string). In the simplified notation plain JSON booleans/numbers are converted for you.`,
          },
        );
      } else if (p.type === "boolean") {
        if (p.value !== "true" && p.value !== "false") {
          c.error(
            "PARAM_BOOLEAN_VALUE",
            `${here}: boolean parameters must have "value": "true" or "false", got ${
              JSON.stringify(p.value)
            }.`,
            {
              ...loc(e, here),
              hint:
                'Set "value": "true" or "value": "false" (as strings), or use the simplified notation: "key": true.',
            },
          );
        }
      } else if (p.type === "integer") {
        if (p.value === undefined || !/^-?\d+$/.test(p.value)) {
          c.error(
            "PARAM_INTEGER_VALUE",
            `${here}: integer parameters must have a whole number as string value, got ${
              JSON.stringify(p.value)
            }.`,
            {
              ...loc(e, here),
              hint: 'Example: { "type": "integer", "key": "dataLayerVersion", "value": "2" }.',
            },
          );
        }
      } else if (
        (p.type === "triggerReference" || p.type === "tagReference") &&
        (p.value === undefined || p.value === "")
      ) {
        c.error(
          "PARAM_REFERENCE_EMPTY",
          `${here}: a ${p.type} parameter needs a "value" (${
            p.type === "triggerReference" ? "trigger ID or name" : "tag name"
          }).`,
          loc(e, here),
        );
      }
    } else if (p.type === "list") {
      if (p.value !== undefined) {
        c.error(
          "PARAM_LIST_WITH_VALUE",
          `${here} is a list and must not have a "value" (GTM rejects it).`,
          {
            ...loc(e, here),
            hint: 'Put the items into "list": [ ... ] and remove "value".',
          },
        );
      }
      if (p.map !== undefined) {
        c.error(
          "PARAM_LIST_WITH_MAP",
          `${here} is a list but has a "map" property. Lists hold their items in "list".`,
          loc(e, here),
        );
      }
      if (p.list === undefined) {
        c.warn("PARAM_LIST_EMPTY", `${here} is a list without any "list" items.`, {
          ...loc(e, here),
          hint: 'Add "list": [ ... ] or remove the parameter.',
        });
      } else {
        validateParameterList(c, e, p.list, `${here}.list`, { inList: true });
      }
    } else if (p.type === "map") {
      if (p.value !== undefined) {
        c.error("PARAM_MAP_WITH_VALUE", `${here} is a map and must not have a "value".`, {
          ...loc(e, here),
          hint: 'Put the entries into "map": [ ... ] and remove "value".',
        });
      }
      if (p.list !== undefined) {
        c.error(
          "PARAM_MAP_WITH_LIST",
          `${here} is a map but has a "list" property. Maps hold their entries in "map".`,
          loc(e, here),
        );
      }
      if (p.map !== undefined) validateParameterList(c, e, p.map, `${here}.map`, { inMap: true });
    }
  });
}

function paramMap(entity: Entity): Map<string, GtmParameter> {
  const out = new Map<string, GtmParameter>();
  if (Array.isArray(entity.parameter)) {
    for (const p of entity.parameter as GtmParameter[]) {
      if (p && typeof p === "object" && p.key) out.set(p.key, p);
    }
  }
  return out;
}

/** Validate parameters against a known built-in type specification */
function validateAgainstSpec(
  c: Collector,
  e: LocalEntity,
  spec: TypeSpec,
  extraRequiredSatisfied: (key: string) => boolean = () => false,
): void {
  const params = paramMap(e.entity);
  const known = new Map(spec.params.map((p) => [p.key, p]));
  for (const ps of spec.params) {
    const p = params.get(ps.key);
    if (
      ps.required &&
      (!p || (p.value === undefined || p.value === "") && p.type !== "list" && p.type !== "map") &&
      !extraRequiredSatisfied(ps.key)
    ) {
      c.error(
        "PARAM_REQUIRED",
        `${spec.name} (${spec.type}) requires the parameter "${ps.key}"${
          ps.description ? ` (${ps.description})` : ""
        }, but it is missing or empty.`,
        {
          ...loc(e, `parameter[${ps.key}]`),
          hint: ps.type === "list"
            ? `Add { "type": "list", "key": "${ps.key}", "list": [ ... ] }.`
            : `Add { "type": "${ps.type}", "key": "${ps.key}", "value": "..." } to "parameter" (simplified: "${ps.key}": "...").`,
        },
      );
      continue;
    }
    if (!p) continue;
    if (p.type && ps.type !== p.type && !(ps.type === "template" && p.type === "integer")) {
      c.warn(
        "PARAM_TYPE_MISMATCH",
        `parameter[${ps.key}] of a ${spec.name} is normally of type "${ps.type}", but has type "${p.type}".`,
        {
          ...loc(e, `parameter[${ps.key}]`),
          hint: ps.type === "boolean"
            ? `Use { "type": "boolean", "key": "${ps.key}", "value": "true"|"false" } (simplified: "${ps.key}": true).`
            : `Change "type" to "${ps.type}".`,
        },
      );
    }
    if (
      ps.enum && typeof p.value === "string" && !p.value.includes("{{") &&
      !ps.enum.includes(p.value)
    ) {
      c.warn(
        "PARAM_ENUM_VALUE",
        `parameter[${ps.key}] has value "${p.value}", but ${spec.name} expects one of ${
          quoteList(ps.enum)
        }.`,
        {
          ...loc(e, `parameter[${ps.key}]`),
          hint: suggest(p.value, ps.enum).length
            ? `Did you mean ${quoteList(suggest(p.value, ps.enum))}?`
            : undefined,
        },
      );
    }
  }
  if (spec.complete) {
    for (const [key] of params) {
      if (!known.has(key)) {
        const sugg = suggest(key, known.keys());
        c.warn(
          "PARAM_UNKNOWN_KEY",
          `parameter[${key}] is not a parameter of ${spec.name} (${spec.type}); GTM will silently drop it.`,
          {
            ...loc(e, `parameter[${key}]`),
            hint: sugg.length
              ? `Did you mean ${quoteList(sugg)}? Known parameters: ${
                quoteList([...known.keys()])
              }.`
              : `Known parameters: ${quoteList([...known.keys()])}.`,
          },
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Custom templates
// ---------------------------------------------------------------------------------------------

interface TemplateIndex {
  byType: Map<string, { entity: LocalEntity; parsed: ParsedTemplate }>;
  byEntity: Map<LocalEntity, ParsedTemplate>;
}

/**
 * Resolve a `"template": "<ref>"` field. Returns the template (with parsed data) or reports
 * TEMPLATE_NOT_FOUND. Returns null when the entity has no template field.
 */
function resolveTemplateField(
  c: Collector,
  e: LocalEntity,
  ws: LocalWorkspace,
  tmpl: TemplateIndex,
): { entity: LocalEntity; parsed: ParsedTemplate } | null | undefined {
  const ref = e.entity.template;
  if (typeof ref !== "string") return null;
  const hit = findTemplate(ws, ref);
  if (!hit) {
    const names = entitiesOfKind(ws, "template").map(entityName);
    c.error(
      "TEMPLATE_NOT_FOUND",
      `"template": "${ref}" does not match any custom template in this workspace.`,
      {
        ...loc(e, "template"),
        hint: names.length
          ? `Templates: ${quoteList(names)}.${
            suggest(ref, names).length ? ` Did you mean ${quoteList(suggest(ref, names))}?` : ""
          }`
          : "Add the template first (templates/<name>.json or `gtm local templates add --template-file x.tpl`).",
      },
    );
    return undefined;
  }
  return {
    entity: hit,
    parsed: tmpl.byEntity.get(hit) ?? parseTemplate(hit.entity.templateData as string | undefined),
  };
}

function indexTemplates(ws: LocalWorkspace): TemplateIndex {
  const byType = new Map<string, { entity: LocalEntity; parsed: ParsedTemplate }>();
  const byEntity = new Map<LocalEntity, ParsedTemplate>();
  for (const t of entitiesOfKind(ws, "template")) {
    const parsed = parseTemplate(t.entity.templateData as string | undefined);
    byEntity.set(t, parsed);
    const gallery = t.entity.galleryReference as { galleryTemplateId?: string } | undefined;
    const id = entityId(t);
    if (gallery?.galleryTemplateId) {
      byType.set(`cvt_${gallery.galleryTemplateId}`, { entity: t, parsed });
    } else if (id) byType.set(`cvt_${ws.meta.containerId}_${id}`, { entity: t, parsed });
    // Also index by declared public id when it is a real gallery id (not the placeholder)
    if (
      parsed.publicId && /^cvt_[A-Za-z0-9]+$/.test(parsed.publicId) &&
      parsed.publicId !== "cvt_temp_public_id" && !byType.has(parsed.publicId)
    ) {
      byType.set(parsed.publicId, { entity: t, parsed });
    }
  }
  return { byType, byEntity };
}

function templateTypeHint(ws: LocalWorkspace, tmpl: TemplateIndex): string {
  const names = [...tmpl.byType.entries()].map(([type, t]) => `${type} (${entityName(t.entity)})`);
  if (names.length === 0) {
    return `This workspace has no custom templates. Add the template first (templates/<name>.json), then reference it. Gallery templates are referenced as cvt_<galleryTemplateId>, templates created in this container as cvt_${ws.meta.containerId}_<templateId>.`;
  }
  return `Custom templates in this workspace: ${names.join(", ")}.`;
}

function validateAgainstTemplate(
  c: Collector,
  e: LocalEntity,
  parsed: ParsedTemplate,
  templateName: string,
  expectedKind: "TAG" | "MACRO" | "CLIENT",
): void {
  if (parsed.kind && parsed.kind !== expectedKind) {
    const human = {
      TAG: "tag",
      MACRO: "variable",
      CLIENT: "client",
    }[parsed.kind as "TAG" | "MACRO" | "CLIENT"] ?? parsed.kind.toLowerCase();
    c.warn(
      "TEMPLATE_KIND_MISMATCH",
      `Template "${templateName}" is a ${human} template, but it is used as the type of a ${
        KINDS[e.kind].label
      }.`,
      {
        ...loc(e, "type"),
        hint: `Use a ${KINDS[e.kind].label} template, or change this entity's kind.`,
      },
    );
  }
  if (parsed.containerContexts && parsed.containerContexts.length > 0) {
    const want = c.context === "server" ? "SERVER" : "WEB";
    if (!parsed.containerContexts.includes(want)) {
      c.error(
        "TEMPLATE_CONTEXT",
        `Template "${templateName}" only supports ${
          parsed.containerContexts.join("/")
        } containers, but this is a ${c.context} container.`,
        loc(e, "type"),
      );
    }
  }
  if (parsed.parseError || parsed.params.length === 0) return;

  const params = paramMap(e.entity);
  const values = new Map<string, string | undefined>();
  for (const [k, p] of params) values.set(k, p.value);
  const defs = new Map(parsed.params.map((d) => [d.name, d]));

  for (const def of parsed.params) {
    const active = isTemplateParamActive(def, values);
    const p = params.get(def.name);
    const expected = expectedParameterType(def);
    if (
      def.required && active &&
      (!p || ((p.value === undefined || p.value === "") && expected !== "list"))
    ) {
      c.error(
        "TEMPLATE_PARAM_REQUIRED",
        `Template "${templateName}" requires the parameter "${def.name}"${
          def.displayName ? ` ("${def.displayName}")` : ""
        }, but it is missing or empty.`,
        {
          ...loc(e, `parameter[${def.name}]`),
          hint: expected === "list"
            ? `Add { "type": "list", "key": "${def.name}", "list": [ ... ] }${
              def.columns ? ` with map items using the columns ${quoteList(def.columns)}` : ""
            }.`
            : `Add { "type": "${expected ?? "template"}", "key": "${def.name}", "value": "..." }${
              def.enumValues ? ` with one of ${quoteList(def.enumValues)}` : ""
            }.`,
        },
      );
      continue;
    }
    if (!p) continue;
    if (
      expected && p.type && p.type !== expected &&
      !(expected === "template" && p.type === "integer")
    ) {
      c.warn(
        "TEMPLATE_PARAM_TYPE",
        `parameter[${def.name}] of template "${templateName}" is a ${def.type} field and should have type "${expected}", but has "${p.type}".`,
        {
          ...loc(e, `parameter[${def.name}]`),
          hint: `Change "type" to "${expected}".`,
        },
      );
    }
    if (
      def.enumValues && typeof p.value === "string" && p.value !== "" &&
      !def.enumValues.includes(p.value) && !(def.macrosInSelect && p.value.includes("{{"))
    ) {
      c.warn(
        "TEMPLATE_PARAM_ENUM",
        `parameter[${def.name}] has value "${p.value}", but template "${templateName}" only offers ${
          quoteList(def.enumValues)
        }.`,
        {
          ...loc(e, `parameter[${def.name}]`),
          hint: suggest(p.value, def.enumValues).length
            ? `Did you mean ${quoteList(suggest(p.value, def.enumValues))}?`
            : undefined,
        },
      );
    }
    if (
      def.regexValidators && typeof p.value === "string" && p.value !== "" &&
      !p.value.includes("{{") && active
    ) {
      for (const rv of def.regexValidators) {
        try {
          if (!new RegExp(rv.pattern).test(p.value)) {
            c.error(
              "TEMPLATE_PARAM_REGEX",
              `parameter[${def.name}] value "${p.value}" is rejected by template "${templateName}": ${
                rv.message ?? `it must match ${rv.pattern}`
              }.`,
              loc(e, `parameter[${def.name}]`),
            );
          }
        } catch {
          // non-JS regex syntax: skip
        }
      }
    }
    if (
      def.numberValidator && typeof p.value === "string" && p.value !== "" &&
      !p.value.includes("{{") && active
    ) {
      const n = Number(p.value);
      const bad = !Number.isFinite(n) ||
        (def.numberValidator === "POSITIVE_NUMBER" && n <= 0) ||
        (def.numberValidator === "NON_NEGATIVE_NUMBER" && n < 0) ||
        (def.numberValidator === "PERCENTAGE" && (n < 0 || n > 100));
      if (bad) {
        c.error(
          "TEMPLATE_PARAM_NUMBER",
          `parameter[${def.name}] value "${p.value}" is rejected by template "${templateName}": it must be a ${
            def.numberValidator.toLowerCase().replace(/_/g, " ")
          }.`,
          loc(e, `parameter[${def.name}]`),
        );
      }
    }
    if (def.columns && Array.isArray(p.list)) {
      p.list.forEach((row, i) => {
        if (!row || typeof row !== "object" || !Array.isArray(row.map)) return;
        for (const cell of row.map) {
          if (cell?.key && !def.columns!.includes(cell.key)) {
            c.warn(
              "TEMPLATE_TABLE_COLUMN",
              `parameter[${def.name}].list[${i}] has a column "${cell.key}" that template "${templateName}" does not define. Columns: ${
                quoteList(def.columns!)
              }.`,
              {
                ...loc(e, `parameter[${def.name}].list[${i}].map[${cell.key}]`),
                hint: suggest(cell.key, def.columns!).length
                  ? `Did you mean ${quoteList(suggest(cell.key, def.columns!))}?`
                  : undefined,
              },
            );
          }
        }
      });
    }
  }
  for (const [key] of params) {
    if (!defs.has(key)) {
      const sugg = suggest(key, defs.keys());
      c.warn(
        "TEMPLATE_PARAM_UNKNOWN",
        `parameter[${key}] is not defined by template "${templateName}"; GTM will silently drop it.`,
        {
          ...loc(e, `parameter[${key}]`),
          hint: sugg.length
            ? `Did you mean ${quoteList(sugg)}? Template parameters: ${
              quoteList([...defs.keys()])
            }.`
            : `Template parameters: ${quoteList([...defs.keys()])}.`,
        },
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------------------------

function validateConditions(c: Collector, e: LocalEntity, conditions: unknown, path: string): void {
  if (conditions === undefined) return;
  if (!Array.isArray(conditions)) {
    c.error("CONDITION_NOT_ARRAY", `${path} must be an array of conditions.`, {
      ...loc(e, path),
      hint:
        'Example: [{ "type": "equals", "parameter": [{ "type": "template", "key": "arg0", "value": "{{Page URL}}" }, { "type": "template", "key": "arg1", "value": "https://example.com/" }] }]',
    });
    return;
  }
  conditions.forEach((cond, i) => {
    const here = `${path}[${i}]`;
    if (!isPlainObject(cond)) {
      c.error(
        "CONDITION_NOT_OBJECT",
        `${here} must be an object with "type" and "parameter".`,
        loc(e, here),
      );
      return;
    }
    const cd = cond as GtmCondition;
    if (typeof cd.type !== "string" || !CONDITION_TYPES.includes(cd.type)) {
      c.error(
        "CONDITION_TYPE_INVALID",
        `${here} has ${cd.type === undefined ? "no" : `unknown`} condition type${
          cd.type !== undefined ? ` "${cd.type}"` : ""
        }. Valid types: ${quoteList(CONDITION_TYPES)}.`,
        {
          ...loc(e, `${here}.type`),
          hint: typeof cd.type === "string" && suggest(cd.type, CONDITION_TYPES).length
            ? `Did you mean ${quoteList(suggest(cd.type, CONDITION_TYPES))}?`
            : undefined,
        },
      );
    }
    if (!Array.isArray(cd.parameter)) {
      c.error(
        "CONDITION_ARGS_MISSING",
        `${here} has no "parameter" array. Conditions need two arguments, arg0 and arg1.`,
        {
          ...loc(e, here),
          hint:
            'Add "parameter": [{ "type": "template", "key": "arg0", "value": "{{Variable}}" }, { "type": "template", "key": "arg1", "value": "expected" }] (simplified: "arg0": ..., "arg1": ...).',
        },
      );
      return;
    }
    validateParameterList(c, e, cd.parameter, `${here}.parameter`);
    const keys = new Set(cd.parameter.map((p) => p?.key));
    if (!keys.has("arg0") || !keys.has("arg1")) {
      c.error(
        "CONDITION_ARGS_MISSING",
        `${here} must have both "arg0" (the variable to check) and "arg1" (the value to compare against). GTM: "Filter must have two arguments."`,
        {
          ...loc(e, `${here}.parameter`),
          hint:
            'Add the missing argument as { "type": "template", "key": "arg1", "value": "..." }.',
        },
      );
    }
    for (const p of cd.parameter) {
      if (!p || typeof p !== "object") continue;
      if (p.key === "ignore_case" && cd.type !== "matchRegex" && p.value === "true") {
        c.warn(
          "CONDITION_IGNORE_CASE",
          `${here}: GTM only supports ignore_case for "matchRegex" conditions ("matches RegEx (ignore case)"); it will be dropped for "${cd.type}".`,
          {
            ...loc(e, `${here}.parameter[ignore_case]`),
            hint:
              'Use "type": "matchRegex" with a case-insensitive pattern, or remove ignore_case.',
          },
        );
      }
      if ((p.key === "negate" || p.key === "ignore_case") && p.type !== "boolean") {
        c.warn(
          "CONDITION_FLAG_TYPE",
          `${here}.parameter[${p.key}] should be a boolean parameter ("type": "boolean", "value": "true"|"false").`,
          loc(e, `${here}.parameter[${p.key}]`),
        );
      } else if (p.key && !["arg0", "arg1", "negate", "ignore_case"].includes(p.key)) {
        c.warn(
          "CONDITION_UNKNOWN_ARG",
          `${here}.parameter[${p.key}] is not a condition argument. Conditions use arg0, arg1 and optionally negate / ignore_case.`,
          loc(e, `${here}.parameter[${p.key}]`),
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Entity-level checks
// ---------------------------------------------------------------------------------------------

function validateCommon(c: Collector, e: LocalEntity, ws: LocalWorkspace): boolean {
  const spec = KINDS[e.kind];
  const entity = e.entity;
  let ok = true;

  for (const k of Object.keys(entity)) {
    if (!ALLOWED_FIELDS[e.kind].includes(k)) {
      const sugg = suggest(k, ALLOWED_FIELDS[e.kind]);
      c.warn("UNKNOWN_FIELD", `"${k}" is not a field of a GTM ${spec.label}; the API ignores it.`, {
        ...loc(e, k),
        hint: sugg.length
          ? `Did you mean ${quoteList(sugg)}? Allowed fields: ${
            quoteList(ALLOWED_FIELDS[e.kind], 30)
          }.`
          : `Allowed fields: ${quoteList(ALLOWED_FIELDS[e.kind], 30)}.`,
      });
    }
  }

  // name
  if (e.kind !== "gtagConfig") {
    const name = entity.name;
    if (typeof name !== "string" || name.length === 0) {
      c.error(
        "NAME_MISSING",
        `The ${spec.label} has no "name". Every ${spec.label} needs a non-empty name (1-255 characters).`,
        { ...loc(e, "name"), hint: 'Add "name": "..." to the file.' },
      );
      ok = false;
    } else {
      if (name.length > 255) {
        c.error(
          "NAME_TOO_LONG",
          `The name is ${name.length} characters long; GTM allows at most 255.`,
          loc(e, "name"),
        );
      }
      const bad = name.match(NAME_FORBIDDEN);
      if (bad) {
        c.error(
          "NAME_INVALID_CHAR",
          `The name "${name}" contains the character ${
            JSON.stringify(bad[0])
          }, which GTM does not allow in names.`,
          {
            ...loc(e, "name"),
            hint:
              `GTM rejects these characters in names: { } : ; " < \\ and control characters. Remove or replace them.`,
          },
        );
      } else if (NAME_NON_PRINTABLE.test(name)) {
        c.error(
          "NAME_INVALID_CHAR",
          `The name contains a non-printable character (tab, newline, ...), which GTM does not allow.`,
          loc(e, "name"),
        );
      }
    }
  }

  // id
  const idRaw = entity[spec.idField];
  if (idRaw !== undefined) {
    if (!isNumericId(String(idRaw))) {
      c.error(
        "ID_INVALID",
        `"${spec.idField}" must be a numeric string assigned by GTM, got ${JSON.stringify(idRaw)}.`,
        {
          ...loc(e, spec.idField),
          hint:
            `Remove "${spec.idField}" for new entities; GTM assigns the ID on push. Reference other entities by name instead of inventing IDs.`,
        },
      );
    } else if (ws.base) {
      const inBase = (ws.base.entities[e.kind] ?? []).some((b) =>
        String(b[spec.idField]) === String(idRaw)
      );
      if (!inBase) {
        c.error(
          "ID_UNKNOWN",
          `"${spec.idField}": "${idRaw}" does not exist in the remote workspace (as of the last pull).`,
          {
            ...loc(e, spec.idField),
            hint:
              `Remove "${spec.idField}" to create this ${spec.label} as a new entity, or run \`gtm local pull\` if it was created remotely in the meantime.`,
          },
        );
      }
    }
  }

  if (spec.hasType) {
    const hasTemplateRef = typeof entity.template === "string" && entity.template !== "";
    if ((typeof entity.type !== "string" || !entity.type) && !hasTemplateRef) {
      c.error("TYPE_MISSING", `The ${spec.label} has no "type".`, {
        ...loc(e, "type"),
        hint: `Add "type": "..." (for example ${
          exampleTypes(e.kind, c.context)
        }), or "template": "<custom template name>" to use a custom template.`,
      });
      ok = false;
    }
    if (entity.template !== undefined && typeof entity.template !== "string") {
      c.error(
        "TEMPLATE_REF_INVALID",
        `"template" must be the name or ID of a custom template in templates/.`,
        loc(e, "template"),
      );
      ok = false;
    }
  }

  if (entity.notes !== undefined && typeof entity.notes !== "string") {
    c.error("NOTES_NOT_STRING", `"notes" must be a string.`, loc(e, "notes"));
  }

  if (entity.parentFolderId !== undefined) {
    const ref = String(entity.parentFolderId);
    const folder = resolveFolderRef(ws, ref);
    if (!folder) {
      const folders = entitiesOfKind(ws, "folder").map(entityName);
      c.error(
        "FOLDER_NOT_FOUND",
        `"parentFolderId": "${ref}" does not match any folder in this workspace.`,
        {
          ...loc(e, "parentFolderId"),
          hint: folders.length
            ? `Use a folder ID or name. Folders: ${quoteList(folders)}.${
              suggest(ref, folders).length
                ? ` Did you mean ${quoteList(suggest(ref, folders))}?`
                : ""
            }`
            : "There are no folders yet. Create one with `gtm local folders add --name <name>` or remove parentFolderId.",
        },
      );
    }
  }

  if ("parameter" in entity) validateParameterList(c, e, entity.parameter, "parameter");
  return ok;
}

/**
 * An unknown type on an entity that already exists remotely with that very type is evidently
 * accepted by GTM (vendor tags we do not list), so it is only a warning. On a new or re-typed
 * entity it is an error: the push would fail with "Unknown entity type".
 */
function unknownTypeSeverity(ws: LocalWorkspace, e: LocalEntity): Severity {
  const id = entityId(e);
  if (!id || !ws.base) return "error";
  const spec = KINDS[e.kind];
  const remote = (ws.base.entities[e.kind] ?? []).find((b) => String(b[spec.idField]) === id);
  return remote && remote.type === e.entity.type ? "warning" : "error";
}

function exampleTypes(kind: EntityKind, context: UsageContext): string {
  switch (kind) {
    case "tag":
      return quoteList(typesForContext(TAG_TYPES, context).slice(0, 6).map((t) => t.type));
    case "variable":
      return quoteList(typesForContext(VARIABLE_TYPES, context).slice(0, 6).map((t) => t.type));
    case "trigger":
      return quoteList(triggerTypesForContext(context).slice(0, 6).map((t) => t.type));
    case "client":
      return quoteList(CLIENT_TYPES.map((t) => t.type));
    default:
      return "";
  }
}

function validateTriggerRefs(c: Collector, e: LocalEntity, ws: LocalWorkspace): void {
  const refs = collectTriggerRefs(e.kind, e.entity);
  for (const { path, ref } of refs) {
    if (!ref.trim()) {
      c.error("TRIGGER_REF_EMPTY", `${path} is empty.`, loc(e, path));
      continue;
    }
    const resolved = resolveTriggerRef(ws, ref);
    if (!resolved) {
      const names = [
        ...entitiesOfKind(ws, "trigger").map(entityName),
        ...BUILT_IN_TRIGGERS[ws.context].map((t) => t.name),
      ];
      const builtIns = BUILT_IN_TRIGGERS[ws.context].map((t) => `${t.name} (${t.id})`).join(", ");
      c.error(
        "TRIGGER_NOT_FOUND",
        `${path} references trigger "${ref}", which does not exist in this workspace.`,
        {
          ...loc(e, path),
          hint: `Use the name or ID of a trigger in triggers/, or a built-in trigger: ${builtIns}.${
            suggest(ref, names).length ? ` Did you mean ${quoteList(suggest(ref, names))}?` : ""
          }`,
        },
      );
    } else if (resolved.entity === e) {
      c.error("TRIGGER_SELF_REFERENCE", `${path} references the trigger itself.`, loc(e, path));
    }
  }
}

function validateTag(c: Collector, e: LocalEntity, ws: LocalWorkspace, tmpl: TemplateIndex): void {
  const t = e.entity;
  const type = t.type as string;
  const viaTemplate = resolveTemplateField(c, e, ws, tmpl);

  // type
  if (viaTemplate !== null) {
    if (viaTemplate) {
      validateAgainstTemplate(c, e, viaTemplate.parsed, entityName(viaTemplate.entity), "TAG");
    }
  } else if (isCustomTemplateType(type)) {
    const hit = tmpl.byType.get(type);
    if (!hit) {
      c.error(
        "TEMPLATE_NOT_FOUND",
        `Tag type "${type}" refers to a custom template that is not in this workspace.`,
        { ...loc(e, "type"), hint: templateTypeHint(ws, tmpl) },
      );
    } else {
      validateAgainstTemplate(c, e, hit.parsed, entityName(hit.entity), "TAG");
    }
  } else {
    const spec = findTagType(type);
    if (!spec) {
      const known = typesForContext(TAG_TYPES, ws.context).map((s) => s.type);
      const otherContext = TAG_TYPES.find((s) => s.type === type);
      if (otherContext) {
        c.error(
          "TYPE_WRONG_CONTEXT",
          `Tag type "${type}" (${otherContext.name}) only exists in ${
            otherContext.contexts.includes("server") ? "server" : "web"
          } containers, but this is a ${ws.context} container.`,
          {
            ...loc(e, "type"),
            hint: `Tag types for ${ws.context} containers include ${
              quoteList(known)
            } and custom templates (cvt_...).`,
          },
        );
      } else {
        c.add(
          unknownTypeSeverity(ws, e),
          "TYPE_UNKNOWN",
          `Tag type "${type}" is not a known ${ws.context} tag type${
            unknownTypeSeverity(ws, e) === "error"
              ? '; GTM would reject it with "Unknown entity type"'
              : " (it exists remotely, so GTM accepts it)"
          }.`,
          {
            ...loc(e, "type"),
            hint: `${
              suggest(type, known).length ? `Did you mean ${quoteList(suggest(type, known))}? ` : ""
            }Known types: ${
              quoteList(known, 20)
            }; custom templates use cvt_<galleryTemplateId> or cvt_${ws.meta.containerId}_<templateId>.`,
          },
        );
      }
    } else if (!spec.contexts.includes(ws.context)) {
      c.error(
        "TYPE_WRONG_CONTEXT",
        `Tag type "${type}" (${spec.name}) is not available in ${ws.context} containers.`,
        loc(e, "type"),
      );
    } else {
      const params = paramMap(t);
      validateAgainstSpec(c, e, spec, (key) => {
        // gaawe: measurementIdOverride may be replaced by a tagReference named measurementId
        if (spec.type === "gaawe" && key === "measurementIdOverride") {
          const ref = params.get("measurementId");
          return !!ref && ref.type === "tagReference" && !!ref.value;
        }
        return false;
      });
      if (spec.note && c.issues.some((i) => i.file === e.file && i.code === "PARAM_REQUIRED")) {
        c.warn("TYPE_NOTE", spec.note, loc(e, "type"));
      }
    }
  }

  // firing triggers
  validateTriggerRefs(c, e, ws);
  const firing = Array.isArray(t.firingTriggerId) ? t.firingTriggerId : [];
  const isSetupOrTeardownTarget = entitiesOfKind(ws, "tag").some((other) =>
    other !== e && collectTagRefs(other.entity).some((r) => r.ref === entityName(e))
  );
  if (firing.length === 0 && !isSetupOrTeardownTarget && t.paused !== true) {
    c.warn("TAG_NO_TRIGGER", `The tag has no firing trigger and will never fire.`, {
      ...loc(e, "firingTriggerId"),
      hint: `Add "firingTriggerId": ["<trigger name or ID>"], e.g. ["${
        BUILT_IN_TRIGGERS[ws.context][0].name
      }"].`,
    });
  }

  // tag references
  for (const { path, ref } of collectTagRefs(t)) {
    const target = entitiesOfKind(ws, "tag").find((x) => entityName(x) === ref);
    if (!target) {
      const names = entitiesOfKind(ws, "tag").map(entityName);
      c.error(
        "TAG_NOT_FOUND",
        `${path} references tag "${ref}", which does not exist in this workspace. Tags are referenced by name.`,
        {
          ...loc(e, path),
          hint: suggest(ref, names).length
            ? `Did you mean ${quoteList(suggest(ref, names))}?`
            : `Tags: ${quoteList(names)}.`,
        },
      );
    } else if (target === e) {
      c.error("TAG_SELF_REFERENCE", `${path} references the tag itself.`, loc(e, path));
    }
  }
  for (const f of ["setupTag", "teardownTag"]) {
    const list = t[f];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      c.error(
        "SETUP_TAG_INVALID",
        `"${f}" must be an array with one entry: [{ "tagName": "<tag name>" }].`,
        loc(e, f),
      );
    } else {
      if (list.length > 1) {
        c.error(
          "SETUP_TAG_TOO_MANY",
          `"${f}" has ${list.length} entries, but GTM allows only one ${
            f === "setupTag" ? "setup" : "cleanup"
          } tag.`,
          loc(e, f),
        );
      }
      list.forEach((s, i) => {
        if (!isPlainObject(s) || typeof s.tagName !== "string") {
          c.error(
            "SETUP_TAG_INVALID",
            `"${f}[${i}]" must be an object with "tagName".`,
            loc(e, `${f}[${i}]`),
          );
        }
      });
    }
  }

  // options
  if (t.tagFiringOption !== undefined && !TAG_FIRING_OPTIONS.includes(String(t.tagFiringOption))) {
    c.error(
      "TAG_FIRING_OPTION_INVALID",
      `"tagFiringOption": ${JSON.stringify(t.tagFiringOption)} is invalid. Valid values: ${
        quoteList(TAG_FIRING_OPTIONS)
      }.`,
      {
        ...loc(e, "tagFiringOption"),
        hint:
          '"oncePerEvent" is GTM\'s default ("Once per event"), "oncePerLoad" = once per page, "unlimited" = every time.',
      },
    );
  }
  if (t.paused !== undefined && typeof t.paused !== "boolean") {
    c.error(
      "FIELD_NOT_BOOLEAN",
      `"paused" must be true or false (a JSON boolean, not a string).`,
      loc(e, "paused"),
    );
  }
  if (t.liveOnly !== undefined && typeof t.liveOnly !== "boolean") {
    c.error("FIELD_NOT_BOOLEAN", `"liveOnly" must be true or false.`, loc(e, "liveOnly"));
  }
  for (const f of ["scheduleStartMs", "scheduleEndMs"]) {
    if (t[f] !== undefined && !/^\d+$/.test(String(t[f]))) {
      c.error(
        "SCHEDULE_INVALID",
        `"${f}" must be a Unix timestamp in milliseconds, as a string.`,
        loc(e, f),
      );
    }
  }
  if (t.priority !== undefined) {
    const p = t.priority as GtmParameter;
    if (!isPlainObject(p) || p.type !== "integer" || !/^-?\d+$/.test(String(p.value))) {
      c.error(
        "PRIORITY_INVALID",
        `"priority" must be an integer parameter: { "type": "integer", "value": "10" } (simplified: "priority": 10).`,
        loc(e, "priority"),
      );
    }
  }
  if (t.monitoringMetadata !== undefined) {
    const mm = t.monitoringMetadata as GtmParameter;
    if (!isPlainObject(mm) || mm.type !== "map") {
      c.error(
        "MONITORING_METADATA_INVALID",
        `"monitoringMetadata" must be a map parameter: { "type": "map", "map": [ ... ] }.`,
        loc(e, "monitoringMetadata"),
      );
    } else if (mm.map !== undefined) {
      validateParameterList(c, e, mm.map, "monitoringMetadata.map", { inMap: true });
    }
  }
  if (t.consentSettings !== undefined) {
    const cs = t.consentSettings as { consentStatus?: unknown; consentType?: GtmParameter };
    if (!isPlainObject(cs)) {
      c.error(
        "CONSENT_INVALID",
        `"consentSettings" must be an object: { "consentStatus": "needed", "consentType": { "type": "list", "list": [ ... ] } }.`,
        loc(e, "consentSettings"),
      );
    } else {
      if (cs.consentStatus !== undefined && !CONSENT_STATUSES.includes(String(cs.consentStatus))) {
        c.error(
          "CONSENT_STATUS_INVALID",
          `"consentSettings.consentStatus": ${
            JSON.stringify(cs.consentStatus)
          } is invalid. Valid values: ${quoteList(CONSENT_STATUSES)}.`,
          loc(e, "consentSettings.consentStatus"),
        );
      }
      if (cs.consentStatus === "needed") {
        const ct = cs.consentType;
        if (!ct || ct.type !== "list" || !Array.isArray(ct.list) || ct.list.length === 0) {
          c.error(
            "CONSENT_TYPE_MISSING",
            `consentStatus "needed" requires "consentType": a list of consent types, e.g. ad_storage, analytics_storage.`,
            {
              ...loc(e, "consentSettings.consentType"),
              hint:
                '"consentType": { "type": "list", "list": [{ "type": "template", "value": "analytics_storage" }] }',
            },
          );
        } else {validateParameterList(c, e, ct.list, "consentSettings.consentType.list", {
            inList: true,
          });}
      }
    }
  }
}

function validateTrigger(c: Collector, e: LocalEntity, ws: LocalWorkspace): void {
  const t = e.entity;
  const type = t.type as string;
  const specs = triggerTypesForContext(ws.context);
  if (!TRIGGER_TYPES.includes(type)) {
    c.error(
      "TRIGGER_TYPE_INVALID",
      `Trigger type "${type}" does not exist. Valid types for ${ws.context} containers: ${
        quoteList(specs.map((s) => s.type), 30)
      }.`,
      {
        ...loc(e, "type"),
        hint: suggest(type, specs.map((s) => s.type)).length
          ? `Did you mean ${quoteList(suggest(type, specs.map((s) => s.type)))}?`
          : 'Use the lowerCamelCase form, e.g. "customEvent", "pageview", "domReady", "linkClick".',
      },
    );
    return;
  }
  const spec = findTriggerType(type);
  if (!spec || !spec.contexts.includes(ws.context)) {
    c.error(
      "TRIGGER_TYPE_CONTEXT",
      `Trigger type "${type}" is not supported in ${ws.context} containers. Supported: ${
        quoteList(specs.map((s) => s.type), 30)
      }.`,
      {
        ...loc(e, "type"),
        hint: ws.context === "server"
          ? 'Server containers support "customEvent" (filter on an event name), "always" (Custom: fires on every event, optionally with conditions) and "serverPageview".'
          : undefined,
      },
    );
    return;
  }

  // customEvent rules
  const cef = t.customEventFilter;
  if (type === "customEvent") {
    if (!Array.isArray(cef) || cef.length !== 1) {
      c.error(
        "CUSTOM_EVENT_FILTER",
        `A customEvent trigger must have exactly one customEventFilter condition, found ${
          Array.isArray(cef) ? cef.length : 0
        }. GTM: "Custom-event trigger must have exactly one custom-event filter."`,
        {
          ...loc(e, "customEventFilter"),
          hint:
            '"customEventFilter": [{ "type": "equals", "parameter": [{ "type": "template", "key": "arg0", "value": "{{_event}}" }, { "type": "template", "key": "arg1", "value": "purchase" }] }]. Use "matchRegex" to match several events.',
        },
      );
    } else {
      const cond = cef[0] as GtmCondition;
      const arg0 = Array.isArray(cond?.parameter)
        ? cond.parameter.find((p) => p?.key === "arg0")
        : undefined;
      if (arg0 && arg0.value !== "{{_event}}") {
        c.warn(
          "CUSTOM_EVENT_ARG0",
          `customEventFilter[0].parameter[arg0] is "${arg0.value}"; custom event triggers normally compare "{{_event}}" (the event name).`,
          {
            ...loc(e, "customEventFilter[0].parameter[arg0]"),
            hint: 'Set arg0 to "{{_event}}" and put the event name into arg1.',
          },
        );
      }
    }
  } else if (cef !== undefined) {
    c.error(
      "CUSTOM_EVENT_FILTER_WRONG_TYPE",
      `Only customEvent triggers can have a customEventFilter (this trigger is "${type}"). GTM: "Only custom-event trigger can have custom-event filters."`,
      {
        ...loc(e, "customEventFilter"),
        hint: 'Change "type" to "customEvent" or move the conditions into "filter".',
      },
    );
  }
  validateConditions(c, e, t.filter, "filter");
  validateConditions(c, e, t.customEventFilter, "customEventFilter");
  validateConditions(c, e, t.autoEventFilter, "autoEventFilter");

  // fields that apply to this type
  for (const f of ["autoEventFilter", ...Object.keys(TRIGGER_PARAMETER_FIELDS)]) {
    if (t[f] !== undefined && !spec.fields.includes(f)) {
      c.warn(
        "TRIGGER_FIELD_NOT_APPLICABLE",
        `"${f}" does not apply to ${spec.name} (${type}) triggers; GTM ignores it.`,
        {
          ...loc(e, f),
          hint: spec.fields.length
            ? `Fields used by ${type} triggers: ${quoteList(spec.fields)}.`
            : `${type} triggers only use "filter" conditions.`,
        },
      );
    }
  }
  for (const [f, expected] of Object.entries(TRIGGER_PARAMETER_FIELDS)) {
    const v = t[f];
    if (v === undefined) continue;
    if (!isPlainObject(v) || typeof v.type !== "string") {
      c.error(
        "TRIGGER_FIELD_NOT_PARAMETER",
        `"${f}" must be a parameter object: { "type": "${expected}", "value": "..." } (simplified: "${f}": ${
          expected === "boolean" ? "true" : '"..."'
        }).`,
        loc(e, f),
      );
      continue;
    }
    const p = v as GtmParameter;
    if (p.type === "boolean" && p.value !== "true" && p.value !== "false") {
      c.error(
        "PARAM_BOOLEAN_VALUE",
        `"${f}" is a boolean parameter and needs "value": "true" or "false".`,
        loc(e, f),
      );
    }
    if (expected === "boolean" && p.type !== "boolean") {
      c.warn(
        "PARAM_TYPE_MISMATCH",
        `"${f}" is normally a boolean parameter, but has type "${p.type}".`,
        loc(e, f),
      );
    }
  }
  if (type === "customEvent" || !spec.usesParameter) {
    if (t.parameter !== undefined && !spec.usesParameter) {
      c.warn(
        "TRIGGER_PARAMETER_UNUSED",
        `${spec.name} triggers do not use "parameter"; its content will be dropped.`,
        loc(e, "parameter"),
      );
    }
  } else if (spec.params) {
    validateAgainstSpec(c, e, {
      type,
      name: spec.name,
      contexts: spec.contexts,
      params: spec.params,
      complete: true,
    });
  }
  if (type === "triggerGroup") {
    const ids = paramMap(t).get("triggerIds");
    const items = ids && Array.isArray(ids.list) ? ids.list : [];
    if (items.length === 0) {
      c.error(
        "TRIGGER_GROUP_EMPTY",
        `A trigger group needs at least one trigger in parameter "triggerIds".`,
        {
          ...loc(e, "parameter[triggerIds]"),
          hint:
            '"parameter": [{ "type": "list", "key": "triggerIds", "list": [{ "type": "triggerReference", "value": "<trigger name or ID>" }] }]',
        },
      );
    }
    items.forEach((p, i) => {
      if (p?.type !== "triggerReference") {
        c.error(
          "TRIGGER_GROUP_ITEM",
          `parameter[triggerIds].list[${i}] must be a triggerReference parameter, got "${p?.type}".`,
          loc(e, `parameter[triggerIds].list[${i}]`),
        );
      }
    });
  }
  validateTriggerRefs(c, e, ws);
}

function validateVariable(
  c: Collector,
  e: LocalEntity,
  ws: LocalWorkspace,
  tmpl: TemplateIndex,
): void {
  const v = e.entity;
  const type = v.type as string;
  const viaTemplate = resolveTemplateField(c, e, ws, tmpl);
  if (viaTemplate !== null) {
    if (viaTemplate) {
      validateAgainstTemplate(c, e, viaTemplate.parsed, entityName(viaTemplate.entity), "MACRO");
    }
  } else if (isCustomTemplateType(type)) {
    const hit = tmpl.byType.get(type);
    if (!hit) {
      c.error(
        "TEMPLATE_NOT_FOUND",
        `Variable type "${type}" refers to a custom template that is not in this workspace.`,
        { ...loc(e, "type"), hint: templateTypeHint(ws, tmpl) },
      );
    } else validateAgainstTemplate(c, e, hit.parsed, entityName(hit.entity), "MACRO");
  } else {
    const spec = findVariableType(type);
    const known = typesForContext(VARIABLE_TYPES, ws.context).map((s) => s.type);
    if (!spec) {
      c.add(
        unknownTypeSeverity(ws, e),
        "TYPE_UNKNOWN",
        `Variable type "${type}" is not a known ${ws.context} variable type${
          unknownTypeSeverity(ws, e) === "error"
            ? '; GTM would reject it with "Unknown entity type"'
            : " (it exists remotely, so GTM accepts it)"
        }.`,
        {
          ...loc(e, "type"),
          hint: `${
            suggest(type, known).length ? `Did you mean ${quoteList(suggest(type, known))}? ` : ""
          }Known types: ${
            typesForContext(VARIABLE_TYPES, ws.context).map((s) => `${s.type} (${s.name})`).join(
              ", ",
            )
          }.`,
        },
      );
    } else if (!spec.contexts.includes(ws.context)) {
      c.error(
        "TYPE_WRONG_CONTEXT",
        `Variable type "${type}" (${spec.name}) is not available in ${ws.context} containers.`,
        {
          ...loc(e, "type"),
          hint: `Variable types for ${ws.context} containers: ${
            typesForContext(VARIABLE_TYPES, ws.context).map((s) => `${s.type} (${s.name})`).join(
              ", ",
            )
          }.`,
        },
      );
    } else {
      validateAgainstSpec(c, e, spec);
      if (type === "jsm") {
        const js = paramMap(v).get("javascript")?.value ?? "";
        if (js && !/^\s*function\s*\(/.test(js)) {
          c.error(
            "JS_NOT_FUNCTION",
            `Custom JavaScript variables must be an anonymous function that returns a value, e.g. function() { return 1; }. GTM: "The javaScript must define a function with a return value."`,
            {
              ...loc(e, "parameter[javascript]"),
              hint: "Wrap the code: function() { ... return value; }",
            },
          );
        } else if (js && !/\breturn\b/.test(js)) {
          c.warn(
            "JS_NO_RETURN",
            `The Custom JavaScript function does not contain a return statement, so the variable will always be undefined.`,
            loc(e, "parameter[javascript]"),
          );
        }
      }
      if (type === "d" || type === "vis") {
        const pm = paramMap(v);
        const selectorType = pm.get("selectorType")?.value ?? "ID";
        if (selectorType === "CSS" && !pm.get("elementSelector")?.value) {
          c.error(
            "PARAM_REQUIRED",
            `${spec.name} with selectorType "CSS" requires "elementSelector".`,
            loc(e, "parameter[elementSelector]"),
          );
        }
        if (selectorType !== "CSS" && !pm.get("elementId")?.value) {
          c.error(
            "PARAM_REQUIRED",
            `${spec.name} requires "elementId" (or set selectorType to "CSS" and provide "elementSelector").`,
            loc(e, "parameter[elementId]"),
          );
        }
      }
    }
  }
  if (v.formatValue !== undefined) {
    const fv = v.formatValue;
    if (!isPlainObject(fv)) {
      c.error(
        "FORMAT_VALUE_INVALID",
        `"formatValue" must be an object (caseConversionType, convertNullToValue, ...).`,
        loc(e, "formatValue"),
      );
    } else {
      const allowed = [
        "caseConversionType",
        "convertNullToValue",
        "convertUndefinedToValue",
        "convertTrueToValue",
        "convertFalseToValue",
        "convertToNumber",
        "convertToBoolean",
      ];
      for (const k of Object.keys(fv)) {
        if (!allowed.includes(k)) {
          c.warn(
            "UNKNOWN_FIELD",
            `"formatValue.${k}" is not a format option. Options: ${quoteList(allowed)}.`,
            loc(e, `formatValue.${k}`),
          );
        }
      }
      if (
        fv.caseConversionType !== undefined &&
        !CASE_CONVERSION_TYPES.includes(String(fv.caseConversionType))
      ) {
        c.error(
          "FORMAT_VALUE_INVALID",
          `"formatValue.caseConversionType" must be one of ${quoteList(CASE_CONVERSION_TYPES)}.`,
          loc(e, "formatValue.caseConversionType"),
        );
      }
      if (
        fv.convertToNumber !== undefined &&
        !CONVERT_TO_NUMBER_TYPES.includes(String(fv.convertToNumber))
      ) {
        c.error(
          "FORMAT_VALUE_INVALID",
          `"formatValue.convertToNumber" must be one of ${quoteList(CONVERT_TO_NUMBER_TYPES)}.`,
          loc(e, "formatValue.convertToNumber"),
        );
      }
    }
  }
  validateTriggerRefs(c, e, ws);
}

function validateClient(
  c: Collector,
  e: LocalEntity,
  ws: LocalWorkspace,
  tmpl: TemplateIndex,
): void {
  const cl = e.entity;
  const type = cl.type as string;
  const viaTemplate = resolveTemplateField(c, e, ws, tmpl);
  if (viaTemplate !== null) {
    if (viaTemplate) {
      validateAgainstTemplate(c, e, viaTemplate.parsed, entityName(viaTemplate.entity), "CLIENT");
    }
  } else if (isCustomTemplateType(type)) {
    const hit = tmpl.byType.get(type);
    if (!hit) {
      c.error(
        "TEMPLATE_NOT_FOUND",
        `Client type "${type}" refers to a custom template that is not in this workspace.`,
        { ...loc(e, "type"), hint: templateTypeHint(ws, tmpl) },
      );
    } else validateAgainstTemplate(c, e, hit.parsed, entityName(hit.entity), "CLIENT");
  } else {
    const spec = findClientType(type);
    if (!spec) {
      c.add(
        unknownTypeSeverity(ws, e),
        "TYPE_UNKNOWN",
        `Client type "${type}" is not a known client type${
          unknownTypeSeverity(ws, e) === "error"
            ? '; GTM would reject it with "Unknown entity type"'
            : " (it exists remotely, so GTM accepts it)"
        }.`,
        {
          ...loc(e, "type"),
          hint: `Known client types: ${
            CLIENT_TYPES.map((s) => `${s.type} (${s.name})`).join(", ")
          }; custom client templates use cvt_...`,
        },
      );
    } else validateAgainstSpec(c, e, spec);
  }
  if (
    cl.priority !== undefined && (typeof cl.priority !== "number" || !Number.isInteger(cl.priority))
  ) {
    c.error(
      "CLIENT_PRIORITY_INVALID",
      `"priority" of a client must be a whole number (JSON number), got ${
        JSON.stringify(cl.priority)
      }.`,
      {
        ...loc(e, "priority"),
        hint: 'Example: "priority": 10. Higher numbers are evaluated first.',
      },
    );
  }
}

function validateTemplate(c: Collector, e: LocalEntity, ws: LocalWorkspace): void {
  const t = e.entity;
  const id = entityId(e);
  if (t.galleryReference !== undefined && id === undefined) {
    c.error(
      "GALLERY_REFERENCE_ON_CREATE",
      `A new template cannot carry "galleryReference": the API rejects it on create ("galleryReference: This field is invalid (or unsupported)").`,
      {
        ...loc(e, "galleryReference"),
        hint:
          `Remove "galleryReference" (gtm local templates set <ref> --unset galleryReference). The template is then a plain custom template, referenced as cvt_${ws.meta.containerId}_<templateId> and without gallery update notices. A gallery-linked template can only be added in the GTM UI (Templates → Search Gallery).`,
      },
    );
  }
  if (t.galleryReference === undefined && id !== undefined && ws.base) {
    const remote = (ws.base.entities.template ?? []).find((b) => String(b.templateId) === id);
    if (remote && remote.galleryReference !== undefined) {
      c.warn(
        "GALLERY_REFERENCE_REMOVED",
        `The remote template has a "galleryReference" (it was imported from the gallery) but the local file has none. Pushing would detach it from the gallery permanently.`,
        {
          ...loc(e, "galleryReference"),
          hint:
            `Keep the "galleryReference" object from the pulled file unless you intend to detach the template.`,
        },
      );
    }
  }
  if (typeof t.templateData !== "string" || !t.templateData.trim()) {
    c.error(
      "TEMPLATE_DATA_MISSING",
      `The template has no "templateData" (the template source with ___INFO___, ___TEMPLATE_PARAMETERS___ and sandboxed JavaScript sections).`,
      loc(e, "templateData"),
    );
    return;
  }
  const parsed = parseTemplate(t.templateData);
  if (parsed.parseError) {
    c.warn(
      "TEMPLATE_DATA_INVALID",
      `templateData could not be fully parsed: ${parsed.parseError}. Parameter validation for entities using this template is skipped.`,
      loc(e, "templateData"),
    );
  }
  if (parsed.containerContexts && parsed.containerContexts.length > 0) {
    const want = c.context === "server" ? "SERVER" : "WEB";
    if (!parsed.containerContexts.includes(want)) {
      c.error(
        "TEMPLATE_CONTEXT",
        `The template declares containerContexts ${
          quoteList(parsed.containerContexts)
        }, but this is a ${c.context} container.`,
        loc(e, "templateData"),
      );
    }
  }
  if (t.galleryReference !== undefined && !isPlainObject(t.galleryReference)) {
    c.error(
      "GALLERY_REFERENCE_INVALID",
      `"galleryReference" must be an object (host, owner, repository, version, galleryTemplateId, ...).`,
      loc(e, "galleryReference"),
    );
  }
}

function validateZone(c: Collector, e: LocalEntity, ws: LocalWorkspace): void {
  const z = e.entity;
  if (z.childContainer !== undefined) {
    if (!Array.isArray(z.childContainer)) {
      c.error(
        "ZONE_CHILD_INVALID",
        `"childContainer" must be an array of { "publicId": "GTM-XXXXXXX", "nickname": "..." }.`,
        loc(e, "childContainer"),
      );
    } else {
      z.childContainer.forEach((cc, i) => {
        if (!isPlainObject(cc) || typeof cc.publicId !== "string") {
          c.error(
            "ZONE_CHILD_INVALID",
            `"childContainer[${i}]" needs a "publicId".`,
            loc(e, `childContainer[${i}]`),
          );
        } else if (!/^GTM-[A-Z0-9]+$/.test(cc.publicId)) {
          c.warn(
            "ZONE_CHILD_PUBLIC_ID",
            `"childContainer[${i}].publicId": "${cc.publicId}" does not look like a container public ID (GTM-XXXXXXX).`,
            loc(e, `childContainer[${i}].publicId`),
          );
        }
      });
    }
  }
  if (z.boundary !== undefined) {
    if (!isPlainObject(z.boundary)) {
      c.error(
        "ZONE_BOUNDARY_INVALID",
        `"boundary" must be an object with "condition" and/or "customEvaluationTriggerId".`,
        loc(e, "boundary"),
      );
    } else validateConditions(c, e, z.boundary.condition, "boundary.condition");
  }
  if (z.typeRestriction !== undefined) {
    const tr = z.typeRestriction;
    if (!isPlainObject(tr) || (tr.enable !== undefined && typeof tr.enable !== "boolean")) {
      c.error(
        "ZONE_TYPE_RESTRICTION_INVALID",
        `"typeRestriction" must be { "enable": true|false, "whitelistedTypeId": ["html", ...] }.`,
        loc(e, "typeRestriction"),
      );
    }
  }
  validateTriggerRefs(c, e, ws);
}

function validateVariableReferences(
  c: Collector,
  e: LocalEntity,
  ws: LocalWorkspace,
  available: Set<string>,
): void {
  const builtIns = builtInVariablesFor(ws.context);
  const enabledTypes = new Set(ws.builtInVariables.map((b) => b.type));
  const reported = new Set<string>();
  for (const { path, value } of collectTemplateValues(e.kind, e.entity)) {
    for (const ref of extractVariableRefs(value)) {
      if (available.has(ref) || reported.has(ref)) continue;
      reported.add(ref);
      const builtInType = builtInVariableType(ws.context, ref);
      if (builtInType && !enabledTypes.has(builtInType)) {
        c.warn(
          "BUILT_IN_NOT_ENABLED",
          `${path} references the built-in variable {{${ref}}}, which is not enabled in this workspace. GTM will treat it as undefined.`,
          {
            ...loc(e, path),
            hint:
              `Enable it: \`gtm local built-in-variables enable ${builtInType}\` (adds { "type": "${builtInType}", "name": "${
                builtIns[builtInType]
              }" } to built-in-variables.json).`,
          },
        );
        continue;
      }
      const sugg = suggest(ref, available);
      c.warn(
        "VARIABLE_NOT_FOUND",
        `${path} references {{${ref}}}, but no variable with that name exists in this workspace. GTM accepts this, but the value will be undefined at runtime.`,
        {
          ...loc(e, path),
          hint: sugg.length
            ? `Did you mean ${quoteList(sugg.map((s) => `{{${s}}}`))}?`
            : `Create the variable in variables/ or fix the reference. Variable names are case-sensitive.`,
        },
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Workspace-level checks
// ---------------------------------------------------------------------------------------------

function validateBuiltInVariables(c: Collector, ws: LocalWorkspace): void {
  const table = builtInVariablesFor(ws.context);
  const seen = new Set<string>();
  ws.builtInVariables.forEach((b, i) => {
    const where: Partial<ValidationIssue> = {
      kind: "builtInVariable",
      file: "built-in-variables.json",
      path: `[${i}]`,
    };
    if (!b || typeof b.type !== "string") {
      c.error(
        "BUILT_IN_INVALID",
        `built-in-variables.json[${i}] must be { "type": "<type>" } or a type string.`,
        where,
      );
      return;
    }
    if (!(b.type in table)) {
      const fromName = builtInVariableType(ws.context, b.type);
      const known = Object.keys(table);
      c.error(
        "BUILT_IN_INVALID",
        `"${b.type}" is not a built-in variable type available in ${ws.context} containers.`,
        {
          ...where,
          hint: fromName
            ? `Use the type identifier "${fromName}" instead of the display name.`
            : `${
              suggest(b.type, known).length
                ? `Did you mean ${quoteList(suggest(b.type, known))}? `
                : ""
            }Available: ${quoteList(known, 60)}.`,
        },
      );
      return;
    }
    if (seen.has(b.type)) {
      c.warn("BUILT_IN_DUPLICATE", `"${b.type}" is listed more than once.`, where);
    }
    seen.add(b.type);
    if (b.name !== undefined && b.name !== table[b.type]) {
      c.warn(
        "BUILT_IN_NAME_MISMATCH",
        `Built-in "${b.type}" is called "${
          table[b.type]
        }" in GTM, not "${b.name}". References must use {{${table[b.type]}}}.`,
        where,
      );
    }
  });
}

/** Two templates with the same ___INFO___ id (a real gallery id) are rejected by GTM as duplicates */
function validateTemplatePublicIds(c: Collector, tmpl: TemplateIndex): void {
  // Templates with identical code and parameter definitions are duplicates for GTM (it rewrites the
  // INFO section on import, so compare the sandboxed JavaScript and parameter sections only).
  const fingerprintOf = (t: LocalEntity): string => {
    const sections = splitTemplateSections(String(t.entity.templateData ?? ""));
    const js = sections.SANDBOXED_JS_FOR_WEB_TEMPLATE ?? sections.SANDBOXED_JS_FOR_SERVER ?? "";
    if (!js.trim()) return "";
    return `${js}\n${sections.TEMPLATE_PARAMETERS ?? ""}`.replace(/\s+/g, " ").trim();
  };
  const byContent = new Map<string, LocalEntity[]>();
  for (const [t] of tmpl.byEntity) {
    const fp = fingerprintOf(t);
    if (fp) byContent.set(fp, [...(byContent.get(fp) ?? []), t]);
  }
  for (const list of byContent.values()) {
    if (list.length < 2) continue;
    const existing = list.filter((t) => entityId(t) !== undefined);
    for (const t of list) {
      if (entityId(t) !== undefined && existing.length === list.length) continue; // all remote already: GTM allowed it
      c.error(
        "TEMPLATE_DUPLICATE_CONTENT",
        `This template's data is identical to ${
          list.filter((x) => x !== t).map((x) => `"${entityName(x)}"`).join(", ")
        }; GTM rejects duplicate templates with "Found entity with duplicate name".`,
        {
          ...loc(t, "templateData"),
          hint:
            "Reuse the existing template (reference it by name) instead of importing it again, or delete the duplicate file.",
        },
      );
    }
  }
  const byPublicId = new Map<string, LocalEntity[]>();
  for (const [t, parsed] of tmpl.byEntity) {
    const id = parsed.publicId;
    if (!id || id === "cvt_temp_public_id" || !/^cvt_[A-Za-z0-9]+$/.test(id)) continue;
    byPublicId.set(id, [...(byPublicId.get(id) ?? []), t]);
  }
  for (const [id, list] of byPublicId) {
    if (list.length < 2) continue;
    for (const t of list) {
      c.error(
        "TEMPLATE_DUPLICATE_PUBLIC_ID",
        `${list.length} templates share the gallery template id "${id}" in their ___INFO___ section (${
          list.map((x) => `"${entityName(x)}"`).join(", ")
        }). GTM rejects this with "Found entity with duplicate name".`,
        {
          ...loc(t, "templateData"),
          hint:
            "A container can hold one copy of a gallery template. Reuse the existing one, or delete the duplicate file.",
        },
      );
    }
  }
}

function validateDuplicates(c: Collector, ws: LocalWorkspace): void {
  for (const kind of KIND_ORDER) {
    const spec = KINDS[kind];
    const list = entitiesOfKind(ws, kind);
    const byName = new Map<string, LocalEntity[]>();
    const byId = new Map<string, LocalEntity[]>();
    for (const e of list) {
      const n = entityName(e);
      if (n) byName.set(n, [...(byName.get(n) ?? []), e]);
      const id = entityId(e);
      if (id) byId.set(id, [...(byId.get(id) ?? []), e]);
    }
    for (const [name, es] of byName) {
      if (es.length > 1) {
        for (const e of es) {
          c.error(
            "DUPLICATE_NAME",
            `${es.length} ${spec.labelPlural} are named "${name}" (${
              es.map((x) => x.file).join(", ")
            }). Names must be unique per ${spec.label}. GTM: "Found entity with duplicate name."`,
            {
              ...loc(e, "name"),
              hint: "Rename one of them or delete the duplicate file.",
            },
          );
        }
      }
    }
    for (const [id, es] of byId) {
      if (es.length > 1) {
        for (const e of es) {
          c.error(
            "DUPLICATE_ID",
            `${es.length} files share "${spec.idField}": "${id}" (${
              es.map((x) => x.file).join(", ")
            }).`,
            {
              ...loc(e, spec.idField),
              hint:
                `Remove the ${spec.idField} from the file that should become a new ${spec.label}, or delete the stale copy.`,
            },
          );
        }
      }
    }
  }
}

function validateKindsSupported(c: Collector, ws: LocalWorkspace): void {
  const supported = new Set(
    supportedKinds(ws.meta.container?.features, ws.context).map((k) => k.kind),
  );
  for (const kind of KIND_ORDER) {
    if (supported.has(kind)) continue;
    const present = ws.entities.filter((e) => e.kind === kind);
    for (const e of present) {
      c.error(
        "KIND_NOT_SUPPORTED",
        `${
          KINDS[kind].labelPlural
        } are not supported by this ${ws.context} container, so ${e.file} cannot be pushed.`,
        {
          ...loc(e),
          hint: KINDS[kind].contexts.includes("server") && !KINDS[kind].contexts.includes("web")
            ? `${KINDS[kind].labelPlural} only exist in server containers.`
            : `Delete the file or move it to the right container's workspace.`,
        },
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

export function validateWorkspace(ws: LocalWorkspace): ValidationResult {
  const c = new Collector(ws);

  for (const e of ws.entities) {
    if (e.parseError) {
      c.error("FILE_INVALID_JSON", `${e.file}: ${e.parseError}`, {
        kind: e.kind,
        file: e.file,
        hint:
          "Fix the JSON syntax (check for trailing commas, unquoted keys and unbalanced braces). The file must contain one JSON object.",
      });
    }
  }

  validateKindsSupported(c, ws);
  validateBuiltInVariables(c, ws);
  validateDuplicates(c, ws);

  const tmpl = indexTemplates(ws);
  validateTemplatePublicIds(c, tmpl);
  const available = availableVariableNames(ws);

  for (const e of ws.entities) {
    if (e.parseError) continue;
    const ok = validateCommon(c, e, ws);
    if (!ok) continue;
    switch (e.kind) {
      case "tag":
        validateTag(c, e, ws, tmpl);
        break;
      case "trigger":
        validateTrigger(c, e, ws);
        break;
      case "variable":
        validateVariable(c, e, ws, tmpl);
        break;
      case "client":
        validateClient(c, e, ws, tmpl);
        break;
      case "template":
        validateTemplate(c, e, ws);
        break;
      case "zone":
        validateZone(c, e, ws);
        break;
      default:
        break;
    }
    validateVariableReferences(c, e, ws, available);
  }

  // Stable ordering: errors first, then by file and path
  const issues = c.issues.sort((a, b) =>
    (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
    (a.file ?? "").localeCompare(b.file ?? "") ||
    (a.path ?? "").localeCompare(b.path ?? "")
  );
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  return { issues, errors, warnings, ok: errors === 0 };
}

/**
 * Validate a single entity in the context of a workspace (used by `add`/`set` before writing).
 * Returns only issues that concern that entity.
 */
export function validateEntityInWorkspace(
  ws: LocalWorkspace,
  entity: LocalEntity,
): ValidationResult {
  const others = ws.entities.filter((e) => e.file !== entity.file);
  const result = validateWorkspace({ ...ws, entities: [...others, entity] });
  const issues = result.issues.filter((i) =>
    i.file === entity.file || (i.kind === entity.kind && i.name === entityName(entity) && !i.file)
  );
  const errors = issues.filter((i) => i.severity === "error").length;
  return { issues, errors, warnings: issues.length - errors, ok: errors === 0 };
}

export type { EntityCtx, ParamSpec };
