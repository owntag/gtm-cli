/**
 * Local workspaces: human-readable terminal rendering of status, diffs and validation results.
 * (Machine-readable output is plain JSON of the underlying data structures.)
 */

import { colors } from "@cliffy/ansi/colors";
import type { EntityKind } from "./kinds.ts";
import { KIND_ORDER, KINDS } from "./kinds.ts";
import type {
  DiffResult,
  EntityChange,
  LocalWorkspace,
  ValidationIssue,
  ValidationResult,
} from "./types.ts";
import { describeFieldChange } from "./diff.ts";
import type { Conflict, Operation, OperationResult, PushPlan } from "./push.ts";
import { describeOperation } from "./push.ts";
import { displayPath } from "./store.ts";

export function kindLabel(kind: EntityKind | "builtInVariable" | "workspace"): string {
  if (kind === "builtInVariable") return "built-in variable";
  if (kind === "workspace") return "workspace";
  return KINDS[kind].label;
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return iso;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function workspaceHeader(ws: LocalWorkspace): string {
  const c = ws.meta.container;
  const ctx = ws.context === "server" ? "server" : ws.context;
  const lines = [
    `${colors.bold("Local workspace")} ${colors.cyan(displayPath(ws.root))}  →  ${
      colors.bold(c.name ?? "container")
    } ${colors.dim(`(${c.publicId ?? ws.meta.containerId}, ${ctx})`)}`,
    `${colors.dim("Remote workspace")} ${ws.meta.workspaceId}${
      ws.meta.workspace?.name ? ` "${ws.meta.workspace.name}"` : ""
    }  ${colors.dim("· pulled")} ${relativeTime(ws.meta.pulledAt)}${
      ws.live
        ? `  ${colors.dim("· live version")} ${ws.live.containerVersionId ?? "?"}${
          ws.live.versionName ? ` "${ws.live.versionName}"` : ""
        }`
        : ""
    }`,
  ];
  return lines.join("\n");
}

const CHANGE_SYMBOL: Record<string, string> = {
  added: colors.green("+"),
  modified: colors.yellow("~"),
  deleted: colors.red("-"),
  unchanged: colors.dim("="),
};

function changeWord(change: EntityChange["change"]): string {
  switch (change) {
    case "added":
      return colors.green("added");
    case "modified":
      return colors.yellow("modified");
    case "deleted":
      return colors.red("deleted");
    default:
      return colors.dim("unchanged");
  }
}

/** Render a diff grouped by kind. `detailed` prints field-level changes. */
export function renderDiff(
  diff: DiffResult,
  options: { detailed?: boolean; showUnchanged?: boolean } = {},
): string {
  const out: string[] = [];
  const target = diff.against === "remote" ? "remote workspace (as of last pull)" : "live version";
  const total = diff.summary.added + diff.summary.modified + diff.summary.deleted;
  out.push(
    colors.bold(`Changes vs ${target}: `) +
      (total === 0
        ? colors.green("none")
        : `${total} (${colors.green(`+${diff.summary.added}`)} ${
          colors.yellow(`~${diff.summary.modified}`)
        } ${colors.red(`-${diff.summary.deleted}`)})`),
  );
  const kinds: Array<EntityKind | "builtInVariable"> = [...KIND_ORDER, "builtInVariable"];
  for (const kind of kinds) {
    const changes = diff.changes.filter((c) =>
      c.kind === kind && (options.showUnchanged || c.change !== "unchanged")
    );
    if (changes.length === 0) continue;
    const label = kind === "builtInVariable" ? "Built-in variables" : KINDS[kind].labelPlural;
    out.push("");
    out.push(colors.bold(label.charAt(0).toUpperCase() + label.slice(1)));
    for (const c of changes) {
      const idPart = c.id ? colors.dim(` #${c.id}`) : "";
      const typePart = c.type ? colors.dim(`  ${c.type}`) : "";
      out.push(
        `  ${CHANGE_SYMBOL[c.change]} ${c.name}${idPart}${typePart}  ${changeWord(c.change)}${
          c.file && c.change !== "deleted" ? colors.dim(`  ${c.file}`) : ""
        }`,
      );
      if (options.detailed && c.fields) {
        for (const f of c.fields) out.push(`      ${colorizeFieldChange(describeFieldChange(f))}`);
      }
    }
  }
  return out.join("\n");
}

function colorizeFieldChange(s: string): string {
  if (s.startsWith("+")) return colors.green(s);
  if (s.startsWith("-")) return colors.red(s);
  return colors.yellow(s);
}

export function renderValidation(
  result: ValidationResult,
  options: { quietOk?: boolean } = {},
): string {
  const out: string[] = [];
  if (result.issues.length === 0) {
    if (!options.quietOk) out.push(colors.green("✓ Validation passed: no errors, no warnings."));
    return out.join("\n");
  }
  for (const issue of result.issues) out.push(renderIssue(issue));
  out.push("");
  const summary = `${result.errors} error${
    result.errors === 1 ? "" : "s"
  }, ${result.warnings} warning${result.warnings === 1 ? "" : "s"}`;
  out.push(
    result.errors > 0
      ? colors.red(`✗ Validation failed: ${summary}.`)
      : colors.yellow(`⚠ Validation passed with warnings: ${summary}.`),
  );
  return out.join("\n");
}

export function renderIssue(issue: ValidationIssue): string {
  const sym = issue.severity === "error" ? colors.red("✗ error") : colors.yellow("⚠ warning");
  const where = [issue.file ?? (issue.kind ? kindLabel(issue.kind) : ""), issue.path].filter(
    Boolean,
  ).join("  ");
  const head = `${sym}  ${colors.bold(where)}  ${colors.dim(issue.code)}`;
  const lines = [head, `    ${issue.message}`];
  if (issue.hint) lines.push(`    ${colors.dim("→ " + issue.hint)}`);
  return lines.join("\n");
}

export function renderConflicts(conflicts: Conflict[]): string {
  const out = [
    colors.red(
      colors.bold(
        `✗ ${conflicts.length} conflict${
          conflicts.length === 1 ? "" : "s"
        } with the remote workspace:`,
      ),
    ),
  ];
  for (const c of conflicts) {
    out.push(
      `  ${colors.red("!")} ${kindLabel(c.kind)} ${colors.bold(c.name)}${
        c.id ? colors.dim(` #${c.id}`) : ""
      }`,
    );
    out.push(`      ${c.reason}`);
    out.push(`      ${colors.dim("→ " + c.hint)}`);
  }
  return out.join("\n");
}

export function renderPlan(plan: PushPlan): string {
  const out: string[] = [];
  if (plan.operations.length === 0) {
    out.push(
      colors.green("Nothing to push: the remote workspace already matches the local workspace."),
    );
  } else {
    out.push(
      colors.bold(
        `Plan: ${plan.operations.length} operation${plan.operations.length === 1 ? "" : "s"}`,
      ),
    );
    plan.operations.forEach((op, i) =>
      out.push(`  ${String(i + 1).padStart(3)}. ${colorizeOp(op)}`)
    );
  }
  if (plan.remoteOnly.length > 0) {
    out.push("");
    out.push(
      colors.dim(
        `${plan.remoteOnly.length} entit${
          plan.remoteOnly.length === 1 ? "y" : "ies"
        } were added remotely since your last pull and are left untouched: ${
          plan.remoteOnly.map((r) => `${kindLabel(r.kind)} "${r.name}"`).join(", ")
        }. Run \`gtm local pull\` afterwards to get them.`,
      ),
    );
  }
  return out.join("\n");
}

export function colorizeOp(op: Operation): string {
  const text = describeOperation(op);
  switch (op.op) {
    case "create":
    case "enableBuiltIns":
      return colors.green(text);
    case "update":
      return colors.yellow(text);
    default:
      return colors.red(text);
  }
}

export function renderOperationResult(r: OperationResult, index: number, total: number): string {
  const n = `[${index + 1}/${total}]`;
  if (r.ok) {
    return `${colors.dim(n)} ${colors.green("✓")} ${describeOperation(r.op)}${
      r.op.op === "create" && r.id ? colors.dim(` → id ${r.id}`) : ""
    } ${colors.dim(`${r.durationMs}ms`)}`;
  }
  return `${colors.dim(n)} ${colors.red("✗")} ${describeOperation(r.op)}\n      ${
    colors.red(r.error ?? "failed")
  }`;
}

/** One-line summary of local entity counts */
export function renderCounts(ws: LocalWorkspace): string {
  const parts: string[] = [];
  for (const kind of KIND_ORDER) {
    const n = ws.entities.filter((e) => e.kind === kind).length;
    if (n > 0) parts.push(`${n} ${n === 1 ? KINDS[kind].label : KINDS[kind].labelPlural}`);
  }
  if (ws.builtInVariables.length) parts.push(`${ws.builtInVariables.length} built-in variables`);
  return parts.join(", ") || "no entities";
}
