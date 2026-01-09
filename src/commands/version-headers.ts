/**
 * Version header commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, ContainerVersionHeader } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, requireOptions } from "../utils/mod.ts";

export const versionHeadersCommand = new Command()
  .name("version-headers")
  .description("List GTM container version headers (lightweight version info)")
  .action(function () {
    this.showHelp();
  })
  // List version headers
  .command("list")
  .description("List all version headers for a container")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("--include-deleted", "Include deleted versions", { default: false })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);

      const tagmanager = await getTagManagerClient();

      const headers = await paginateAll<ContainerVersionHeader>(
        (pageToken) =>
          tagmanager.accounts.containers.version_headers.list({
            parent: `accounts/${accountId}/containers/${containerId}`,
            includeDeleted: options.includeDeleted,
            pageToken,
          }),
        "containerVersionHeader"
      );

      output(headers, options.output as OutputFormat, {
        columns: ["containerVersionId", "name", "numTags", "numTriggers", "numVariables", "deleted"],
        headers: ["Version ID", "Name", "Tags", "Triggers", "Variables", "Deleted"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get latest version header
  .command("latest")
  .description("Get the latest version header for a container")
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
      const response = await tagmanager.accounts.containers.version_headers.latest({
        parent: `accounts/${accountId}/containers/${containerId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
