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
  getCredentialSummary,
  getStandardAdcPath,
  loadAuthMethod,
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
  .action(async (options) => {
    try {
      // Service account authentication
      if (options.serviceAccount) {
        info(`Authenticating with credential key: ${options.serviceAccount}`);
        const result = await loginWithServiceAccount(options.serviceAccount);
        success(`Successfully authenticated as ${result.email} (${result.type})`);
        info("Credentials are now active.");
        info("Note: Service account uses your own GCP project's API quotas.");
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
        // Clear service account configuration
        await clearAuthMethod();
        if (authMethod.method === "service-account") {
          success(`Cleared service account configuration (${authMethod.serviceAccountEmail})`);
          info("Note: The service account key file was not deleted.");
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
        const summary = await getCredentialSummary(envKeyPath);
        const statusData = {
          authenticated: true,
          method: summary.typeDescription,
          targetPrincipal: summary.targetPrincipal,
          source: "GOOGLE_APPLICATION_CREDENTIALS",
          keyPath: envKeyPath,
        };

        if (options.output === "json") {
          output(statusData, "json");
        } else {
          success("Authenticated via environment variable");
          console.log(`  Method: ${summary.typeDescription}`);
          if (summary.targetPrincipal) {
            console.log(`  Target: ${summary.targetPrincipal}`);
          }
          console.log(`  Key file: ${envKeyPath}`);
          console.log(`  Source: GOOGLE_APPLICATION_CREDENTIALS`);
          warn("Environment variable takes precedence over other auth methods.");
        }
        return;
      }

      // Check saved auth method
      if (authMethod && authMethod.method !== "oauth") {
        let summary = null;
        if (authMethod.serviceAccountPath) {
          summary = await getCredentialSummary(authMethod.serviceAccountPath);
        }
        const target = authMethod.serviceAccountEmail || summary?.targetPrincipal;
        const methodDesc = summary?.typeDescription || "Service Account";
        const statusData = {
          authenticated: true,
          method: methodDesc,
          targetPrincipal: target,
          ...(authMethod.serviceAccountPath && {
            keyPath: authMethod.serviceAccountPath,
          }),
        };

        if (options.output === "json") {
          output(statusData, "json");
        } else {
          success("Authenticated");
          console.log(`  Method: ${methodDesc}`);
          if (target) {
            console.log(`  Target: ${target}`);
          }
          if (authMethod.serviceAccountPath) {
            console.log(`  Key file: ${authMethod.serviceAccountPath}`);
          }
        }
        return;
      }

      // Check OAuth status
      const oauthStatus = await getAuthStatus();

      if (oauthStatus.authenticated) {
        if (options.output === "json") {
          output({ ...oauthStatus, method: "oauth" }, "json");
        } else {
          success("Authenticated");
          console.log(`  Method: OAuth 2.0`);
          console.log(`  Email: ${oauthStatus.email}`);
          console.log(`  Name: ${oauthStatus.name}`);
          console.log(`  Token expires: ${oauthStatus.expiresAt?.toLocaleString()}`);
          if (oauthStatus.needsRefresh) {
            info("Token will be refreshed on next request.");
          }
        }
        return;
      }

      // Check for standard ADC if no saved OAuth credentials
      const adcPath = getStandardAdcPath();
      if (adcPath) {
        const summary = await getCredentialSummary(adcPath);
        const statusData = {
          authenticated: true,
          method: summary.typeDescription,
          targetPrincipal: summary.targetPrincipal,
          source: "Application Default Credentials (ADC)",
          keyPath: adcPath,
        };

        if (options.output === "json") {
          output(statusData, "json");
        } else {
          success("Authenticated via Application Default Credentials (ADC)");
          console.log(`  Method: ${summary.typeDescription}`);
          if (summary.targetPrincipal) {
            console.log(`  Target: ${summary.targetPrincipal}`);
          }
          console.log(`  Key file: ${adcPath}`);
          console.log(`  Source: gcloud ADC`);
        }
        return;
      }

      // Not authenticated
      if (options.output === "json") {
        output({ authenticated: false }, "json");
      } else {
        info("Not authenticated. Run 'gtm auth login' to sign in.");
        console.log("");
        console.log("Authentication options:");
        console.log("  gtm auth login                          # OAuth (browser)");
        console.log("  gtm auth login --service-account <file> # Service account / Impersonation / WIF");
      }
    } catch (err) {
      error(
        `Failed to get status: ${err instanceof Error ? err.message : String(err)}`
      );
      Deno.exit(1);
    }
  });
