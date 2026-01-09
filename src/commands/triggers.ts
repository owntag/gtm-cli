/**
 * Trigger commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, Trigger } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const triggersCommand = new Command()
  .name("triggers")
  .description("Manage GTM triggers")
  .action(function () {
    this.showHelp();
  })
  // List triggers
  .command("list")
  .description("List all triggers in a workspace")
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

      const triggers = await paginateAll<Trigger>(
        (pageToken) =>
          tagmanager.accounts.containers.workspaces.triggers.list({
            parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
            pageToken,
          }),
        "trigger"
      );

      output(triggers, options.output as OutputFormat, {
        columns: ["triggerId", "name", "type", "fingerprint"],
        headers: ["Trigger ID", "Name", "Type", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get trigger
  .command("get")
  .description("Get details for a specific trigger")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--trigger-id <id:string>", "GTM Trigger ID", { required: true })
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
      const response = await tagmanager.accounts.containers.workspaces.triggers.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers/${options.triggerId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create trigger
  .command("create")
  .description("Create a new trigger")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-n, --name <name:string>", "Trigger name", { required: true })
  .option("--type <type:string>", "Trigger type", { required: true })
  .option("--config <config:string>", "Trigger configuration as JSON")
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

      const response = await tagmanager.accounts.containers.workspaces.triggers.create({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        requestBody,
      });

      success(`Trigger created: ${response.data.triggerId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update trigger
  .command("update")
  .description("Update a trigger")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--trigger-id <id:string>", "GTM Trigger ID", { required: true })
  .option("-n, --name <name:string>", "New trigger name")
  .option("--config <config:string>", "Trigger configuration as JSON (merged with existing)")
  .option("--fingerprint <fingerprint:string>", "Trigger fingerprint for concurrency control")
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

      // Get current trigger
      const current = await tagmanager.accounts.containers.workspaces.triggers.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers/${options.triggerId}`,
      });

      const requestBody: Record<string, unknown> = {};

      if (options.name) {
        requestBody.name = options.name;
      }
      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }

      const response = await tagmanager.accounts.containers.workspaces.triggers.update({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers/${options.triggerId}`,
        fingerprint: options.fingerprint || current.data.fingerprint || undefined,
        requestBody,
      });

      success("Trigger updated successfully");
      output(response.data!, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete trigger
  .command("delete")
  .description("Delete a trigger")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--trigger-id <id:string>", "GTM Trigger ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      if (!options.force) {
        console.log("Warning: This will delete the trigger from the workspace.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.workspaces.triggers.delete({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers/${options.triggerId}`,
      });

      success(`Trigger ${options.triggerId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  })
  // Revert trigger
  .command("revert")
  .description("Revert changes to a trigger in the workspace")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--trigger-id <id:string>", "GTM Trigger ID", { required: true })
  .option("--fingerprint <fingerprint:string>", "Trigger fingerprint for concurrency control")
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
      const response = await tagmanager.accounts.containers.workspaces.triggers.revert({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/triggers/${options.triggerId}`,
        fingerprint: options.fingerprint,
      });

      success("Trigger reverted successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
