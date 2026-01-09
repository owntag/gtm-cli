/**
 * Transformation commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, Transformation } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const transformationsCommand = new Command()
  .name("transformations")
  .description("Manage GTM transformations")
  .action(function () {
    this.showHelp();
  })
  // List transformations
  .command("list")
  .description("List all transformations in a workspace")
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

      const transformations = await paginateAll<Transformation>(
        (pageToken) =>
          tagmanager.accounts.containers.workspaces.transformations.list({
            parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
            pageToken,
          }),
        "transformation"
      );

      output(transformations, options.output as OutputFormat, {
        columns: ["transformationId", "name", "type", "fingerprint"],
        headers: ["Transformation ID", "Name", "Type", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get transformation
  .command("get")
  .description("Get details for a specific transformation")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--transformation-id <id:string>", "GTM Transformation ID", { required: true })
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
      const response = await tagmanager.accounts.containers.workspaces.transformations.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/transformations/${options.transformationId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create transformation
  .command("create")
  .description("Create a new transformation")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-n, --name <name:string>", "Transformation name", { required: true })
  .option("--type <type:string>", "Transformation type", { required: true })
  .option("--config <config:string>", "Transformation configuration as JSON")
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

      const response = await tagmanager.accounts.containers.workspaces.transformations.create({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        requestBody,
      });

      success(`Transformation created: ${response.data.transformationId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update transformation
  .command("update")
  .description("Update a transformation")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--transformation-id <id:string>", "GTM Transformation ID", { required: true })
  .option("-n, --name <name:string>", "New transformation name")
  .option("--config <config:string>", "Transformation configuration as JSON")
  .option("--fingerprint <fingerprint:string>", "Transformation fingerprint")
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

      // Get current transformation if fingerprint not provided
      let fingerprint = options.fingerprint as string | undefined;
      if (!fingerprint) {
        const current = await tagmanager.accounts.containers.workspaces.transformations.get({
          path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/transformations/${options.transformationId}`,
        });
        fingerprint = current.data.fingerprint || undefined;
      }

      const requestBody: Record<string, unknown> = {};
      if (options.name) requestBody.name = options.name;
      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }

      const response = await tagmanager.accounts.containers.workspaces.transformations.update({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/transformations/${options.transformationId}`,
        fingerprint,
        requestBody,
      });

      success("Transformation updated successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete transformation
  .command("delete")
  .description("Delete a transformation")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--transformation-id <id:string>", "GTM Transformation ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      if (!options.force) {
        console.log("Warning: This will delete the transformation.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.workspaces.transformations.delete({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/transformations/${options.transformationId}`,
      });

      success(`Transformation ${options.transformationId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  })
  // Revert transformation
  .command("revert")
  .description("Revert changes to a transformation")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--transformation-id <id:string>", "GTM Transformation ID", { required: true })
  .option("--fingerprint <fingerprint:string>", "Transformation fingerprint")
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
      const response = await tagmanager.accounts.containers.workspaces.transformations.revert({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/transformations/${options.transformationId}`,
        fingerprint: options.fingerprint,
      });

      success("Transformation reverted successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
