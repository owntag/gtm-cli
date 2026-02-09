#!/usr/bin/env node

/**
 * Postinstall script for @owntag/gtm-cli
 *
 * Downloads the appropriate pre-built binary for the current platform
 * from GitHub releases.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = "owntag/gtm-cli";
const BIN_DIR = path.join(__dirname, "bin");
const BIN_PATH = path.join(BIN_DIR, "gtm-binary");

/**
 * Get the binary name for the current platform
 */
function getBinaryName() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    if (arch === "arm64") {
      return "gtm-darwin-arm64";
    } else if (arch === "x64") {
      return "gtm-darwin-x64";
    }
  } else if (platform === "linux") {
    if (arch === "x64") {
      return "gtm-linux-x64";
    }
  }

  throw new Error(
    `Unsupported platform: ${platform}-${arch}. GTM CLI supports darwin-x64, darwin-arm64, and linux-x64.`
  );
}

/**
 * Download a file from URL to destination, following redirects
 */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (url) => {
      https
        .get(url, (response) => {
          // Handle redirects (GitHub releases use redirects)
          if (response.statusCode === 301 || response.statusCode === 302) {
            request(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
            return;
          }

          const file = fs.createWriteStream(dest);
          response.pipe(file);

          file.on("finish", () => {
            file.close();
            resolve();
          });

          file.on("error", (err) => {
            fs.unlink(dest, () => {});
            reject(err);
          });
        })
        .on("error", (err) => {
          reject(err);
        });
    };

    request(url);
  });
}

/**
 * Get the version from package.json
 */
function getVersion() {
  const packageJson = require("./package.json");
  return packageJson.version;
}

async function main() {
  const version = getVersion();
  const binaryName = getBinaryName();
  const downloadUrl = `https://github.com/${REPO}/releases/download/v${version}/${binaryName}`;

  console.log(`Downloading GTM CLI v${version} for ${process.platform}-${process.arch}...`);

  // Create bin directory if it doesn't exist
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  try {
    await download(downloadUrl, BIN_PATH);

    // Make binary executable
    fs.chmodSync(BIN_PATH, 0o755);

    console.log("GTM CLI installed successfully!");
  } catch (error) {
    console.error(`Failed to install GTM CLI: ${error.message}`);
    console.error(`Download URL: ${downloadUrl}`);
    console.error("");
    console.error("You can manually download the binary from:");
    console.error(`https://github.com/${REPO}/releases/tag/v${version}`);
    process.exit(1);
  }
}

main();
