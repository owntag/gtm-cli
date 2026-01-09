/**
 * Variable commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, Variable } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const variablesCommand = new Command()
  .name("variables")
  .description("Manage GTM variables")
  .action(function () {
    this.showHelp();
  })
  // List variables
  .command("list")
  .description("List all variables in a workspace")
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

      const variables = await paginateAll<Variable>(
        (pageToken) =>
          tagmanager.accounts.containers.workspaces.variables.list({
            parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
            pageToken,
          }),
        "variable"
      );

      output(variables, options.output as OutputFormat, {
        columns: ["variableId", "name", "type", "fingerprint"],
        headers: ["Variable ID", "Name", "Type", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get variable
  .command("get")
  .description("Get details for a specific variable")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--variable-id <id:string>", "GTM Variable ID", { required: true })
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
      const response = await tagmanager.accounts.containers.workspaces.variables.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables/${options.variableId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create variable
  .command("create")
  .description("Create a new variable")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-n, --name <name:string>", "Variable name", { required: true })
  .option("--type <type:string>", "Variable type", { required: true })
  .option("--config <config:string>", "Variable configuration as JSON")
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

      const requestBody: Record<string, unknown> = {
        name: options.name,
        type: options.type,
      };

      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }

      const response = await tagmanager.accounts.containers.workspaces.variables.create({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        requestBody,
      });

      success(`Variable created: ${response.data.variableId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update variable
  .command("update")
  .description("Update a variable")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--variable-id <id:string>", "GTM Variable ID", { required: true })
  .option("-n, --name <name:string>", "New variable name")
  .option("--config <config:string>", "Variable configuration as JSON (merged with existing)")
  .option("--fingerprint <fingerprint:string>", "Variable fingerprint for concurrency control")
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

      // Get current variable
      const current = await tagmanager.accounts.containers.workspaces.variables.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables/${options.variableId}`,
      });

      const requestBody: Record<string, unknown> = {};

      if (options.name) {
        requestBody.name = options.name;
      }
      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }

      const response = await tagmanager.accounts.containers.workspaces.variables.update({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables/${options.variableId}`,
        fingerprint: options.fingerprint || current.data.fingerprint || undefined,
        requestBody,
      });

      success("Variable updated successfully");
      output(response.data!, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete variable
  .command("delete")
  .description("Delete a variable")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--variable-id <id:string>", "GTM Variable ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      if (!options.force) {
        console.log("Warning: This will delete the variable from the workspace.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.workspaces.variables.delete({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables/${options.variableId}`,
      });

      success(`Variable ${options.variableId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  })
  // Revert variable
  .command("revert")
  .description("Revert changes to a variable in the workspace")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--variable-id <id:string>", "GTM Variable ID", { required: true })
  .option("--fingerprint <fingerprint:string>", "Variable fingerprint for concurrency control")
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
      const response = await tagmanager.accounts.containers.workspaces.variables.revert({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/variables/${options.variableId}`,
        fingerprint: options.fingerprint,
      });

      success("Variable reverted successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
