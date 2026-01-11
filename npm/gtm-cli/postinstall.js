#!/usr/bin/env node

/**
 * Postinstall script for gtm-cli
 * Verifies that the platform-specific binary package was installed
 */

const fs = require("fs");
const path = require("path");

const PLATFORMS = {
  "darwin-arm64": "@owntag/gtm-cli-darwin-arm64",
  "darwin-x64": "@owntag/gtm-cli-darwin-x64",
  "linux-x64": "@owntag/gtm-cli-linux-x64",
};

function getPlatformKey() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  return null;
}

function main() {
  const platformKey = getPlatformKey();

  if (!platformKey) {
    console.warn(`\n⚠️  GTM CLI: Unsupported platform (${process.platform}-${process.arch})`);
    console.warn("   Supported platforms: macOS (arm64, x64), Linux (x64)");
    console.warn("   You can still use the CLI via the install script:");
    console.warn("   curl -fsSL https://raw.githubusercontent.com/owntag/gtm-cli/main/install.sh | bash\n");
    return;
  }

  const packageName = PLATFORMS[platformKey];

  // Check if the platform package exists
  const possiblePaths = [
    path.join(__dirname, "node_modules", packageName),
    path.join(__dirname, "..", packageName),
    path.join(__dirname, "..", "..", packageName),
  ];

  const found = possiblePaths.some((p) => fs.existsSync(p));

  if (!found) {
    console.warn(`\n⚠️  GTM CLI: Platform package ${packageName} was not installed.`);
    console.warn("   This might happen if you're using --ignore-optional.");
    console.warn("   Try: npm install ${packageName}\n");
  }
}

main();
