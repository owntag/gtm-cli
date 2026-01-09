/**
 * Built-in variable commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, BuiltInVariable } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const builtInVariablesCommand = new Command()
  .name("built-in-variables")
  .alias("biv")
  .description("Manage GTM built-in variables")
  .action(function () {
    this.showHelp();
  })
  // List built-in variables
  .command("list")
  .description("List all enabled built-in variables in a workspace")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      const tagmanager = await getTagManagerClient();

      const variables = await paginateAll<BuiltInVariable>(
        (pageToken) =>
          tagmanager.accounts.containers.workspaces.built_in_variables.list({
            parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
            pageToken,
          }),
        "builtInVariable"
      );

      output(variables, options.output as OutputFormat, {
        columns: ["type", "name"],
        headers: ["Type", "Name"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Enable built-in variables
  .command("enable")
  .description("Enable built-in variables by type")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--types <types:string>", "Comma-separated list of built-in variable types to enable", {
    required: true,
  })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      const types = options.types.split(",").map((t: string) => t.trim());

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.workspaces.built_in_variables.create({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        type: types,
      });

      success(`Enabled ${types.length} built-in variable(s)`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Disable built-in variables
  .command("disable")
  .description("Disable built-in variables by type")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--types <types:string>", "Comma-separated list of built-in variable types to disable", {
    required: true,
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      const types = options.types.split(",").map((t: string) => t.trim());

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.workspaces.built_in_variables.delete({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        type: types,
      });

      success(`Disabled ${types.length} built-in variable(s)`);
    } catch (err) {
      handleError(err);
    }
  })
  // Revert built-in variables
  .command("revert")
  .description("Revert changes to built-in variables")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--type <type:string>", "Built-in variable type to revert", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.workspaces.built_in_variables.revert({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        type: options.type,
      });

      success("Built-in variable reverted successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
