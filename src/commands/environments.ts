/**
 * Environment commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, Environment } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const environmentsCommand = new Command()
  .name("environments")
  .description("Manage GTM environments")
  .action(function () {
    this.showHelp();
  })
  // List environments
  .command("list")
  .description("List all environments in a container")
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

      const environments = await paginateAll<Environment>(
        (pageToken) =>
          tagmanager.accounts.containers.environments.list({
            parent: `accounts/${accountId}/containers/${containerId}`,
            pageToken,
          }),
        "environment"
      );

      output(environments, options.output as OutputFormat, {
        columns: ["environmentId", "name", "type", "url", "fingerprint"],
        headers: ["Environment ID", "Name", "Type", "URL", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get environment
  .command("get")
  .description("Get details for a specific environment")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--environment-id <id:string>", "GTM Environment ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.environments.get({
        path: `accounts/${accountId}/containers/${containerId}/environments/${options.environmentId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create environment
  .command("create")
  .description("Create a new environment")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-n, --name <name:string>", "Environment name", { required: true })
  .option("-d, --description <description:string>", "Environment description")
  .option("--debug", "Enable debug mode", { default: false })
  .option("--url <url:string>", "Environment URL")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.environments.create({
        parent: `accounts/${accountId}/containers/${containerId}`,
        requestBody: {
          name: options.name,
          description: options.description,
          enableDebug: options.debug,
          url: options.url,
        },
      });

      success(`Environment created: ${response.data.environmentId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update environment
  .command("update")
  .description("Update an environment")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--environment-id <id:string>", "GTM Environment ID", { required: true })
  .option("-n, --name <name:string>", "New environment name")
  .option("-d, --description <description:string>", "New environment description")
  .option("--debug <debug:boolean>", "Enable/disable debug mode")
  .option("--url <url:string>", "New environment URL")
  .option("--fingerprint <fingerprint:string>", "Environment fingerprint")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();

      // Get current environment if fingerprint not provided
      let fingerprint = options.fingerprint as string | undefined;
      if (!fingerprint) {
        const current = await tagmanager.accounts.containers.environments.get({
          path: `accounts/${accountId}/containers/${containerId}/environments/${options.environmentId}`,
        });
        fingerprint = current.data.fingerprint || undefined;
      }

      const requestBody: Record<string, unknown> = {};
      if (options.name) requestBody.name = options.name;
      if (options.description !== undefined) requestBody.description = options.description;
      if (options.debug !== undefined) requestBody.enableDebug = options.debug;
      if (options.url) requestBody.url = options.url;

      const response = await tagmanager.accounts.containers.environments.update({
        path: `accounts/${accountId}/containers/${containerId}/environments/${options.environmentId}`,
        fingerprint,
        requestBody,
      });

      success("Environment updated successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete environment
  .command("delete")
  .description("Delete an environment")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--environment-id <id:string>", "GTM Environment ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      if (!options.force) {
        console.log("Warning: This will delete the environment.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.environments.delete({
        path: `accounts/${accountId}/containers/${containerId}/environments/${options.environmentId}`,
      });

      success(`Environment ${options.environmentId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  })
  // Reauthorize environment
  .command("reauthorize")
  .description("Reauthorize an environment (generates new auth token)")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--environment-id <id:string>", "GTM Environment ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.environments.reauthorize({
        path: `accounts/${accountId}/containers/${containerId}/environments/${options.environmentId}`,
        requestBody: {},
      });

      success("Environment reauthorized successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
