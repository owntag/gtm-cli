/**
 * Destination commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, requireOptions } from "../utils/mod.ts";

export const destinationsCommand = new Command()
  .name("destinations")
  .description("Manage GTM destinations")
  .action(function () {
    this.showHelp();
  })
  // List destinations
  .command("list")
  .description("List all destinations in a container")
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

      // Destinations API doesn't support pagination
      const response = await tagmanager.accounts.containers.destinations.list({
        parent: `accounts/${accountId}/containers/${containerId}`,
      });
      const destinations = response.data.destination || [];

      output(destinations, options.output as OutputFormat, {
        columns: ["destinationId", "name", "destinationLinkId", "fingerprint"],
        headers: ["Destination ID", "Name", "Link ID", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get destination
  .command("get")
  .description("Get details for a specific destination")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--destination-id <id:string>", "GTM Destination ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.destinations.get({
        path: `accounts/${accountId}/containers/${containerId}/destinations/${options.destinationId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Link destination
  .command("link")
  .description("Link a destination to a container")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--destination-id <id:string>", "Destination ID to link (e.g., AW-123456789)", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.containers.destinations.link({
        parent: `accounts/${accountId}/containers/${containerId}`,
        destinationId: options.destinationId,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
