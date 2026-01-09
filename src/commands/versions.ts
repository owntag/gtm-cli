/**
 * Version commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const versionsCommand = new Command()
  .name("versions")
  .description("Manage GTM container versions")
  .action(function () {
    this.showHelp();
  })
  // Get version
  .command("get")
  .description("Get details for a specific container version")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--version-id <id:string>", "GTM Version ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.versions.get({
        path: `accounts/${accountId}/containers/${containerId}/versions/${options.versionId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Get live version
  .command("live")
  .description("Get the live (published) container version")
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
      const response = await tagmanager.accounts.containers.versions.live({
        parent: `accounts/${accountId}/containers/${containerId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create version from workspace
  .command("create")
  .description("Create a new version from a workspace")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-n, --name <name:string>", "Version name")
  .option("--notes <notes:string>", "Version notes")
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
      const response = await tagmanager.accounts.containers.workspaces.create_version({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        requestBody: {
          name: options.name,
          notes: options.notes,
        },
      });

      success(`Version created: ${response.data.containerVersion?.containerVersionId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Publish version
  .command("publish")
  .description("Publish a container version")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--version-id <id:string>", "GTM Version ID", { required: true })
  .option("--fingerprint <fingerprint:string>", "Version fingerprint for concurrency control")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.versions.publish({
        path: `accounts/${accountId}/containers/${containerId}/versions/${options.versionId}`,
        fingerprint: options.fingerprint,
      });

      success(`Version ${options.versionId} published successfully`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update version
  .command("update")
  .description("Update a container version (name/notes)")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--version-id <id:string>", "GTM Version ID", { required: true })
  .option("-n, --name <name:string>", "New version name")
  .option("--notes <notes:string>", "New version notes")
  .option("--fingerprint <fingerprint:string>", "Version fingerprint for concurrency control")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();

      // Get current version if fingerprint not provided
      let fingerprint = options.fingerprint as string | undefined;
      if (!fingerprint) {
        const current = await tagmanager.accounts.containers.versions.get({
          path: `accounts/${accountId}/containers/${containerId}/versions/${options.versionId}`,
        });
        fingerprint = current.data.fingerprint || undefined;
      }

      const requestBody: Record<string, unknown> = {};
      if (options.name) requestBody.name = options.name;
      if (options.notes) requestBody.notes = options.notes;

      const response = await tagmanager.accounts.containers.versions.update({
        path: `accounts/${accountId}/containers/${containerId}/versions/${options.versionId}`,
        fingerprint,
        requestBody,
      });

      success("Version updated successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete version
  .command("delete")
  .description("Delete a container version")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--version-id <id:string>", "GTM Version ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      if (!options.force) {
        console.log("Warning: This will delete the container version.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.versions.delete({
        path: `accounts/${accountId}/containers/${containerId}/versions/${options.versionId}`,
      });

      success(`Version ${options.versionId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  })
  // Set latest version
  .command("set-latest")
  .description("Set a version as the latest version")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--version-id <id:string>", "GTM Version ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.versions.set_latest({
        path: `accounts/${accountId}/containers/${containerId}/versions/${options.versionId}`,
      });

      success(`Version ${options.versionId} set as latest`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Undelete version
  .command("undelete")
  .description("Undelete a deleted container version")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--version-id <id:string>", "GTM Version ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.versions.undelete({
        path: `accounts/${accountId}/containers/${containerId}/versions/${options.versionId}`,
      });

      success(`Version ${options.versionId} undeleted`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
