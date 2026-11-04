/**
 * Local workspaces: tiny local HTTP server that renders the workspace in a GTM-like web UI.
 * Read-only: the CLI (or direct file edits) stay the single way to change things; the page polls
 * the server so edits made by an agent show up as they happen.
 */

import { colors } from "@cliffy/ansi/colors";
import { KIND_ORDER, KINDS } from "../kinds.ts";
import { loadWorkspace } from "../store.ts";
import { validateWorkspace } from "../validate.ts";
import { computeDiff } from "../diff.ts";
import { simplifyParameterList } from "../params.ts";
import { BUILT_IN_TRIGGERS, entityId, entityName, resolveReferencesToIds } from "../workspace.ts";
import { builtInVariablesFor } from "../schema/built-ins.ts";
import { UI_PAGE } from "./page.ts";

export interface UiOptions {
  port?: number;
  open?: boolean;
  hostname?: string;
}

async function buildState(root: string) {
  const ws = await loadWorkspace(root);
  const validation = validateWorkspace(ws);
  const diffRemote = computeDiff(ws, ws.base, "remote");
  const diffLive = ws.live ? computeDiff(ws, ws.live, "live") : null;
  const triggerNames: Record<string, string> = {};
  for (const t of BUILT_IN_TRIGGERS[ws.context]) triggerNames[t.id] = t.name;
  for (const t of ws.entities.filter((e) => e.kind === "trigger")) {
    const id = entityId(t);
    if (id) triggerNames[id] = entityName(t);
  }
  const entities: Record<string, unknown[]> = {};
  for (const kind of KIND_ORDER) {
    entities[kind] = ws.entities.filter((e) => e.kind === kind).map((e) => {
      const change = diffRemote.changes.find((c) => c.file === e.file);
      const liveChange = diffLive?.changes.find((c) => c.file === e.file);
      return {
        file: e.file,
        id: entityId(e) ?? null,
        name: entityName(e),
        type: typeof e.entity.type === "string" ? e.entity.type : null,
        parseError: e.parseError ?? null,
        raw: e.raw,
        canonical: resolveReferencesToIds(ws, kind, e.entity),
        simpleParams: Array.isArray(e.entity.parameter)
          ? simplifyParameterList(e.entity.parameter as never)
          : null,
        status: change?.change ?? "added",
        fields: change?.fields ?? [],
        statusLive: liveChange?.change ?? null,
        fieldsLive: liveChange?.fields ?? [],
        issues: validation.issues.filter((i) => i.file === e.file),
      };
    });
  }
  const deleted = diffRemote.changes.filter((c) =>
    c.change === "deleted" && c.kind !== "builtInVariable"
  ).map((c) => ({ kind: c.kind, name: c.name, id: c.id, type: c.type, before: c.before }));
  const deletedLive =
    diffLive?.changes.filter((c) => c.change === "deleted" && c.kind !== "builtInVariable").map((
      c,
    ) => ({ kind: c.kind, name: c.name, id: c.id, type: c.type })) ?? [];
  const builtInTable = builtInVariablesFor(ws.context);
  return {
    root: ws.root,
    meta: ws.meta,
    context: ws.context,
    kinds: KIND_ORDER.filter((k) =>
      KINDS[k].contexts.includes(ws.context) || (entities[k]?.length ?? 0) > 0
    ).map((k) => ({ kind: k, label: KINDS[k].labelPlural, dir: KINDS[k].dir })),
    entities,
    deleted,
    deletedLive,
    builtInVariables: ws.builtInVariables.map((b) => ({
      type: b.type,
      name: b.name ?? builtInTable[b.type] ?? b.type,
    })),
    builtInChanges: diffRemote.changes.filter((c) => c.kind === "builtInVariable"),
    triggerNames,
    diffRemote: {
      summary: diffRemote.summary,
      changes: diffRemote.changes.filter((c) => c.change !== "unchanged"),
    },
    diffLive: diffLive
      ? {
        summary: diffLive.summary,
        changes: diffLive.changes.filter((c) => c.change !== "unchanged"),
      }
      : null,
    validation,
    hasBase: !!ws.base,
    live: ws.live
      ? {
        containerVersionId: ws.live.containerVersionId ?? null,
        versionName: ws.live.versionName ?? null,
        takenAt: ws.live.takenAt,
      }
      : null,
    generatedAt: new Date().toISOString(),
  };
}

export async function startUiServer(roots: string[], options: UiOptions = {}): Promise<void> {
  const hostname = options.hostname ?? "127.0.0.1";
  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(UI_PAGE, {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      if (url.pathname === "/api/workspaces") {
        const list = [];
        for (const [i, root] of roots.entries()) {
          try {
            const ws = await loadWorkspace(root, { snapshots: false });
            list.push({
              index: i,
              root,
              name: ws.meta.container.name ?? root,
              publicId: ws.meta.container.publicId ?? ws.meta.containerId,
              context: ws.context,
              workspaceId: ws.meta.workspaceId,
            });
          } catch (e) {
            list.push({ index: i, root, name: root, error: (e as Error).message });
          }
        }
        return Response.json(list, { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/api/state") {
        const index = Number(url.searchParams.get("ws") ?? "0");
        const root = roots[index] ?? roots[0];
        const state = await buildState(root);
        return Response.json(state, { headers: { "cache-control": "no-store" } });
      }
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  };

  const server = Deno.serve({ port: options.port ?? 0, hostname, onListen: () => {} }, handler);
  const addr = server.addr as Deno.NetAddr;
  const url = `http://${hostname}:${addr.port}/`;
  console.log(
    `${colors.green("✓")} Local workspace UI running at ${colors.cyan(url)} ${
      colors.dim("(Ctrl+C to stop)")
    }`,
  );
  console.log(
    colors.dim(
      `  Showing ${roots.length} workspace${roots.length === 1 ? "" : "s"}: ${roots.join(", ")}`,
    ),
  );
  if (options.open !== false) {
    const cmd = Deno.build.os === "darwin" ? "open" : "xdg-open";
    try {
      await new Deno.Command(cmd, { args: [url], stdout: "null", stderr: "null" }).output();
    } catch {
      // ignore: URL is printed
    }
  }
  await server.finished;
}
