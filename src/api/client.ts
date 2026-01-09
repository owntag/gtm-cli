/**
 * Google Tag Manager API client wrapper
 */

import { google, type tagmanager_v2 } from "googleapis";
import { getAccessToken } from "../auth/oauth.ts";
import { getServiceAccountAccessToken } from "../auth/service-account.ts";

// Re-export useful types
export type TagManager = tagmanager_v2.Tagmanager;
export type Account = tagmanager_v2.Schema$Account;
export type Container = tagmanager_v2.Schema$Container;
export type Workspace = tagmanager_v2.Schema$Workspace;
export type Tag = tagmanager_v2.Schema$Tag;
export type Trigger = tagmanager_v2.Schema$Trigger;
export type Variable = tagmanager_v2.Schema$Variable;
export type Folder = tagmanager_v2.Schema$Folder;
export type ContainerVersion = tagmanager_v2.Schema$ContainerVersion;
export type ContainerVersionHeader = tagmanager_v2.Schema$ContainerVersionHeader;
export type Environment = tagmanager_v2.Schema$Environment;
export type BuiltInVariable = tagmanager_v2.Schema$BuiltInVariable;
export type Client = tagmanager_v2.Schema$Client;
export type CustomTemplate = tagmanager_v2.Schema$CustomTemplate;
export type Transformation = tagmanager_v2.Schema$Transformation;
export type Zone = tagmanager_v2.Schema$Zone;
export type Destination = tagmanager_v2.Schema$Destination;
export type GtagConfig = tagmanager_v2.Schema$GtagConfig;
export type UserPermission = tagmanager_v2.Schema$UserPermission;

// Cached client instance
let cachedClient: TagManager | null = null;
let lastAccessToken: string | null = null;

/**
 * Get an authenticated Tag Manager API client
 * Supports OAuth, Service Account, and ADC authentication
 */
export async function getTagManagerClient(): Promise<TagManager> {
  // Try service account or ADC first
  const saToken = await getServiceAccountAccessToken();
  
  if (saToken) {
    // Return cached client if token hasn't changed
    if (cachedClient && lastAccessToken === saToken.accessToken) {
      return cachedClient;
    }
    
    cachedClient = google.tagmanager({
      version: "v2",
      headers: {
        Authorization: `Bearer ${saToken.accessToken}`,
      },
    });
    lastAccessToken = saToken.accessToken;
    return cachedClient;
  }

  // Fall back to OAuth
  const accessToken = await getAccessToken();

  // Return cached client if token hasn't changed
  if (cachedClient && lastAccessToken === accessToken) {
    return cachedClient;
  }

  cachedClient = google.tagmanager({
    version: "v2",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  lastAccessToken = accessToken;
  return cachedClient;
}

/**
 * Helper to build parent path for GTM API
 */
export function buildPath(parts: {
  accountId?: string;
  containerId?: string;
  workspaceId?: string;
  tagId?: string;
  triggerId?: string;
  variableId?: string;
  folderId?: string;
  versionId?: string;
  environmentId?: string;
  clientId?: string;
  templateId?: string;
  transformationId?: string;
  zoneId?: string;
  destinationId?: string;
  gtagConfigId?: string;
}): string {
  let path = "";

  if (parts.accountId) {
    path += `accounts/${parts.accountId}`;
  }
  if (parts.containerId) {
    path += `/containers/${parts.containerId}`;
  }
  if (parts.workspaceId) {
    path += `/workspaces/${parts.workspaceId}`;
  }
  if (parts.tagId) {
    path += `/tags/${parts.tagId}`;
  }
  if (parts.triggerId) {
    path += `/triggers/${parts.triggerId}`;
  }
  if (parts.variableId) {
    path += `/variables/${parts.variableId}`;
  }
  if (parts.folderId) {
    path += `/folders/${parts.folderId}`;
  }
  if (parts.versionId) {
    path += `/versions/${parts.versionId}`;
  }
  if (parts.environmentId) {
    path += `/environments/${parts.environmentId}`;
  }
  if (parts.clientId) {
    path += `/clients/${parts.clientId}`;
  }
  if (parts.templateId) {
    path += `/templates/${parts.templateId}`;
  }
  if (parts.transformationId) {
    path += `/transformations/${parts.transformationId}`;
  }
  if (parts.zoneId) {
    path += `/zones/${parts.zoneId}`;
  }
  if (parts.destinationId) {
    path += `/destinations/${parts.destinationId}`;
  }
  if (parts.gtagConfigId) {
    path += `/gtag_config/${parts.gtagConfigId}`;
  }

  return path;
}

/**
 * Helper to build parent path for create operations
 */
export function buildParent(parts: {
  accountId?: string;
  containerId?: string;
  workspaceId?: string;
}): string {
  return buildPath(parts);
}

/**
 * Paginate through all results from a GTM API list operation
 */
export async function paginateAll<T>(
  // deno-lint-ignore no-explicit-any
  listFn: (pageToken?: string) => Promise<{ data: any }>,
  resultKey: string
): Promise<T[]> {
  const allResults: T[] = [];
  let pageToken: string | undefined;

  do {
    const response = await listFn(pageToken);
    const items = response.data[resultKey] as T[] | undefined;

    if (items) {
      allResults.push(...items);
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return allResults;
}
