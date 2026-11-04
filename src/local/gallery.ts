/**
 * Local workspaces: fetching community gallery templates from GitHub.
 *
 * Gallery templates live in a GitHub repository with a `metadata.yaml` whose `versions:` list has
 * the published gallery versions (newest first; HEAD may be unpublished work) and a `template.tpl`.
 * The GTM API cannot create a template *with* a gallery link (`galleryReference` is rejected on
 * create), so the result is imported as a plain custom template.
 */

import { LocalWorkspaceError } from "./store.ts";
import { parseTemplate } from "./schema/template.ts";

export interface GalleryTemplate {
  owner: string;
  repository: string;
  /** Commit SHA the template was fetched at */
  version: string;
  /** Whether the SHA came from metadata.yaml (published gallery version) or is the default branch HEAD */
  source: "gallery-version" | "head";
  templateData: string;
  displayName?: string;
  /** TAG | MACRO | CLIENT */
  kind?: string;
  containerContexts?: string[];
}

export function parseGalleryRef(ref: string): { owner: string; repository: string } {
  const m = ref.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").match(
    /^([\w.-]+)\/([\w.-]+)\/?$/,
  );
  if (!m) {
    throw new LocalWorkspaceError(
      `"${ref}" is not a gallery template reference.`,
      "Use owner/repository as shown in the gallery, e.g. stape-io/fb-tag or https://github.com/stape-io/fb-tag.",
    );
  }
  return { owner: m[1], repository: m[2] };
}

async function fetchText(url: string, what: string): Promise<string | undefined> {
  const res = await fetch(url, { headers: { "User-Agent": "gtm-cli" } });
  if (res.status === 404) return undefined;
  if (!res.ok) {
    throw new LocalWorkspaceError(
      `Could not fetch ${what} (${res.status} ${res.statusText}) from ${url}.`,
    );
  }
  return await res.text();
}

/** Extract the newest published SHA from metadata.yaml (first `- sha:` under `versions:`) */
export function newestGalleryVersion(metadataYaml: string): string | undefined {
  const m = metadataYaml.match(/^\s*-\s*sha:\s*["']?([0-9a-fA-F]{7,40})["']?/m);
  return m?.[1];
}

/**
 * Download a gallery template. Uses the newest version listed in metadata.yaml unless `version`
 * is given; falls back to the default branch when the repository has no metadata.yaml.
 */
export async function fetchGalleryTemplate(
  ref: string,
  version?: string,
): Promise<GalleryTemplate> {
  const { owner, repository } = parseGalleryRef(ref);
  const base = `https://raw.githubusercontent.com/${owner}/${repository}`;
  let sha = version;
  let source: GalleryTemplate["source"] = "gallery-version";
  if (!sha) {
    // metadata.yaml on the default branch (try the two common branch names)
    const metadata = (await fetchText(`${base}/HEAD/metadata.yaml`, "metadata.yaml")) ??
      (await fetchText(`${base}/main/metadata.yaml`, "metadata.yaml")) ??
      (await fetchText(`${base}/master/metadata.yaml`, "metadata.yaml"));
    sha = metadata ? newestGalleryVersion(metadata) : undefined;
    if (!sha) {
      sha = "HEAD";
      source = "head";
    }
  }
  const templateData = await fetchText(`${base}/${sha}/template.tpl`, "template.tpl");
  if (!templateData) {
    throw new LocalWorkspaceError(
      `No template.tpl found in github.com/${owner}/${repository} at ${sha}.`,
      "Check the owner/repository (as shown on the gallery page) or pass --gallery-version <sha>.",
    );
  }
  const parsed = parseTemplate(templateData);
  return {
    owner,
    repository,
    version: sha,
    source,
    templateData,
    displayName: parsed.displayName,
    kind: parsed.kind,
    containerContexts: parsed.containerContexts,
  };
}
