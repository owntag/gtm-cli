/**
 * Local workspaces: normalization of entity JSON into the canonical GTM API form.
 *
 * The local file format is the GTM API format, with a few conveniences that make hand-written
 * (or agent-written) JSON much less error-prone. Everything here is *tolerant*: input that cannot
 * be interpreted is passed through unchanged so the validator can report it with a useful message.
 *
 * Conveniences accepted on input:
 *   - Enum casing from container exports: "TEMPLATE" -> "template", "CUSTOM_EVENT" -> "customEvent"
 *   - Simplified parameters: `"parameter": {"eventName": "purchase", "sendPageView": false}`
 *     instead of the verbose `[{"type": "template", "key": "eventName", "value": "purchase"}, ...]`.
 *     Strings become template, booleans boolean, integers integer, arrays list, objects map.
 *   - Simplified conditions: `{"type": "equals", "arg0": "{{_event}}", "arg1": "purchase"}`
 *   - Scalar values for single-parameter fields such as a trigger's `interval` or a tag's `priority`
 *   - `firingTriggerId: "All Pages"` (string instead of array; trigger names instead of IDs)
 */

import type { Entity, GtmParameter } from "./types.ts";
import type { EntityKind } from "./kinds.ts";
import { READ_ONLY_FIELDS } from "./kinds.ts";

export const PARAMETER_TYPES = [
  "template",
  "integer",
  "boolean",
  "list",
  "map",
  "triggerReference",
  "tagReference",
];

export const CONDITION_TYPES = [
  "equals",
  "contains",
  "startsWith",
  "endsWith",
  "matchRegex",
  "greater",
  "greaterOrEquals",
  "less",
  "lessOrEquals",
  "cssSelector",
  "urlMatches",
];

export const TRIGGER_TYPES = [
  "pageview",
  "domReady",
  "windowLoaded",
  "customEvent",
  "triggerGroup",
  "init",
  "consentInit",
  "serverPageview",
  "always",
  "firebaseAppException",
  "firebaseAppUpdate",
  "firebaseCampaign",
  "firebaseFirstOpen",
  "firebaseInAppPurchase",
  "firebaseNotificationDismiss",
  "firebaseNotificationForeground",
  "firebaseNotificationOpen",
  "firebaseNotificationReceive",
  "firebaseOsUpdate",
  "firebaseSessionStart",
  "firebaseUserEngagement",
  "formSubmission",
  "click",
  "linkClick",
  "jsError",
  "historyChange",
  "timer",
  "ampClick",
  "ampTimer",
  "ampScroll",
  "ampVisibility",
  "youTubeVideo",
  "scrollDepth",
  "elementVisibility",
];

export const TAG_FIRING_OPTIONS = ["unlimited", "oncePerEvent", "oncePerLoad"];
export const CONSENT_STATUSES = ["notSet", "notNeeded", "needed"];
export const CASE_CONVERSION_TYPES = ["none", "lowercase", "uppercase"];
export const CONVERT_TO_NUMBER_TYPES = ["period", "comma", "automatic"];

/** Trigger properties that hold a single Parameter object, with the parameter type GTM uses */
export const TRIGGER_PARAMETER_FIELDS: Record<string, "template" | "boolean" | "integer"> = {
  waitForTags: "boolean",
  checkValidation: "boolean",
  waitForTagsTimeout: "template",
  uniqueTriggerId: "template",
  eventName: "template",
  interval: "template",
  limit: "template",
  intervalSeconds: "template",
  maxTimerLengthSeconds: "template",
  selector: "template",
  visibilitySelector: "template",
  visiblePercentageMin: "template",
  visiblePercentageMax: "template",
  totalTimeMinMilliseconds: "template",
  continuousTimeMinMilliseconds: "template",
  verticalScrollPercentageList: "template",
  horizontalScrollPercentageList: "template",
};

export const FORMAT_VALUE_PARAMETER_FIELDS = [
  "convertNullToValue",
  "convertUndefinedToValue",
  "convertTrueToValue",
  "convertFalseToValue",
];

export const TRIGGER_REF_FIELDS: Record<EntityKind, string[]> = {
  tag: ["firingTriggerId", "blockingTriggerId"],
  variable: ["enablingTriggerId", "disablingTriggerId"],
  trigger: [],
  folder: [],
  template: [],
  client: [],
  transformation: [],
  zone: [],
  gtagConfig: [],
};

/**
 * Convert an UPPER_SNAKE or snake_case enum value into the lowerCamelCase form the API returns.
 * Returns the input unchanged when it already is (or isn't) a member of `allowed`.
 */
export function normalizeEnum(value: unknown, allowed: readonly string[]): unknown {
  if (typeof value !== "string") return value;
  if (allowed.includes(value)) return value;
  const lower = value.toLowerCase();
  const direct = allowed.find((a) => a.toLowerCase() === lower);
  if (direct) return direct;
  const camel = lower.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
  const match = allowed.find((a) => a.toLowerCase() === camel.toLowerCase());
  return match ?? value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Does this object look like a GTM Parameter (as opposed to a simplified map)? */
export function looksLikeParameter(v: unknown): boolean {
  if (!isPlainObject(v)) return false;
  if (typeof v.type !== "string") return false;
  const t = normalizeEnum(v.type, PARAMETER_TYPES);
  if (!PARAMETER_TYPES.includes(t as string)) return false;
  return "value" in v || "list" in v || "map" in v || "key" in v || Object.keys(v).length === 1;
}

function scalarToString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/**
 * Build a GTM parameter from a simplified value.
 *   string  -> template      boolean -> boolean      integer -> integer
 *   array   -> list          object  -> map (or a verbatim parameter if it looks like one)
 */
export function fromSimpleValue(key: string | undefined, value: unknown): GtmParameter {
  const withKey = (p: GtmParameter): GtmParameter => (key !== undefined ? { ...p, key } : p);
  if (looksLikeParameter(value)) {
    const p = normalizeParameter(value, key === undefined);
    return key !== undefined && p.key === undefined ? { ...p, key } : p;
  }
  if (typeof value === "boolean") return withKey({ type: "boolean", value: String(value) });
  if (typeof value === "number") {
    if (Number.isInteger(value)) return withKey({ type: "integer", value: String(value) });
    return withKey({ type: "template", value: String(value) });
  }
  if (value === null || value === undefined) return withKey({ type: "template", value: "" });
  if (Array.isArray(value)) {
    return withKey({ type: "list", list: value.map((item) => fromSimpleValue(undefined, item)) });
  }
  if (isPlainObject(value)) {
    return withKey({
      type: "map",
      map: Object.entries(value).map(([k, v]) => fromSimpleValue(k, v)),
    });
  }
  return withKey({ type: "template", value: scalarToString(value) });
}

/**
 * Normalize one parameter object: fix enum casing, stringify scalar values, recurse into list/map.
 * `inList` items are not supposed to carry keys.
 */
export function normalizeParameter(input: unknown, inList = false): GtmParameter {
  if (!isPlainObject(input)) {
    // Not an object: treat as a simplified scalar/array value.
    return fromSimpleValue(undefined, input);
  }
  if (!looksLikeParameter(input)) {
    // A simplified map inside a list, e.g. list items of a table: [{"parameter": "x", "parameterValue": "y"}]
    return fromSimpleValue(undefined, input);
  }
  const out: GtmParameter = {};
  const type = normalizeEnum(input.type, PARAMETER_TYPES);
  if (type !== undefined) out.type = type as string;
  if (input.key !== undefined && !(inList && type === "list")) out.key = String(input.key);
  if (input.value !== undefined && input.value !== null) {
    out.value = typeof input.value === "string" ? input.value : scalarToString(input.value);
  }
  if (input.list !== undefined) {
    out.list = Array.isArray(input.list)
      ? input.list.map((item) => normalizeParameter(item, true))
      : (input.list as GtmParameter[]);
  }
  if (input.map !== undefined) {
    if (Array.isArray(input.map)) {
      out.map = input.map.map((item) => normalizeParameter(item, false));
    } else if (isPlainObject(input.map)) {
      out.map = Object.entries(input.map).map(([k, v]) => fromSimpleValue(k, v));
    } else {
      out.map = input.map as GtmParameter[];
    }
  }
  if (input.isWeakReference !== undefined) out.isWeakReference = Boolean(input.isWeakReference);
  // Preserve unknown fields so the validator can complain about them.
  for (const [k, v] of Object.entries(input)) {
    if (!["type", "key", "value", "list", "map", "isWeakReference"].includes(k)) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/**
 * Normalize a `parameter` property: accepts the GTM array form or the simplified object form.
 */
export function normalizeParameterList(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((p) => normalizeParameter(p, false));
  if (isPlainObject(input)) {
    return Object.entries(input).map(([k, v]) => fromSimpleValue(k, v));
  }
  return input;
}

/**
 * Normalize a property that holds exactly one Parameter (trigger `interval`, tag `priority`, ...).
 */
export function normalizeSingleParameter(
  field: string,
  input: unknown,
  defaultType: "template" | "boolean" | "integer" | "list" | "map",
): unknown {
  if (looksLikeParameter(input)) {
    const p = normalizeParameter(input, false);
    // The API returns these single-parameter fields without a key; drop a redundant one.
    if (p.key === field) delete p.key;
    return p;
  }
  if (input === undefined || input === null) return input;
  if (defaultType === "list" && Array.isArray(input)) {
    return { type: "list", list: input.map((item) => fromSimpleValue(undefined, item)) };
  }
  if (defaultType === "map" && isPlainObject(input)) {
    return { type: "map", map: Object.entries(input).map(([k, v]) => fromSimpleValue(k, v)) };
  }
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    const type = defaultType === "list" || defaultType === "map"
      ? (typeof input === "boolean" ? "boolean" : "template")
      : defaultType;
    return { type, value: String(input) };
  }
  return input;
}

/**
 * Normalize a Condition (trigger filter, zone boundary): casing + simplified arg0/arg1 form.
 */
export function normalizeCondition(input: unknown): unknown {
  if (!isPlainObject(input)) return input;
  const out: Record<string, unknown> = {};
  if (input.type !== undefined) out.type = normalizeEnum(input.type, CONDITION_TYPES);
  if (input.parameter !== undefined) {
    out.parameter = normalizeParameterList(input.parameter);
  } else if ("arg0" in input || "arg1" in input) {
    const params: GtmParameter[] = [];
    if ("arg0" in input) params.push(fromSimpleValue("arg0", input.arg0));
    if ("arg1" in input) params.push(fromSimpleValue("arg1", input.arg1));
    if ("negate" in input) {
      params.push({ type: "boolean", key: "negate", value: String(input.negate) });
    }
    const ic = "ignore_case" in input
      ? input.ignore_case
      : "ignoreCase" in input
      ? input.ignoreCase
      : undefined;
    if (ic !== undefined) params.push({ type: "boolean", key: "ignore_case", value: String(ic) });
    out.parameter = params;
  }
  for (const [k, v] of Object.entries(input)) {
    if (!["type", "parameter", "arg0", "arg1", "negate", "ignore_case", "ignoreCase"].includes(k)) {
      out[k] = v;
    }
  }
  return out;
}

function normalizeConditionList(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(normalizeCondition);
  if (isPlainObject(input)) return [normalizeCondition(input)];
  return input;
}

function normalizeIdList(input: unknown): unknown {
  if (typeof input === "string" || typeof input === "number") return [String(input)];
  if (Array.isArray(input)) return input.map((x) => (typeof x === "number" ? String(x) : x));
  return input;
}

function isEmptyParameterMap(v: unknown): boolean {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  const t = normalizeEnum(v.type, PARAMETER_TYPES);
  if (t !== "map") return false;
  const rest = keys.filter((k) => k !== "type" && k !== "key");
  if (rest.length === 0) return true;
  return rest.length === 1 && rest[0] === "map" && Array.isArray(v.map) && v.map.length === 0;
}

/**
 * Remove values the API treats as "unset" so that local files and remote snapshots compare equal:
 * empty arrays, empty monitoring metadata, notSet consent, empty formatValue, false booleans
 * the API omits, empty notes.
 */
export function stripEmptyDefaults(entity: Entity): Entity {
  const out: Entity = {};
  for (const [k, v] of Object.entries(entity)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (k === "monitoringMetadata" && isEmptyParameterMap(v)) continue;
    if (
      k === "consentSettings" && isPlainObject(v) &&
      Object.keys(v).every((kk) => kk === "consentStatus") && v.consentStatus === "notSet"
    ) continue;
    if (k === "formatValue" && isPlainObject(v) && Object.keys(v).length === 0) continue;
    if ((k === "paused" || k === "liveOnly") && v === false) continue;
    if (k === "notes" && v === "") continue;
    if (
      k === "priority" && isPlainObject(v) && v.value === undefined && v.type !== undefined &&
      Object.keys(v).length <= 2
    ) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Convert an entity as written in a local file (or as returned by the API) into canonical form.
 * Read-only API fields are removed. The result is what gets validated, diffed and pushed.
 */
export function normalizeEntity(kind: EntityKind, raw: Entity): Entity {
  const out: Entity = {};
  for (const [k, v] of Object.entries(raw)) {
    if (READ_ONLY_FIELDS.includes(k)) continue;
    out[k] = v;
  }

  if (typeof out.name === "string") out.name = out.name.trim();

  if ("parameter" in out) out.parameter = normalizeParameterList(out.parameter);

  if (kind === "trigger") {
    if ("type" in out) out.type = normalizeEnum(out.type, TRIGGER_TYPES);
    for (const f of ["filter", "customEventFilter", "autoEventFilter"]) {
      if (f in out) out[f] = normalizeConditionList(out[f]);
    }
    for (const [f, t] of Object.entries(TRIGGER_PARAMETER_FIELDS)) {
      if (f in out) out[f] = normalizeSingleParameter(f, out[f], t);
    }
  }

  if (kind === "tag") {
    if ("tagFiringOption" in out) {
      out.tagFiringOption = normalizeEnum(out.tagFiringOption, TAG_FIRING_OPTIONS);
    }
    if ("priority" in out) {
      out.priority = normalizeSingleParameter("priority", out.priority, "integer");
    }
    if ("monitoringMetadata" in out) {
      out.monitoringMetadata = normalizeSingleParameter(
        "monitoringMetadata",
        out.monitoringMetadata,
        "map",
      );
    }
    if (isPlainObject(out.consentSettings)) {
      const cs: Record<string, unknown> = { ...out.consentSettings };
      if ("consentStatus" in cs) {
        cs.consentStatus = normalizeEnum(cs.consentStatus, CONSENT_STATUSES);
      }
      if ("consentType" in cs) {
        cs.consentType = normalizeSingleParameter("consentType", cs.consentType, "list");
      }
      out.consentSettings = cs;
    } else if (typeof out.consentSettings === "string") {
      out.consentSettings = { consentStatus: normalizeEnum(out.consentSettings, CONSENT_STATUSES) };
    }
    for (const f of ["setupTag", "teardownTag"]) {
      if (isPlainObject(out[f])) out[f] = [out[f]];
      if (typeof out[f] === "string") out[f] = [{ tagName: out[f] }];
    }
    if (typeof out.paused === "string") out.paused = out.paused === "true";
  }

  if (kind === "variable" && isPlainObject(out.formatValue)) {
    const fv: Record<string, unknown> = { ...out.formatValue };
    if ("caseConversionType" in fv) {
      fv.caseConversionType = normalizeEnum(fv.caseConversionType, CASE_CONVERSION_TYPES);
    }
    if ("convertToNumber" in fv) {
      fv.convertToNumber = normalizeEnum(fv.convertToNumber, CONVERT_TO_NUMBER_TYPES);
    }
    for (const f of FORMAT_VALUE_PARAMETER_FIELDS) {
      if (f in fv) fv[f] = normalizeSingleParameter(f, fv[f], "template");
    }
    out.formatValue = fv;
  }

  if (kind === "zone") {
    if (isPlainObject(out.boundary)) {
      const b: Record<string, unknown> = { ...out.boundary };
      if ("condition" in b) b.condition = normalizeConditionList(b.condition);
      if ("customEvaluationTriggerId" in b) {
        b.customEvaluationTriggerId = normalizeIdList(b.customEvaluationTriggerId);
      }
      out.boundary = b;
    }
    if (isPlainObject(out.childContainer)) out.childContainer = [out.childContainer];
  }

  for (const f of TRIGGER_REF_FIELDS[kind]) {
    if (f in out) out[f] = normalizeIdList(out[f]);
  }
  if (typeof out.parentFolderId === "number") out.parentFolderId = String(out.parentFolderId);
  if (kind === "client" && typeof out.priority === "string" && /^-?\d+$/.test(out.priority)) {
    out.priority = parseInt(out.priority, 10);
  }

  return stripEmptyDefaults(out);
}

// ---------------------------------------------------------------------------------------------
// Simplified view (inverse of fromSimpleValue) - used for `get --simple` and the UI.
// ---------------------------------------------------------------------------------------------

export function simplifyParameter(p: GtmParameter): unknown {
  switch (p.type) {
    case "boolean":
      return p.value === "true";
    case "integer": {
      const n = Number(p.value);
      return Number.isFinite(n) ? n : p.value;
    }
    case "template":
      return p.value ?? "";
    case "list":
      return (p.list ?? []).map(simplifyParameter);
    case "map": {
      const o: Record<string, unknown> = {};
      for (const item of p.map ?? []) o[item.key ?? ""] = simplifyParameter(item);
      return o;
    }
    case "triggerReference":
    case "tagReference":
      return { type: p.type, value: p.value };
    default:
      return p;
  }
}

/** Turn a GTM parameter array into the simplified object notation */
export function simplifyParameterList(params: GtmParameter[] | undefined): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const p of params ?? []) o[p.key ?? ""] = simplifyParameter(p);
  return o;
}

/** Shallow helper: get a top-level parameter by key */
export function getParam(entity: Entity, key: string): GtmParameter | undefined {
  const params = entity.parameter;
  if (!Array.isArray(params)) return undefined;
  return (params as GtmParameter[]).find((p) => p.key === key);
}

/** Insert or replace a top-level parameter */
export function setParam(entity: Entity, param: GtmParameter): void {
  const params = Array.isArray(entity.parameter) ? (entity.parameter as GtmParameter[]) : [];
  const idx = params.findIndex((p) => p.key === param.key);
  if (idx >= 0) params[idx] = param;
  else params.push(param);
  entity.parameter = params;
}

export function removeParam(entity: Entity, key: string): boolean {
  const params = Array.isArray(entity.parameter) ? (entity.parameter as GtmParameter[]) : [];
  const idx = params.findIndex((p) => p.key === key);
  if (idx < 0) return false;
  params.splice(idx, 1);
  entity.parameter = params;
  return true;
}

/**
 * Parse a `--param` CLI argument.
 *   key=value             template
 *   key:boolean=true      boolean (also :bool)
 *   key:integer=5         integer (also :int)
 *   key:json=<json>       any JSON value in simplified notation (or a full parameter object)
 *   key:template=value    explicit template
 */
export function parseParamArg(arg: string): GtmParameter {
  const eq = arg.indexOf("=");
  if (eq < 0) {
    throw new Error(
      `Invalid --param "${arg}". Expected key=value, key:boolean=true, key:integer=5 or key:json='{...}'.`,
    );
  }
  let keyPart = arg.slice(0, eq);
  const value = arg.slice(eq + 1);
  let type = "template";
  const colon = keyPart.indexOf(":");
  if (colon >= 0) {
    type = keyPart.slice(colon + 1).toLowerCase();
    keyPart = keyPart.slice(0, colon);
  }
  const key = keyPart.trim();
  if (!key) throw new Error(`Invalid --param "${arg}": the key must not be empty.`);
  switch (type) {
    case "template":
    case "text":
    case "string":
      return { type: "template", key, value };
    case "boolean":
    case "bool": {
      const v = value.trim().toLowerCase();
      if (v !== "true" && v !== "false") {
        throw new Error(`Invalid --param "${arg}": boolean parameters must be true or false.`);
      }
      return { type: "boolean", key, value: v };
    }
    case "integer":
    case "int":
      if (!/^-?\d+$/.test(value.trim())) {
        throw new Error(`Invalid --param "${arg}": integer parameters must be whole numbers.`);
      }
      return { type: "integer", key, value: value.trim() };
    case "json": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (e) {
        throw new Error(
          `Invalid --param "${arg}": value is not valid JSON (${(e as Error).message}).`,
        );
      }
      return fromSimpleValue(key, parsed);
    }
    case "triggerreference":
    case "trigger":
      return { type: "triggerReference", key, value };
    case "tagreference":
    case "tag":
      return { type: "tagReference", key, value };
    default:
      throw new Error(
        `Invalid --param "${arg}": unknown parameter type "${type}". Use template, boolean, integer or json.`,
      );
  }
}
