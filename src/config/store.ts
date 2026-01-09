/**
 * Configuration store for user preferences and defaults
 */

import { ensureDir } from "@std/fs";
import { getConfigDir, getConfigPath } from "./constants.ts";

export interface UserConfig {
  // Default IDs to use when not specified
  defaultAccountId?: string;
  defaultContainerId?: string;
  defaultWorkspaceId?: string;

  // Output preferences
  outputFormat?: "json" | "table" | "compact";

  // Last used values (for convenience)
  lastAccountId?: string;
  lastContainerId?: string;
  lastWorkspaceId?: string;
}

const DEFAULT_CONFIG: UserConfig = {
  outputFormat: "table",
};

let cachedConfig: UserConfig | null = null;

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  const configDir = getConfigDir();
  await ensureDir(configDir);
}

/**
 * Load user configuration from disk
 */
export async function loadConfig(): Promise<UserConfig> {
  if (cachedConfig !== null) {
    return cachedConfig!;
  }

  const configPath = getConfigPath();

  try {
    const content = await Deno.readTextFile(configPath);
    cachedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    return cachedConfig!;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig!;
    }
    throw error;
  }
}

/**
 * Save user configuration to disk
 */
export async function saveConfig(config: UserConfig): Promise<void> {
  await ensureConfigDir();
  const configPath = getConfigPath();
  await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
  cachedConfig = config;
}

/**
 * Update specific configuration values
 */
export async function updateConfig(updates: Partial<UserConfig>): Promise<UserConfig> {
  const current = await loadConfig();
  const updated = { ...current, ...updates };
  await saveConfig(updated);
  return updated;
}

/**
 * Get a specific configuration value
 */
export async function getConfigValue<K extends keyof UserConfig>(
  key: K
): Promise<UserConfig[K] | undefined> {
  const config = await loadConfig();
  return config[key];
}

/**
 * Set a specific configuration value
 */
export async function setConfigValue<K extends keyof UserConfig>(
  key: K,
  value: UserConfig[K]
): Promise<void> {
  await updateConfig({ [key]: value });
}

/**
 * Remove a specific configuration value
 */
export async function unsetConfigValue<K extends keyof UserConfig>(key: K): Promise<void> {
  const config = await loadConfig();
  delete config[key];
  await saveConfig(config);
}

/**
 * Clear all configuration
 */
export async function clearConfig(): Promise<void> {
  await saveConfig({ ...DEFAULT_CONFIG });
}

/**
 * Get effective value for an option (CLI flag > config default > undefined)
 */
export async function getEffectiveValue(
  cliValue: string | undefined,
  configKey: keyof UserConfig
): Promise<string | undefined> {
  if (cliValue) {
    return cliValue;
  }
  const config = await loadConfig();
  return config[configKey] as string | undefined;
}
