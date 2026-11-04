/**
 * Local workspaces: built-in variables.
 *
 * Type -> display name mapping and per-context availability, verified against the GTM API
 * (the API rejects enabling a type that the container type does not support).
 */

import type { UsageContext } from "../kinds.ts";

/** Built-in variables available in web containers (type -> display name) */
export const WEB_BUILT_IN_VARIABLES: Record<string, string> = {
  pageUrl: "Page URL",
  pageHostname: "Page Hostname",
  pagePath: "Page Path",
  referrer: "Referrer",
  event: "Event",
  clickElement: "Click Element",
  clickClasses: "Click Classes",
  clickId: "Click ID",
  clickTarget: "Click Target",
  clickUrl: "Click URL",
  clickText: "Click Text",
  formElement: "Form Element",
  formClasses: "Form Classes",
  formId: "Form ID",
  formTarget: "Form Target",
  formUrl: "Form URL",
  formText: "Form Text",
  errorMessage: "Error Message",
  errorUrl: "Error URL",
  errorLine: "Error Line",
  newHistoryFragment: "New History Fragment",
  oldHistoryFragment: "Old History Fragment",
  newHistoryState: "New History State",
  oldHistoryState: "Old History State",
  historySource: "History Source",
  containerVersion: "Container Version",
  debugMode: "Debug Mode",
  randomNumber: "Random Number",
  containerId: "Container ID",
  htmlId: "HTML ID",
  environmentName: "Environment Name",
  videoProvider: "Video Provider",
  videoUrl: "Video URL",
  videoTitle: "Video Title",
  videoDuration: "Video Duration",
  videoPercent: "Video Percent",
  videoVisible: "Video Visible",
  videoStatus: "Video Status",
  videoCurrentTime: "Video Current Time",
  scrollDepthThreshold: "Scroll Depth Threshold",
  scrollDepthUnits: "Scroll Depth Units",
  scrollDepthDirection: "Scroll Direction",
  elementVisibilityRatio: "Percent Visible",
  elementVisibilityTime: "On-Screen Duration",
  elementVisibilityFirstTime: "First Time Visible",
  elementVisibilityRecentTime: "Last Time Visible",
  analyticsClientId: "Analytics Client ID",
  analyticsSessionId: "Analytics Session ID",
  analyticsSessionNumber: "Analytics Session Number",
};

/** Built-in variables available in server containers */
export const SERVER_BUILT_IN_VARIABLES: Record<string, string> = {
  eventName: "Event Name",
  visitorRegion: "Visitor Region",
  containerVersion: "Container Version",
  debugMode: "Debug Mode",
  randomNumber: "Random Number",
  containerId: "Container ID",
  requestPath: "Request Path",
  requestMethod: "Request Method",
  clientName: "Client Name",
  queryString: "Query String",
};

/** Built-ins of mobile/AMP containers that the API knows about (names from GTM) */
export const OTHER_BUILT_IN_VARIABLES: Record<string, string> = {
  ...WEB_BUILT_IN_VARIABLES,
  firstPartyServingUrl: "First Party Serving URL",
  newHistoryUrl: "New History URL",
  oldHistoryUrl: "Old History URL",
  appId: "App ID",
  appName: "App Name",
  appVersionCode: "App Version Code",
  appVersionName: "App Version Name",
  language: "Language",
  osVersion: "OS Version",
  platform: "Platform",
  sdkVersion: "SDK Version",
  deviceName: "Device Name",
  resolution: "Resolution",
  advertiserId: "Advertiser ID",
  advertisingTrackingEnabled: "Advertising Tracking Enabled",
  ampBrowserLanguage: "Browser Language",
  ampCanonicalPath: "Canonical Path",
  ampCanonicalUrl: "Canonical URL",
  ampCanonicalHost: "Canonical Host",
  ampReferrer: "Referrer",
  ampTitle: "Title",
  ampClientId: "Client ID",
  ampClientTimezone: "Client Timezone",
  ampClientTimestamp: "Client Timestamp",
  ampClientScreenWidth: "Screen Width",
  ampClientScreenHeight: "Screen Height",
  ampClientScrollX: "Scroll Left",
  ampClientScrollY: "Scroll Top",
  ampClientMaxScrollX: "Scroll Width",
  ampClientMaxScrollY: "Scroll Height",
  ampTotalEngagedTime: "Total Engaged Time",
  ampPageViewId: "Page View ID",
  ampPageLoadTime: "Page Load Time",
  ampPageDownloadTime: "Page Download Time",
  ampGtmEvent: "AMP Event",
  eventName: "Event Name",
  serverPageLocationUrl: "Page Location URL",
  serverPageLocationPath: "Page Location Path",
  serverPageLocationHostname: "Page Location Hostname",
  requestPath: "Request Path",
  requestMethod: "Request Method",
  clientName: "Client Name",
  queryString: "Query String",
  visitorRegion: "Visitor Region",
};

export function builtInVariablesFor(context: UsageContext): Record<string, string> {
  switch (context) {
    case "web":
      return WEB_BUILT_IN_VARIABLES;
    case "server":
      return SERVER_BUILT_IN_VARIABLES;
    default:
      return OTHER_BUILT_IN_VARIABLES;
  }
}

/** Display name for a built-in variable type (any context) */
export function builtInVariableName(type: string): string | undefined {
  return WEB_BUILT_IN_VARIABLES[type] ?? SERVER_BUILT_IN_VARIABLES[type] ??
    OTHER_BUILT_IN_VARIABLES[type];
}

/** Built-in variable type for a display name, in the given context */
export function builtInVariableType(context: UsageContext, name: string): string | undefined {
  const table = builtInVariablesFor(context);
  const lower = name.trim().toLowerCase();
  for (const [type, display] of Object.entries(table)) {
    if (type.toLowerCase() === lower || display.toLowerCase() === lower) return type;
  }
  return undefined;
}

/** All built-in variable type identifiers known to the API */
export const ALL_BUILT_IN_VARIABLE_TYPES: string[] = Array.from(
  new Set([
    ...Object.keys(WEB_BUILT_IN_VARIABLES),
    ...Object.keys(SERVER_BUILT_IN_VARIABLES),
    ...Object.keys(OTHER_BUILT_IN_VARIABLES),
    ...[
      "firebaseEventParameterCampaign",
      "firebaseEventParameterCampaignAclid",
      "firebaseEventParameterCampaignAnid",
      "firebaseEventParameterCampaignClickTimestamp",
      "firebaseEventParameterCampaignContent",
      "firebaseEventParameterCampaignCp1",
      "firebaseEventParameterCampaignGclid",
      "firebaseEventParameterCampaignSource",
      "firebaseEventParameterCampaignTerm",
      "firebaseEventParameterCurrency",
      "firebaseEventParameterDynamicLinkAcceptTime",
      "firebaseEventParameterDynamicLinkLinkid",
      "firebaseEventParameterNotificationMessageDeviceTime",
      "firebaseEventParameterNotificationMessageId",
      "firebaseEventParameterNotificationMessageName",
      "firebaseEventParameterNotificationMessageTime",
      "firebaseEventParameterNotificationTopic",
      "firebaseEventParameterPreviousAppVersion",
      "firebaseEventParameterPreviousOsVersion",
      "firebaseEventParameterPrice",
      "firebaseEventParameterProductId",
      "firebaseEventParameterQuantity",
      "firebaseEventParameterValue",
    ],
  ]),
);
