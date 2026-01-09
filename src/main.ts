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
} from "./commands/mod.ts";
import { printBanner } from "./utils/mod.ts";

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
  // Global options
  .globalOption("-q, --quiet", "Suppress non-essential output")
  .globalOption("--no-color", "Disable colored output")
  // Default action shows banner and help
  .action(function (options) {
    if (!options.quiet) {
      printBanner(options.color !== false);
    }
    this.showHelp();
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
  .command("user-permissions", userPermissionsCommand);

// Run CLI
if (import.meta.main) {
  await main.parse(Deno.args);
}

export { main };
