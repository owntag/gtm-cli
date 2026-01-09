/**
 * GTM CLI - Command-line interface for Google Tag Manager
 *
 * A full-featured CLI tool for managing Google Tag Manager resources.
 * Supports all GTM API operations including tags, triggers, variables,
 * containers, workspaces, and more.
 */

import { Command } from "@cliffy/command";
import { APP_DESCRIPTION, APP_NAME, APP_VERSION } from "./config/constants.ts";
import {
  authCommand,
  configCommand,
  accountsCommand,
  containersCommand,
  workspacesCommand,
  tagsCommand,
  triggersCommand,
  variablesCommand,
  foldersCommand,
  versionsCommand,
  versionHeadersCommand,
  environmentsCommand,
  builtInVariablesCommand,
  clientsCommand,
  templatesCommand,
  transformationsCommand,
  zonesCommand,
  destinationsCommand,
  gtagConfigsCommand,
  userPermissionsCommand,
  upgradeCommand,
  agentCommand,
} from "./commands/mod.ts";
import { printBanner, checkForUpdate } from "./utils/mod.ts";

// ANSI colors
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/**
 * Show update hint if a new version is available
 * Runs asynchronously to not block startup
 */
async function showUpdateHint(quiet: boolean): Promise<void> {
  if (quiet) return;

  try {
    const { updateAvailable, latestVersion, currentVersion } = await checkForUpdate();

    if (updateAvailable && latestVersion) {
      console.log("");
      console.log(`${YELLOW}💡 Update available: ${latestVersion} (current: ${currentVersion})${RESET}`);
      console.log(`   Run ${CYAN}gtm upgrade${RESET} to update.`);
      console.log("");
    }
  } catch {
    // Silently ignore update check failures
  }
}

// Create main command
const main = new Command()
  .name(APP_NAME)
  .version(APP_VERSION)
  .description(APP_DESCRIPTION)
  .meta("Author", "owntag GmbH")
  .meta("License", "MIT")
  .example("Login to GTM", "gtm auth login")
  .example("List accounts", "gtm accounts list")
  .example("List containers", "gtm containers list --account-id 123456")
  .example("List tags", "gtm tags list --account-id 123 --container-id 456 --workspace-id 1")
  .example("Create tag", "gtm tags create --name 'My Tag' --type html --config '{...}'")
  .example("Setup defaults", "gtm config setup")
  .example("Publish version", "gtm versions publish --version-id 42")
  .example("Upgrade CLI", "gtm upgrade")
  .example("AI agent guide", "gtm agent guide")
  // Global options
  .globalOption("-q, --quiet", "Suppress non-essential output")
  .globalOption("--no-color", "Disable colored output")
  // Default action shows banner and help
  .action(function (options) {
    if (!options.quiet) {
      printBanner(options.color !== false);
    }
    this.showHelp();
    // Show AI agent hint
    console.log("");
    console.log(`${DIM}🤖 AI/LLM agents: Run ${RESET}${CYAN}gtm agent guide${RESET}${DIM} for a comprehensive usage guide.${RESET}`);
    console.log("");
  })
  // Authentication commands
  .command("auth", authCommand)
  // Configuration commands
  .command("config", configCommand)
  // Account commands
  .command("accounts", accountsCommand)
  // Container commands
  .command("containers", containersCommand)
  // Workspace commands
  .command("workspaces", workspacesCommand)
  // Tag commands
  .command("tags", tagsCommand)
  // Trigger commands
  .command("triggers", triggersCommand)
  // Variable commands
  .command("variables", variablesCommand)
  // Folder commands
  .command("folders", foldersCommand)
  // Version commands
  .command("versions", versionsCommand)
  // Version header commands
  .command("version-headers", versionHeadersCommand)
  // Environment commands
  .command("environments", environmentsCommand)
  // Built-in variable commands
  .command("built-in-variables", builtInVariablesCommand)
  // Client commands (sGTM)
  .command("clients", clientsCommand)
  // Template commands
  .command("templates", templatesCommand)
  // Transformation commands
  .command("transformations", transformationsCommand)
  // Zone commands
  .command("zones", zonesCommand)
  // Destination commands
  .command("destinations", destinationsCommand)
  // Gtag config commands
  .command("gtag-configs", gtagConfigsCommand)
  // User permission commands
  .command("user-permissions", userPermissionsCommand)
  // Upgrade command
  .command("upgrade", upgradeCommand)
  // Agent resources (for AI/LLM integration)
  .command("agent", agentCommand);

// Run CLI
if (import.meta.main) {
  // Parse args to get quiet flag for update hint
  const quietFlag = Deno.args.includes("-q") || Deno.args.includes("--quiet");
  const isUpgradeCommand = Deno.args.includes("upgrade");

  await main.parse(Deno.args);

  // Show update hint after command completes (unless it's the upgrade command itself)
  if (!isUpgradeCommand) {
    await showUpdateHint(quietFlag);
  }
}

export { main };
