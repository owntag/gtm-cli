/**
 * Local workspaces: the single-page UI served by `gtm local ui`.
 * Plain HTML/CSS/JS, no external dependencies, styled after the Google Tag Manager interface.
 */

export const UI_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GTM CLI · Local workspace</title>
<style>
  :root {
    --blue: #1a73e8; --blue-dark: #174ea6; --blue-bg: #e8f0fe;
    --green: #188038; --green-bg: #e6f4ea; --yellow: #e37400; --yellow-bg: #fef7e0; --red: #d93025; --red-bg: #fce8e6;
    --text: #202124; --muted: #5f6368; --line: #dadce0; --bg: #f8f9fa; --card: #fff; --hover: #f1f3f4;
    --font: "Google Sans", Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    --mono: "Roboto Mono", SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font-family: var(--font); color: var(--text); background: var(--bg); font-size: 14px; display: flex; flex-direction: column; }
  a { color: var(--blue); text-decoration: none; }
  header { height: 64px; background: #fff; border-bottom: 1px solid var(--line); display: flex; align-items: center; padding: 0 24px; gap: 20px; position: sticky; top: 0; z-index: 5; }
  .logo { display: flex; align-items: center; gap: 10px; font-size: 20px; color: var(--muted); white-space: nowrap; }
  .logo .mark { width: 28px; height: 28px; border-radius: 6px; background: linear-gradient(135deg, #4285f4, #1a73e8 60%, #174ea6); display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 13px; }
  .logo b { color: var(--text); font-weight: 500; }
  .crumbs { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 14px; min-width: 0; }
  .crumbs .sep { color: var(--line); }
  .crumbs .name { color: var(--text); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 16px; padding: 3px 10px; font-size: 12px; color: var(--muted); background: #fff; white-space: nowrap; }
  .chip.local { background: var(--blue-bg); border-color: transparent; color: var(--blue-dark); font-weight: 500; }
  .spacer { flex: 1; }
  .live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  .live .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px var(--green-bg); }
  .live.stale .dot { background: var(--red); box-shadow: 0 0 0 3px var(--red-bg); }
  .btn { border: 1px solid var(--line); background: #fff; color: var(--blue); font-weight: 500; border-radius: 4px; padding: 7px 14px; font-size: 14px; cursor: pointer; font-family: inherit; }
  .btn.primary { background: var(--blue); color: #fff; border-color: var(--blue); }
  .btn:disabled { opacity: .6; cursor: default; }
  select.ws { font: inherit; border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; background: #fff; max-width: 320px; }
  main { display: flex; flex: 1; min-height: 0; }
  nav { width: 240px; background: #fff; border-right: 1px solid var(--line); padding: 12px 8px; flex-shrink: 0; }
  nav button { display: flex; align-items: center; width: 100%; gap: 12px; border: 0; background: none; text-align: left; padding: 10px 16px; border-radius: 0 20px 20px 0; font: inherit; font-size: 14px; color: var(--text); cursor: pointer; }
  nav button:hover { background: var(--hover); }
  nav button.active { background: var(--blue-bg); color: var(--blue-dark); font-weight: 500; }
  nav button .ico { width: 20px; text-align: center; color: var(--muted); }
  nav button.active .ico { color: var(--blue-dark); }
  nav button .count { margin-left: auto; color: var(--muted); font-size: 12px; }
  nav .badge { background: var(--yellow); color: #fff; border-radius: 10px; padding: 0 7px; font-size: 11px; font-weight: 600; min-width: 18px; text-align: center; }
  nav .badge.err { background: var(--red); }
  nav hr { border: 0; border-top: 1px solid var(--line); margin: 8px 16px; }
  nav .group { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 12px 16px 4px; }
  section.content { flex: 1; min-width: 0; overflow: auto; padding: 24px 32px 48px; }
  h1 { font-size: 22px; font-weight: 400; margin: 0 0 16px; display: flex; align-items: center; gap: 12px; }
  h1 .sub { color: var(--muted); font-size: 14px; }
  h2 { font-size: 16px; font-weight: 500; margin: 0 0 12px; }
  .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 20px 24px; }
  .card.full { grid-column: 1 / -1; }
  .kpi { display: flex; gap: 32px; }
  .kpi .n { font-size: 36px; font-weight: 400; line-height: 1; }
  .kpi .l { color: var(--muted); font-size: 12px; margin-top: 6px; }
  .kpi .n.add { color: var(--green); } .kpi .n.mod { color: var(--yellow); } .kpi .n.del { color: var(--red); } .kpi .n.err { color: var(--red); } .kpi .n.warn { color: var(--yellow); }
  table { width: 100%; border-collapse: collapse; background: var(--card); }
  .tablecard { background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .tablecard .toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .toolbar input { font: inherit; border: 1px solid var(--line); border-radius: 4px; padding: 7px 10px; width: 280px; }
  th { text-align: left; font-weight: 500; color: var(--muted); font-size: 12px; padding: 10px 16px; border-bottom: 1px solid var(--line); background: #fff; position: sticky; top: 0; }
  td { padding: 10px 16px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr.row { cursor: pointer; } tr.row:hover td { background: var(--hover); }
  tr.row.selected td { background: var(--blue-bg); }
  td .name { font-weight: 500; color: var(--text); }
  td .file { color: var(--muted); font-size: 12px; font-family: var(--mono); }
  .pill { display: inline-block; border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: 500; }
  .pill.added { background: var(--green-bg); color: var(--green); } .pill.modified { background: var(--yellow-bg); color: var(--yellow); }
  .pill.deleted { background: var(--red-bg); color: var(--red); } .pill.unchanged { color: var(--muted); background: var(--hover); }
  .pill.error { background: var(--red-bg); color: var(--red); } .pill.warning { background: var(--yellow-bg); color: var(--yellow); }
  .pill.paused { background: var(--hover); color: var(--muted); }
  .muted { color: var(--muted); }
  .mono { font-family: var(--mono); font-size: 12.5px; }
  .empty { padding: 40px; text-align: center; color: var(--muted); }
  .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  @media (max-width: 1100px) { .split { grid-template-columns: 1fr; } nav { width: 200px; } }
  .detail { position: sticky; top: 24px; max-height: calc(100vh - 120px); overflow: auto; }
  .detail h2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .detail .close { margin-left: auto; }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; font-size: 13px; }
  .kv .k { color: var(--muted); }
  pre { background: #f6f8fa; border: 1px solid var(--line); border-radius: 6px; padding: 12px; overflow: auto; margin: 0; font-family: var(--mono); font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .diff { font-family: var(--mono); font-size: 12.5px; }
  .diff div { padding: 3px 8px; border-radius: 4px; margin-bottom: 2px; white-space: pre-wrap; word-break: break-word; }
  .diff .add { background: var(--green-bg); color: var(--green); } .diff .rem { background: var(--red-bg); color: var(--red); } .diff .chg { background: var(--yellow-bg); color: #7a4100; }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin: 16px 0 12px; }
  .tabs button { border: 0; background: none; padding: 8px 12px; font: inherit; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; }
  .tabs button.active { color: var(--blue); border-bottom-color: var(--blue); font-weight: 500; }
  .issue { border-left: 3px solid var(--yellow); padding: 8px 12px; margin-bottom: 8px; background: var(--yellow-bg); border-radius: 0 6px 6px 0; }
  .issue.error { border-left-color: var(--red); background: var(--red-bg); }
  .issue .where { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .issue .hint { color: var(--muted); margin-top: 4px; font-size: 13px; }
  .params td:first-child { color: var(--muted); width: 220px; font-family: var(--mono); font-size: 12.5px; }
  .segment { display: inline-flex; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
  .segment button { border: 0; background: #fff; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; color: var(--muted); }
  .segment button.active { background: var(--blue-bg); color: var(--blue-dark); font-weight: 500; }
  .notice { padding: 12px 16px; border-radius: 8px; background: var(--yellow-bg); color: #7a4100; margin-bottom: 16px; }
  .notice.err { background: var(--red-bg); color: var(--red); }
  footer { padding: 10px 24px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); background: #fff; display: flex; gap: 16px; }
</style>
</head>
<body>
<header>
  <div class="logo"><span class="mark">G</span> Tag Manager <b>· local workspace</b></div>
  <div class="crumbs" id="crumbs"></div>
  <span class="chip local" id="ctxchip"></span>
  <div class="spacer"></div>
  <select class="ws" id="wsselect" style="display:none"></select>
  <span class="live" id="live"><span class="dot"></span><span id="livetext">live</span></span>
  <a class="btn" id="gtmlink" target="_blank" rel="noopener">Open in GTM</a>
</header>
<main>
  <nav id="nav"></nav>
  <section class="content" id="content"></section>
</main>
<footer><span>gtm local ui</span><span id="footinfo"></span><span class="spacer"></span><span>Read-only view · edit with <code>gtm local …</code> or by changing the JSON files</span></footer>
<script>
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const state = { ws: 0, data: null, view: "overview", selected: null, against: "remote", filter: "", tab: "params", error: null, lastOk: 0 };
  const ICONS = { overview: "▦", tag: "◆", trigger: "⚡", variable: "⦿", folder: "▭", template: "⌗", client: "⇄", transformation: "⟳", zone: "◫", gtagConfig: "◉", builtins: "✦", validation: "✓" };

  async function loadWorkspaces() {
    const list = await (await fetch("/api/workspaces")).json();
    const sel = $("#wsselect");
    if (list.length > 1) {
      sel.style.display = "";
      sel.innerHTML = list.map((w) => '<option value="' + w.index + '">' + esc(w.name) + " (" + esc(w.publicId || "") + ") · " + esc(w.root) + "</option>").join("");
      sel.value = String(state.ws);
      sel.onchange = () => { state.ws = Number(sel.value); state.selected = null; refresh(true); };
    }
  }
  async function refresh(force) {
    try {
      const res = await fetch("/api/state?ws=" + state.ws);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const changed = !state.data || JSON.stringify(data.entities) !== JSON.stringify(state.data.entities) || JSON.stringify(data.validation) !== JSON.stringify(state.data.validation) || JSON.stringify(data.builtInVariables) !== JSON.stringify(state.data.builtInVariables);
      state.data = data; state.error = null; state.lastOk = Date.now();
      if (changed || force) render();
      $("#live").classList.remove("stale"); $("#livetext").textContent = "live · " + new Date().toLocaleTimeString();
    } catch (e) {
      state.error = e.message; $("#live").classList.add("stale"); $("#livetext").textContent = "disconnected";
      if (!state.data) render();
    }
  }

  function changeOf(e) { return state.against === "live" ? (e.statusLive || "added") : e.status; }
  function fieldsOf(e) { return state.against === "live" ? e.fieldsLive : e.fields; }
  function diffData() { return state.against === "live" ? state.data.diffLive : state.data.diffRemote; }

  function render() {
    const d = state.data;
    if (!d) { $("#content").innerHTML = '<div class="notice err">' + esc(state.error || "Loading…") + "</div>"; return; }
    const c = d.meta.container || {};
    $("#crumbs").innerHTML = '<span class="name">' + esc(c.name || d.meta.containerId) + '</span><span class="sep">/</span><span>' + esc(c.publicId || "") + '</span><span class="sep">/</span><span>Workspace ' + esc(d.meta.workspaceId) + (d.meta.workspace && d.meta.workspace.name ? " · " + esc(d.meta.workspace.name) : "") + "</span>";
    $("#ctxchip").textContent = d.context === "server" ? "Server container" : d.context === "web" ? "Web container" : "Container";
    $("#gtmlink").href = "https://tagmanager.google.com/#/container/accounts/" + d.meta.accountId + "/containers/" + d.meta.containerId + "/workspaces/" + d.meta.workspaceId;
    $("#footinfo").textContent = d.root + " · pulled " + (d.meta.pulledAt ? ago(d.meta.pulledAt) : "never") + (d.live ? " · live version " + d.live.containerVersionId : " · no live version");
    renderNav(); renderView();
  }
  function ago(iso) { const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000); if (s < 60) return s + "s ago"; const m = Math.round(s / 60); if (m < 60) return m + " min ago"; const h = Math.round(m / 60); if (h < 48) return h + " h ago"; return Math.round(h / 24) + " days ago"; }

  function renderNav() {
    const d = state.data;
    const total = d.diffRemote.summary.added + d.diffRemote.summary.modified + d.diffRemote.summary.deleted;
    const items = [{ id: "overview", label: "Overview", badge: total ? total : "" }];
    for (const k of d.kinds) {
      const list = d.entities[k.kind] || [];
      const ch = list.filter((e) => e.status !== "unchanged").length + d.deleted.filter((x) => x.kind === k.kind).length;
      items.push({ id: k.kind, label: cap(k.label), count: list.length, badge: ch ? ch : "" });
    }
    items.push({ id: "builtins", label: "Built-in variables", count: d.builtInVariables.length, badge: d.builtInChanges.length ? d.builtInChanges.length : "" });
    items.push({ id: "validation", label: "Validation", badge: d.validation.errors ? d.validation.errors : (d.validation.warnings ? d.validation.warnings : ""), err: d.validation.errors > 0 });
    $("#nav").innerHTML = items.map((it, i) => (i === 1 ? '<div class="group">Workspace</div>' : "") + (it.id === "builtins" ? "<hr>" : "") +
      '<button class="' + (state.view === it.id ? "active" : "") + '" data-view="' + it.id + '"><span class="ico">' + ICONS[it.id] + "</span><span>" + esc(it.label) + "</span>" +
      (it.badge !== "" ? '<span class="badge' + (it.err ? " err" : "") + '">' + it.badge + "</span>" : "") + (it.count !== undefined ? '<span class="count">' + it.count + "</span>" : "") + "</button>").join("");
    $("#nav").querySelectorAll("button").forEach((b) => b.onclick = () => { state.view = b.dataset.view; state.selected = null; state.filter = ""; render(); });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function againstToggle() {
    const d = state.data;
    return '<span class="segment"><button class="' + (state.against === "remote" ? "active" : "") + '" data-against="remote">vs remote workspace</button><button class="' + (state.against === "live" ? "active" : "") + '" data-against="live" ' + (d.diffLive ? "" : "disabled title='No live version snapshot'") + ">vs live version</button></span>";
  }
  function bindToggle(root) { root.querrySelectorAll; (root || document).querySelectorAll("[data-against]").forEach((b) => b.onclick = () => { if (!b.disabled) { state.against = b.dataset.against; render(); } }); }

  function renderView() {
    const d = state.data; const el = $("#content");
    if (state.view === "overview") return renderOverview(el, d);
    if (state.view === "builtins") return renderBuiltins(el, d);
    if (state.view === "validation") return renderValidation(el, d);
    return renderKind(el, d, state.view);
  }

  function renderOverview(el, d) {
    const diff = diffData() || { summary: { added: 0, modified: 0, deleted: 0 }, changes: [] };
    const s = diff.summary; const v = d.validation;
    const target = state.against === "live" ? "live version" : "remote workspace";
    let html = '<h1>Overview <span class="sub">' + esc(d.meta.container && d.meta.container.name || "") + "</span></h1>";
    if (!d.hasBase) html += '<div class="notice">This workspace has not been pulled yet, so there is nothing to compare against. Run <code>gtm local pull</code>.</div>';
    if (state.error) html += '<div class="notice err">Lost connection to gtm local ui: ' + esc(state.error) + "</div>";
    html += '<div class="grid">';
    html += '<div class="card"><h2>Workspace changes <span class="muted" style="font-weight:400">· ' + target + "</span></h2>" + againstToggle() + '<div class="kpi" style="margin-top:16px"><div><div class="n add">' + s.added + '</div><div class="l">Added</div></div><div><div class="n mod">' + s.modified + '</div><div class="l">Modified</div></div><div><div class="n del">' + s.deleted + '</div><div class="l">Deleted</div></div></div></div>';
    html += '<div class="card"><h2>Validation</h2><div class="kpi"><div><div class="n ' + (v.errors ? "err" : "") + '">' + v.errors + '</div><div class="l">Errors</div></div><div><div class="n ' + (v.warnings ? "warn" : "") + '">' + v.warnings + '</div><div class="l">Warnings</div></div></div><p class="muted" style="margin:14px 0 0">' + (v.errors ? "Push is blocked until the errors are fixed." : v.warnings ? "Push is possible; review the warnings." : "Everything looks good.") + "</p></div>";
    html += '<div class="card"><h2>Container</h2><div class="kv"><span class="k">Name</span><span>' + esc(d.meta.container.name || "") + '</span><span class="k">Public ID</span><span class="mono">' + esc(d.meta.container.publicId || "") + '</span><span class="k">Type</span><span>' + esc(d.context) + '</span><span class="k">Remote workspace</span><span>' + esc(d.meta.workspaceId) + (d.meta.workspace && d.meta.workspace.name ? " · " + esc(d.meta.workspace.name) : "") + '</span><span class="k">Live version</span><span>' + (d.live ? esc(d.live.containerVersionId) + (d.live.versionName ? " · " + esc(d.live.versionName) : "") : "none") + '</span><span class="k">Last pull</span><span>' + (d.meta.pulledAt ? ago(d.meta.pulledAt) : "never") + '</span><span class="k">Folder</span><span class="mono">' + esc(d.root) + "</span></div></div>";
    html += '<div class="card full"><h2>Changes</h2>' + changesTable(diff.changes, d) + "</div>";
    html += "</div>";
    el.innerHTML = html; bindToggle(el);
    el.querySelectorAll("tr.row[data-kind]").forEach((r) => r.onclick = () => { state.view = r.dataset.kind; state.selected = r.dataset.file || null; render(); });
  }

  function changesTable(changes, d) {
    if (!changes.length) return '<div class="empty">No changes. Edit files in the workspace folder or run <code>gtm local tags add …</code>.</div>';
    const rows = changes.map((c) => '<tr class="row" data-kind="' + esc(c.kind) + '" data-file="' + esc(c.file || "") + '"><td><div class="name">' + esc(c.name) + '</div><div class="file">' + esc(c.file || (c.id ? "#" + c.id : "")) + "</div></td><td>" + esc(kindLabel(c.kind, d)) + "</td><td>" + esc(c.type || "") + '</td><td><span class="pill ' + c.change + '">' + c.change + "</span></td><td class='muted'>" + (c.fields && c.fields.length ? c.fields.length + " field" + (c.fields.length === 1 ? "" : "s") : "") + "</td></tr>").join("");
    return '<table><thead><tr><th>Name</th><th>Kind</th><th>Type</th><th>Change</th><th>Details</th></tr></thead><tbody>' + rows + "</tbody></table>";
  }
  function kindLabel(k, d) { if (k === "builtInVariable") return "built-in variable"; const spec = d.kinds.find((x) => x.kind === k); return spec ? spec.label.replace(/s$/, "") : k; }

  function renderKind(el, d, kind) {
    const spec = d.kinds.find((k) => k.kind === kind) || { label: kind };
    let list = (d.entities[kind] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const deleted = (state.against === "live" ? d.deletedLive : d.deleted).filter((x) => x.kind === kind);
    const f = state.filter.toLowerCase();
    if (f) list = list.filter((e) => (e.name + " " + (e.type || "") + " " + e.file).toLowerCase().includes(f));
    const isTag = kind === "tag";
    let html = "<h1>" + esc(cap(spec.label)) + ' <span class="sub">' + list.length + "</span></h1>";
    html += '<div class="split"><div class="tablecard"><div class="toolbar"><input placeholder="Filter ' + esc(spec.label) + '…" id="filter" value="' + esc(state.filter) + '">' + againstToggle() + "</div>";
    html += "<table><thead><tr><th>Name</th>" + (kind === "folder" || kind === "template" || kind === "zone" ? "" : "<th>Type</th>") + (isTag ? "<th>Firing triggers</th>" : "") + "<th>Status</th><th>Issues</th></tr></thead><tbody>";
    for (const e of list) {
      const ch = changeOf(e);
      const errs = e.issues.filter((i) => i.severity === "error").length, warns = e.issues.length - errs;
      html += '<tr class="row ' + (state.selected === e.file ? "selected" : "") + '" data-file="' + esc(e.file) + '"><td><div class="name">' + esc(e.name || "(no name)") + (e.canonical && e.canonical.paused ? ' <span class="pill paused">paused</span>' : "") + '</div><div class="file">' + esc(e.file) + (e.id ? " · #" + e.id : "") + "</div></td>" +
        (kind === "folder" || kind === "template" || kind === "zone" ? "" : "<td class='mono'>" + esc(e.type || "") + "</td>") +
        (isTag ? "<td>" + esc(triggerList(e, d)) + "</td>" : "") +
        '<td><span class="pill ' + ch + '">' + ch + "</span></td><td>" + (e.parseError ? '<span class="pill error">invalid JSON</span>' : "") + (errs ? '<span class="pill error">' + errs + " error" + (errs > 1 ? "s" : "") + "</span> " : "") + (warns ? '<span class="pill warning">' + warns + " warning" + (warns > 1 ? "s" : "") + "</span>" : "") + "</td></tr>";
    }
    for (const x of deleted) html += '<tr class="row" data-deleted="' + esc(x.id || x.name) + '"><td><div class="name" style="text-decoration:line-through">' + esc(x.name) + '</div><div class="file">#' + esc(x.id || "") + " · deleted locally</div></td>" + (kind === "folder" || kind === "template" || kind === "zone" ? "" : "<td class='mono'>" + esc(x.type || "") + "</td>") + (isTag ? "<td></td>" : "") + '<td><span class="pill deleted">deleted</span></td><td></td></tr>';
    if (!list.length && !deleted.length) html += '<tr><td colspan="5" class="empty">No ' + esc(spec.label) + " in this workspace.</td></tr>";
    html += "</tbody></table></div>";
    html += '<div id="detail">' + (state.selected ? detailCard(list.find((e) => e.file === state.selected) || (d.entities[kind] || []).find((e) => e.file === state.selected), d, kind) : "") + "</div></div>";
    el.innerHTML = html; bindToggle(el);
    const inp = $("#filter"); inp.oninput = () => { state.filter = inp.value; renderKind(el, d, kind); $("#filter").focus(); $("#filter").setSelectionRange(inp.value.length, inp.value.length); };
    el.querySelectorAll("tr.row[data-file]").forEach((r) => r.onclick = () => { state.selected = state.selected === r.dataset.file ? null : r.dataset.file; state.tab = "params"; renderKind(el, d, kind); });
    el.querySelectorAll("tr.row[data-deleted]").forEach((r) => r.onclick = () => { const x = deleted.find((y) => (y.id || y.name) === r.dataset.deleted); if (x && x.before) { $("#detail").innerHTML = '<div class="card detail"><h2>' + esc(x.name) + ' <span class="pill deleted">deleted locally</span></h2><p class="muted">This entity exists in the ' + (state.against === "live" ? "live version" : "remote workspace") + ' but has no local file. Pushing will delete it from the remote workspace.</p><pre>' + esc(JSON.stringify(x.before, null, 2)) + "</pre></div>"; } });
    bindDetail(el, d, kind);
  }
  function triggerList(e, d) { const ids = (e.canonical && e.canonical.firingTriggerId) || []; return ids.map((id) => d.triggerNames[id] || id).join(", "); }

  function detailCard(e, d, kind) {
    if (!e) return "";
    const ch = changeOf(e); const fields = fieldsOf(e) || [];
    let html = '<div class="card detail"><h2>' + esc(e.name || "(no name)") + ' <span class="pill ' + ch + '">' + ch + '</span>' + (e.type ? '<span class="chip mono">' + esc(e.type) + "</span>" : "") + '<button class="btn close" id="closedetail">Close</button></h2>';
    html += '<div class="kv"><span class="k">File</span><span class="mono">' + esc(e.file) + '</span>' + (e.id ? '<span class="k">ID</span><span class="mono">' + esc(e.id) + "</span>" : '<span class="k">ID</span><span class="muted">assigned on push</span>') +
      (kind === "tag" ? '<span class="k">Firing triggers</span><span>' + esc(triggerList(e, d) || "none") + "</span>" + (e.canonical.blockingTriggerId ? '<span class="k">Blocking triggers</span><span>' + esc(e.canonical.blockingTriggerId.map((id) => d.triggerNames[id] || id).join(", ")) + "</span>" : "") : "") +
      (e.canonical.parentFolderId ? '<span class="k">Folder</span><span>' + esc(folderName(e.canonical.parentFolderId, d)) + "</span>" : "") +
      (e.canonical.notes ? '<span class="k">Notes</span><span>' + esc(e.canonical.notes) + "</span>" : "") + "</div>";
    if (e.issues.length) html += '<div style="margin-top:14px">' + e.issues.map(issueHtml).join("") + "</div>";
    if (e.parseError) html += '<div class="issue error"><b>Invalid JSON</b><div class="hint">' + esc(e.parseError) + "</div></div>";
    const tabs = [["params", "Configuration"], ["diff", "Changes" + (fields.length ? " (" + fields.length + ")" : "")], ["json", "JSON"]];
    html += '<div class="tabs">' + tabs.map((t) => '<button class="' + (state.tab === t[0] ? "active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>").join("") + "</div>";
    if (state.tab === "params") html += paramsHtml(e, kind);
    else if (state.tab === "diff") html += fields.length ? '<div class="diff">' + fields.map(fieldHtml).join("") + "</div>" : '<p class="muted">' + (ch === "added" ? "New entity: everything will be created on push." : "No differences against the " + (state.against === "live" ? "live version" : "remote workspace") + ".") + "</p>";
    else html += "<pre>" + esc(JSON.stringify(e.raw, null, 2)) + "</pre>";
    return html + "</div>";
  }
  function folderName(ref, d) { const f = (d.entities.folder || []).find((x) => x.id === ref || x.name === ref); return f ? f.name : ref; }
  function paramsHtml(e, kind) {
    const rows = [];
    const sp = e.simpleParams;
    if (sp && Object.keys(sp).length) for (const k of Object.keys(sp)) rows.push("<tr><td>" + esc(k) + "</td><td>" + valueHtml(sp[k]) + "</td></tr>");
    if (kind === "trigger") {
      for (const f of ["filter", "customEventFilter", "autoEventFilter"]) if (e.canonical[f]) rows.push("<tr><td>" + f + "</td><td>" + e.canonical[f].map(condHtml).join("<br>") + "</td></tr>");
      for (const f of ["waitForTags", "checkValidation", "waitForTagsTimeout", "eventName", "interval", "limit", "uniqueTriggerId"]) if (e.canonical[f]) rows.push("<tr><td>" + f + "</td><td>" + esc(e.canonical[f].value) + "</td></tr>");
    }
    if (kind === "tag") {
      if (e.canonical.tagFiringOption) rows.push("<tr><td>tagFiringOption</td><td>" + esc(e.canonical.tagFiringOption) + "</td></tr>");
      if (e.canonical.consentSettings) rows.push("<tr><td>consentSettings</td><td>" + esc(JSON.stringify(e.canonical.consentSettings)) + "</td></tr>");
      if (e.canonical.setupTag) rows.push("<tr><td>setupTag</td><td>" + esc(e.canonical.setupTag.map((s) => s.tagName).join(", ")) + "</td></tr>");
      if (e.canonical.teardownTag) rows.push("<tr><td>teardownTag</td><td>" + esc(e.canonical.teardownTag.map((s) => s.tagName).join(", ")) + "</td></tr>");
    }
    if (kind === "variable" && e.canonical.formatValue) rows.push("<tr><td>formatValue</td><td>" + esc(JSON.stringify(e.canonical.formatValue)) + "</td></tr>");
    if (kind === "template") rows.push("<tr><td>templateData</td><td><pre style='max-height:300px'>" + esc(String(e.canonical.templateData || "").slice(0, 4000)) + "</pre></td></tr>");
    if (kind === "client" && e.canonical.priority !== undefined) rows.push("<tr><td>priority</td><td>" + esc(e.canonical.priority) + "</td></tr>");
    return rows.length ? '<table class="params"><tbody>' + rows.join("") + "</tbody></table>" : '<p class="muted">No parameters.</p>';
  }
  function valueHtml(v) {
    if (v === true || v === false) return '<span class="pill ' + (v ? "added" : "unchanged") + '">' + v + "</span>";
    if (typeof v === "string") return "<span class='mono'>" + esc(v).replace(/\\{\\{([^}]+)\\}\\}/g, '<span style="color:var(--blue)">{{$1}}</span>') + "</span>";
    if (Array.isArray(v) && v.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
      const cols = Array.from(new Set(v.flatMap((x) => Object.keys(x))));
      return "<table style='font-size:12.5px'><thead><tr>" + cols.map((c) => "<th style='position:static'>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" + v.map((row) => "<tr>" + cols.map((c) => "<td>" + valueHtml(row[c]) + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
    }
    return "<pre>" + esc(JSON.stringify(v, null, 2)) + "</pre>";
  }
  function condHtml(c) { const p = {}; (c.parameter || []).forEach((x) => p[x.key] = x.value); return "<span class='mono'>" + esc(p.arg0) + "</span> " + (p.negate === "true" ? "<b>not</b> " : "") + esc(c.type) + " <span class='mono'>" + esc(p.arg1) + "</span>" + (p.ignore_case === "true" ? " <span class='muted'>(ignore case)</span>" : ""); }
  function fieldHtml(f) {
    const fmt = (v) => v === undefined ? "∅" : typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v);
    if (f.op === "added") return '<div class="add">+ ' + esc(f.path) + " = " + esc(fmt(f.after)) + "</div>";
    if (f.op === "removed") return '<div class="rem">− ' + esc(f.path) + " (was " + esc(fmt(f.before)) + ")</div>";
    return '<div class="chg">~ ' + esc(f.path) + ": " + esc(fmt(f.before)) + " → " + esc(fmt(f.after)) + "</div>";
  }
  function issueHtml(i) { return '<div class="issue ' + i.severity + '"><div class="where">' + esc(i.severity) + " · " + esc(i.code) + (i.path ? " · " + esc(i.path) : "") + "</div><div>" + esc(i.message) + "</div>" + (i.hint ? '<div class="hint">→ ' + esc(i.hint) + "</div>" : "") + "</div>"; }
  function bindDetail(el, d, kind) {
    const close = $("#closedetail"); if (close) close.onclick = () => { state.selected = null; renderKind(el, d, kind); };
    el.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; renderKind(el, d, kind); });
  }

  function renderBuiltins(el, d) {
    const changes = {}; d.builtInChanges.forEach((c) => changes[c.type] = c.change);
    let html = '<h1>Built-in variables <span class="sub">' + d.builtInVariables.length + " enabled</span></h1>";
    html += '<div class="tablecard"><table><thead><tr><th>Name</th><th>Type</th><th>Status</th></tr></thead><tbody>';
    for (const b of d.builtInVariables.slice().sort((a, b) => a.name.localeCompare(b.name))) html += '<tr><td><span class="name">{{' + esc(b.name) + '}}</span></td><td class="mono">' + esc(b.type) + '</td><td><span class="pill ' + (changes[b.type] || "unchanged") + '">' + (changes[b.type] || "unchanged") + "</span></td></tr>";
    for (const c of d.builtInChanges.filter((c) => c.change === "deleted")) html += '<tr><td><span class="name" style="text-decoration:line-through">{{' + esc(c.name) + '}}</span></td><td class="mono">' + esc(c.type) + '</td><td><span class="pill deleted">deleted</span></td></tr>';
    if (!d.builtInVariables.length) html += '<tr><td colspan="3" class="empty">No built-in variables enabled. Enable some with <code>gtm local built-in-variables enable pageUrl pagePath</code>.</td></tr>';
    html += "</tbody></table></div>"; el.innerHTML = html;
  }

  function renderValidation(el, d) {
    const v = d.validation;
    let html = '<h1>Validation <span class="sub">' + v.errors + " error" + (v.errors === 1 ? "" : "s") + ", " + v.warnings + " warning" + (v.warnings === 1 ? "" : "s") + "</span></h1>";
    if (!v.issues.length) { el.innerHTML = html + '<div class="card"><p class="muted" style="margin:0">✓ Everything validates. The workspace can be pushed.</p></div>'; return; }
    const byFile = {}; v.issues.forEach((i) => { const k = i.file || "(workspace)"; (byFile[k] = byFile[k] || []).push(i); });
    html += '<div class="grid">' + Object.keys(byFile).sort().map((f) => '<div class="card full"><h2 class="mono">' + esc(f) + "</h2>" + byFile[f].map(issueHtml).join("") + "</div>").join("") + "</div>";
    el.innerHTML = html;
  }

  loadWorkspaces().then(() => refresh(true));
  setInterval(() => refresh(false), 2000);
})();
</script>
</body>
</html>`;
