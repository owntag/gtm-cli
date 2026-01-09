/**
 * Application constants and embedded configuration
 *
 * For development: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables
 * For production: The CI build embeds credentials from GitHub secrets
 */

// OAuth 2.0 Client Credentials
// These identify the GTM CLI application to Google
// __OAUTH_CLIENT_ID__ and __OAUTH_CLIENT_SECRET__ are replaced during CI build
export const GOOGLE_CLIENT_ID =
  Deno.env.get("GOOGLE_CLIENT_ID") || "__OAUTH_CLIENT_ID__";

export const GOOGLE_CLIENT_SECRET =
  Deno.env.get("GOOGLE_CLIENT_SECRET") || "__OAUTH_CLIENT_SECRET__";

// OAuth configuration
export const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.manage.accounts",
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.delete.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.manage.users",
  "https://www.googleapis.com/auth/tagmanager.publish",
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// Local OAuth callback server
export const OAUTH_CALLBACK_PORT = 8085;
export const OAUTH_CALLBACK_PATH = "/callback";
export const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`;

// Google OAuth endpoints
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// Application info
export const APP_NAME = "gtm-cli";
export const APP_VERSION = "1.0.0";
export const APP_DESCRIPTION = "Command-line interface for Google Tag Manager";

// Configuration paths
export function getConfigDir(): string {
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
  const configDir = Deno.env.get("GTM_CLI_CONFIG_DIR");

  if (configDir) {
    return configDir;
  }

  // Use XDG_CONFIG_HOME on Linux/macOS if available
  const xdgConfig = Deno.env.get("XDG_CONFIG_HOME");
  if (xdgConfig) {
    return `${xdgConfig}/${APP_NAME}`;
  }

  // Default locations
  if (Deno.build.os === "windows") {
    const appData = Deno.env.get("APPDATA") || `${home}/AppData/Roaming`;
    return `${appData}/${APP_NAME}`;
  }

  return `${home}/.config/${APP_NAME}`;
}

export function getCredentialsPath(): string {
  return `${getConfigDir()}/credentials.json`;
}

export function getConfigPath(): string {
  return `${getConfigDir()}/config.json`;
}

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
