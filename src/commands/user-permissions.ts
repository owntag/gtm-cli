/**
 * User permission commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, UserPermission } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const userPermissionsCommand = new Command()
  .name("user-permissions")
  .alias("permissions")
  .description("Manage GTM user permissions")
  .action(function () {
    this.showHelp();
  })
  // List user permissions
  .command("list")
  .description("List all user permissions for an account")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      const tagmanager = await getTagManagerClient();

      const permissions = await paginateAll<UserPermission>(
        (pageToken) =>
          tagmanager.accounts.user_permissions.list({
            parent: `accounts/${accountId}`,
            pageToken,
          }),
        "userPermission"
      );

      output(permissions, options.output as OutputFormat, {
        columns: ["emailAddress", "accountAccess", "containerAccess"],
        headers: ["Email", "Account Access", "Container Access"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get user permission
  .command("get")
  .description("Get permission details for a specific user")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("--permission-id <id:string>", "User Permission ID", { required: true })
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      const tagmanager = await getTagManagerClient();
      const response = await tagmanager.accounts.user_permissions.get({
        path: `accounts/${accountId}/user_permissions/${options.permissionId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create user permission
  .command("create")
  .description("Grant permissions to a user")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("--email <email:string>", "User email address", { required: true })
  .option("--account-access <access:string>", "Account access level (noAccess, read, admin)")
  .option("--container-access <access:string>", "Container access as JSON array")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      const tagmanager = await getTagManagerClient();

      const requestBody: Record<string, unknown> = {
        emailAddress: options.email,
      };

      if (options.accountAccess) {
        requestBody.accountAccess = { permission: options.accountAccess };
      }

      if (options.containerAccess) {
        requestBody.containerAccess = JSON.parse(options.containerAccess);
      }

      const response = await tagmanager.accounts.user_permissions.create({
        parent: `accounts/${accountId}`,
        requestBody,
      });

      success(`Permission granted to ${options.email}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update user permission
  .command("update")
  .description("Update user permissions")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("--permission-id <id:string>", "User Permission ID", { required: true })
  .option("--account-access <access:string>", "Account access level (noAccess, read, admin)")
  .option("--container-access <access:string>", "Container access as JSON array")
  .option("-o, --output <format:string>", "Output format (json, table, compact)", {
    default: "table",
  })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      const tagmanager = await getTagManagerClient();

      const requestBody: Record<string, unknown> = {};

      if (options.accountAccess) {
        requestBody.accountAccess = { permission: options.accountAccess };
      }

      if (options.containerAccess) {
        requestBody.containerAccess = JSON.parse(options.containerAccess);
      }

      const response = await tagmanager.accounts.user_permissions.update({
        path: `accounts/${accountId}/user_permissions/${options.permissionId}`,
        requestBody,
      });

      success("Permission updated successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete user permission
  .command("delete")
  .description("Remove user permissions")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("--permission-id <id:string>", "User Permission ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      requireOptions({ accountId }, ["accountId"]);

      if (!options.force) {
        console.log("Warning: This will remove the user's permissions.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.user_permissions.delete({
        path: `accounts/${accountId}/user_permissions/${options.permissionId}`,
      });

      success("Permission removed successfully");
    } catch (err) {
      handleError(err);
    }
  });
