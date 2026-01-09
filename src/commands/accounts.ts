/**
 * Account commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient } from "../api/mod.ts";
import { handleError, output, OutputFormat, success } from "../utils/mod.ts";

export const accountsCommand = new Command()
  .name("accounts")
  .description("Manage GTM accounts")
  .action(function () {
    this.showHelp();
  })
  // List accounts
  .command("list")
  .description("List all GTM accounts you have access to")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.list();
      const accounts = response.data.account || [];

      output(accounts, options.output as OutputFormat, {
        columns: ["accountId", "name", "fingerprint"],
        headers: ["Account ID", "Name", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get account
  .command("get")
  .description("Get details for a specific GTM account")
  .option("-a, --account-id <id:string>", "GTM Account ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.get({
        path: `accounts/${options.accountId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update account
  .command("update")
  .description("Update a GTM account")
  .option("-a, --account-id <id:string>", "GTM Account ID", { required: true })
  .option("-n, --name <name:string>", "New account name")
  .option("--fingerprint <fingerprint:string>", "Account fingerprint for concurrency control")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const tagmanager = await getTagManagerClient();

      // First get current account to get fingerprint if not provided
      const current = await tagmanager.accounts.get({
        path: `accounts/${options.accountId}`,
      });

      const requestBody: Record<string, string> = {};
      if (options.name) {
        requestBody.name = options.name;
      }

      const response = await tagmanager.accounts.update({
        path: `accounts/${options.accountId}`,
        fingerprint: options.fingerprint || current.data.fingerprint || undefined,
        requestBody,
      });

      success("Account updated successfully");
      output(response.data!, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
