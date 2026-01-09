/**
 * Update checker utility
 * Checks GitHub releases for new versions and caches results
 */

import { ensureDir } from "@std/fs";
import { getConfigDir, APP_VERSION } from "../config/constants.ts";

const GITHUB_REPO = "owntag/gtm-cli";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UpdateCheckCache {
  lastCheck: number;
  latestVersion: string | null;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
}

/**
 * Get the path to the update check cache file
 */
function getCachePath(): string {
  return `${getConfigDir()}/update-check.json`;
}

/**
 * Load the cached update check result
 */
async function loadCache(): Promise<UpdateCheckCache | null> {
  try {
    const content = await Deno.readTextFile(getCachePath());
    return JSON.parse(content) as UpdateCheckCache;
  } catch {
    return null;
  }
}

/**
 * Save the update check result to cache
 */
async function saveCache(cache: UpdateCheckCache): Promise<void> {
  try {
    await ensureDir(getConfigDir());
    await Deno.writeTextFile(getCachePath(), JSON.stringify(cache, null, 2));
  } catch {
    // Silently fail - caching is not critical
  }
}

/**
 * Fetch the latest release version from GitHub
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "gtm-cli",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const release = (await response.json()) as GitHubRelease;
    return release.tag_name;
  } catch {
    // Network error, timeout, etc. - fail silently
    return null;
  }
}

/**
 * Compare version strings (e.g., "v1.0.0" vs "v1.1.0")
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  // Remove 'v' prefix if present
  const cleanA = a.replace(/^v/, "");
  const cleanB = b.replace(/^v/, "");

  const partsA = cleanA.split(".").map(Number);
  const partsB = cleanB.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}

/**
 * Check if an update is available
 * Uses cache to avoid checking too frequently
 * Returns the latest version if an update is available, null otherwise
 */
export async function checkForUpdate(): Promise<{
  updateAvailable: boolean;
  latestVersion: string | null;
  currentVersion: string;
}> {
  const currentVersion = `v${APP_VERSION}`;
  const cache = await loadCache();
  const now = Date.now();

  // Use cached result if recent enough
  if (cache && now - cache.lastCheck < CHECK_INTERVAL_MS) {
    const updateAvailable =
      cache.latestVersion !== null &&
      compareVersions(currentVersion, cache.latestVersion) < 0;

    return {
      updateAvailable,
      latestVersion: cache.latestVersion,
      currentVersion,
    };
  }

  // Fetch fresh data
  const latestVersion = await fetchLatestVersion();

  // Save to cache
  await saveCache({
    lastCheck: now,
    latestVersion,
  });

  const updateAvailable =
    latestVersion !== null && compareVersions(currentVersion, latestVersion) < 0;

  return {
    updateAvailable,
    latestVersion,
    currentVersion,
  };
}

/**
 * Force check for update (bypasses cache)
 */
export async function forceCheckForUpdate(): Promise<{
  updateAvailable: boolean;
  latestVersion: string | null;
  currentVersion: string;
}> {
  const currentVersion = `v${APP_VERSION}`;
  const latestVersion = await fetchLatestVersion();

  // Save to cache
  await saveCache({
    lastCheck: Date.now(),
    latestVersion,
  });

  const updateAvailable =
    latestVersion !== null && compareVersions(currentVersion, latestVersion) < 0;

  return {
    updateAvailable,
    latestVersion,
    currentVersion,
  };
}

/**
 * Get the download URL for the current platform
 */
export function getDownloadUrl(version: string): string {
  const os = Deno.build.os === "darwin" ? "darwin" : "linux";
  const arch = Deno.build.arch === "aarch64" ? "arm64" : "x64";
  const binary = `gtm-${os}-${arch}`;

  return `https://github.com/${GITHUB_REPO}/releases/download/${version}/${binary}`;
}

/**
 * Get the current executable path
 */
export function getExecutablePath(): string {
  return Deno.execPath();
}
