import { assert, assertEquals } from "@std/assert";
import type { Entity, LocalEntity, LocalWorkspace, Snapshot } from "../src/local/types.ts";
import { normalizeEntity } from "../src/local/params.ts";
import { validateWorkspace } from "../src/local/validate.ts";
import { computeDiff } from "../src/local/diff.ts";
import type { EntityKind } from "../src/local/kinds.ts";

function local(kind: EntityKind, raw: Entity, file?: string): LocalEntity {
  return {
    kind,
    file: file ?? `${kind}s/${raw.name}.json`,
    raw,
    entity: normalizeEntity(kind, raw),
  };
}

function workspace(
  entities: LocalEntity[],
  options: { context?: "web" | "server"; builtIns?: string[]; base?: Snapshot } = {},
): LocalWorkspace {
  const context = options.context ?? "web";
  return {
    root: "/tmp/ws",
    meta: {
      formatVersion: 1,
      accountId: "1",
      containerId: "100",
      workspaceId: "2",
      container: { name: "Test", publicId: "GTM-TEST", usageContext: [context] },
      workspace: {},
    },
    context,
    entities,
    builtInVariables: (options.builtIns ?? ["pageUrl", "event"]).map((type) => ({ type })),
    base: options.base,
  };
}

const codes = (ws: LocalWorkspace) =>
  validateWorkspace(ws).issues.map((i) => `${i.severity}:${i.code}`);

Deno.test("a well-formed tag, trigger and variable validate without issues", () => {
  const ws = workspace([
    local("variable", { name: "GA4 ID", type: "c", parameter: { value: "G-123" } }),
    local("trigger", {
      name: "event.purchase",
      type: "customEvent",
      customEventFilter: [{ type: "equals", arg0: "{{_event}}", arg1: "purchase" }],
    }),
    local("tag", {
      name: "GA4 purchase",
      type: "gaawe",
      parameter: {
        eventName: "purchase",
        measurementIdOverride: "{{GA4 ID}}",
        sendEcommerceData: true,
      },
      firingTriggerId: ["event.purchase", "All Pages"],
    }),
  ]);
  assertEquals(codes(ws), []);
});

Deno.test("missing required parameter, unknown trigger and bad boolean are errors", () => {
  const ws = workspace([
    local("tag", {
      name: "t",
      type: "html",
      parameter: [{ type: "boolean", key: "supportDocumentWrite", value: "yes" }],
      firingTriggerId: ["does not exist"],
    }),
  ]);
  const c = codes(ws);
  assert(c.includes("error:PARAM_REQUIRED"), c.join());
  assert(c.includes("error:TRIGGER_NOT_FOUND"), c.join());
  assert(c.includes("error:PARAM_BOOLEAN_VALUE"), c.join());
});

Deno.test("unknown parameter keys and dangling variable references are warnings", () => {
  const ws = workspace([
    local("tag", {
      name: "t",
      type: "html",
      parameter: { html: "<script>{{Nope}} {{Click Text}}</script>", supportDocumentWrit: false },
      firingTriggerId: "All Pages",
    }),
  ]);
  const c = codes(ws);
  assert(c.includes("warning:PARAM_UNKNOWN_KEY"), c.join());
  assert(c.includes("warning:VARIABLE_NOT_FOUND"), c.join());
  assert(c.includes("warning:BUILT_IN_NOT_ENABLED"), c.join());
  assert(!c.some((x) => x.startsWith("error:")), c.join());
});

Deno.test("custom event triggers need exactly one customEventFilter; other types must not have one", () => {
  const ws = workspace([
    local("trigger", { name: "a", type: "customEvent" }),
    local("trigger", {
      name: "b",
      type: "pageview",
      customEventFilter: [{ type: "equals", arg0: "{{_event}}", arg1: "x" }],
    }),
    local("trigger", {
      name: "c",
      type: "pageview",
      filter: [{ type: "contains", arg0: "{{Page URL}}" }],
    }),
  ]);
  const c = codes(ws);
  assert(c.includes("error:CUSTOM_EVENT_FILTER"), c.join());
  assert(c.includes("error:CUSTOM_EVENT_FILTER_WRONG_TYPE"), c.join());
  assert(c.includes("error:CONDITION_ARGS_MISSING"), c.join());
});

Deno.test("context rules: web-only types and triggers are rejected in server containers", () => {
  const ws = workspace([
    local("tag", {
      name: "t",
      type: "html",
      parameter: { html: "x" },
      firingTriggerId: ["All Pages"],
    }),
    local("trigger", { name: "pv", type: "pageview" }),
    local("variable", { name: "v", type: "v", parameter: { name: "x" } }),
  ], { context: "server", builtIns: ["eventName"] });
  const c = codes(ws);
  assertEquals(c.filter((x) => x === "error:TYPE_WRONG_CONTEXT").length, 2, c.join());
  assert(c.includes("error:TRIGGER_TYPE_CONTEXT"), c.join());
});

Deno.test("names: duplicates, forbidden characters and length", () => {
  const ws = workspace([
    local("variable", { name: "dup", type: "c", parameter: { value: "1" } }, "variables/a.json"),
    local("variable", { name: "dup", type: "c", parameter: { value: "1" } }, "variables/b.json"),
    local(
      "variable",
      { name: "bad{name}", type: "c", parameter: { value: "1" } },
      "variables/c.json",
    ),
    local(
      "variable",
      { name: "x".repeat(300), type: "c", parameter: { value: "1" } },
      "variables/d.json",
    ),
  ]);
  const c = codes(ws);
  assertEquals(c.filter((x) => x === "error:DUPLICATE_NAME").length, 2);
  assert(c.includes("error:NAME_INVALID_CHAR"));
  assert(c.includes("error:NAME_TOO_LONG"));
});

Deno.test("custom template types resolve to templates and validate against their parameters", () => {
  const templateData = `___INFO___

{"type": "TAG", "id": "cvt_temp_public_id", "displayName": "T", "containerContexts": ["WEB"]}

___TEMPLATE_PARAMETERS___

[
  {"type": "TEXT", "name": "pixelId", "valueValidators": [{"type": "NON_EMPTY"}, {"type": "REGEX", "args": ["^[0-9]+$"], "errorMessage": "digits only"}]},
  {"type": "SELECT", "name": "mode", "selectItems": [{"value": "a"}, {"value": "b"}]},
  {"type": "SELECT", "name": "consent", "selectItems": [{"value": true}, {"value": false}]},
  {"type": "CHECKBOX", "name": "adv"},
  {"type": "GROUP", "name": "g", "enablingConditions": [{"paramName": "adv", "paramValue": true, "type": "EQUALS"}], "subParams": [
    {"type": "SIMPLE_TABLE", "name": "advList", "valueValidators": [{"type": "NON_EMPTY"}], "simpleTableColumns": [{"name": "k"}, {"name": "v"}]}
  ]}
]

___SANDBOXED_JS_FOR_WEB_TEMPLATE___

data.gtmOnSuccess();
`;
  const tmpl = local("template", { templateId: "7", name: "T", templateData });
  const ok = local("tag", {
    name: "ok",
    type: "cvt_100_7",
    parameter: { pixelId: "123", mode: "a", consent: true, adv: false },
    firingTriggerId: ["All Pages"],
  });
  const bad = local("tag", {
    name: "bad",
    type: "cvt_100_7",
    parameter: { pixelId: "abc", mode: "zzz", adv: true, nonsense: "1" },
    firingTriggerId: ["All Pages"],
  });
  const missing = local("tag", {
    name: "missing",
    type: "cvt_100_99",
    firingTriggerId: ["All Pages"],
  });
  const ws = workspace([tmpl, ok, bad, missing]);
  const issues = validateWorkspace(ws).issues;
  const forFile = (f: string) =>
    issues.filter((i) => i.file === f).map((i) => `${i.severity}:${i.code}`);
  assertEquals(forFile("tags/ok.json"), []);
  const b = forFile("tags/bad.json");
  assert(b.includes("error:TEMPLATE_PARAM_REGEX"), b.join());
  assert(b.includes("warning:TEMPLATE_PARAM_ENUM"), b.join());
  assert(b.includes("error:TEMPLATE_PARAM_REQUIRED"), b.join()); // advList required because adv=true enables the group
  assert(b.includes("warning:TEMPLATE_PARAM_UNKNOWN"), b.join());
  assertEquals(forFile("tags/missing.json"), ["error:TEMPLATE_NOT_FOUND"]);
});

Deno.test("computeDiff classifies added, modified, deleted and unchanged entities and resolves trigger names", () => {
  const base: Snapshot = {
    takenAt: "2026-01-01T00:00:00Z",
    entities: {
      trigger: [{
        triggerId: "6",
        name: "event.purchase",
        type: "customEvent",
        fingerprint: "1",
        customEventFilter: [{
          type: "equals",
          parameter: [{ type: "template", key: "arg0", value: "{{_event}}" }, {
            type: "template",
            key: "arg1",
            value: "purchase",
          }],
        }],
      }],
      tag: [
        {
          tagId: "10",
          name: "keep",
          type: "html",
          fingerprint: "2",
          parameter: [{ type: "template", key: "html", value: "<x>" }],
          firingTriggerId: ["6"],
          monitoringMetadata: { type: "map" },
          consentSettings: { consentStatus: "notSet" },
        },
        {
          tagId: "11",
          name: "change",
          type: "html",
          fingerprint: "3",
          parameter: [{ type: "template", key: "html", value: "<old>" }],
          firingTriggerId: ["6"],
        },
        {
          tagId: "12",
          name: "gone",
          type: "html",
          fingerprint: "4",
          parameter: [{ type: "template", key: "html", value: "<x>" }],
        },
      ],
    },
    builtInVariables: [{ type: "pageUrl" }],
  };
  const ws = workspace([
    local("trigger", {
      triggerId: "6",
      name: "event.purchase",
      type: "customEvent",
      customEventFilter: [{ type: "equals", arg0: "{{_event}}", arg1: "purchase" }],
    }),
    local("tag", {
      tagId: "10",
      name: "keep",
      type: "html",
      parameter: { html: "<x>" },
      firingTriggerId: ["event.purchase"],
    }),
    local("tag", {
      tagId: "11",
      name: "change",
      type: "html",
      parameter: { html: "<new>" },
      firingTriggerId: ["6", "All Pages"],
    }),
    local("tag", {
      name: "new",
      type: "html",
      parameter: { html: "<x>" },
      firingTriggerId: ["All Pages"],
    }),
  ], { base, builtIns: ["pageUrl", "clickText"] });
  const diff = computeDiff(ws, base, "remote");
  const by = (name: string) => diff.changes.find((c) => c.name === name)!;
  assertEquals(by("keep").change, "unchanged");
  assertEquals(by("change").change, "modified");
  assertEquals(by("change").fields!.map((f) => f.path).sort(), [
    "firingTriggerId",
    "parameter[html]",
  ]);
  assertEquals(by("new").change, "added");
  assertEquals(by("gone").change, "deleted");
  assertEquals(diff.changes.find((c) => c.kind === "builtInVariable")?.name, "Click Text");
  assertEquals(diff.summary, {
    added: 2,
    modified: 1,
    deleted: 1,
    unchanged: 2,
    byKind: {
      tag: { added: 1, modified: 1, deleted: 1 },
      builtInVariable: { added: 1, modified: 0, deleted: 0 },
    },
  });
});

Deno.test("templates can be referenced by name before they have an ID; galleryReference is rejected on new templates", () => {
  const templateData = `___INFO___

{"type": "TAG", "id": "cvt_temp_public_id", "displayName": "By Name", "containerContexts": ["WEB"]}

___TEMPLATE_PARAMETERS___

[{"type": "TEXT", "name": "pixelId", "valueValidators": [{"type": "NON_EMPTY"}]}]
`;
  const ws = workspace([
    local("template", { name: "By Name", templateData }),
    local("template", {
      name: "Gallery copy",
      templateData,
      galleryReference: { host: "github.com", owner: "x", repository: "y" },
    }),
    local("tag", {
      name: "uses template",
      template: "By Name",
      parameter: { pixelId: "1" },
      firingTriggerId: ["All Pages"],
    }),
    local("tag", { name: "missing param", template: "By Name", firingTriggerId: ["All Pages"] }),
    local("tag", { name: "unknown template", template: "Nope", firingTriggerId: ["All Pages"] }),
  ]);
  const issues = validateWorkspace(ws).issues;
  const forFile = (f: string) =>
    issues.filter((i) => i.file === f).map((i) => `${i.severity}:${i.code}`);
  assertEquals(forFile("tags/uses template.json"), []);
  assertEquals(forFile("tags/missing param.json"), ["error:TEMPLATE_PARAM_REQUIRED"]);
  assertEquals(forFile("tags/unknown template.json"), ["error:TEMPLATE_NOT_FOUND"]);
  assertEquals(forFile("templates/Gallery copy.json"), ["error:GALLERY_REFERENCE_ON_CREATE"]);
  assertEquals(forFile("templates/By Name.json"), []);
});
