/**
 * Authentication commands
 */

import { Command } from "@cliffy/command";
import {
  getAuthStatus,
  login,
  logout,
} from "../auth/oauth.ts";
import {
  clearAuthMethod,
  isADCAvailable,
  loadAuthMethod,
  loginWithADC,
  loginWithServiceAccount,
} from "../auth/service-account.ts";
import { error, info, output, success, warn } from "../utils/mod.ts";

export const authCommand = new Command()
  .name("auth")
  .description("Manage authentication with Google Tag Manager")
  .action(function () {
    this.showHelp();
  })
  // Login command
  .command("login")
  .description("Authenticate with Google Tag Manager")
  .option(
    "-s, --service-account <path:string>",
    "Path to service account key JSON file"
  )
  .option("--adc", "Use Application Default Credentials (gcloud auth)")
  .action(async (options) => {
    try {
      // Service account authentication
      if (options.serviceAccount) {
        info(`Authenticating with service account key: ${options.serviceAccount}`);
        const result = await loginWithServiceAccount(options.serviceAccount);
        success(`Successfully authenticated as ${result.email}`);
        info("Service account credentials are now active.");
        info("Note: Service account uses your own GCP project's API quotas.");
        return;
      }

      // ADC authentication
      if (options.adc) {
        info("Checking for Application Default Credentials...");
        
        if (!(await isADCAvailable())) {
          error("No Application Default Credentials found.");
          info("");
          info("To set up ADC, run:");
          info("  gcloud auth application-default login");
          info("");
          info("Or set GOOGLE_APPLICATION_CREDENTIALS environment variable:");
          info("  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json");
          Deno.exit(1);
        }

        const result = await loginWithADC();
        success(`Successfully authenticated using ADC`);
        if (result.email !== "Application Default Credentials") {
          info(`  Service account: ${result.email}`);
        }
        info("ADC credentials are now active.");
        info("Note: ADC uses your own GCP project's API quotas.");
        return;
      }

      // OAuth authentication (default)
      const status = await getAuthStatus();

      if (status.authenticated) {
        info(`Already authenticated as ${status.email}`);
        info(
          "Run 'gtm auth logout' to sign out first, or use 'gtm auth status' to view details."
        );
        return;
      }

      const credentials = await login();
      success(`Successfully authenticated as ${credentials.userEmail}`);
      info("You can now use GTM CLI to manage your Tag Manager resources.");
    } catch (err) {
      error(
        `Authentication failed: ${err instanceof Error ? err.message : String(err)}`
      );
      Deno.exit(1);
    }
  })
  // Logout command
  .command("logout")
  .description("Sign out and revoke access tokens")
  .action(async () => {
    try {
      const authMethod = await loadAuthMethod();
      const oauthStatus = await getAuthStatus();

      if (!authMethod && !oauthStatus.authenticated) {
        info("Not currently authenticated.");
        return;
      }

      if (authMethod) {
        // Clear service account or ADC configuration
        await clearAuthMethod();
        if (authMethod.method === "service-account") {
          success(`Cleared service account configuration (${authMethod.serviceAccountEmail})`);
          info("Note: The service account key file was not deleted.");
        } else if (authMethod.method === "adc") {
          success("Cleared ADC configuration.");
          info("Note: gcloud credentials were not revoked. Run 'gcloud auth revoke' to do so.");
        }
      }

      if (oauthStatus.authenticated) {
        await logout();
        success("Successfully logged out from OAuth session.");
      }
    } catch (err) {
      error(
        `Logout failed: ${err instanceof Error ? err.message : String(err)}`
      );
      Deno.exit(1);
    }
  })
  // Status command
  .command("status")
  .description("Show current authentication status")
  .option("-o, --output <format:string>", "Output format (json, table)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const authMethod = await loadAuthMethod();
      const envKeyPath = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS");

      // Check for env var override
      if (envKeyPath) {
        const statusData = {
          authenticated: true,
          method: "service-account",
          source: "GOOGLE_APPLICATION_CREDENTIALS",
          keyPath: envKeyPath,
        };

        if (options.output === "json") {
          output(statusData, "json");
        } else {
          success("Authenticated via environment variable");
          console.log(`  Method: Service Account`);
          console.log(`  Key file: ${envKeyPath}`);
          console.log(`  Source: GOOGLE_APPLICATION_CREDENTIALS`);
          warn("Environment variable takes precedence over other auth methods.");
        }
        return;
      }

      // Check saved auth method
      if (authMethod && authMethod.method !== "oauth") {
        const statusData = {
          authenticated: true,
          method: authMethod.method,
          email: authMethod.serviceAccountEmail,
          ...(authMethod.serviceAccountPath && {
            keyPath: authMethod.serviceAccountPath,
          }),
        };

        if (options.output === "json") {
          output(statusData, "json");
        } else {
          success("Authenticated");
          console.log(
            `  Method: ${authMethod.method === "service-account" ? "Service Account" : "Application Default Credentials"}`
          );
          if (authMethod.serviceAccountEmail) {
            console.log(`  Account: ${authMethod.serviceAccountEmail}`);
          }
          if (authMethod.serviceAccountPath) {
            console.log(`  Key file: ${authMethod.serviceAccountPath}`);
          }
        }
        return;
      }

      // Fall back to OAuth status
      const status = await getAuthStatus();

      if (options.output === "json") {
        output({ ...status, method: "oauth" }, "json");
      } else {
        if (status.authenticated) {
          success("Authenticated");
          console.log(`  Method: OAuth 2.0`);
          console.log(`  Email: ${status.email}`);
          console.log(`  Name: ${status.name}`);
          console.log(`  Token expires: ${status.expiresAt?.toLocaleString()}`);
          if (status.needsRefresh) {
            info("Token will be refreshed on next request.");
          }
        } else {
          info("Not authenticated. Run 'gtm auth login' to sign in.");
          console.log("");
          console.log("Authentication options:");
          console.log("  gtm auth login                          # OAuth (browser)");
          console.log("  gtm auth login --service-account <file> # Service account");
          console.log("  gtm auth login --adc                    # Application Default Credentials");
        }
      }
    } catch (err) {
      error(
        `Failed to get status: ${err instanceof Error ? err.message : String(err)}`
      );
      Deno.exit(1);
    }
  });
