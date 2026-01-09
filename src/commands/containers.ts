/**
 * Container commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, Container } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const containersCommand = new Command()
  .name("containers")
  .description("Manage GTM containers")
  .action(function () {
    this.showHelp();
  })
  // List containers
  .command("list")
  .description("List all containers in an account")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      const tagmanager = await getTagManagerClient();

      const containers = await paginateAll<Container>(
        (pageToken) =>
          tagmanager.accounts.containers.list({
            parent: `accounts/${accountId}`,
            pageToken,
          }),
        "container"
      );

      output(containers, options.output as OutputFormat, {
        columns: ["containerId", "name", "publicId", "usageContext"],
        headers: ["Container ID", "Name", "Public ID", "Type"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get container
  .command("get")
  .description("Get details for a specific container")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.get({
        path: `accounts/${accountId}/containers/${options.containerId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create container
  .command("create")
  .description("Create a new container")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-n, --name <name:string>", "Container name", { required: true })
  .option("-t, --type <type:string>", "Container type (web, amp, ios, android, server)", {
    required: true,
  })
  .option("--domain <domain:string>", "Target domain (comma-separated for multiple)")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      const tagmanager = await getTagManagerClient();

      const usageContext = [options.type.toUpperCase()];
      const domainName = options.domain?.split(",").map((d: string) => d.trim());

      const response = await tagmanager.accounts.containers.create({
        parent: `accounts/${accountId}`,
        requestBody: {
          name: options.name,
          usageContext,
          domainName,
        },
      });

      success(`Container created: ${response.data.publicId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update container
  .command("update")
  .description("Update a container")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID", { required: true })
  .option("-n, --name <name:string>", "New container name")
  .option("--domain <domain:string>", "Target domain (comma-separated for multiple)")
  .option("--fingerprint <fingerprint:string>", "Container fingerprint for concurrency control")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      const tagmanager = await getTagManagerClient();

      // Get current container to get fingerprint if not provided
      const current = await tagmanager.accounts.containers.get({
        path: `accounts/${accountId}/containers/${options.containerId}`,
      });

      const requestBody: Record<string, unknown> = {};
      if (options.name) {
        requestBody.name = options.name;
      }
      if (options.domain) {
        requestBody.domainName = options.domain.split(",").map((d: string) => d.trim());
      }

      const response = await tagmanager.accounts.containers.update({
        path: `accounts/${accountId}/containers/${options.containerId}`,
        fingerprint: options.fingerprint || current.data.fingerprint || undefined,
        requestBody,
      });

      success("Container updated successfully");
      output(response.data!, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete container
  .command("delete")
  .description("Delete a container")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      if (!options.force) {
        console.log("Warning: This will permanently delete the container and all its contents.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.delete({
        path: `accounts/${accountId}/containers/${options.containerId}`,
      });

      success(`Container ${options.containerId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  })
  // Get container snippet
  .command("snippet")
  .description("Get the installation snippet for a container")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-o, --output <format:string>", "Output format (json, table)", { default: "table" })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.snippet({
        path: `accounts/${accountId}/containers/${containerId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
