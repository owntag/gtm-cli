/**
 * Output formatting utilities
 */

import { Table } from "@cliffy/table";
import { colors } from "@cliffy/ansi/colors";

export type OutputFormat = "json" | "table" | "compact";

/**
 * Detect if we're outputting to a terminal (TTY)
 */
export function isTTY(): boolean {
  return Deno.stdout.isTerminal();
}

/**
 * Get the effective output format
 */
export function getOutputFormat(requested?: OutputFormat): OutputFormat {
  if (requested) {
    return requested;
  }

  // If piping to another command, default to JSON
  if (!isTTY()) {
    return "json";
  }

  return "table";
}

/**
 * Output data in the specified format
 */
export function output(
  data: unknown,
  format: OutputFormat = getOutputFormat(),
  options?: {
    columns?: string[];
    headers?: string[];
  }
): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify(data, null, 2));
      break;

    case "compact":
      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (typeof item === "object" && item !== null) {
            // Output key fields only
            const id =
              (item as Record<string, unknown>).tagId ||
              (item as Record<string, unknown>).triggerId ||
              (item as Record<string, unknown>).variableId ||
              (item as Record<string, unknown>).containerId ||
              (item as Record<string, unknown>).accountId ||
              (item as Record<string, unknown>).workspaceId ||
              (item as Record<string, unknown>).folderId ||
              "";
            const name = (item as Record<string, unknown>).name || "";
            console.log(`${id}\t${name}`);
          } else {
            console.log(String(item));
          }
        });
      } else {
        console.log(JSON.stringify(data));
      }
      break;

    case "table":
    default:
      if (Array.isArray(data) && data.length > 0) {
        outputTable(data, options?.columns, options?.headers);
      } else if (typeof data === "object" && data !== null) {
        // Single object - output as key-value pairs
        outputObject(data as Record<string, unknown>);
      } else {
        console.log(String(data));
      }
      break;
  }
}

/**
 * Output an array of objects as a table
 */
function outputTable(data: unknown[], columns?: string[], headers?: string[]): void {
  if (data.length === 0) {
    console.log("No results found.");
    return;
  }

  const firstItem = data[0];
  if (typeof firstItem !== "object" || firstItem === null) {
    data.forEach((item) => console.log(String(item)));
    return;
  }

  // Determine columns to display
  const cols = columns || getDefaultColumns(firstItem as Record<string, unknown>);
  const hdrs = headers || cols.map(formatHeader);

  // Build table rows
  const rows = data.map((item) => {
    const record = item as Record<string, unknown>;
    return cols.map((col) => formatValue(record[col]));
  });

  // Create and render table
  const table = new Table()
    .header(hdrs.map((h) => colors.bold(h)))
    .body(rows)
    .border();

  console.log(table.toString());
}

/**
 * Output a single object as key-value pairs
 */
function outputObject(data: Record<string, unknown>): void {
  const table = new Table();

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      table.push([colors.bold(formatHeader(key)), formatValue(value)]);
    }
  }

  table.border();
  console.log(table.toString());
}

/**
 * Get default columns for a resource type
 */
function getDefaultColumns(item: Record<string, unknown>): string[] {
  // Common ID columns in order of preference
  const idColumns = [
    "accountId",
    "containerId",
    "workspaceId",
    "tagId",
    "triggerId",
    "variableId",
    "folderId",
    "containerVersionId",
    "environmentId",
    "clientId",
    "templateId",
  ];

  const columns: string[] = [];

  // Add ID column first
  for (const idCol of idColumns) {
    if (idCol in item) {
      columns.push(idCol);
      break;
    }
  }

  // Add name
  if ("name" in item) {
    columns.push("name");
  }

  // Add type if present
  if ("type" in item) {
    columns.push("type");
  }

  // Add common useful fields
  if ("publicId" in item) {
    columns.push("publicId");
  }

  if ("fingerprint" in item) {
    columns.push("fingerprint");
  }

  return columns;
}

/**
 * Format a header name (camelCase to Title Case)
 */
function formatHeader(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? colors.green("✓") : colors.red("✗");
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return `[${value.length} items]`;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Print a success message
 */
export function success(message: string): void {
  console.log(colors.green("✓"), message);
}

/**
 * Print an error message
 */
export function error(message: string): void {
  console.error(colors.red("✗"), message);
}

/**
 * Print a warning message
 */
export function warn(message: string): void {
  console.warn(colors.yellow("⚠"), message);
}

/**
 * Print an info message
 */
export function info(message: string): void {
  console.log(colors.blue("ℹ"), message);
}
