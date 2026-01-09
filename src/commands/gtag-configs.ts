/**
 * Gtag config commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, GtagConfig } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const gtagConfigsCommand = new Command()
  .name("gtag-configs")
  .description("Manage GTM gtag configurations")
  .action(function () {
    this.showHelp();
  })
  // List gtag configs
  .command("list")
  .description("List all gtag configurations in a workspace")
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

      const configs = await paginateAll<GtagConfig>(
        (pageToken) =>
          tagmanager.accounts.containers.workspaces.gtag_config.list({
            parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
            pageToken,
          }),
        "gtagConfig"
      );

      output(configs, options.output as OutputFormat, {
        columns: ["gtagConfigId", "type", "fingerprint"],
        headers: ["Gtag Config ID", "Type", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get gtag config
  .command("get")
  .description("Get details for a specific gtag configuration")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--gtag-config-id <id:string>", "GTM Gtag Config ID", { required: true })
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
      const response = await tagmanager.accounts.containers.workspaces.gtag_config.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/gtag_config/${options.gtagConfigId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create gtag config
  .command("create")
  .description("Create a new gtag configuration")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--type <type:string>", "Gtag config type", { required: true })
  .option("--config <config:string>", "Gtag configuration as JSON")
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
        type: options.type,
      };

      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }

      const response = await tagmanager.accounts.containers.workspaces.gtag_config.create({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        requestBody,
      });

      success(`Gtag config created: ${response.data.gtagConfigId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update gtag config
  .command("update")
  .description("Update a gtag configuration")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--gtag-config-id <id:string>", "GTM Gtag Config ID", { required: true })
  .option("--config <config:string>", "Gtag configuration as JSON")
  .option("--fingerprint <fingerprint:string>", "Config fingerprint")
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

      // Get current config if fingerprint not provided
      let fingerprint = options.fingerprint as string | undefined;
      if (!fingerprint) {
        const current = await tagmanager.accounts.containers.workspaces.gtag_config.get({
          path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/gtag_config/${options.gtagConfigId}`,
        });
        fingerprint = current.data.fingerprint || undefined;
      }

      const requestBody: Record<string, unknown> = {};
      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }

      const response = await tagmanager.accounts.containers.workspaces.gtag_config.update({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/gtag_config/${options.gtagConfigId}`,
        fingerprint,
        requestBody,
      });

      success("Gtag config updated successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete gtag config
  .command("delete")
  .description("Delete a gtag configuration")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--gtag-config-id <id:string>", "GTM Gtag Config ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      if (!options.force) {
        console.log("Warning: This will delete the gtag configuration.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.workspaces.gtag_config.delete({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/gtag_config/${options.gtagConfigId}`,
      });

      success(`Gtag config ${options.gtagConfigId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  });
