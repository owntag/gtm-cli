/**
 * Local workspaces: registry of GTM entity kinds.
 *
 * Every workspace-scoped GTM resource type that can live in a local workspace is described here
 * once, so that pull/push/diff/validate and the CLI commands can be written generically.
 */

export type EntityKind =
  | "tag"
  | "trigger"
  | "variable"
  | "folder"
  | "template"
  | "client"
  | "transformation"
  | "zone"
  | "gtagConfig";

export type UsageContext = "web" | "server" | "other";

export interface KindSpec {
  kind: EntityKind;
  /** Human label, singular / plural */
  label: string;
  labelPlural: string;
  /** Directory inside the local workspace that holds one JSON file per entity */
  dir: string;
  /** CLI sub-command name (gtm local <command> ...) */
  command: string;
  /** Property holding the entity ID (e.g. "tagId") */
  idField: string;
  /** Key of the entity array in `versions.live` / container export JSON */
  versionKey: string;
  /** Key of the entity array in the API list response */
  listKey: string;
  /** Name of the resource on the googleapis workspaces client (e.g. tagmanager.accounts.containers.workspaces.tags) */
  apiResource:
    | "tags"
    | "triggers"
    | "variables"
    | "folders"
    | "templates"
    | "clients"
    | "transformations"
    | "zones"
    | "gtag_config";
  /** Whether entities of this kind have a `type` property */
  hasType: boolean;
  /** Container feature flag that must be true for the kind to exist in a container */
  feature: string;
  /** Usage contexts in which the kind exists at all */
  contexts: UsageContext[];
}

export const KINDS: Record<EntityKind, KindSpec> = {
  folder: {
    kind: "folder",
    label: "folder",
    labelPlural: "folders",
    dir: "folders",
    command: "folders",
    idField: "folderId",
    versionKey: "folder",
    listKey: "folder",
    apiResource: "folders",
    hasType: false,
    feature: "supportFolders",
    contexts: ["web", "server", "other"],
  },
  template: {
    kind: "template",
    label: "template",
    labelPlural: "templates",
    dir: "templates",
    command: "templates",
    idField: "templateId",
    versionKey: "customTemplate",
    listKey: "template",
    apiResource: "templates",
    hasType: false,
    feature: "supportTemplates",
    contexts: ["web", "server", "other"],
  },
  variable: {
    kind: "variable",
    label: "variable",
    labelPlural: "variables",
    dir: "variables",
    command: "variables",
    idField: "variableId",
    versionKey: "variable",
    listKey: "variable",
    apiResource: "variables",
    hasType: true,
    feature: "supportVariables",
    contexts: ["web", "server", "other"],
  },
  trigger: {
    kind: "trigger",
    label: "trigger",
    labelPlural: "triggers",
    dir: "triggers",
    command: "triggers",
    idField: "triggerId",
    versionKey: "trigger",
    listKey: "trigger",
    apiResource: "triggers",
    hasType: true,
    feature: "supportTriggers",
    contexts: ["web", "server", "other"],
  },
  client: {
    kind: "client",
    label: "client",
    labelPlural: "clients",
    dir: "clients",
    command: "clients",
    idField: "clientId",
    versionKey: "client",
    listKey: "client",
    apiResource: "clients",
    hasType: true,
    feature: "supportClients",
    contexts: ["server"],
  },
  transformation: {
    kind: "transformation",
    label: "transformation",
    labelPlural: "transformations",
    dir: "transformations",
    command: "transformations",
    idField: "transformationId",
    versionKey: "transformation",
    listKey: "transformation",
    apiResource: "transformations",
    hasType: true,
    feature: "supportTransformations",
    contexts: ["server"],
  },
  tag: {
    kind: "tag",
    label: "tag",
    labelPlural: "tags",
    dir: "tags",
    command: "tags",
    idField: "tagId",
    versionKey: "tag",
    listKey: "tag",
    apiResource: "tags",
    hasType: true,
    feature: "supportTags",
    contexts: ["web", "server", "other"],
  },
  zone: {
    kind: "zone",
    label: "zone",
    labelPlural: "zones",
    dir: "zones",
    command: "zones",
    idField: "zoneId",
    versionKey: "zone",
    listKey: "zone",
    apiResource: "zones",
    hasType: false,
    feature: "supportZones",
    contexts: ["web", "other"],
  },
  gtagConfig: {
    kind: "gtagConfig",
    label: "Google tag config",
    labelPlural: "Google tag configs",
    dir: "gtag-configs",
    command: "gtag-configs",
    idField: "gtagConfigId",
    versionKey: "gtagConfig",
    listKey: "gtagConfig",
    apiResource: "gtag_config",
    hasType: true,
    feature: "supportGtagConfigs",
    contexts: ["web", "other"],
  },
};

/**
 * Order in which kinds must be created/updated so that references resolve
 * (folders before everything, triggers before tags, tags before zones ...).
 * Deletions run in reverse.
 */
export const KIND_ORDER: EntityKind[] = [
  "folder",
  "template",
  "trigger",
  "variable",
  "client",
  "transformation",
  "tag",
  "zone",
  "gtagConfig",
];

export const ALL_KINDS: EntityKind[] = KIND_ORDER;

/** Fields that the API manages and that are never stored in local entity files */
export const READ_ONLY_FIELDS = [
  "path",
  "accountId",
  "containerId",
  "workspaceId",
  "fingerprint",
  "tagManagerUrl",
];

/** File name for the enabled built-in variables list */
export const BUILT_IN_VARIABLES_FILE = "built-in-variables.json";
/** Workspace metadata file name (marks a directory as a local workspace) */
export const WORKSPACE_FILE = "gtm-workspace.json";
/** Hidden directory for machine-managed snapshots */
export const SNAPSHOT_DIR = ".gtm";
export const BASE_SNAPSHOT_FILE = "base.json";
export const LIVE_SNAPSHOT_FILE = "live.json";
export const FORMAT_VERSION = 1;

export function kindFromDir(dir: string): KindSpec | undefined {
  return Object.values(KINDS).find((k) => k.dir === dir);
}

export function kindFromCommand(command: string): KindSpec | undefined {
  return Object.values(KINDS).find((k) => k.command === command);
}

/**
 * Derive the usage context from a container's usageContext array.
 */
export function usageContextOf(usageContext: string[] | undefined): UsageContext {
  if (!usageContext || usageContext.length === 0) return "other";
  if (usageContext.includes("server")) return "server";
  if (usageContext.includes("web")) return "web";
  return "other";
}

/**
 * Kinds that a given container supports, derived from its feature flags
 * (falls back to context-based defaults when features are missing).
 */
export function supportedKinds(
  features: Record<string, boolean> | undefined,
  context: UsageContext,
): KindSpec[] {
  return KIND_ORDER.map((k) => KINDS[k]).filter((spec) => {
    if (features && typeof features[spec.feature] === "boolean") {
      return features[spec.feature];
    }
    return spec.contexts.includes(context);
  });
}
