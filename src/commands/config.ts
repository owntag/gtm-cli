/**
 * Configuration commands
 */

import { Command } from "@cliffy/command";
import { Select, Confirm } from "@cliffy/prompt";
import {
  loadConfig,
  setConfigValue,
  unsetConfigValue,
  UserConfig,
} from "../config/store.ts";
import { getTagManagerClient } from "../api/mod.ts";
import { error, info, output, success } from "../utils/mod.ts";

type ConfigKey = keyof UserConfig;

const VALID_KEYS: ConfigKey[] = [
  "defaultAccountId",
  "defaultContainerId",
  "defaultWorkspaceId",
  "outputFormat",
];

export const configCommand = new Command()
  .name("config")
  .description("Manage GTM CLI configuration")
  .action(function () {
    this.showHelp();
  })
  // Get configuration value
  .command("get")
  .description("Get a configuration value")
  .arguments("[key:string]")
  .option("-o, --output <format:string>", "Output format (json, table)", { default: "table" })
  .action(async (options, key?: string) => {
    try {
      const config = await loadConfig();

      if (key) {
        if (!VALID_KEYS.includes(key as ConfigKey)) {
          error(`Invalid key: ${key}. Valid keys: ${VALID_KEYS.join(", ")}`);
          Deno.exit(1);
        }
        const value = config[key as ConfigKey];
        if (options.output === "json") {
          output({ [key]: value }, "json");
        } else {
          console.log(value !== undefined ? value : "(not set)");
        }
      } else {
        output(config, options.output as "json" | "table");
      }
    } catch (err) {
      error(`Failed to get config: ${err instanceof Error ? err.message : String(err)}`);
      Deno.exit(1);
    }
  })
  // Set configuration value
  .command("set")
  .description("Set a configuration value")
  .arguments("<key:string> <value:string>")
  .action(async (_options, key: string, value: string) => {
    try {
      if (!VALID_KEYS.includes(key as ConfigKey)) {
        error(`Invalid key: ${key}. Valid keys: ${VALID_KEYS.join(", ")}`);
        Deno.exit(1);
      }

      // Validate output format
      if (key === "outputFormat" && !["json", "table", "compact"].includes(value)) {
        error("outputFormat must be one of: json, table, compact");
        Deno.exit(1);
      }

      await setConfigValue(key as ConfigKey, value);
      success(`Set ${key} = ${value}`);
    } catch (err) {
      error(`Failed to set config: ${err instanceof Error ? err.message : String(err)}`);
      Deno.exit(1);
    }
  })
  // Unset configuration value
  .command("unset")
  .description("Remove a configuration value")
  .arguments("<key:string>")
  .action(async (_options, key: string) => {
    try {
      if (!VALID_KEYS.includes(key as ConfigKey)) {
        error(`Invalid key: ${key}. Valid keys: ${VALID_KEYS.join(", ")}`);
        Deno.exit(1);
      }

      await unsetConfigValue(key as ConfigKey);
      success(`Unset ${key}`);
    } catch (err) {
      error(`Failed to unset config: ${err instanceof Error ? err.message : String(err)}`);
      Deno.exit(1);
    }
  })
  // Interactive setup
  .command("setup")
  .description("Interactive setup for default container")
  .action(async () => {
    try {
      info("Setting up default container...\n");

      const tagmanager = await getTagManagerClient();

      // Fetch accounts
      info("Fetching your GTM accounts...");
      const accountsResponse = await tagmanager.accounts.list();
      const accounts = accountsResponse.data.account || [];

      if (accounts.length === 0) {
        error("No GTM accounts found. Please create a GTM account first.");
        Deno.exit(1);
      }

      // Select account
      const accountChoices = accounts.map((a) => ({
        name: `${a.name} (${a.accountId})`,
        value: a.accountId!,
      }));

      const selectedAccountId: string = await Select.prompt({
        message: "Select an account",
        options: accountChoices,
      });

      await setConfigValue("defaultAccountId", selectedAccountId);

      // Fetch containers
      info("Fetching containers...");
      const containersResponse = await tagmanager.accounts.containers.list({
        parent: `accounts/${selectedAccountId}`,
      });
      const containers = containersResponse.data.container || [];

      if (containers.length === 0) {
        info("No containers found in this account.");
        const continueSetup = await Confirm.prompt("Would you like to set up without a default container?");
        if (!continueSetup) {
          Deno.exit(0);
        }
        success("Default account set successfully!");
        return;
      }

      // Select container
      const containerChoices = containers.map((c) => ({
        name: `${c.name} - ${c.publicId} (${c.usageContext?.join(", ")})`,
        value: c.containerId!,
      }));

      const selectedContainerId: string = await Select.prompt({
        message: "Select a container",
        options: containerChoices,
      });

      await setConfigValue("defaultContainerId", selectedContainerId);

      // Fetch workspaces
      info("Fetching workspaces...");
      const workspacesResponse = await tagmanager.accounts.containers.workspaces.list({
        parent: `accounts/${selectedAccountId}/containers/${selectedContainerId}`,
      });
      const workspaces = workspacesResponse.data.workspace || [];

      if (workspaces.length > 0) {
        const setDefaultWorkspace = await Confirm.prompt("Would you like to set a default workspace?");

        if (setDefaultWorkspace) {
          const workspaceChoices = workspaces.map((w) => ({
            name: `${w.name} (${w.workspaceId})`,
            value: w.workspaceId!,
          }));

          const selectedWorkspaceId: string = await Select.prompt({
            message: "Select a workspace",
            options: workspaceChoices,
          });

          await setConfigValue("defaultWorkspaceId", selectedWorkspaceId);
        }
      }

      success("\nConfiguration complete!");
      info("You can now run commands without specifying --account-id and --container-id");
    } catch (err) {
      error(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
      Deno.exit(1);
    }
  });
