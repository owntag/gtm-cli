/**
 * Tag commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, Tag } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const tagsCommand = new Command()
  .name("tags")
  .description("Manage GTM tags")
  .action(function () {
    this.showHelp();
  })
  // List tags
  .command("list")
  .description("List all tags in a workspace")
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

      const tags = await paginateAll<Tag>(
        (pageToken) =>
          tagmanager.accounts.containers.workspaces.tags.list({
            parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
            pageToken,
          }),
        "tag"
      );

      output(tags, options.output as OutputFormat, {
        columns: ["tagId", "name", "type", "paused", "fingerprint"],
        headers: ["Tag ID", "Name", "Type", "Paused", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get tag
  .command("get")
  .description("Get details for a specific tag")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-t, --tag-id <id:string>", "GTM Tag ID", { required: true })
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
      const response = await tagmanager.accounts.containers.workspaces.tags.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags/${options.tagId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create tag
  .command("create")
  .description("Create a new tag")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-n, --name <name:string>", "Tag name", { required: true })
  .option("--type <type:string>", "Tag type", { required: true })
  .option("--config <config:string>", "Tag configuration as JSON")
  .option("--firing-trigger-id <ids:string>", "Comma-separated firing trigger IDs")
  .option("--blocking-trigger-id <ids:string>", "Comma-separated blocking trigger IDs")
  .option("--paused", "Create tag in paused state", { default: false })
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
        paused: options.paused,
      };

      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }

      if (options.firingTriggerId) {
        requestBody.firingTriggerId = options.firingTriggerId.split(",").map((id: string) => id.trim());
      }

      if (options.blockingTriggerId) {
        requestBody.blockingTriggerId = options.blockingTriggerId.split(",").map((id: string) => id.trim());
      }

      const response = await tagmanager.accounts.containers.workspaces.tags.create({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        requestBody,
      });

      success(`Tag created: ${response.data.tagId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update tag
  .command("update")
  .description("Update a tag")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-t, --tag-id <id:string>", "GTM Tag ID", { required: true })
  .option("-n, --name <name:string>", "New tag name")
  .option("--config <config:string>", "Tag configuration as JSON (merged with existing)")
  .option("--firing-trigger-id <ids:string>", "Comma-separated firing trigger IDs")
  .option("--blocking-trigger-id <ids:string>", "Comma-separated blocking trigger IDs")
  .option("--paused <paused:boolean>", "Set paused state")
  .option("--fingerprint <fingerprint:string>", "Tag fingerprint for concurrency control")
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

      // Get current tag
      const current = await tagmanager.accounts.containers.workspaces.tags.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags/${options.tagId}`,
      });

      const requestBody: Record<string, unknown> = {};

      if (options.name) {
        requestBody.name = options.name;
      }
      if (options.paused !== undefined) {
        requestBody.paused = options.paused;
      }
      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }
      if (options.firingTriggerId) {
        requestBody.firingTriggerId = options.firingTriggerId.split(",").map((id: string) => id.trim());
      }
      if (options.blockingTriggerId) {
        requestBody.blockingTriggerId = options.blockingTriggerId.split(",").map((id: string) => id.trim());
      }

      const response = await tagmanager.accounts.containers.workspaces.tags.update({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags/${options.tagId}`,
        fingerprint: options.fingerprint || current.data.fingerprint || undefined,
        requestBody,
      });

      success("Tag updated successfully");
      output(response.data!, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete tag
  .command("delete")
  .description("Delete a tag")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-t, --tag-id <id:string>", "GTM Tag ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      if (!options.force) {
        console.log("Warning: This will delete the tag from the workspace.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.workspaces.tags.delete({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags/${options.tagId}`,
      });

      success(`Tag ${options.tagId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  })
  // Revert tag
  .command("revert")
  .description("Revert changes to a tag in the workspace")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-t, --tag-id <id:string>", "GTM Tag ID", { required: true })
  .option("--fingerprint <fingerprint:string>", "Tag fingerprint for concurrency control")
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
      const response = await tagmanager.accounts.containers.workspaces.tags.revert({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/tags/${options.tagId}`,
        fingerprint: options.fingerprint,
      });

      success("Tag reverted successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
