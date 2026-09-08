/**
 * Service Account authentication
 *
 * Supports service account key file (--service-account flag or GOOGLE_APPLICATION_CREDENTIALS env)
 */

import { google } from "googleapis";
import { OAUTH_SCOPES } from "../config/constants.ts";
import { ensureDir } from "@std/fs";
import { getConfigDir } from "../config/constants.ts";
import { loadCredentials } from "./credentials.ts";

/**
 * Google credential key file structure (supports service_account, impersonated_service_account, external_account)
 */
export interface AnyGoogleCredentialKey {
  type: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
  service_account_impersonation_url?: string;
  source_credentials?: Record<string, unknown>;
  audience?: string;
  token_url?: string;
  credential_source?: unknown;
  [key: string]: unknown;
}

/**
 * Stored auth method configuration
 */
export interface AuthMethodConfig {
  method: "oauth" | "service-account";
  serviceAccountPath?: string;
  serviceAccountEmail?: string;
}

const AUTH_METHOD_PATH = `${getConfigDir()}/auth-method.json`;

/**
 * Save the current auth method configuration
 */
export async function saveAuthMethod(config: AuthMethodConfig): Promise<void> {
  const configDir = getConfigDir();
  await ensureDir(configDir);
  await Deno.writeTextFile(AUTH_METHOD_PATH, JSON.stringify(config, null, 2));
}

/**
 * Load the current auth method configuration
 */
export async function loadAuthMethod(): Promise<AuthMethodConfig | null> {
  try {
    const content = await Deno.readTextFile(AUTH_METHOD_PATH);
    return JSON.parse(content) as AuthMethodConfig;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }
}

/**
 * Clear the auth method configuration
 */
export async function clearAuthMethod(): Promise<void> {
  try {
    await Deno.remove(AUTH_METHOD_PATH);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

/**
 * Helper to extract the service account or target principal email from key file data
 */
export function extractPrincipalEmail(key: Record<string, unknown>): string | undefined {
  if (typeof key.client_email === "string" && key.client_email) {
    return key.client_email;
  }
  if (typeof key.service_account_impersonation_url === "string") {
    const match = key.service_account_impersonation_url.match(/\/serviceAccounts\/([^:/]+)/);
    if (match) return match[1];
  }
  if (key.source_credentials && typeof key.source_credentials === "object") {
    const src = key.source_credentials as Record<string, unknown>;
    if (typeof src.account === "string" && src.account) {
      return src.account;
    }
  }
  return undefined;
}

/**
 * Auto-detect standard gcloud Application Default Credentials file
 */
export function getStandardAdcPath(): string | null {
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (!home) return null;
  const adcPath = Deno.build.os === "windows"
    ? `${Deno.env.get("APPDATA") || home}/gcloud/application_default_credentials.json`
    : `${home}/.config/gcloud/application_default_credentials.json`;
  try {
    const stat = Deno.statSync(adcPath);
    return stat.isFile ? adcPath : null;
  } catch {
    return null;
  }
}

export interface CredentialSummary {
  type: string;
  typeDescription: string;
  targetPrincipal?: string;
  keyPath: string;
}

/**
 * Parse a credential file to provide a user-friendly summary
 */
export async function getCredentialSummary(filePath: string): Promise<CredentialSummary> {
  try {
    const content = await Deno.readTextFile(filePath);
    const data = JSON.parse(content);
    const email = extractPrincipalEmail(data);
    let typeDescription = "Service Account";
    if (data.type === "impersonated_service_account") {
      typeDescription = "Impersonated Service Account";
    } else if (data.type === "external_account") {
      typeDescription = "Workload Identity Federation";
    } else if (data.type === "authorized_user") {
      typeDescription = "Authorized User (ADC)";
    }
    return {
      type: data.type || "unknown",
      typeDescription,
      targetPrincipal: email,
      keyPath: filePath,
    };
  } catch {
    return {
      type: "unknown",
      typeDescription: "Service Account",
      keyPath: filePath,
    };
  }
}

/**
 * Validate a service account key file (supports service_account, impersonated_service_account, external_account)
 */
export async function validateServiceAccountKey(
  keyPath: string
): Promise<AnyGoogleCredentialKey> {
  try {
    const content = await Deno.readTextFile(keyPath);
    const key = JSON.parse(content);

    if (key.type === "service_account") {
      if (!key.private_key || !key.client_email) {
        throw new Error("Invalid service account key: missing private_key or client_email");
      }
    } else if (key.type === "impersonated_service_account") {
      if (!key.service_account_impersonation_url) {
        throw new Error("Invalid impersonated key: missing service_account_impersonation_url");
      }
    } else if (key.type === "external_account") {
      if (!key.audience || !key.token_url) {
        throw new Error("Invalid external account key: missing audience or token_url");
      }
    } else {
      throw new Error(
        `Invalid key file: unsupported type '${key.type}'. Supported types: service_account, impersonated_service_account, external_account`
      );
    }

    return key as AnyGoogleCredentialKey;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Service account key file not found: ${keyPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in service account key file: ${keyPath}`);
    }
    throw error;
  }
}

/**
 * Login with a service account, impersonated, or external account key file
 */
export async function loginWithServiceAccount(
  keyPath: string
): Promise<{ email: string; type: string }> {
  // Validate the key file
  const key = await validateServiceAccountKey(keyPath);

  // Test authentication by creating a client
  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: OAUTH_SCOPES,
  });

  // Test getting an access token
  const client = await auth.getClient();
  await client.getAccessToken();

  // Extract principal email
  // deno-lint-ignore no-explicit-any
  const targetPrincipal = (client as any).targetPrincipal;
  const email = extractPrincipalEmail(key as Record<string, unknown>) ||
    targetPrincipal ||
    "service-account";

  // Save auth method configuration
  await saveAuthMethod({
    method: "service-account",
    serviceAccountPath: keyPath,
    serviceAccountEmail: email,
  });

  return { email, type: key.type };
}

/**
 * Get an access token from service account or ADC based on the current auth method
 * Returns null if OAuth should be used instead
 */
export async function getServiceAccountAccessToken(): Promise<{
  accessToken: string;
  method: AuthMethodConfig["method"];
} | null> {
  // 1. Check for GOOGLE_APPLICATION_CREDENTIALS env var first
  const envKeyPath = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS");
  if (envKeyPath) {
    const auth = new google.auth.GoogleAuth({
      keyFile: envKeyPath,
      scopes: OAUTH_SCOPES,
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error("Failed to get access token from service account");
    }
    return { accessToken: tokenResponse.token, method: "service-account" };
  }

  // 2. Check saved auth method
  const authMethod = await loadAuthMethod();

  if (authMethod) {
    if (authMethod.method === "oauth") {
      // User explicitly selected OAuth
      return null;
    }

    if (authMethod.method === "service-account") {
      if (!authMethod.serviceAccountPath) {
        throw new Error("Service account path not configured");
      }
      await validateServiceAccountKey(authMethod.serviceAccountPath);
      const auth = new google.auth.GoogleAuth({
        keyFile: authMethod.serviceAccountPath,
        scopes: OAUTH_SCOPES,
      });
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      if (!tokenResponse.token) {
        throw new Error("Failed to get access token from service account");
      }
      return { accessToken: tokenResponse.token, method: "service-account" };
    }
  }

  // 3. Check if user has saved OAuth credentials
  const oauthCreds = await loadCredentials();
  if (oauthCreds) {
    return null;
  }

  // 4. Fallback to standard Application Default Credentials (ADC) if available
  const adcPath = getStandardAdcPath();
  if (adcPath) {
    const auth = new google.auth.GoogleAuth({
      keyFile: adcPath,
      scopes: OAUTH_SCOPES,
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error("Failed to get access token from Application Default Credentials");
    }
    return { accessToken: tokenResponse.token, method: "service-account" };
  }

  return null;
}
