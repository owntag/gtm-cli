/**
 * Local workspaces: shared types.
 */

import type { EntityKind, UsageContext } from "./kinds.ts";

/** Any GTM workspace entity (tag, trigger, variable, ...) as a plain JSON object */
export type Entity = Record<string, unknown>;

export interface GtmParameter {
  type?: string;
  key?: string;
  value?: string;
  list?: GtmParameter[];
  map?: GtmParameter[];
  isWeakReference?: boolean;
}

export interface GtmCondition {
  type?: string;
  parameter?: GtmParameter[];
}

export interface BuiltInVariableEntry {
  type: string;
  name?: string;
}

/** Metadata stored in gtm-workspace.json */
export interface WorkspaceMeta {
  formatVersion: number;
  accountId: string;
  containerId: string;
  workspaceId: string;
  container: {
    name?: string;
    publicId?: string;
    usageContext?: string[];
    features?: Record<string, boolean>;
    domainName?: string[];
    taggingServerUrls?: string[];
    tagIds?: string[];
    fingerprint?: string;
  };
  workspace: {
    name?: string;
    description?: string;
  };
  /** ISO timestamp of the last pull/push that refreshed the base snapshot */
  pulledAt?: string;
  /** ISO timestamp of the last successful push */
  pushedAt?: string;
}

/** Snapshot of a remote state (workspace or live version) kept in .gtm/ */
export interface Snapshot {
  takenAt: string;
  /** For live snapshots: the version id/name */
  containerVersionId?: string;
  versionName?: string;
  /** Remote workspace fingerprint (for workspace snapshots) */
  workspaceFingerprint?: string;
  /** Entities by kind, exactly as returned by the API (with fingerprints) */
  entities: Partial<Record<EntityKind, Entity[]>>;
  builtInVariables: BuiltInVariableEntry[];
}

/** One entity file loaded from disk */
export interface LocalEntity {
  kind: EntityKind;
  /** Path relative to the workspace root, e.g. tags/ga4.purchase.json */
  file: string;
  /** Raw content as written in the file (may use simplified parameter notation) */
  raw: Entity;
  /** Canonical GTM API form (parameters normalized, enum casing fixed, read-only fields dropped) */
  entity: Entity;
  /** Parse error, when the file could not be read as JSON */
  parseError?: string;
}

/** Fully loaded local workspace */
export interface LocalWorkspace {
  /** Absolute path to the workspace directory */
  root: string;
  meta: WorkspaceMeta;
  context: UsageContext;
  entities: LocalEntity[];
  builtInVariables: BuiltInVariableEntry[];
  base?: Snapshot;
  live?: Snapshot;
}

export type Severity = "error" | "warning";

export interface ValidationIssue {
  severity: Severity;
  /** Stable machine-readable code, e.g. PARAM_BOOLEAN_VALUE */
  code: string;
  kind?: EntityKind | "builtInVariable" | "workspace";
  name?: string;
  id?: string;
  /** Workspace-relative file path */
  file?: string;
  /** JSON path inside the entity, e.g. parameter[eventName].value */
  path?: string;
  /** Plain-English description of what is wrong */
  message: string;
  /** Plain-English suggestion how to fix it */
  hint?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errors: number;
  warnings: number;
  ok: boolean;
}

export type ChangeType = "added" | "modified" | "deleted" | "unchanged";

export interface FieldChange {
  path: string;
  op: "added" | "removed" | "changed";
  before?: unknown;
  after?: unknown;
}

export interface EntityChange {
  kind: EntityKind | "builtInVariable";
  name: string;
  id?: string;
  type?: string;
  file?: string;
  change: ChangeType;
  fields?: FieldChange[];
  before?: Entity;
  after?: Entity;
}

export interface DiffResult {
  against: "remote" | "live";
  changes: EntityChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    unchanged: number;
    byKind: Record<string, { added: number; modified: number; deleted: number }>;
  };
}
