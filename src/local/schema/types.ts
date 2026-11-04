/**
 * Local workspaces: knowledge base of GTM entity types.
 *
 * Which tag/trigger/variable/client types exist per container context, which parameters they
 * take and which of those are required. Required parameters and context availability were
 * verified against the GTM API; parameter lists marked `complete` are the full set GTM knows
 * (unknown keys are silently dropped by the API, so the validator warns about them).
 */

import type { UsageContext } from "../kinds.ts";

export type ParamType =
  | "template"
  | "boolean"
  | "integer"
  | "list"
  | "map"
  | "tagReference"
  | "triggerReference";

export interface ParamSpec {
  key: string;
  type: ParamType;
  required?: boolean;
  /** Allowed values (template parameters only) */
  enum?: string[];
  /** Short description for error messages / docs */
  description?: string;
}

export interface TypeSpec {
  type: string;
  name: string;
  contexts: UsageContext[];
  params: ParamSpec[];
  /** True when `params` lists every parameter GTM accepts for this type */
  complete?: boolean;
  /** Extra plain-English guidance shown in error hints */
  note?: string;
}

const T = (key: string, extra: Partial<ParamSpec> = {}): ParamSpec => ({
  key,
  type: "template",
  ...extra,
});
const B = (key: string, extra: Partial<ParamSpec> = {}): ParamSpec => ({
  key,
  type: "boolean",
  ...extra,
});
const I = (key: string, extra: Partial<ParamSpec> = {}): ParamSpec => ({
  key,
  type: "integer",
  ...extra,
});
const L = (key: string, extra: Partial<ParamSpec> = {}): ParamSpec => ({
  key,
  type: "list",
  ...extra,
});

const WEB: UsageContext[] = ["web", "other"];
const SERVER: UsageContext[] = ["server"];

// ---------------------------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------------------------

export const TAG_TYPES: TypeSpec[] = [
  {
    type: "html",
    name: "Custom HTML",
    contexts: WEB,
    complete: true,
    params: [
      T("html", { required: true, description: "The HTML/JavaScript to inject" }),
      B("supportDocumentWrite", { description: "Support document.write" }),
    ],
  },
  {
    type: "img",
    name: "Custom Image",
    contexts: WEB,
    complete: true,
    params: [
      T("url", { required: true, description: "Image URL" }),
      B("useCacheBuster"),
      T("cacheBusterQueryParam", {
        description: 'Query parameter name for the cache buster (default "gtmcb")',
      }),
    ],
  },
  {
    type: "googtag",
    name: "Google Tag",
    contexts: WEB,
    complete: true,
    params: [
      T("tagId", { required: true, description: "Google tag ID, e.g. G-XXXXXXX or AW-XXXXXXX" }),
      L("configSettingsTable", {
        description: "List of maps with keys parameter / parameterValue",
      }),
      T("configSettingsVariable", {
        description: "Reference to a Google Tag: Configuration Settings variable",
      }),
      L("eventSettingsTable", { description: "List of maps with keys parameter / parameterValue" }),
      T("eventSettingsVariable", {
        description: "Reference to a Google Tag: Event Settings variable",
      }),
    ],
  },
  {
    type: "gaawe",
    name: "Google Analytics: GA4 Event",
    contexts: WEB,
    params: [
      T("eventName", { required: true }),
      T("measurementIdOverride", {
        required: true,
        description: "Measurement ID (G-XXXXXXX) or a variable",
      }),
      {
        key: "measurementId",
        type: "tagReference",
        description: "Legacy: name of a GA4 Configuration tag",
      },
      L("eventSettingsTable", { description: "List of maps with keys parameter / parameterValue" }),
      T("eventSettingsVariable"),
      L("eventParameters", {
        description: "Legacy event parameters: list of maps with keys name / value",
      }),
      L("userProperties", { description: "List of maps with keys name / value" }),
      B("sendEcommerceData"),
      T("getEcommerceDataFrom", { enum: ["dataLayer", "customObject"] }),
      T("ecommerceMacroData"),
      B("enhancedUserId"),
      T("userDataVariable"),
    ],
    note:
      'Either set "measurementIdOverride" to a Measurement ID (or variable) or reference a configuration tag via a tagReference parameter named "measurementId".',
  },
  {
    type: "gaawc",
    name: "Google Analytics: GA4 Configuration (legacy)",
    contexts: WEB,
    params: [
      T("tagId", { required: true }),
      T("measurementId"),
      B("sendPageView"),
      L("fieldsToSet"),
      L("userProperties"),
    ],
    note: 'GA4 Configuration tags are deprecated; use type "googtag" (Google Tag) for new setups.',
  },
  {
    type: "awct",
    name: "Google Ads Conversion Tracking",
    contexts: WEB,
    params: [
      T("conversionId", { required: true }),
      T("conversionLabel", { required: true }),
      T("conversionValue"),
      T("currencyCode"),
      T("orderId"),
      B("enableConversionLinker"),
      T("conversionCookiePrefix"),
      B("enableNewCustomerReporting"),
      B("enableEnhancedConversion"),
      B("enableProductReporting"),
      T("productReportingDataSource"),
      B("rdp"),
      T("userDataVariable"),
    ],
  },
  {
    type: "sp",
    name: "Google Ads Remarketing",
    contexts: WEB,
    params: [
      T("conversionId", { required: true }),
      T("conversionLabel"),
      T("customParamsFormat", { enum: ["NONE", "USER_SPECIFIED", "DATA_LAYER"] }),
      L("customParams"),
      B("enableDynamicRemarketing"),
      B("enableConversionLinker"),
      T("conversionCookiePrefix"),
      B("rdp"),
      T("eventName"),
      T("eventValue"),
      L("eventItems"),
    ],
  },
  {
    type: "gclidw",
    name: "Conversion Linker",
    contexts: WEB,
    params: [
      B("enableCrossDomain"),
      B("enableUrlPassthrough"),
      B("enableCookieOverrides"),
      T("cookieDomain"),
      T("cookiePrefix"),
      T("cookieExpiration"),
      T("cookieNamePrefix"),
      L("linkerDomains"),
      B("acceptIncoming"),
      B("decorateForms"),
      B("urlPosition"),
    ],
  },
  {
    type: "flc",
    name: "Floodlight Counter",
    contexts: WEB,
    params: [
      T("advertiserId", { required: true }),
      T("groupTag", { required: true }),
      T("activityTag", { required: true }),
      T("ordinalType", { required: true, enum: ["STANDARD", "UNIQUE", "SESSION"] }),
      T("ordinalStandard"),
      T("ordinalSession"),
      B("useDcCustomParams"),
      L("dcCustomParams"),
      B("enableConversionLinker"),
      T("conversionCookiePrefix"),
      B("useImageTag"),
      B("rdp"),
    ],
  },
  {
    type: "fls",
    name: "Floodlight Sales",
    contexts: WEB,
    params: [
      T("advertiserId", { required: true }),
      T("groupTag", { required: true }),
      T("activityTag", { required: true }),
      T("revenue", { required: true }),
      T("orderId", { required: true }),
      T("countingMethod", { enum: ["TRANSACTIONS", "ITEMS_SOLD"] }),
      T("quantity"),
      B("useDcCustomParams"),
      L("dcCustomParams"),
      B("enableConversionLinker"),
      T("conversionCookiePrefix"),
      B("useImageTag"),
      B("rdp"),
    ],
  },
  {
    type: "ua",
    name: "Google Analytics: Universal Analytics (legacy)",
    contexts: WEB,
    params: [
      T("trackType", {
        enum: [
          "TRACK_PAGEVIEW",
          "TRACK_EVENT",
          "TRACK_SOCIAL",
          "TRACK_TRANSACTION",
          "TRACK_TIMING",
          "DECORATE_LINK",
          "DECORATE_FORM",
        ],
      }),
      T("gaSettings", {
        description: "Reference to a Google Analytics Settings variable, e.g. {{GA Settings}}",
      }),
      B("overrideGaSettings"),
      T("trackingId"),
      T("eventCategory"),
      T("eventAction"),
      T("eventLabel"),
      T("eventValue"),
      B("nonInteraction"),
      L("fieldsToSet"),
      L("dimension"),
      L("metric"),
    ],
    note: "Universal Analytics has been shut down; prefer GA4 (googtag / gaawe).",
  },
  {
    type: "dest_aw",
    name: "Google Ads (Google tag destination)",
    contexts: WEB,
    params: [
      T("destinationId", { required: true, description: "Destination ID, e.g. AW-123456789" }),
    ],
  },
  { type: "cl", name: "Click Listener (legacy)", contexts: WEB, params: [] },
  { type: "fsl", name: "Form Submit Listener (legacy)", contexts: WEB, params: [] },
  {
    type: "baut",
    name: "Microsoft Advertising UET",
    contexts: WEB,
    params: [T("uetqName", { required: true }), T("tagId"), T("eventType")],
  },
  { type: "bzi", name: "LinkedIn Insight", contexts: WEB, params: [T("id")] },
  {
    type: "crto",
    name: "Criteo OneTag",
    contexts: WEB,
    params: [T("accountId", { required: true })],
  },
  {
    type: "hjtc",
    name: "Hotjar Tracking Code",
    contexts: WEB,
    params: [T("hotjar_site_id", { required: true })],
  },
  { type: "ta", name: "Tapad", contexts: WEB, params: [T("subscriberId", { required: true })] },
  {
    type: "twitter_website_tag",
    name: "Twitter Website Tag",
    contexts: WEB,
    params: [T("twitter_pixel_id", { required: true }), T("event_type", { required: true })],
  },
  { type: "pntr", name: "Pinterest Tag", contexts: WEB, params: [T("tagId", { required: true })] },
  {
    type: "ll",
    name: "Lytics",
    contexts: WEB,
    params: [T("trackingAccountId", { required: true })],
  },
  { type: "mf", name: "Mouseflow", contexts: WEB, params: [T("projectId", { required: true })] },
  {
    type: "cegg",
    name: "Crazy Egg",
    contexts: WEB,
    params: [T("usersNumericId", { required: true })],
  },
  { type: "qpx", name: "Quora Pixel", contexts: WEB, params: [T("pixel_id", { required: true })] },
  // Server-side tags
  {
    type: "sgtmgaaw",
    name: "Google Analytics: GA4",
    contexts: SERVER,
    params: [
      T("measurementId", { description: "Override Measurement ID (G-XXXXXXX)" }),
      B("redactVisitorIp"),
      T("epToIncludeDropdown", { enum: ["all", "none", "specific"] }),
      T("upToIncludeDropdown", { enum: ["all", "none", "specific"] }),
      L("epToInclude"),
      L("upToInclude"),
      L("epToExclude"),
      L("upToExclude"),
      B("enableGoogleSignals"),
      B("enableEuid"),
      T("serverManagedCookiesDropdown"),
    ],
  },
  {
    type: "sgtmadsct",
    name: "Google Ads Conversion Tracking",
    contexts: SERVER,
    params: [
      T("conversionId", { required: true }),
      T("conversionLabel", { required: true }),
      T("conversionValue"),
      T("currencyCode"),
      T("orderId"),
      B("enableConversionLinker"),
      B("enableNewCustomerReporting"),
      B("enableProductReporting"),
      B("rdp"),
      T("userDataVariable"),
    ],
  },
  {
    type: "sgtmadsremarket",
    name: "Google Ads Remarketing",
    contexts: SERVER,
    params: [
      T("conversionId", { required: true }),
      T("conversionLabel"),
      B("enableConversionLinker"),
      B("rdp"),
    ],
  },
  {
    type: "sgtmflc",
    name: "Floodlight Counter",
    contexts: SERVER,
    params: [
      T("advertiserId", { required: true }),
      T("groupTag", { required: true }),
      T("activityTag", { required: true }),
      T("ordinalType", { required: true, enum: ["STANDARD", "UNIQUE", "SESSION"] }),
    ],
  },
  {
    type: "sgtmfls",
    name: "Floodlight Sales",
    contexts: SERVER,
    params: [
      T("advertiserId", { required: true }),
      T("groupTag", { required: true }),
      T("activityTag", { required: true }),
      T("revenue"),
      T("orderId"),
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------------------------

export const VARIABLE_TYPES: TypeSpec[] = [
  {
    type: "c",
    name: "Constant",
    contexts: ["web", "server", "other"],
    complete: true,
    params: [T("value", { required: true })],
  },
  {
    type: "v",
    name: "Data Layer Variable",
    contexts: WEB,
    complete: true,
    params: [
      T("name", { required: true, description: "Data layer key, e.g. ecommerce.value" }),
      I("dataLayerVersion", { enum: ["1", "2"] }),
      B("setDefaultValue"),
      T("defaultValue"),
    ],
  },
  {
    type: "jsm",
    name: "Custom JavaScript",
    contexts: WEB,
    complete: true,
    params: [
      T("javascript", {
        required: true,
        description: "An anonymous function: function() { return ...; }",
      }),
    ],
  },
  {
    type: "u",
    name: "URL",
    contexts: WEB,
    complete: true,
    params: [
      T("component", {
        enum: ["URL", "PROTOCOL", "HOST", "PORT", "PATH", "EXTENSION", "QUERY", "FRAGMENT"],
      }),
      T("queryKey"),
      B("stripWww"),
      T("customUrlSource"),
      B("isUrlProvided"),
    ],
  },
  {
    type: "k",
    name: "1st-Party Cookie",
    contexts: WEB,
    complete: true,
    params: [T("name", { required: true }), B("decodeCookie")],
  },
  {
    type: "j",
    name: "JavaScript Variable",
    contexts: WEB,
    complete: true,
    params: [
      T("name", { required: true, description: "Global variable name, e.g. document.title" }),
    ],
  },
  {
    type: "d",
    name: "DOM Element",
    contexts: WEB,
    complete: true,
    params: [
      T("selectorType", { enum: ["ID", "CSS"] }),
      T("elementId"),
      T("elementSelector"),
      T("attributeName"),
    ],
  },
  { type: "e", name: "Custom Event", contexts: WEB, complete: true, params: [] },
  {
    type: "f",
    name: "HTTP Referrer",
    contexts: WEB,
    complete: true,
    params: [
      T("component", {
        enum: ["URL", "PROTOCOL", "HOST", "PORT", "PATH", "EXTENSION", "QUERY", "FRAGMENT"],
      }),
      T("queryKey"),
      B("stripWww"),
    ],
  },
  {
    type: "r",
    name: "Random Number",
    contexts: ["web", "server", "other"],
    complete: true,
    params: [],
  },
  {
    type: "ctv",
    name: "Container Version Number",
    contexts: ["web", "server", "other"],
    complete: true,
    params: [],
  },
  {
    type: "cid",
    name: "Container ID",
    contexts: ["web", "server", "other"],
    complete: true,
    params: [],
  },
  {
    type: "dbg",
    name: "Debug Mode",
    contexts: ["web", "server", "other"],
    complete: true,
    params: [],
  },
  {
    type: "uv",
    name: "Undefined Value",
    contexts: ["web", "server", "other"],
    complete: true,
    params: [],
  },
  {
    type: "smm",
    name: "Lookup Table",
    contexts: ["web", "server", "other"],
    complete: true,
    params: [
      T("input", { description: "Input variable, e.g. {{Page Hostname}}" }),
      L("map", { description: "List of maps with keys key / value" }),
      B("setDefaultValue"),
      T("defaultValue"),
    ],
  },
  {
    type: "remm",
    name: "RegEx Table",
    contexts: ["web", "server", "other"],
    complete: true,
    params: [
      T("input"),
      L("map", { description: "List of maps with keys key / value" }),
      B("fullMatch"),
      B("replaceAfterMatch"),
      B("ignoreCase"),
      B("setDefaultValue"),
      T("defaultValue"),
    ],
  },
  {
    type: "aev",
    name: "Auto-Event Variable",
    contexts: WEB,
    params: [
      T("varType", {
        enum: [
          "ELEMENT",
          "TAG_NAME",
          "ATTRIBUTE",
          "CLASSES",
          "ID",
          "TARGET",
          "TEXT",
          "URL",
          "HISTORY_NEW_URL_FRAGMENT",
          "HISTORY_OLD_URL_FRAGMENT",
          "HISTORY_NEW_STATE",
          "HISTORY_OLD_STATE",
          "HISTORY_CHANGE_SOURCE",
        ],
      }),
      T("attribute"),
      T("component"),
      T("queryKey"),
      B("stripWww"),
      B("setDefaultValue"),
      T("defaultValue"),
    ],
  },
  {
    type: "vis",
    name: "Element Visibility",
    contexts: WEB,
    params: [
      T("selectorType", { enum: ["ID", "CSS"] }),
      T("elementId"),
      T("elementSelector"),
      T("outputMethod", { enum: ["BOOLEAN", "PERCENT", "TIME"] }),
      T("onScreenRatio"),
    ],
  },
  {
    type: "gtes",
    name: "Google Tag: Event Settings",
    contexts: WEB,
    complete: true,
    params: [
      L("eventSettingsTable", { description: "List of maps with keys parameter / parameterValue" }),
      L("userProperties", { description: "List of maps with keys name / value" }),
    ],
  },
  {
    type: "gtcs",
    name: "Google Tag: Configuration Settings",
    contexts: WEB,
    complete: true,
    params: [
      L("configSettingsTable", {
        description: "List of maps with keys parameter / parameterValue",
      }),
    ],
  },
  {
    type: "awec",
    name: "User-Provided Data",
    contexts: WEB,
    params: [
      T("mode", { enum: ["CODE", "MANUAL", "AUTO"] }),
      T("dataLayerVariable"),
      T("email"),
      T("phone_number"),
      T("first_name"),
      T("last_name"),
      T("street"),
      T("city"),
      T("region"),
      T("postal_code"),
      T("country"),
      B("enableElementBlocking"),
      B("enableAutoEmail"),
      B("enableAutoPhone"),
      B("enableAutoAddress"),
    ],
  },
  {
    type: "gas",
    name: "Google Analytics Settings (legacy)",
    contexts: WEB,
    params: [T("trackingId", { required: true }), T("cookieDomain"), L("fieldsToSet")],
  },
  // Server-side variables
  {
    type: "ed",
    name: "Event Data",
    contexts: SERVER,
    complete: true,
    params: [
      T("keyPath", { required: true, description: "Event data key path, e.g. items.0.item_id" }),
      B("setDefaultValue"),
      T("defaultValue"),
    ],
  },
  {
    type: "qp",
    name: "Query Parameter",
    contexts: SERVER,
    complete: true,
    params: [T("queryParamName", { required: true })],
  },
  {
    type: "rh",
    name: "Request Header",
    contexts: SERVER,
    complete: true,
    params: [T("headerName", { required: true })],
  },
  { type: "rp", name: "Request Path (user-defined)", contexts: SERVER, params: [] },
  { type: "rm", name: "Request Method (user-defined)", contexts: SERVER, params: [] },
];

// ---------------------------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------------------------

export interface TriggerTypeSpec {
  type: string;
  name: string;
  contexts: UsageContext[];
  /** Entity-level fields (besides name/type/notes/parentFolderId/filter) that apply to this type */
  fields: string[];
  /** Whether `parameter` is used */
  usesParameter?: boolean;
  /** Known parameter keys when usesParameter */
  params?: ParamSpec[];
}

const AUTO_EVENT_FIELDS = [
  "autoEventFilter",
  "waitForTags",
  "checkValidation",
  "waitForTagsTimeout",
  "uniqueTriggerId",
];

export const TRIGGER_TYPE_SPECS: TriggerTypeSpec[] = [
  { type: "pageview", name: "Page View", contexts: WEB, fields: [] },
  { type: "domReady", name: "DOM Ready", contexts: WEB, fields: [] },
  { type: "windowLoaded", name: "Window Loaded", contexts: WEB, fields: [] },
  { type: "init", name: "Initialization", contexts: WEB, fields: [] },
  { type: "consentInit", name: "Consent Initialization", contexts: WEB, fields: [] },
  {
    type: "customEvent",
    name: "Custom Event",
    contexts: ["web", "server", "other"],
    fields: ["customEventFilter"],
  },
  { type: "click", name: "Click - All Elements", contexts: WEB, fields: [] },
  { type: "linkClick", name: "Click - Just Links", contexts: WEB, fields: AUTO_EVENT_FIELDS },
  { type: "formSubmission", name: "Form Submission", contexts: WEB, fields: AUTO_EVENT_FIELDS },
  { type: "historyChange", name: "History Change", contexts: WEB, fields: [] },
  { type: "jsError", name: "JavaScript Error", contexts: WEB, fields: [] },
  {
    type: "timer",
    name: "Timer",
    contexts: WEB,
    fields: ["eventName", "interval", "limit", "autoEventFilter", "uniqueTriggerId"],
  },
  {
    type: "scrollDepth",
    name: "Scroll Depth",
    contexts: WEB,
    fields: ["uniqueTriggerId"],
    usesParameter: true,
    params: [
      B("verticalThresholdOn"),
      T("verticalThresholdUnits", { enum: ["PERCENT", "PIXELS"] }),
      T("verticalThresholdsPercent", {
        description: "Comma separated percentages, e.g. 25,50,75,100",
      }),
      T("verticalThresholdsPixels"),
      B("horizontalThresholdOn"),
      T("horizontalThresholdUnits", { enum: ["PERCENT", "PIXELS"] }),
      T("horizontalThresholdsPercent"),
      T("horizontalThresholdsPixels"),
      T("triggerStartOption", { enum: ["WINDOW_LOAD", "DOM_READY", "CONTAINER_LOADING"] }),
    ],
  },
  {
    type: "elementVisibility",
    name: "Element Visibility",
    contexts: WEB,
    fields: ["uniqueTriggerId"],
    usesParameter: true,
    params: [
      T("selectorType", { enum: ["ID", "CSS"] }),
      T("elementId"),
      T("elementSelector"),
      T("firingFrequency", { enum: ["ONCE", "ONCE_PER_ELEMENT", "MANY_PER_ELEMENT"] }),
      T("onScreenRatio"),
      B("useOnScreenDuration"),
      T("onScreenDuration"),
      B("useDomChangeListener"),
    ],
  },
  {
    type: "youTubeVideo",
    name: "YouTube Video",
    contexts: WEB,
    fields: ["uniqueTriggerId"],
    usesParameter: true,
    params: [
      B("captureStart"),
      B("captureComplete"),
      B("capturePause"),
      B("captureProgress"),
      T("radioButtonGroup1", { enum: ["PERCENTAGE", "TIME"] }),
      T("progressThresholdsPercent"),
      T("progressThresholdsTimeInSeconds"),
      B("fixMissingApi"),
      T("triggerStartOption", { enum: ["WINDOW_LOAD", "DOM_READY", "CONTAINER_LOADING"] }),
    ],
  },
  {
    type: "triggerGroup",
    name: "Trigger Group",
    contexts: WEB,
    fields: ["uniqueTriggerId"],
    usesParameter: true,
    params: [
      L("triggerIds", { required: true, description: "List of triggerReference parameters" }),
    ],
  },
  // Server
  { type: "always", name: "Custom", contexts: SERVER, fields: [] },
  { type: "serverPageview", name: "Page View", contexts: SERVER, fields: [] },
];

// ---------------------------------------------------------------------------------------------
// Clients (server containers)
// ---------------------------------------------------------------------------------------------

export const CLIENT_TYPES: TypeSpec[] = [
  {
    type: "gaaw_client",
    name: "Google Analytics: GA4",
    contexts: SERVER,
    params: [
      B("activateGtagSupport"),
      L("gtagMeasurementIds", { description: "List of maps with key measurementId" }),
      B("activateDefaultPaths"),
      B("activateDependencyServing"),
      B("activateGeoResolution"),
      B("activateResponseCompression"),
      T("cookieManagement", { enum: ["js", "server"] }),
      T("cookieName"),
      T("cookieDomain"),
      T("cookiePath"),
      T("cookieMaxAgeInSec"),
      B("migrateFromJsClientId"),
      T("region"),
      B("useHttpOnlyCookie"),
    ],
  },
  {
    type: "gtm_client",
    name: "Google Tag Manager: Web Container",
    contexts: SERVER,
    params: [
      L("allowedContainerIds", {
        required: true,
        description: "List of maps with key containerId (GTM-XXXXXXX)",
      }),
      B("activateDependencyServing"),
      B("activateGeoResolution"),
      B("activateResponseCompression"),
      T("region"),
    ],
  },
  { type: "ua_client", name: "Universal Analytics (legacy)", contexts: SERVER, params: [] },
];

// ---------------------------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------------------------

export function findTagType(type: string): TypeSpec | undefined {
  return TAG_TYPES.find((t) => t.type === type);
}
export function findVariableType(type: string): TypeSpec | undefined {
  return VARIABLE_TYPES.find((t) => t.type === type);
}
export function findTriggerType(type: string): TriggerTypeSpec | undefined {
  return TRIGGER_TYPE_SPECS.find((t) => t.type === type);
}
export function findClientType(type: string): TypeSpec | undefined {
  return CLIENT_TYPES.find((t) => t.type === type);
}

/** Is this a custom template type id (cvt_<galleryId> or cvt_<containerId>_<templateId>)? */
export function isCustomTemplateType(type: string): boolean {
  return /^cvt_/.test(type);
}

export function typesForContext(specs: TypeSpec[], context: UsageContext): TypeSpec[] {
  return specs.filter((s) => s.contexts.includes(context));
}

export function triggerTypesForContext(context: UsageContext): TriggerTypeSpec[] {
  return TRIGGER_TYPE_SPECS.filter((s) => s.contexts.includes(context));
}
