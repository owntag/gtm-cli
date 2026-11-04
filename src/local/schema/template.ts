/**
 * Local workspaces: parsing custom template data (the `templateData` of a CustomTemplate).
 *
 * Template files consist of sections separated by `___SECTION_NAME___` markers. The
 * `___INFO___` section tells us whether the template is a tag, variable (MACRO) or client and
 * which container contexts it supports; `___TEMPLATE_PARAMETERS___` describes every parameter,
 * which lets us validate `cvt_*` entities precisely (required fields, enums, table columns).
 */

export interface TemplateParamDef {
  name: string;
  /** TEXT, CHECKBOX, SELECT, RADIO, SIMPLE_TABLE, PARAM_TABLE, GROUP, LABEL, ... */
  type: string;
  displayName?: string;
  required: boolean;
  /** Allowed values for SELECT / RADIO (unless macrosInSelect allows variables) */
  enumValues?: string[];
  /** True when every SELECT/RADIO option is a JSON boolean (GTM then stores a boolean parameter) */
  booleanItems?: boolean;
  macrosInSelect?: boolean;
  /** Column names for SIMPLE_TABLE / PARAM_TABLE */
  columns?: string[];
  /** Regex validators (pattern, message) */
  regexValidators?: Array<{ pattern: string; message?: string }>;
  numberValidator?: "NUMBER" | "POSITIVE_NUMBER" | "NON_NEGATIVE_NUMBER" | "PERCENTAGE";
  /** Conditions under which this parameter is shown (paramName, paramValue, type) */
  enablingConditions?: Array<{ paramName: string; paramValue: unknown; type: string }>;
  /** Parent RADIO parameter + value that reveals this sub parameter */
  parent?: { name: string; value?: string };
}

export interface ParsedTemplate {
  /** TAG | MACRO | CLIENT | TRANSFORMATION (MACRO = variable) */
  kind?: string;
  displayName?: string;
  /** Public id as declared in INFO, e.g. cvt_5RM3Q or cvt_temp_public_id */
  publicId?: string;
  /** WEB | SERVER | ... */
  containerContexts?: string[];
  params: TemplateParamDef[];
  parseError?: string;
}

const SECTION_RE = /^___([A-Z0-9_]+)___\s*$/m;

export function splitTemplateSections(templateData: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = templateData.split(/\r?\n/);
  let current: string | undefined;
  const buf: string[] = [];
  const flush = () => {
    if (current !== undefined) sections[current] = buf.join("\n").trim();
    buf.length = 0;
  };
  for (const line of parts) {
    const m = line.match(SECTION_RE);
    if (m) {
      flush();
      current = m[1];
    } else if (current !== undefined) {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

type EnablingCondition = { paramName: string; paramValue: unknown; type: string };

function readConditions(def: Record<string, unknown>): EnablingCondition[] {
  if (!Array.isArray(def.enablingConditions)) return [];
  return (def.enablingConditions as Array<Record<string, unknown>>).map((c) => ({
    paramName: String(c.paramName ?? ""),
    paramValue: c.paramValue,
    type: String(c.type ?? "EQUALS"),
  }));
}

/** SELECT/RADIO items whose values are JSON booleans are stored by GTM as boolean parameters */
function itemValues(items: unknown): { values: string[]; allBoolean: boolean } {
  const list = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  const raw = list.map((i) => i.value);
  return {
    values: raw.map(String),
    allBoolean: raw.length > 0 && raw.every((v) => typeof v === "boolean"),
  };
}

function collectParams(
  defs: unknown,
  out: TemplateParamDef[],
  parent?: { name: string; value?: string },
  inherited: EnablingCondition[] = [],
): void {
  if (!Array.isArray(defs)) return;
  for (const d of defs) {
    if (!d || typeof d !== "object") continue;
    const def = d as Record<string, unknown>;
    const type = String(def.type ?? "");
    const name = typeof def.name === "string" ? def.name : "";
    const conditions = [...inherited, ...readConditions(def)];
    if (type === "GROUP") {
      // Parameters inside a group are only relevant when the group itself is enabled.
      collectParams(def.subParams, out, parent, conditions);
      continue;
    }
    if (type === "LABEL" || !name) continue;

    const validators = Array.isArray(def.valueValidators)
      ? (def.valueValidators as Array<Record<string, unknown>>)
      : [];
    const required = validators.some((v) => v.type === "NON_EMPTY");
    const regexValidators = validators
      .filter((v) =>
        v.type === "REGEX" && Array.isArray(v.args) && typeof (v.args as unknown[])[0] === "string"
      )
      .map((v) => ({
        pattern: (v.args as string[])[0],
        message: typeof v.errorMessage === "string" ? v.errorMessage : undefined,
      }));
    const numberValidator = validators.map((v) => String(v.type)).find((t) =>
      ["NUMBER", "POSITIVE_NUMBER", "NON_NEGATIVE_NUMBER", "PERCENTAGE"].includes(t)
    ) as TemplateParamDef["numberValidator"];

    const param: TemplateParamDef = {
      name,
      type,
      displayName: typeof def.displayName === "string" ? def.displayName : undefined,
      required,
      regexValidators: regexValidators.length ? regexValidators : undefined,
      numberValidator,
      enablingConditions: conditions.length ? conditions : undefined,
      parent,
    };

    if (type === "SELECT") {
      const iv = itemValues(def.selectItems);
      param.enumValues = iv.values;
      param.booleanItems = iv.allBoolean;
      param.macrosInSelect = def.macrosInSelect === true;
    }
    if (type === "RADIO") {
      const iv = itemValues(def.radioItems);
      param.enumValues = iv.values;
      param.booleanItems = iv.allBoolean;
    }
    if (type === "SIMPLE_TABLE" && Array.isArray(def.simpleTableColumns)) {
      param.columns = (def.simpleTableColumns as Array<Record<string, unknown>>).map((c) =>
        String(c.name)
      );
    }
    if (type === "PARAM_TABLE" && Array.isArray(def.paramTableColumns)) {
      param.columns = (def.paramTableColumns as Array<Record<string, unknown>>)
        .map((c) => (c.param as Record<string, unknown> | undefined)?.name)
        .filter((n): n is string => typeof n === "string");
    }
    out.push(param);

    if (type === "RADIO" && Array.isArray(def.radioItems)) {
      for (const item of def.radioItems as Array<Record<string, unknown>>) {
        collectParams(item.subParams, out, { name, value: String(item.value) }, conditions);
      }
    }
    if (Array.isArray(def.subParams)) collectParams(def.subParams, out, parent, conditions);
  }
}

/**
 * Parse template data. Never throws: malformed sections produce `parseError` and an empty
 * parameter list so callers can fall back to generic validation.
 */
export function parseTemplate(templateData: string | undefined): ParsedTemplate {
  const result: ParsedTemplate = { params: [] };
  if (typeof templateData !== "string" || !templateData.trim()) {
    result.parseError = "templateData is empty";
    return result;
  }
  const sections = splitTemplateSections(templateData);
  if (sections.INFO) {
    try {
      const info = JSON.parse(sections.INFO) as Record<string, unknown>;
      result.kind = typeof info.type === "string" ? info.type : undefined;
      result.displayName = typeof info.displayName === "string" ? info.displayName : undefined;
      result.publicId = typeof info.id === "string" ? info.id : undefined;
      result.containerContexts = Array.isArray(info.containerContexts)
        ? info.containerContexts.map(String)
        : undefined;
    } catch (e) {
      result.parseError = `___INFO___ is not valid JSON: ${(e as Error).message}`;
    }
  } else {
    result.parseError = "missing ___INFO___ section";
  }
  if (sections.TEMPLATE_PARAMETERS) {
    try {
      collectParams(JSON.parse(sections.TEMPLATE_PARAMETERS), result.params);
    } catch (e) {
      result.parseError = `___TEMPLATE_PARAMETERS___ is not valid JSON: ${(e as Error).message}`;
    }
  }
  return result;
}

/** Map a template parameter type to the GTM parameter type expected in entity JSON */
export function expectedParameterType(
  def: TemplateParamDef,
): "template" | "boolean" | "list" | undefined {
  switch (def.type) {
    case "CHECKBOX":
      return "boolean";
    case "SIMPLE_TABLE":
    case "PARAM_TABLE":
      return "list";
    case "SELECT":
    case "RADIO":
      return def.booleanItems ? "boolean" : "template";
    case "TEXT":
      return "template";
    default:
      return undefined;
  }
}

/**
 * Evaluate whether a parameter is "active" given the values the entity supplies
 * (enabling conditions and radio parents). Inactive parameters are not required.
 */
export function isTemplateParamActive(
  def: TemplateParamDef,
  values: Map<string, string | undefined>,
): boolean {
  if (def.parent) {
    const v = values.get(def.parent.name);
    if (def.parent.value !== undefined && v !== def.parent.value) return false;
  }
  if (def.enablingConditions && def.enablingConditions.length > 0) {
    for (const c of def.enablingConditions) {
      const actual = values.get(c.paramName);
      const expected = c.paramValue === undefined ? undefined : String(c.paramValue);
      const equals = actual !== undefined && expected !== undefined && actual === expected;
      if (c.type === "NOT_EQUALS" ? equals : !equals) return false;
    }
  }
  return true;
}
