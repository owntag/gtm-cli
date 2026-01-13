#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run
/**
 * Release automation script
 *
 * Usage:
 *   deno task release patch    # 1.4.0 -> 1.4.1
 *   deno task release minor    # 1.4.0 -> 1.5.0
 *   deno task release major    # 1.4.0 -> 2.0.0
 *   deno task release 2.0.0    # Set explicit version
 *
 * This script:
 * 1. Bumps the version in deno.json
 * 2. Commits the change
 * 3. Creates a git tag
 * 4. Pushes to origin
 */

const DENO_JSON_PATH = "deno.json";

interface DenoConfig {
  version: string;
  [key: string]: unknown;
}

/**
 * Parse semantic version string
 */
function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}. Expected X.Y.Z`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Bump version based on type
 */
function bumpVersion(current: string, bump: "major" | "minor" | "patch"): string {
  const { major, minor, patch } = parseVersion(current);

  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

/**
 * Run a command and return output
 */
async function run(cmd: string[]): Promise<{ success: boolean; output: string }> {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();
  const output = new TextDecoder().decode(code === 0 ? stdout : stderr);

  return { success: code === 0, output: output.trim() };
}

/**
 * Run a command and exit on failure
 */
async function runOrExit(cmd: string[], errorMsg: string): Promise<string> {
  const { success, output } = await run(cmd);
  if (!success) {
    console.error(`❌ ${errorMsg}`);
    console.error(output);
    Deno.exit(1);
  }
  return output;
}

/**
 * Main release function
 */
async function main() {
  const args = Deno.args;

  if (args.length === 0) {
    console.log(`
Usage: deno task release <version>

Version can be:
  patch    Bump patch version (1.4.0 -> 1.4.1)
  minor    Bump minor version (1.4.0 -> 1.5.0)
  major    Bump major version (1.4.0 -> 2.0.0)
  X.Y.Z    Set explicit version (e.g., 2.0.0)

Example:
  deno task release patch
  deno task release 2.0.0
`);
    Deno.exit(1);
  }

  const versionArg = args[0];

  // Check for uncommitted changes
  console.log("🔍 Checking for uncommitted changes...");
  const { output: gitStatus } = await run(["git", "status", "--porcelain"]);
  if (gitStatus.trim() !== "") {
    console.error("❌ You have uncommitted changes. Please commit or stash them first.");
    console.error(gitStatus);
    Deno.exit(1);
  }

  // Check we're on main branch
  console.log("🔍 Checking current branch...");
  const { output: branch } = await run(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") {
    console.error(`❌ You must be on the main branch to release. Currently on: ${branch}`);
    Deno.exit(1);
  }

  // Pull latest changes
  console.log("📥 Pulling latest changes...");
  await runOrExit(["git", "pull", "origin", "main"], "Failed to pull latest changes");

  // Read current deno.json
  console.log("📖 Reading deno.json...");
  const denoJsonText = await Deno.readTextFile(DENO_JSON_PATH);
  const denoJson = JSON.parse(denoJsonText) as DenoConfig;
  const currentVersion = denoJson.version;

  console.log(`   Current version: ${currentVersion}`);

  // Determine new version
  let newVersion: string;
  if (["major", "minor", "patch"].includes(versionArg)) {
    newVersion = bumpVersion(currentVersion, versionArg as "major" | "minor" | "patch");
  } else {
    // Validate explicit version
    parseVersion(versionArg); // This will throw if invalid
    newVersion = versionArg;
  }

  console.log(`   New version:     ${newVersion}`);

  // Check if tag already exists
  const { success: tagExists } = await run(["git", "rev-parse", `v${newVersion}`]);
  if (tagExists) {
    console.error(`❌ Tag v${newVersion} already exists. Choose a different version.`);
    Deno.exit(1);
  }

  // Confirm with user
  console.log("");
  console.log(`📦 Ready to release v${newVersion}`);
  console.log("");
  console.log("This will:");
  console.log(`  1. Update version in deno.json to ${newVersion}`);
  console.log(`  2. Commit the change`);
  console.log(`  3. Create tag v${newVersion}`);
  console.log(`  4. Push to origin`);
  console.log("");

  const confirm = prompt("Continue? (y/N)");
  if (confirm?.toLowerCase() !== "y") {
    console.log("❌ Release cancelled.");
    Deno.exit(0);
  }

  // Update deno.json
  console.log("");
  console.log("📝 Updating deno.json...");
  denoJson.version = newVersion;
  await Deno.writeTextFile(DENO_JSON_PATH, JSON.stringify(denoJson, null, 2) + "\n");

  // Run type check to make sure everything still works
  console.log("🔍 Running type check...");
  await runOrExit(["deno", "task", "check"], "Type check failed");

  // Commit
  console.log("📝 Committing...");
  await runOrExit(["git", "add", DENO_JSON_PATH], "Failed to stage deno.json");
  await runOrExit(["git", "commit", "-m", `Release v${newVersion}`], "Failed to commit");

  // Create tag
  console.log("🏷️  Creating tag...");
  await runOrExit(["git", "tag", `v${newVersion}`], "Failed to create tag");

  // Push
  console.log("🚀 Pushing to origin...");
  await runOrExit(["git", "push", "origin", "main"], "Failed to push commits");
  await runOrExit(["git", "push", "origin", `v${newVersion}`], "Failed to push tag");

  console.log("");
  console.log(`✅ Successfully released v${newVersion}!`);
  console.log("");
  console.log("GitHub Actions will now build and publish the release.");
  console.log(`Check progress at: https://github.com/owntag/gtm-cli/actions`);
}

main();
