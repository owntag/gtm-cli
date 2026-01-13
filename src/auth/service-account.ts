/**
 * Service Account authentication
 *
 * Supports service account key file (--service-account flag or GOOGLE_APPLICATION_CREDENTIALS env)
 */

import { google } from "googleapis";
import { OAUTH_SCOPES } from "../config/constants.ts";
import { ensureDir } from "@std/fs";
import { getConfigDir } from "../config/constants.ts";

/**
 * Service account key file structure
 */
interface ServiceAccountKey {
  type: "service_account";
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
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
 * Validate a service account key file
 */
export async function validateServiceAccountKey(
  keyPath: string
): Promise<ServiceAccountKey> {
  try {
    const content = await Deno.readTextFile(keyPath);
    const key = JSON.parse(content);

    if (key.type !== "service_account") {
      throw new Error("Invalid key file: not a service account key");
    }

    if (!key.private_key || !key.client_email) {
      throw new Error("Invalid key file: missing required fields");
    }

    return key as ServiceAccountKey;
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
 * Login with a service account key file
 */
export async function loginWithServiceAccount(
  keyPath: string
): Promise<{ email: string }> {
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

  // Save auth method configuration
  await saveAuthMethod({
    method: "service-account",
    serviceAccountPath: keyPath,
    serviceAccountEmail: key.client_email,
  });

  return { email: key.client_email };
}

/**
 * Get an access token from service account based on the current auth method
 * Returns null if OAuth should be used instead
 */
export async function getServiceAccountAccessToken(): Promise<{
  accessToken: string;
  method: AuthMethodConfig["method"];
} | null> {
  // Check for GOOGLE_APPLICATION_CREDENTIALS env var first
  const envKeyPath = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS");
  if (envKeyPath) {
    await validateServiceAccountKey(envKeyPath);
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

  // Check saved auth method
  const authMethod = await loadAuthMethod();

  if (!authMethod || authMethod.method === "oauth") {
    // No auth method configured or OAuth, return null
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

  return null;
}
