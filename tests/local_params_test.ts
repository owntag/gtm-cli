import { assertEquals, assertThrows } from "@std/assert";
import {
  fromSimpleValue,
  normalizeCondition,
  normalizeEntity,
  normalizeEnum,
  parseParamArg,
  simplifyParameterList,
  stripEmptyDefaults,
} from "../src/local/params.ts";

Deno.test("normalizeEnum converts export casing to API casing", () => {
  assertEquals(normalizeEnum("CUSTOM_EVENT", ["customEvent", "pageview"]), "customEvent");
  assertEquals(normalizeEnum("TEMPLATE", ["template", "boolean"]), "template");
  assertEquals(normalizeEnum("trigger_reference", ["triggerReference"]), "triggerReference");
  assertEquals(normalizeEnum("ONCE_PER_EVENT", ["oncePerEvent"]), "oncePerEvent");
  assertEquals(normalizeEnum("pageview", ["pageview"]), "pageview");
  // unknown values pass through untouched so the validator can report them
  assertEquals(normalizeEnum("foobar", ["pageview"]), "foobar");
});

Deno.test("fromSimpleValue maps JSON types to GTM parameter types", () => {
  assertEquals(fromSimpleValue("a", "x"), { type: "template", key: "a", value: "x" });
  assertEquals(fromSimpleValue("b", true), { type: "boolean", key: "b", value: "true" });
  assertEquals(fromSimpleValue("c", 2), { type: "integer", key: "c", value: "2" });
  assertEquals(fromSimpleValue("d", 2.5), { type: "template", key: "d", value: "2.5" });
  assertEquals(fromSimpleValue("table", [{ parameter: "p", parameterValue: "v" }]), {
    type: "list",
    key: "table",
    list: [{
      type: "map",
      map: [{ type: "template", key: "parameter", value: "p" }, {
        type: "template",
        key: "parameterValue",
        value: "v",
      }],
    }],
  });
  // a verbatim GTM parameter object is kept (and gets the key)
  assertEquals(fromSimpleValue("ref", { type: "tagReference", value: "ga4" }), {
    type: "tagReference",
    value: "ga4",
    key: "ref",
  });
});

Deno.test("simplifyParameterList is the inverse of fromSimpleValue", () => {
  const simple = {
    eventName: "purchase",
    sendEcommerceData: true,
    dataLayerVersion: 2,
    table: [{ parameter: "p", parameterValue: "v" }],
  };
  const params = Object.entries(simple).map(([k, v]) => fromSimpleValue(k, v));
  assertEquals(simplifyParameterList(params), simple);
});

Deno.test("normalizeEntity accepts simplified parameters, export casing and string trigger lists", () => {
  const raw = {
    name: "  My tag  ",
    type: "html",
    parameter: { html: "<script>1</script>", supportDocumentWrite: false },
    firingTriggerId: "All Pages",
    tagFiringOption: "ONCE_PER_EVENT",
    consentSettings: { consentStatus: "NEEDED", consentType: ["analytics_storage"] },
    priority: 5,
    paused: false,
    path: "accounts/1/containers/2/workspaces/3/tags/4",
    fingerprint: "123",
  };
  const e = normalizeEntity("tag", raw);
  assertEquals(e.name, "My tag");
  assertEquals(e.parameter, [
    { type: "template", key: "html", value: "<script>1</script>" },
    { type: "boolean", key: "supportDocumentWrite", value: "false" },
  ]);
  assertEquals(e.firingTriggerId, ["All Pages"]);
  assertEquals(e.tagFiringOption, "oncePerEvent");
  assertEquals(e.consentSettings, {
    consentStatus: "needed",
    consentType: { type: "list", list: [{ type: "template", value: "analytics_storage" }] },
  });
  assertEquals(e.priority, { type: "integer", value: "5" });
  assertEquals("paused" in e, false, "paused:false is an API default and is stripped");
  assertEquals("path" in e, false);
  assertEquals("fingerprint" in e, false);
});

Deno.test("normalizeEntity handles trigger conditions and single-parameter fields", () => {
  const e = normalizeEntity("trigger", {
    name: "t",
    type: "LINK_CLICK",
    filter: [{
      type: "CONTAINS",
      arg0: "{{Page URL}}",
      arg1: "/x",
      negate: true,
      ignoreCase: true,
    }],
    waitForTags: true,
    waitForTagsTimeout: 2000,
  });
  assertEquals(e.type, "linkClick");
  assertEquals(e.filter, [{
    type: "contains",
    parameter: [
      { type: "template", key: "arg0", value: "{{Page URL}}" },
      { type: "template", key: "arg1", value: "/x" },
      { type: "boolean", key: "negate", value: "true" },
      { type: "boolean", key: "ignore_case", value: "true" },
    ],
  }]);
  assertEquals(e.waitForTags, { type: "boolean", value: "true" });
  assertEquals(e.waitForTagsTimeout, { type: "template", value: "2000" });
});

Deno.test("normalizeCondition keeps a full GTM condition intact", () => {
  const c = {
    type: "equals",
    parameter: [{ type: "template", key: "arg0", value: "{{_event}}" }, {
      type: "template",
      key: "arg1",
      value: "x",
    }],
  };
  assertEquals(normalizeCondition(c), c);
});

Deno.test("stripEmptyDefaults removes values the API treats as unset", () => {
  const out = stripEmptyDefaults({
    name: "x",
    parameter: [],
    monitoringMetadata: { type: "map" },
    consentSettings: { consentStatus: "notSet" },
    formatValue: {},
    notes: "",
    liveOnly: false,
    keep: { type: "map", map: [{ type: "template", key: "a", value: "b" }] },
  });
  assertEquals(out, {
    name: "x",
    keep: { type: "map", map: [{ type: "template", key: "a", value: "b" }] },
  });
});

Deno.test("parseParamArg understands the typed key=value syntax", () => {
  assertEquals(parseParamArg("eventName=purchase"), {
    type: "template",
    key: "eventName",
    value: "purchase",
  });
  assertEquals(parseParamArg("send:boolean=true"), { type: "boolean", key: "send", value: "true" });
  assertEquals(parseParamArg("v:int=3"), { type: "integer", key: "v", value: "3" });
  assertEquals(parseParamArg('table:json=[{"a":"b"}]'), {
    type: "list",
    key: "table",
    list: [{ type: "map", map: [{ type: "template", key: "a", value: "b" }] }],
  });
  assertEquals(parseParamArg("url=https://x.com/?a=b=c"), {
    type: "template",
    key: "url",
    value: "https://x.com/?a=b=c",
  });
  assertThrows(() => parseParamArg("novalue"), Error, "Expected key=value");
  assertThrows(() => parseParamArg("flag:boolean=yes"), Error, "true or false");
  assertThrows(() => parseParamArg("n:integer=1.5"), Error, "whole numbers");
});

import { resolveReferencesToIds } from "../src/local/workspace.ts";
import { newestGalleryVersion, parseGalleryRef } from "../src/local/gallery.ts";
import type { LocalWorkspace } from "../src/local/types.ts";

Deno.test("resolveReferencesToIds turns a template name into the cvt_ type (container id, gallery id, or push override)", () => {
  const ws: LocalWorkspace = {
    root: "/tmp",
    meta: {
      formatVersion: 1,
      accountId: "1",
      containerId: "100",
      workspaceId: "2",
      container: {},
      workspace: {},
    },
    context: "web",
    builtInVariables: [],
    entities: [
      {
        kind: "template",
        file: "templates/a.json",
        raw: {},
        entity: { templateId: "7", name: "Plain" },
      },
      {
        kind: "template",
        file: "templates/b.json",
        raw: {},
        entity: { name: "Gallery", galleryReference: { galleryTemplateId: "5RM3Q" } },
      },
      { kind: "template", file: "templates/c.json", raw: {}, entity: { name: "New" } },
    ],
  };
  assertEquals(resolveReferencesToIds(ws, "tag", { name: "t", template: "Plain" }), {
    name: "t",
    type: "cvt_100_7",
  });
  assertEquals(resolveReferencesToIds(ws, "tag", { name: "t", template: "Gallery" }), {
    name: "t",
    type: "cvt_5RM3Q",
  });
  // unresolvable until the template is created; with the push's id override it resolves
  assertEquals(resolveReferencesToIds(ws, "tag", { name: "t", template: "New" }), {
    name: "t",
    template: "New",
  });
  assertEquals(
    resolveReferencesToIds(
      ws,
      "tag",
      { name: "t", template: "New" },
      new Map([["template:New", "42"]]),
    ),
    { name: "t", type: "cvt_100_42" },
  );
});

Deno.test("gallery helpers parse references and metadata.yaml", () => {
  assertEquals(parseGalleryRef("stape-io/fb-tag"), { owner: "stape-io", repository: "fb-tag" });
  assertEquals(parseGalleryRef("https://github.com/stape-io/fb-tag"), {
    owner: "stape-io",
    repository: "fb-tag",
  });
  assertThrows(() => parseGalleryRef("not a ref"));
  assertEquals(
    newestGalleryVersion(
      "homepage: x\nversions:\n  - sha: a8bac87c0d597c3285b8ac174ba3d0104e9b42a1\n    changeNotes: new\n  - sha: 1111111111111111111111111111111111111111\n",
    ),
    "a8bac87c0d597c3285b8ac174ba3d0104e9b42a1",
  );
  assertEquals(newestGalleryVersion("homepage: x\n"), undefined);
});
