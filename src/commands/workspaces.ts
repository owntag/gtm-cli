/**
 * Workspace commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, Workspace } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const workspacesCommand = new Command()
  .name("workspaces")
  .description("Manage GTM workspaces")
  .action(function () {
    this.showHelp();
  })
  // List workspaces
  .command("list")
  .description("List all workspaces in a container")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();

      const workspaces = await paginateAll<Workspace>(
        (pageToken) =>
          tagmanager.accounts.containers.workspaces.list({
            parent: `accounts/${accountId}/containers/${containerId}`,
            pageToken,
          }),
        "workspace"
      );

      output(workspaces, options.output as OutputFormat, {
        columns: ["workspaceId", "name", "description", "fingerprint"],
        headers: ["Workspace ID", "Name", "Description", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get workspace
  .command("get")
  .description("Get details for a specific workspace")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.workspaces.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${options.workspaceId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create workspace
  .command("create")
  .description("Create a new workspace")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-n, --name <name:string>", "Workspace name", { required: true })
  .option("-d, --description <description:string>", "Workspace description")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.workspaces.create({
        parent: `accounts/${accountId}/containers/${containerId}`,
        requestBody: {
          name: options.name,
          description: options.description,
        },
      });

      success(`Workspace created: ${response.data.workspaceId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update workspace
  .command("update")
  .description("Update a workspace")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID", { required: true })
  .option("-n, --name <name:string>", "New workspace name")
  .option("-d, --description <description:string>", "New workspace description")
  .option("--fingerprint <fingerprint:string>", "Workspace fingerprint for concurrency control")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();

      // Get current workspace to get fingerprint if not provided
      const current = await tagmanager.accounts.containers.workspaces.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${options.workspaceId}`,
      });

      const requestBody: Record<string, unknown> = {};
      if (options.name) {
        requestBody.name = options.name;
      }
      if (options.description !== undefined) {
        requestBody.description = options.description;
      }

      const response = await tagmanager.accounts.containers.workspaces.update({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${options.workspaceId}`,
        fingerprint: options.fingerprint || current.data.fingerprint || undefined,
        requestBody,
      });

      success("Workspace updated successfully");
      output(response.data!, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete workspace
  .command("delete")
  .description("Delete a workspace")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      if (!options.force) {
        console.log("Warning: This will permanently delete the workspace and all its changes.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.workspaces.delete({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${options.workspaceId}`,
      });

      success(`Workspace ${options.workspaceId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  })
  // Get workspace status
  .command("status")
  .description("Get the status of a workspace (pending changes)")
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
      const response = await tagmanager.accounts.containers.workspaces.getStatus({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Sync workspace
  .command("sync")
  .description("Sync a workspace to detect conflicts with the live container version")
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
      const response = await tagmanager.accounts.containers.workspaces.sync({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
      });

      success("Workspace synced successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Quick preview
  .command("preview")
  .description("Quick preview of workspace changes")
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
      const response = await tagmanager.accounts.containers.workspaces.quick_preview({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
