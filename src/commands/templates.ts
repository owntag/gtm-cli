/**
 * Custom template commands
 */

import { Command } from "@cliffy/command";
import { getTagManagerClient, paginateAll, CustomTemplate } from "../api/mod.ts";
import { getEffectiveValue } from "../config/store.ts";
import { handleError, output, OutputFormat, success, requireOptions } from "../utils/mod.ts";

export const templatesCommand = new Command()
  .name("templates")
  .description("Manage GTM custom templates")
  .action(function () {
    this.showHelp();
  })
  // List templates
  .command("list")
  .description("List all custom templates in a workspace")
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

      const templates = await paginateAll<CustomTemplate>(
        (pageToken) =>
          tagmanager.accounts.containers.workspaces.templates.list({
            parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
            pageToken,
          }),
        "template"
      );

      output(templates, options.output as OutputFormat, {
        columns: ["templateId", "name", "fingerprint"],
        headers: ["Template ID", "Name", "Fingerprint"],
      });
    } catch (err) {
      handleError(err);
    }
  })
  // Get template
  .command("get")
  .description("Get details for a specific custom template")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--template-id <id:string>", "GTM Template ID", { required: true })
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
      const response = await tagmanager.accounts.containers.workspaces.templates.get({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/templates/${options.templateId}`,
      });

      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Create template
  .command("create")
  .description("Create a new custom template")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("-n, --name <name:string>", "Template name", { required: true })
  .option("--template-data <data:string>", "Template data (sandboxed JavaScript)")
  .option("--config <config:string>", "Template configuration as JSON")
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
      };

      if (options.templateData) {
        requestBody.templateData = options.templateData;
      }

      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }

      const response = await tagmanager.accounts.containers.workspaces.templates.create({
        parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
        requestBody,
      });

      success(`Template created: ${response.data.templateId}`);
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Update template
  .command("update")
  .description("Update a custom template")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--template-id <id:string>", "GTM Template ID", { required: true })
  .option("-n, --name <name:string>", "New template name")
  .option("--template-data <data:string>", "New template data")
  .option("--config <config:string>", "Template configuration as JSON")
  .option("--fingerprint <fingerprint:string>", "Template fingerprint")
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

      // Get current template if fingerprint not provided
      let fingerprint = options.fingerprint as string | undefined;
      if (!fingerprint) {
        const current = await tagmanager.accounts.containers.workspaces.templates.get({
          path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/templates/${options.templateId}`,
        });
        fingerprint = current.data.fingerprint || undefined;
      }

      const requestBody: Record<string, unknown> = {};
      if (options.name) requestBody.name = options.name;
      if (options.templateData) requestBody.templateData = options.templateData;
      if (options.config) {
        const config = JSON.parse(options.config);
        Object.assign(requestBody, config);
      }

      const response = await tagmanager.accounts.containers.workspaces.templates.update({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/templates/${options.templateId}`,
        fingerprint,
        requestBody,
      });

      success("Template updated successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  })
  // Delete template
  .command("delete")
  .description("Delete a custom template")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--template-id <id:string>", "GTM Template ID", { required: true })
  .option("-f, --force", "Skip confirmation", { default: false })
  .action(async (options) => {
    try {
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      const workspaceId = await getEffectiveValue(options.workspaceId, "defaultWorkspaceId");
      requireOptions({ accountId, containerId, workspaceId }, ["accountId", "containerId", "workspaceId"]);

      if (!options.force) {
        console.log("Warning: This will delete the template.");
        console.log("Use --force to skip this confirmation.");
        Deno.exit(1);
      }

      const tagmanager = await getTagManagerClient();
      await tagmanager.accounts.containers.workspaces.templates.delete({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/templates/${options.templateId}`,
      });

      success(`Template ${options.templateId} deleted successfully`);
    } catch (err) {
      handleError(err);
    }
  })
  // Revert template
  .command("revert")
  .description("Revert changes to a template")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option("-w, --workspace-id <id:string>", "GTM Workspace ID")
  .option("--template-id <id:string>", "GTM Template ID", { required: true })
  .option("--fingerprint <fingerprint:string>", "Template fingerprint")
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
      const response = await tagmanager.accounts.containers.workspaces.templates.revert({
        path: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}/templates/${options.templateId}`,
        fingerprint: options.fingerprint,
      });

      success("Template reverted successfully");
      output(response.data, options.output as OutputFormat);
    } catch (err) {
      handleError(err);
    }
  });
