/**
 * Credential storage and management
 * Handles storing and retrieving OAuth tokens locally
 */

import { ensureDir } from "@std/fs";
import { getConfigDir, getCredentialsPath } from "../config/constants.ts";

export interface StoredCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  tokenType: string;
  scope: string;
  userEmail?: string;
  userName?: string;
  userId?: string;
}

/**
 * Ensure the config directory exists
 */
async function ensureCredentialsDir(): Promise<void> {
  const configDir = getConfigDir();
  await ensureDir(configDir);
}

/**
 * Save credentials to disk
 */
export async function saveCredentials(credentials: StoredCredentials): Promise<void> {
  await ensureCredentialsDir();
  const credentialsPath = getCredentialsPath();
  await Deno.writeTextFile(credentialsPath, JSON.stringify(credentials, null, 2));

  // Set restrictive permissions on Unix systems
  if (Deno.build.os !== "windows") {
    await Deno.chmod(credentialsPath, 0o600);
  }
}

/**
 * Load credentials from disk
 */
export async function loadCredentials(): Promise<StoredCredentials | null> {
  const credentialsPath = getCredentialsPath();

  try {
    const content = await Deno.readTextFile(credentialsPath);
    return JSON.parse(content) as StoredCredentials;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete stored credentials
 */
export async function deleteCredentials(): Promise<void> {
  const credentialsPath = getCredentialsPath();

  try {
    await Deno.remove(credentialsPath);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw error;
    }
  }
}

/**
 * Check if credentials exist
 */
export async function hasCredentials(): Promise<boolean> {
  const credentials = await loadCredentials();
  return credentials !== null;
}

/**
 * Check if credentials are expired
 */
export function isExpired(credentials: StoredCredentials): boolean {
  // Add a 5-minute buffer to avoid edge cases
  const buffer = 5 * 60 * 1000;
  return Date.now() >= credentials.expiresAt - buffer;
}

/**
 * Check if credentials need refresh (expired or about to expire)
 */
export function needsRefresh(credentials: StoredCredentials): boolean {
  // Refresh if within 10 minutes of expiration
  const buffer = 10 * 60 * 1000;
  return Date.now() >= credentials.expiresAt - buffer;
}
