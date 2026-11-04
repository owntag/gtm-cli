/**
 * `gtm local` - local workspaces: work on a full copy of a GTM container workspace on disk,
 * validate every change offline and push the result in one go.
 */

import { Command } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import { colors } from "@cliffy/ansi/colors";
import { getEffectiveValue } from "../config/store.ts";
import { getOutputFormat, type OutputFormat, requireOptions, success, warn } from "../utils/mod.ts";
import {
  BUILT_IN_VARIABLES_FILE,
  type EntityKind,
  KIND_ORDER,
  KINDS,
  type KindSpec,
  supportedKinds,
} from "../local/kinds.ts";
import type { Entity, LocalEntity, LocalWorkspace, ValidationResult } from "../local/types.ts";
import {
  displayPath,
  loadWorkspace,
  LocalWorkspaceError,
  resolveWorkspaceRoots,
  writeBuiltInVariables,
} from "../local/store.ts";
import { initWorkspace, pullWorkspace, refreshLiveSnapshot, workspaceIds } from "../local/sync.ts";
import { computeDiff, describeFieldChange, hasChanges } from "../local/diff.ts";
import { validateWorkspace } from "../local/validate.ts";
import { executePush, planPush } from "../local/push.ts";
import { fetchRemoteState, setRetryNotifier, snapshotFromRemote } from "../local/remote.ts";
import {
  kindLabel,
  renderConflicts,
  renderCounts,
  renderDiff,
  renderIssue,
  renderOperationResult,
  renderPlan,
  renderValidation,
  workspaceHeader,
} from "../local/format.ts";
import { addEntity, type Patch, removeEntity, updateEntity } from "../local/edit.ts";
import {
  fromSimpleValue,
  normalizeEntity,
  parseParamArg,
  simplifyParameterList,
} from "../local/params.ts";
import { builtInVariablesFor, builtInVariableType } from "../local/schema/built-ins.ts";
import {
  entityId,
  entityName,
  findEntity,
  resolveTriggerRef,
  templateTypeId,
} from "../local/workspace.ts";
import { fetchGalleryTemplate } from "../local/gallery.ts";
import { expectedParameterType, parseTemplate } from "../local/schema/template.ts";
import { startUiServer } from "../local/ui/server.ts";

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function fail(err: unknown): never {
  if (err instanceof LocalWorkspaceError) {
    console.error(colors.red("Error:"), err.message);
    if (err.hint) console.error(colors.dim("→ " + err.hint));
    Deno.exit(1);
  }
  const e = err as { message?: string; response?: { data?: { error?: { message?: string } } } };
  console.error(colors.red("Error:"), e.response?.data?.error?.message ?? e.message ?? String(err));
  Deno.exit(1);
}

function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function isJson(format: string | undefined): boolean {
  return getOutputFormat(format as OutputFormat | undefined) === "json";
}

/** Progress lines go to stderr and are suppressed with -q and in JSON mode (agents merge streams) */
function progress(quiet: boolean | undefined): (msg: string) => void {
  return (msg) => {
    if (!quiet) console.error(colors.dim(msg));
  };
}

function installRetryNotifier(quiet: boolean | undefined): void {
  setRetryNotifier((msg) => {
    if (!quiet) console.error(colors.yellow("⏳ " + msg));
  });
}

/** Single workspace -> one object, several -> array (documented in the agent guide) */
function oneOrMany<T>(list: T[]): T | T[] {
  return list.length === 1 ? list[0] : list;
}

function gtmUrl(ws: LocalWorkspace): string {
  return `https://tagmanager.google.com/#/container/accounts/${ws.meta.accountId}/containers/${ws.meta.containerId}/workspaces/${ws.meta.workspaceId}`;
}

/** Replace a template's (often >100 KB) templateData in command output; the file holds it */
function elideTemplateData(entity: Entity, file: string): Entity {
  if (typeof entity.templateData !== "string") return entity;
  return {
    ...entity,
    templateData: `[${entity.templateData.length} characters omitted; see ${file}]`,
  };
}

function summaryOf(d: { summary: { added: number; modified: number; deleted: number } }) {
  return { added: d.summary.added, modified: d.summary.modified, deleted: d.summary.deleted };
}

async function singleWorkspace(dir: string | undefined): Promise<LocalWorkspace> {
  const [root] = await resolveWorkspaceRoots(dir, { allowMany: false });
  return await loadWorkspace(root);
}

async function manyWorkspaces(dir: string | undefined): Promise<LocalWorkspace[]> {
  const roots = await resolveWorkspaceRoots(dir, { allowMany: true });
  const out: LocalWorkspace[] = [];
  for (const r of roots) out.push(await loadWorkspace(r));
  return out;
}

function printWarnings(validation: ValidationResult): void {
  for (const issue of validation.issues) console.error(renderIssue(issue));
}

async function readJsonInput(
  jsonArg: string | undefined,
  fileArg: string | undefined,
): Promise<Entity | undefined> {
  let text: string | undefined;
  if (jsonArg !== undefined) text = jsonArg;
  else if (fileArg !== undefined) {
    if (fileArg === "-") {
      const chunks: Uint8Array[] = [];
      for await (const chunk of Deno.stdin.readable) chunks.push(chunk);
      text = new TextDecoder().decode(new Uint8Array(chunks.flatMap((c) => [...c])));
    } else {
      text = await Deno.readTextFile(fileArg);
    }
  }
  if (text === undefined) return undefined;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new LocalWorkspaceError(
        "The JSON input must be a single object.",
        'Example: {"name": "My tag", "type": "html", "parameter": {"html": "<script>...</script>"}}',
      );
    }
    return parsed as Entity;
  } catch (e) {
    if (e instanceof LocalWorkspaceError) throw e;
    throw new LocalWorkspaceError(
      `The JSON input is not valid JSON: ${(e as Error).message}`,
      "Check quotes and commas; with --json, wrap the whole value in single quotes in your shell.",
    );
  }
}

const OUTPUT_OPTION = [
  "-o, --output <format:string>",
  "Output format (json, table). Defaults to table on a terminal and json when piped.",
] as const;
const DIR_OPTION = [
  "-d, --dir <path:string>",
  "Local workspace directory (default: the one containing the current directory, or $GTM_LOCAL_WORKSPACE)",
] as const;

/** The global -q/--quiet flag is not part of the inferred option types */
function quietOf(options: unknown): boolean | undefined {
  return (options as { quiet?: boolean }).quiet;
}

// ---------------------------------------------------------------------------------------------
// init / pull / status / diff / validate / push / ui
// ---------------------------------------------------------------------------------------------

const initCommand = new Command()
  .description("Create a local workspace folder linked to a GTM container workspace and pull it")
  .option("-a, --account-id <id:string>", "GTM Account ID")
  .option("-c, --container-id <id:string>", "GTM Container ID")
  .option(
    "-w, --workspace-id <id:string>",
    "GTM Workspace ID (defaults to the only workspace of the container)",
  )
  .option(
    "--create-workspace <name:string>",
    "Create a new remote workspace with this name and link to it",
  )
  .option("--no-pull", "Only write gtm-workspace.json; do not download anything yet")
  .option("-d, --dir <path:string>", "Directory to create (default: ./<container public ID>)")
  .option(...OUTPUT_OPTION)
  .example(
    "Web + server container side by side",
    "gtm local init -a 123 -c 456 --dir web && gtm local init -a 123 -c 789 --dir server",
  )
  .example(
    "Dedicated remote workspace for an agent",
    'gtm local init -a 123 -c 456 --create-workspace "agent-feature-x"',
  )
  .action(async (options) => {
    try {
      installRetryNotifier(quietOf(options) || isJson(options.output));
      const accountId = await getEffectiveValue(options.accountId, "defaultAccountId");
      const containerId = await getEffectiveValue(options.containerId, "defaultContainerId");
      requireOptions({ accountId, containerId }, ["accountId", "containerId"]);
      const workspaceId = options.workspaceId ??
        (options.createWorkspace
          ? undefined
          : await getEffectiveValue(undefined, "defaultWorkspaceId"));
      const result = await initWorkspace({
        accountId: accountId!,
        containerId: containerId!,
        workspaceId: workspaceId ?? undefined,
        createWorkspace: options.createWorkspace,
        dir: options.dir,
        pull: options.pull,
        onProgress: progress(quietOf(options) || isJson(options.output)),
      });
      if (isJson(options.output)) {
        json({
          root: result.root,
          workspaceId: result.workspaceId,
          workspaceUrl:
            `https://tagmanager.google.com/#/container/accounts/${accountId}/containers/${containerId}/workspaces/${result.workspaceId}`,
          createdWorkspace: result.created,
          counts: result.counts,
          builtInVariables: result.builtInVariables,
          liveVersion: result.live?.containerVersionId ?? null,
        });
        return;
      }
      success(`Local workspace created in ${colors.cyan(displayPath(result.root))}`);
      console.log(
        `  Container: ${result.meta.container.name ?? ""} (${
          result.meta.container.publicId ?? containerId
        }), remote workspace ${result.workspaceId}${result.created ? " (newly created)" : ""}`,
      );
      if (options.pull !== false) {
        const parts = Object.entries(result.counts).map(([k, v]) => `${v} ${k}`);
        if (result.builtInVariables) parts.push(`${result.builtInVariables} built-in variables`);
        console.log(`  Pulled: ${parts.join(", ") || "nothing (empty workspace)"}`);
        console.log(
          `  Live version: ${
            result.live
              ? `${result.live.containerVersionId}${
                result.live.versionName ? ` "${result.live.versionName}"` : ""
              }`
              : "none published yet"
          }`,
        );
      }
      console.log("");
      console.log(
        colors.dim(
          `Next: edit the JSON files in ${
            displayPath(result.root)
          }/ (or use \`gtm local tags add ...\`), then \`gtm local status\`, \`gtm local push\`.`,
        ),
      );
    } catch (err) {
      fail(err);
    }
  });

const pullCommand = new Command()
  .description(
    "Download the remote workspace into the local workspace (refuses to overwrite unpushed changes)",
  )
  .option("-f, --force", "Discard local changes and overwrite with the remote state")
  .option("--no-live", "Skip refreshing the live version snapshot")
  .option(...DIR_OPTION)
  .option(...OUTPUT_OPTION)
  .action(async (options) => {
    try {
      installRetryNotifier(quietOf(options) || isJson(options.output));
      const roots = await resolveWorkspaceRoots(options.dir, { allowMany: true });
      const results = [];
      for (const root of roots) {
        const r = await pullWorkspace(root, {
          force: options.force,
          live: options.live,
          onProgress: progress(quietOf(options) || isJson(options.output)),
        });
        results.push(r);
        if (!isJson(options.output)) {
          const parts = Object.entries(r.counts).map(([k, v]) => `${v} ${k}`);
          parts.push(`${r.builtInVariables} built-in variables`);
          success(
            `Pulled ${colors.cyan(displayPath(root))}: ${parts.join(", ")}${
              r.live ? `; live version ${r.live.containerVersionId}` : ""
            }`,
          );
        }
      }
      if (isJson(options.output)) {
        json(oneOrMany(results.map((r) => ({
          root: r.root,
          counts: r.counts,
          builtInVariables: r.builtInVariables,
          liveVersion: r.live?.containerVersionId ?? null,
        }))));
      }
    } catch (err) {
      fail(err);
    }
  });

const statusCommand = new Command()
  .description(
    "Show local changes vs the remote workspace, validation results and unpublished remote changes",
  )
  .option(...DIR_OPTION)
  .option(...OUTPUT_OPTION)
  .action(async (options) => {
    try {
      const workspaces = await manyWorkspaces(options.dir);
      const all = workspaces.map((ws) => {
        const validation = validateWorkspace(ws);
        const remote = computeDiff(ws, ws.base, "remote");
        const live = ws.live ? computeDiff(ws, ws.live, "live") : undefined;
        // unpublished changes already in the remote workspace: base vs live
        const remoteVsLive = ws.base && ws.live
          ? computeDiff(
            {
              ...ws,
              entities: snapshotAsLocal(ws, ws.base),
              builtInVariables: ws.base.builtInVariables,
            },
            ws.live,
            "live",
          )
          : undefined;
        return { ws, validation, remote, live, remoteVsLive };
      });
      if (isJson(options.output)) {
        json(oneOrMany(all.map(({ ws, validation, remote, live, remoteVsLive }) => ({
          root: ws.root,
          workspaceId: ws.meta.workspaceId,
          workspaceUrl: gtmUrl(ws),
          container: {
            name: ws.meta.container.name ?? null,
            publicId: ws.meta.container.publicId ?? null,
            context: ws.context,
          },
          pulledAt: ws.meta.pulledAt ?? null,
          liveVersion: ws.live?.containerVersionId ?? null,
          // local vs remote workspace (as of the last pull/push)
          summary: summaryOf(remote),
          summaryByKind: remote.summary.byKind,
          changes: remote.changes.filter((c) => c.change !== "unchanged").map((
            { kind, name, id, type, file, change, fields },
          ) => ({ kind, name, id, type, file, change, fields })),
          // local vs published version
          summaryVsLive: live ? summaryOf(live) : null,
          // changes the remote workspace already holds vs the published version
          unpublishedRemoteChanges: remoteVsLive ? summaryOf(remoteVsLive) : null,
          validation: {
            ok: validation.ok,
            errors: validation.errors,
            warnings: validation.warnings,
            issues: validation.issues,
          },
        }))));
        return;
      }
      all.forEach(({ ws, validation, remote, live, remoteVsLive }, i) => {
        if (i > 0) console.log("\n" + colors.dim("─".repeat(60)) + "\n");
        console.log(workspaceHeader(ws));
        console.log(colors.dim(`Contents: ${renderCounts(ws)}`));
        console.log("");
        console.log(renderDiff(remote, { detailed: false }));
        if (live) {
          const n = live.summary.added + live.summary.modified + live.summary.deleted;
          console.log("");
          console.log(
            colors.dim(
              `Compared with the live version: ${n} change${
                n === 1 ? "" : "s"
              } (run \`gtm local diff --against live\` for details).`,
            ),
          );
        }
        if (remoteVsLive) {
          const n = remoteVsLive.summary.added + remoteVsLive.summary.modified +
            remoteVsLive.summary.deleted;
          if (n > 0) {
            console.log(
              colors.dim(
                `The remote workspace itself has ${n} unpublished change${
                  n === 1 ? "" : "s"
                } vs live (as of the last pull).`,
              ),
            );
          }
        }
        console.log("");
        console.log(renderValidation(validation));
        if (!ws.base) {
          console.log(
            colors.yellow(
              "\n⚠ No base snapshot: run `gtm local pull` so changes can be compared with the remote workspace.",
            ),
          );
        }
      });
    } catch (err) {
      fail(err);
    }
  });

/** Treat snapshot entities as if they were local, for snapshot-vs-snapshot comparisons */
function snapshotAsLocal(
  ws: LocalWorkspace,
  snapshot: NonNullable<LocalWorkspace["base"]>,
): LocalEntity[] {
  const out: LocalEntity[] = [];
  for (const kind of KIND_ORDER) {
    for (const e of snapshot.entities[kind] ?? []) {
      out.push({
        kind,
        file: `${KINDS[kind].dir}/${e.name}.json`,
        raw: e,
        entity: normalizeEntity(kind, e),
      });
    }
  }
  void ws;
  return out;
}

const diffCommand = new Command()
  .description(
    "Show detailed differences between the local workspace and the remote workspace or the live version",
  )
  .option(
    "--against <target:string>",
    "What to compare against: remote (workspace as of last pull) or live (published version)",
    { default: "remote" },
  )
  .option(
    "--refresh",
    "Fetch the current remote state before comparing (does not change local files)",
  )
  .option("--names-only", "List changed entities without field-level details")
  .option("--all", "Also list unchanged entities")
  .option(...DIR_OPTION)
  .option(...OUTPUT_OPTION)
  .action(async (options) => {
    try {
      installRetryNotifier(quietOf(options) || isJson(options.output));
      if (options.against !== "remote" && options.against !== "live") {
        throw new LocalWorkspaceError(
          `--against must be "remote" or "live", got "${options.against}".`,
        );
      }
      const workspaces = await manyWorkspaces(options.dir);
      const results = [];
      for (const ws of workspaces) {
        let snapshot = options.against === "remote" ? ws.base : ws.live;
        if (options.refresh) {
          if (options.against === "remote") {
            progress(quietOf(options) || isJson(options.output))(
              "Fetching current remote workspace...",
            );
            snapshot = snapshotFromRemote(await fetchRemoteState(workspaceIds(ws)));
          } else {
            progress(quietOf(options) || isJson(options.output))("Fetching live version...");
            snapshot = await refreshLiveSnapshot(ws.root, workspaceIds(ws));
          }
        }
        if (!snapshot) {
          throw new LocalWorkspaceError(
            options.against === "remote"
              ? "No remote snapshot available."
              : "No live version snapshot available (the container may never have been published).",
            options.against === "remote"
              ? "Run `gtm local pull` first."
              : "Publish a version in GTM, then run `gtm local pull` or `gtm local diff --against live --refresh`.",
          );
        }
        results.push({ ws, diff: computeDiff(ws, snapshot, options.against) });
      }
      if (isJson(options.output)) {
        json(oneOrMany(results.map(({ ws, diff }) => ({
          root: ws.root,
          against: diff.against,
          summary: summaryOf(diff),
          summaryByKind: diff.summary.byKind,
          changes: diff.changes.filter((c) => options.all || c.change !== "unchanged").map((c) =>
            options.namesOnly
              ? {
                kind: c.kind,
                name: c.name,
                id: c.id,
                type: c.type,
                file: c.file,
                change: c.change,
              }
              : c
          ),
        }))));
        return;
      }
      results.forEach(({ ws, diff }, i) => {
        if (i > 0) console.log("\n" + colors.dim("─".repeat(60)) + "\n");
        console.log(workspaceHeader(ws));
        console.log("");
        console.log(renderDiff(diff, { detailed: !options.namesOnly, showUnchanged: options.all }));
      });
    } catch (err) {
      fail(err);
    }
  });

const validateCommand = new Command()
  .description("Validate every file in the local workspace against GTM's rules (offline, instant)")
  .option("--strict", "Exit with code 1 on warnings too")
  .option(...DIR_OPTION)
  .option(...OUTPUT_OPTION)
  .action(async (options) => {
    try {
      const workspaces = await manyWorkspaces(options.dir);
      const results = workspaces.map((ws) => ({ ws, validation: validateWorkspace(ws) }));
      if (isJson(options.output)) {
        json(oneOrMany(results.map(({ ws, validation }) => ({
          root: ws.root,
          ok: validation.ok,
          errors: validation.errors,
          warnings: validation.warnings,
          issues: validation.issues,
        }))));
      } else {
        results.forEach(({ ws, validation }, i) => {
          if (i > 0) console.log("");
          if (results.length > 1) console.log(colors.bold(displayPath(ws.root)));
          console.log(renderValidation(validation));
        });
      }
      const failed = results.some(({ validation }) =>
        !validation.ok || (options.strict && validation.warnings > 0)
      );
      if (failed) Deno.exit(1);
    } catch (err) {
      fail(err);
    }
  });

const pushCommand = new Command()
  .description("Validate, plan and upload local changes to the remote GTM workspace")
  .option("--dry-run", "Show the plan without changing anything remotely")
  .option(
    "-f, --force",
    "Overwrite remote changes made since the last pull (resolve conflicts in favour of local)",
  )
  .option("--strict", "Refuse to push when validation reports warnings")
  .option("--continue-on-error", "Keep executing remaining operations after a failure")
  .option("-y, --yes", "Do not ask for confirmation before deleting remote entities")
  .option(...DIR_OPTION)
  .option(...OUTPUT_OPTION)
  .example("Preview", "gtm local push --dry-run")
  .example("Push all workspaces in a folder", "gtm local push --dir ./containers")
  .action(async (options) => {
    try {
      installRetryNotifier(quietOf(options) || isJson(options.output));
      const workspaces = await manyWorkspaces(options.dir);
      const machine = isJson(options.output);
      const summaries: unknown[] = [];
      let exitCode = 0;
      for (const ws of workspaces) {
        if (!machine) {
          if (workspaces.length > 1) console.log(colors.bold(`\n${displayPath(ws.root)}`));
          console.log(workspaceHeader(ws));
          console.log("");
        }
        const validation = validateWorkspace(ws);
        if (!validation.ok || (options.strict && validation.warnings > 0)) {
          if (machine) {
            summaries.push({
              root: ws.root,
              workspaceUrl: gtmUrl(ws),
              ok: false,
              stage: "validation",
              validation,
            });
          } else {
            console.log(renderValidation(validation));
            console.log(
              colors.red("\nPush aborted: fix the validation errors first (`gtm local validate`)."),
            );
          }
          exitCode = 1;
          continue;
        }
        if (!machine && validation.warnings > 0) {
          printWarnings(validation);
          console.log("");
        }
        if (!ws.base) {
          throw new LocalWorkspaceError(
            "This workspace has never been pulled, so changes cannot be compared with the remote state.",
            "Run `gtm local pull` first (use --force if you created files already and want to start from the remote state).",
          );
        }
        const plan = await planPush(ws, {
          force: options.force,
          onProgress: progress(quietOf(options) || isJson(options.output)),
        });
        if (plan.conflicts.length > 0 && !options.force) {
          if (machine) {
            summaries.push({
              root: ws.root,
              ok: false,
              stage: "conflicts",
              conflicts: plan.conflicts,
              plan: plan.operations.map(opJson),
            });
          } else {
            console.log(renderConflicts(plan.conflicts));
            console.log(
              colors.red(
                "\nPush aborted. Resolve the conflicts (pull, or push --force to overwrite).",
              ),
            );
          }
          exitCode = 1;
          continue;
        }
        if (!machine) {
          if (plan.conflicts.length > 0) {
            console.log(
              colors.yellow(
                `--force: overriding ${plan.conflicts.length} conflict${
                  plan.conflicts.length === 1 ? "" : "s"
                }.`,
              ),
            );
            for (const c of plan.conflicts) {
              console.log(colors.yellow(`  ! ${kindLabel(c.kind)} "${c.name}": ${c.reason}`));
            }
            console.log("");
          }
          console.log(renderPlan(plan));
        }
        if (plan.operations.length === 0) {
          if (machine) {
            summaries.push({
              root: ws.root,
              workspaceUrl: gtmUrl(ws),
              ok: true,
              operations: [],
              results: [],
            });
          }
          continue;
        }
        if (options.dryRun) {
          if (machine) {
            summaries.push({
              root: ws.root,
              workspaceUrl: gtmUrl(ws),
              ok: true,
              dryRun: true,
              operations: plan.operations.map(opJson),
              remoteOnly: plan.remoteOnly,
            });
          } else {console.log(
              colors.dim("\nDry run: nothing was changed. Run without --dry-run to apply."),
            );}
          continue;
        }
        const deletes = plan.operations.filter((o) =>
          o.op === "delete" || o.op === "disableBuiltIns"
        );
        if (
          deletes.length > 0 && !options.yes && Deno.stdin.isTerminal() && Deno.stdout.isTerminal()
        ) {
          console.log("");
          const ok = await Confirm.prompt({
            message: `This will delete ${deletes.length} remote entit${
              deletes.length === 1 ? "y" : "ies"
            } from the workspace. Continue?`,
            default: false,
          });
          if (!ok) {
            console.log(colors.dim("Push cancelled."));
            exitCode = 1;
            continue;
          }
        }
        if (!machine) console.log("");
        const result = await executePush(ws, plan, {
          stopOnError: !options.continueOnError,
          onResult: (r, i, total) => {
            if (!machine) console.log(renderOperationResult(r, i, total));
          },
        });
        if (machine) {
          summaries.push({
            root: ws.root,
            workspaceUrl: gtmUrl(ws),
            ok: result.ok,
            operations: plan.operations.map(opJson),
            results: result.results.map((r) => ({
              ...opJson(r.op),
              ok: r.ok,
              id: r.id,
              error: r.error,
              durationMs: r.durationMs,
              drift: r.drift,
            })),
            remoteOnly: plan.remoteOnly,
          });
        } else {
          console.log("");
          const okCount = result.results.filter((r) => r.ok).length;
          const drifted = result.results.filter((r) => r.ok && r.drift);
          if (drifted.length) {
            console.log(
              colors.yellow(
                `⚠ GTM stored ${drifted.length} entit${
                  drifted.length === 1 ? "y" : "ies"
                } differently than requested (unknown parameters are dropped silently). The local files were updated to match:`,
              ),
            );
            for (const r of drifted) {
              console.log(colors.yellow(`  ${kindLabel(r.op.kind)} "${r.op.name}"`));
              for (const f of r.drift!) console.log(colors.dim(`      ${describeFieldChange(f)}`));
            }
            console.log("");
          }
          if (result.ok) {
            success(
              `Pushed ${okCount} change${
                okCount === 1 ? "" : "s"
              } to remote workspace ${ws.meta.workspaceId}. Review and publish in GTM: ${
                gtmUrl(ws)
              }`,
            );
          } else {
            console.log(
              colors.red(
                `✗ Push stopped after ${okCount} successful operation${okCount === 1 ? "" : "s"}; ${
                  result.results.length - okCount
                } failed.`,
              ),
            );
            console.log(
              colors.dim(
                "Successful operations were recorded; fix the problem and run `gtm local push` again to continue.",
              ),
            );
          }
        }
        if (!result.ok) exitCode = 1;
      }
      if (machine) json(workspaces.length === 1 ? summaries[0] : summaries);
      if (exitCode) Deno.exit(exitCode);
    } catch (err) {
      fail(err);
    }
  });

function opJson(
  op: {
    op: string;
    kind: string;
    name: string;
    id?: string;
    types?: string[];
    local?: LocalEntity;
  },
) {
  return {
    op: op.op,
    kind: op.kind,
    name: op.name,
    id: op.id,
    types: op.types,
    file: op.local?.file,
  };
}

const uiCommand = new Command()
  .description(
    "Open a local web UI (GTM-style) that shows the workspace, its changes and validation live",
  )
  .option("-p, --port <port:number>", "Port to listen on (default: random free port)")
  .option("--no-open", "Do not open the browser automatically")
  .option(...DIR_OPTION)
  .action(async (options) => {
    try {
      const roots = await resolveWorkspaceRoots(options.dir, { allowMany: true });
      await startUiServer(roots, { port: options.port, open: options.open !== false });
    } catch (err) {
      fail(err);
    }
  });

const openCommand = new Command()
  .description("Open the linked remote workspace in the Google Tag Manager web UI")
  .option(...DIR_OPTION)
  .action(async (options) => {
    try {
      const ws = await singleWorkspace(options.dir);
      const url = gtmUrl(ws);
      console.log(url);
      const cmd = Deno.build.os === "darwin" ? "open" : "xdg-open";
      try {
        await new Deno.Command(cmd, { args: [url], stdout: "null", stderr: "null" }).output();
      } catch {
        // printing the URL is enough
      }
    } catch (err) {
      fail(err);
    }
  });

// ---------------------------------------------------------------------------------------------
// Entity commands (tags, triggers, variables, folders, templates, clients, transformations, zones)
// ---------------------------------------------------------------------------------------------

function changeStatus(ws: LocalWorkspace, e: LocalEntity): string {
  if (!ws.base) return "";
  const diff = computeDiff(ws, ws.base, "remote");
  const c = diff.changes.find((x) => x.file === e.file);
  return c?.change ?? "";
}

function triggerNames(ws: LocalWorkspace, e: LocalEntity): string {
  const list = Array.isArray(e.entity.firingTriggerId)
    ? (e.entity.firingTriggerId as string[])
    : [];
  return list.map((ref) => resolveTriggerRef(ws, String(ref))?.name ?? `${ref}?`).join(", ");
}

function entityCommands(spec: KindSpec): Command {
  const kind = spec.kind;
  const label = spec.label;
  const cmd = new Command()
    .description(`Manage ${spec.labelPlural} in the local workspace`)
    .action(function () {
      this.showHelp();
    });

  cmd.command("list")
    .description(`List ${spec.labelPlural} in the local workspace`)
    .option(...DIR_OPTION)
    .option(...OUTPUT_OPTION)
    .action(async (options) => {
      try {
        const ws = await singleWorkspace(options.dir);
        const list = ws.entities.filter((e) => e.kind === kind);
        const diff = ws.base ? computeDiff(ws, ws.base, "remote") : undefined;
        const rows = list.map((e) => ({
          id: entityId(e) ?? "",
          name: entityName(e),
          type: typeof e.entity.type === "string" ? e.entity.type : "",
          status: diff?.changes.find((c) => c.file === e.file)?.change ??
            (ws.base ? "" : "unknown"),
          ...(kind === "tag" ? { triggers: triggerNames(ws, e) } : {}),
          file: e.file,
          ...(e.parseError ? { error: e.parseError } : {}),
        }));
        if (isJson(options.output)) {
          json(rows);
          return;
        }
        if (rows.length === 0) {
          console.log(`No ${spec.labelPlural} in ${displayPath(ws.root)}.`);
          return;
        }
        const { Table } = await import("@cliffy/table");
        const cols = [
          "id",
          "name",
          ...(spec.hasType ? ["type"] : []),
          ...(kind === "tag" ? ["triggers"] : []),
          "status",
          "file",
        ];
        const table = new Table().header(
          cols.map((c) => colors.bold(c === "id" ? "ID" : c.charAt(0).toUpperCase() + c.slice(1))),
        ).border();
        for (const r of rows) {
          table.push(cols.map((c) => {
            const v = (r as Record<string, string>)[c] ?? "";
            if (c === "status") {
              return v === "added"
                ? colors.green(v)
                : v === "modified"
                ? colors.yellow(v)
                : v === "unchanged"
                ? colors.dim(v)
                : v;
            }
            return v;
          }));
        }
        console.log(table.toString());
      } catch (err) {
        fail(err);
      }
    });

  cmd.command("get <ref:string>")
    .description(`Show one ${label} (by name, ID or file name)`)
    .option("--simple", "Show parameters in the simplified key/value notation")
    .option(...DIR_OPTION)
    .option(...OUTPUT_OPTION)
    .action(async (options, ref: string) => {
      try {
        const ws = await singleWorkspace(options.dir);
        const e = requireEntity(ws, kind, ref);
        const data: Entity = structuredClone(e.raw);
        if (options.simple && Array.isArray(data.parameter)) {
          data.parameter = simplifyParameterList(e.entity.parameter as never);
        }
        if (isJson(options.output) || options.simple) {
          json({ ...data, _file: e.file, _status: changeStatus(ws, e) || undefined });
          return;
        }
        console.log(
          colors.bold(`${label} "${entityName(e)}"`) +
            colors.dim(
              `  ${e.file}${entityId(e) ? `  #${entityId(e)}` : ""}  ${changeStatus(ws, e)}`,
            ),
        );
        if (kind === "tag") {
          console.log(colors.dim(`firing triggers: ${triggerNames(ws, e) || "none"}`));
        }
        console.log(JSON.stringify(data, null, 2));
      } catch (err) {
        fail(err);
      }
    });

  if (kind === "template") {
    cmd.command("params <ref:string>")
      .description(
        "List the parameters a custom template defines (name, type, required, options, conditions)",
      )
      .option(...DIR_OPTION)
      .option(...OUTPUT_OPTION)
      .action(async (options, ref: string) => {
        try {
          const ws = await singleWorkspace(options.dir);
          const e = requireEntity(ws, kind, ref);
          const parsed = parseTemplate(e.entity.templateData as string | undefined);
          const typeId = templateTypeId(ws, e);
          const rows = parsed.params.map((p) => ({
            name: p.name,
            type: p.type,
            wireType: expectedParameterType(p) ?? "template",
            required: p.required,
            displayName: p.displayName ?? null,
            options: p.enumValues ?? null,
            columns: p.columns ?? null,
            enabledWhen: p.enablingConditions?.map((c) =>
              `${c.paramName} ${c.type === "NOT_EQUALS" ? "!=" : "=="} ${
                JSON.stringify(c.paramValue)
              }`
            ) ?? null,
            radioParent: p.parent ? `${p.parent.name} == ${JSON.stringify(p.parent.value)}` : null,
          }));
          if (isJson(options.output)) {
            json({
              name: entityName(e),
              typeId: typeId ?? null,
              kind: parsed.kind ?? null,
              containerContexts: parsed.containerContexts ?? null,
              parseError: parsed.parseError ?? null,
              parameters: rows,
            });
            return;
          }
          console.log(
            colors.bold(entityName(e)) +
              colors.dim(`  ${parsed.kind ?? ""}  type id: ${typeId ?? "(assigned on push)"}`),
          );
          if (parsed.parseError) {
            console.log(colors.yellow(`  ${parsed.parseError}`));
          }
          for (const r of rows) {
            const flags = [
              r.required ? colors.red("required") : "",
              r.enabledWhen ? colors.dim(`when ${r.enabledWhen.join(" and ")}`) : "",
              r.radioParent ? colors.dim(`when ${r.radioParent}`) : "",
            ].filter(Boolean).join("  ");
            console.log(
              `  ${r.name.padEnd(34)} ${r.type.padEnd(13)} ${
                colors.dim(r.wireType.padEnd(9))
              } ${flags}`,
            );
            if (r.options) {
              console.log(colors.dim(`      options: ${r.options.join(", ")}`));
            }
            if (r.columns) {
              console.log(colors.dim(`      columns: ${r.columns.join(", ")}`));
            }
          }
        } catch (err) {
          fail(err);
        }
      });
  }

  const addCmd = cmd.command("add")
    .description(`Add a new ${label} (validated before it is written)`)
    .option("-n, --name <name:string>", `${label} name`)
    .option(
      "--json <json:string>",
      "Entity as JSON (GTM API format; simplified parameters allowed)",
    )
    .option("--file <path:string>", "Read the entity JSON from a file (- for stdin)")
    .option(
      "-p, --param <param:string>",
      "Parameter key=value (also key:boolean=true, key:integer=5, key:json='[...]'); repeatable",
      { collect: true },
    )
    .option("--notes <notes:string>", "Notes")
    .option("--folder <folder:string>", "Parent folder (name or ID)")
    .option("--force", "Write the file even if validation reports errors")
    .option(...DIR_OPTION)
    .option(...OUTPUT_OPTION);
  if (spec.hasType) {
    addCmd.option("-t, --type <type:string>", `${label} type (e.g. ${exampleType(kind)})`);
  }
  if (kind === "tag") {
    addCmd
      .option(
        "--trigger <trigger:string>",
        "Firing trigger (name or ID, e.g. 'All Pages'); repeatable",
        { collect: true },
      )
      .option("--blocking-trigger <trigger:string>", "Blocking trigger (name or ID); repeatable", {
        collect: true,
      })
      .option("--paused", "Create the tag paused")
      .option(
        "--firing-option <option:string>",
        "oncePerEvent (default), oncePerLoad or unlimited",
      );
  }
  if (kind === "trigger") {
    addCmd.option(
      "--event <name:string>",
      "Shorthand for a customEvent trigger on this event name (sets type and customEventFilter)",
    );
  }
  if (kind === "variable") {
    addCmd.option("--value <value:string>", "Shorthand for --param value=<value> (constants)");
  }
  if (kind === "template") {
    addCmd
      .option(
        "--template-file <path:string>",
        "Read templateData from a .tpl file (exported from the GTM template editor)",
      )
      .option(
        "--gallery <owner/repo:string>",
        "Fetch the template from the community gallery's GitHub repository (newest published version); name defaults to the template's display name",
      )
      .option(
        "--gallery-version <sha:string>",
        "Commit SHA to fetch with --gallery (default: newest version in metadata.yaml)",
      );
  }
  if (kind === "tag" || kind === "variable" || kind === "client") {
    addCmd.option(
      "--template <template:string>",
      `Use a custom template from templates/ (name or ID) as the ${label} type; works before the template has been pushed`,
    );
  }
  if (kind === "client") {
    addCmd.option("--priority <priority:number>", "Client priority (higher runs first)");
  }
  addCmd.example(
    "Simple",
    `gtm local ${spec.command} add --name "My ${label}"${
      spec.hasType ? ` --type ${exampleType(kind).split(",")[0].trim()}` : ""
    }${kind === "tag" ? " --param html='<script>...</script>' --trigger 'All Pages'" : ""}`,
  );
  addCmd.example(
    "From JSON",
    `gtm local ${spec.command} add --json '{"name": "...", ${
      spec.hasType ? '"type": "...", ' : ""
    }"parameter": {"key": "value"}}'`,
  );
  addCmd.action(async (options) => {
    try {
      const ws = await singleWorkspace(options.dir);
      const base = (await readJsonInput(options.json, options.file)) ?? {};
      const raw = await applyFlags(kind, base, options as Record<string, unknown>);
      let galleryNote: string | undefined;
      if (kind === "template" && typeof (options as Record<string, unknown>).gallery === "string") {
        const o = options as Record<string, unknown>;
        const g = await fetchGalleryTemplate(
          o.gallery as string,
          o.galleryVersion as string | undefined,
        );
        raw.templateData = g.templateData;
        if (raw.name === undefined && g.displayName) raw.name = g.displayName;
        galleryNote = `Fetched github.com/${g.owner}/${g.repository} at ${g.version}${
          g.source === "head"
            ? " (default branch; repository has no metadata.yaml)"
            : " (newest published gallery version)"
        }. Imported as a plain custom template; GTM does not allow linking API-created templates to the gallery.`;
      }
      const result = await addEntity(ws, kind, raw, { force: options.force });
      if (isJson(options.output)) {
        json({
          file: result.file,
          entity: elideTemplateData(result.entity, result.file),
          typeId: kind === "template"
            ? templateTypeIdForFile(ws, result.entity) ?? null
            : undefined,
          validation: result.validation,
          gallery: galleryNote,
        });
        return;
      }
      success(
        `Added ${label} "${result.entity.name}" → ${
          colors.cyan(displayPath(ws.root, result.file))
        }`,
      );
      if (galleryNote) console.log(colors.dim(`  ${galleryNote}`));
      if (kind === "template") {
        console.log(
          colors.dim(
            `  Reference it from tags/variables with "template": "${result.entity.name}" (resolved to its cvt_ type on push).`,
          ),
        );
      }
      printWarnings(result.validation);
    } catch (err) {
      fail(err);
    }
  });

  const setCmd = cmd.command("set <ref:string>")
    .description(
      `Change an existing ${label} (merges into the current file; validated before writing)`,
    )
    .option(
      "-n, --name <name:string>",
      "Rename (references in other files are updated automatically)",
    )
    .option(
      "--json <json:string>",
      'Fields to merge as JSON (a simplified "parameter" object merges by key)',
    )
    .option("--file <path:string>", "Read the fields to merge from a file (- for stdin)")
    .option(
      "-p, --param <param:string>",
      "Set a parameter key=value (also key:boolean=..., key:integer=..., key:json=...); repeatable",
      { collect: true },
    )
    .option("--unset-param <key:string>", "Remove a parameter; repeatable", { collect: true })
    .option("--unset <field:string>", "Remove a top-level field; repeatable", { collect: true })
    .option("--notes <notes:string>", "Notes")
    .option("--folder <folder:string>", "Parent folder (name or ID)")
    .option("--force", "Write the file even if validation reports errors")
    .option(...DIR_OPTION)
    .option(...OUTPUT_OPTION);
  if (spec.hasType) setCmd.option("-t, --type <type:string>", `Change the ${label} type`);
  if (kind === "tag") {
    setCmd
      .option(
        "--trigger <trigger:string>",
        "Replace the firing triggers with this list (name or ID); repeatable",
        { collect: true },
      )
      .option("--add-trigger <trigger:string>", "Add a firing trigger; repeatable", {
        collect: true,
      })
      .option("--remove-trigger <trigger:string>", "Remove a firing trigger; repeatable", {
        collect: true,
      })
      .option("--blocking-trigger <trigger:string>", "Replace the blocking triggers; repeatable", {
        collect: true,
      })
      .option("--paused <paused:boolean>", "Pause (true) or unpause (false) the tag")
      .option("--firing-option <option:string>", "oncePerEvent, oncePerLoad or unlimited");
  }
  if (kind === "trigger") {
    setCmd.option("--event <name:string>", "Change the custom event name (customEvent triggers)");
  }
  if (kind === "variable") {
    setCmd.option("--value <value:string>", "Shorthand for --param value=<value> (constants)");
  }
  if (kind === "template") {
    setCmd.option(
      "--template-file <path:string>",
      "Replace templateData with the content of a .tpl file",
    );
  }
  if (kind === "tag" || kind === "variable" || kind === "client") {
    setCmd.option(
      "--template <template:string>",
      "Switch to a custom template from templates/ (name or ID)",
    );
  }
  if (kind === "client") setCmd.option("--priority <priority:number>", "Client priority");
  setCmd.example(
    "Change a parameter",
    `gtm local ${spec.command} set "My ${label}" --param key=value`,
  );
  setCmd.example("Rename", `gtm local ${spec.command} set "Old name" --name "New name"`);
  setCmd.action(async (options, ref: string) => {
    try {
      const ws = await singleWorkspace(options.dir);
      const e = requireEntity(ws, kind, ref);
      const fields = (await readJsonInput(options.json, options.file)) ?? {};
      const flagFields = await applyFlags(kind, {}, options as Record<string, unknown>, true);
      const patch: Patch = {
        fields: { ...fields, ...flagFields },
        params: (options.param ?? []).map(parseParamArg),
        unsetParams: options.unsetParam,
        unsetFields: options.unset,
      };
      if (kind === "tag") {
        const o = options as Record<string, string[] | undefined>;
        patch.addTriggers = o.addTrigger;
        patch.removeTriggers = o.removeTrigger;
      }
      const result = await updateEntity(ws, e, patch, { force: options.force });
      if (isJson(options.output)) {
        json({
          file: result.file,
          entity: elideTemplateData(result.entity, result.file),
          validation: result.validation,
          updatedReferences: result.updatedReferences ?? [],
        });
        return;
      }
      success(
        `Updated ${label} "${result.entity.name}" → ${
          colors.cyan(displayPath(ws.root, result.file))
        }`,
      );
      if (result.updatedReferences?.length) {
        console.log(colors.dim(`  Updated references in: ${result.updatedReferences.join(", ")}`));
      }
      printWarnings(result.validation);
    } catch (err) {
      fail(err);
    }
  });

  cmd.command("rm <ref:string>")
    .alias("remove")
    .alias("delete")
    .description(
      `Delete a ${label} from the local workspace (the remote ${label} is deleted on the next push)`,
    )
    .option("-f, --force", "Delete even if other entities still reference it")
    .option(...DIR_OPTION)
    .option(...OUTPUT_OPTION)
    .action(async (options, ref: string) => {
      try {
        const ws = await singleWorkspace(options.dir);
        const e = requireEntity(ws, kind, ref);
        const result = await removeEntity(ws, e, { force: options.force });
        if (isJson(options.output)) {
          json({
            file: result.file,
            dependents: result.dependents.map((d) => ({
              kind: d.kind,
              name: entityName(d),
              file: d.file,
            })),
          });
          return;
        }
        success(
          `Deleted ${label} "${entityName(e)}" (${
            displayPath(ws.root, result.file)
          }). It will be removed from the remote workspace on the next push.`,
        );
        if (result.dependents.length) {
          warn(
            `Still referenced by: ${
              result.dependents.map((d) => `${kindLabel(d.kind)} "${entityName(d)}"`).join(", ")
            } — fix those before pushing.`,
          );
        }
      } catch (err) {
        fail(err);
      }
    });

  return cmd;
}

function requireEntity(ws: LocalWorkspace, kind: EntityKind, ref: string): LocalEntity {
  const e = findEntity(ws, kind, ref);
  if (e) return e;
  const names = ws.entities.filter((x) => x.kind === kind).map(entityName);
  throw new LocalWorkspaceError(
    `No ${KINDS[kind].label} "${ref}" in ${displayPath(ws.root)}.`,
    names.length
      ? `Existing ${KINDS[kind].labelPlural}: ${names.map((n) => `"${n}"`).join(", ")}.`
      : `There are no ${KINDS[kind].labelPlural} yet; add one with \`gtm local ${
        KINDS[kind].command
      } add\`.`,
  );
}

function exampleType(kind: EntityKind): string {
  switch (kind) {
    case "tag":
      return "html, googtag, gaawe, awct, cvt_<templateId>";
    case "trigger":
      return "customEvent, pageview, domReady, click, linkClick";
    case "variable":
      return "c, v, jsm, u, k, smm, ed";
    case "client":
      return "gaaw_client, gtm_client";
    default:
      return "...";
  }
}

/** Turn CLI flags into entity fields (shared by add and set) */
async function applyFlags(
  kind: EntityKind,
  base: Entity,
  o: Record<string, unknown>,
  forSet = false,
): Promise<Entity> {
  const out: Entity = { ...base };
  if (typeof o.name === "string") out.name = o.name;
  if (typeof o.type === "string") out.type = o.type;
  if (typeof o.notes === "string") out.notes = o.notes;
  if (typeof o.folder === "string") out.parentFolderId = o.folder;
  if (!forSet && Array.isArray(o.param) && o.param.length) {
    // Start from whatever parameters the JSON input provided (array or simplified object), then upsert flags.
    let list: Record<string, unknown>[] = [];
    if (Array.isArray(out.parameter)) list = [...(out.parameter as Record<string, unknown>[])];
    else if (out.parameter && typeof out.parameter === "object") {
      list = Object.entries(out.parameter as Record<string, unknown>).map(([k, v]) =>
        fromSimpleValue(k, v) as Record<string, unknown>
      );
    }
    for (const arg of o.param as string[]) {
      const p = parseParamArg(arg) as Record<string, unknown>;
      const idx = list.findIndex((x) => x.key === p.key);
      if (idx >= 0) list[idx] = p;
      else list.push(p);
    }
    out.parameter = list;
  }
  if (kind === "variable" && typeof o.value === "string") {
    const list = Array.isArray(out.parameter) ? (out.parameter as Record<string, unknown>[]) : [];
    const idx = list.findIndex((x) => x.key === "value");
    const p = { type: "template", key: "value", value: o.value };
    if (idx >= 0) list[idx] = p;
    else list.push(p);
    out.parameter = list;
    if (!forSet && out.type === undefined) out.type = "c";
  }
  if (kind === "tag") {
    if (Array.isArray(o.trigger) && o.trigger.length) out.firingTriggerId = o.trigger;
    if (Array.isArray(o.blockingTrigger) && o.blockingTrigger.length) {
      out.blockingTriggerId = o.blockingTrigger;
    }
    if (typeof o.paused === "boolean") out.paused = o.paused;
    if (typeof o.firingOption === "string") out.tagFiringOption = o.firingOption;
  }
  if (kind === "trigger" && typeof o.event === "string") {
    if (!forSet || out.type === undefined) out.type = "customEvent";
    out.customEventFilter = [{
      type: "equals",
      parameter: [{ type: "template", key: "arg0", value: "{{_event}}" }, {
        type: "template",
        key: "arg1",
        value: o.event,
      }],
    }];
  }
  if (kind === "template" && typeof o.templateFile === "string") {
    out.templateData = await Deno.readTextFile(o.templateFile);
    if (out.name === undefined) {
      const parsed = parseTemplate(out.templateData as string);
      if (parsed.displayName) out.name = parsed.displayName;
    }
  }
  if (kind === "client" && typeof o.priority === "number") out.priority = o.priority;
  if (
    (kind === "tag" || kind === "variable" || kind === "client") && typeof o.template === "string"
  ) {
    out.template = o.template;
    if (forSet) delete out.type;
  }
  return out;
}

/** The cvt_ type id a template file resolves to (undefined until a new template is pushed) */
function templateTypeIdForFile(ws: LocalWorkspace, entity: Entity): string | undefined {
  const fake: LocalEntity = { kind: "template", file: "", raw: entity, entity };
  return templateTypeId(ws, fake);
}

// ---------------------------------------------------------------------------------------------
// Built-in variables
// ---------------------------------------------------------------------------------------------

const builtInsCommand = new Command()
  .description("Manage enabled built-in variables (built-in-variables.json)")
  .action(function () {
    this.showHelp();
  })
  .command("list")
  .description("List enabled built-in variables and the ones available for this container type")
  .option("--available", "List every built-in variable available for this container type")
  .option(...DIR_OPTION)
  .option(...OUTPUT_OPTION)
  .action(async (options) => {
    try {
      const ws = await singleWorkspace(options.dir);
      const table = builtInVariablesFor(ws.context);
      const enabled = new Set(ws.builtInVariables.map((b) => b.type));
      const rows = Object.entries(table).filter(([t]) => options.available || enabled.has(t)).map((
        [type, name],
      ) => ({ type, name, enabled: enabled.has(type) }));
      if (isJson(options.output)) {
        json(rows);
        return;
      }
      for (const r of rows) {
        console.log(
          `${r.enabled ? colors.green("✓") : colors.dim("·")} ${r.type.padEnd(32)} {{${r.name}}}`,
        );
      }
      if (!options.available) {
        console.log(
          colors.dim(
            `\n${rows.length} enabled. Use --available to see all ${
              Object.keys(table).length
            } built-in variables for ${ws.context} containers.`,
          ),
        );
      }
    } catch (err) {
      fail(err);
    }
  })
  .command("enable <types...:string>")
  .description("Enable built-in variables by type (e.g. pageUrl clickText) or display name")
  .option(...DIR_OPTION)
  .option(...OUTPUT_OPTION)
  .action(async (options, ...types: string[]) => {
    try {
      const ws = await singleWorkspace(options.dir);
      const table = builtInVariablesFor(ws.context);
      const list = [...ws.builtInVariables];
      const added: string[] = [];
      for (const t of types.flatMap((x) => x.split(","))) {
        const type = builtInVariableType(ws.context, t);
        if (!type) {
          throw new LocalWorkspaceError(
            `"${t}" is not a built-in variable available in ${ws.context} containers.`,
            `Run \`gtm local built-in-variables list --available\` to see the ${
              Object.keys(table).length
            } available types.`,
          );
        }
        if (!list.some((b) => b.type === type)) {
          list.push({ type, name: table[type] });
          added.push(type);
        }
      }
      await writeBuiltInVariables(ws.root, list);
      if (isJson(options.output)) {
        json({ file: BUILT_IN_VARIABLES_FILE, enabled: added, total: list.length });
        return;
      }
      success(
        added.length
          ? `Enabled ${added.map((t) => `${t} ({{${table[t]}}})`).join(", ")}`
          : "Nothing to do: already enabled.",
      );
    } catch (err) {
      fail(err);
    }
  })
  .command("disable <types...:string>")
  .description("Disable built-in variables by type or display name")
  .option(...DIR_OPTION)
  .option(...OUTPUT_OPTION)
  .action(async (options, ...types: string[]) => {
    try {
      const ws = await singleWorkspace(options.dir);
      const remove = new Set<string>();
      for (const t of types.flatMap((x) => x.split(","))) {
        const type = builtInVariableType(ws.context, t) ?? t;
        remove.add(type);
      }
      const list = ws.builtInVariables.filter((b) => !remove.has(b.type));
      const removed = ws.builtInVariables.length - list.length;
      await writeBuiltInVariables(ws.root, list);
      if (isJson(options.output)) {
        json({ file: BUILT_IN_VARIABLES_FILE, disabled: [...remove], total: list.length });
        return;
      }
      success(
        removed
          ? `Disabled ${removed} built-in variable${removed === 1 ? "" : "s"}.`
          : "Nothing to do: none of these were enabled.",
      );
    } catch (err) {
      fail(err);
    }
  });

// ---------------------------------------------------------------------------------------------
// Root command
// ---------------------------------------------------------------------------------------------

export const localCommand = new Command()
  .name("local")
  .description(
    "Local workspaces: pull a GTM workspace to disk as JSON files, edit them (validated instantly, no API calls), review the diff and push everything back in one go",
  )
  .example("Start", "gtm local init --account-id 123 --container-id 456")
  .example(
    "Add a tag",
    "gtm local tags add --name 'GA4 - purchase' --type gaawe --param eventName=purchase --param measurementIdOverride='{{GA4 ID}}' --trigger 'event.purchase'",
  )
  .example("Review", "gtm local status && gtm local diff")
  .example("Upload", "gtm local push")
  .example("Browse", "gtm local ui")
  .action(function () {
    this.showHelp();
  })
  .command("init", initCommand)
  .command("pull", pullCommand)
  .command("status", statusCommand)
  .command("diff", diffCommand)
  .command("validate", validateCommand)
  .command("push", pushCommand)
  .command("ui", uiCommand)
  .command("open", openCommand)
  .command("built-in-variables", builtInsCommand)
  .alias("biv");

for (const kind of KIND_ORDER) {
  const spec = KINDS[kind];
  localCommand.command(spec.command, entityCommands(spec));
}

export { hasChanges, supportedKinds };
