/**
 * Upgrade command - self-update the GTM CLI
 */

import { Command } from "@cliffy/command";
import {
  forceCheckForUpdate,
  getDownloadUrl,
  getExecutablePath,
} from "../utils/update-checker.ts";
import { error, info, success, warn } from "../utils/mod.ts";

export const upgradeCommand = new Command()
  .name("upgrade")
  .description("Upgrade GTM CLI to the latest version")
  .option("-f, --force", "Force upgrade even if already on latest version")
  .option("--check", "Only check for updates, don't install")
  .action(async (options) => {
    try {
      info("Checking for updates...");

      const { updateAvailable, latestVersion, currentVersion } =
        await forceCheckForUpdate();

      if (!latestVersion) {
        error("Could not check for updates. Please check your internet connection.");
        Deno.exit(1);
      }

      console.log(`  Current version: ${currentVersion}`);
      console.log(`  Latest version:  ${latestVersion}`);
      console.log("");

      if (options.check) {
        if (updateAvailable) {
          info(`Update available! Run 'gtm upgrade' to install.`);
        } else {
          success("You're on the latest version.");
        }
        return;
      }

      if (!updateAvailable && !options.force) {
        success("You're already on the latest version.");
        return;
      }

      if (!updateAvailable && options.force) {
        warn("Forcing reinstall of current version...");
      }

      // Get download URL and executable path
      const downloadUrl = getDownloadUrl(latestVersion);
      const execPath = getExecutablePath();

      info(`Downloading from: ${downloadUrl}`);
      console.log("");

      // Download to temp file
      const tempPath = `${execPath}.download`;

      try {
        // Download with progress
        const response = await fetch(downloadUrl);

        if (!response.ok) {
          error(`Download failed: ${response.status} ${response.statusText}`);
          Deno.exit(1);
        }

        const contentLength = response.headers.get("content-length");
        const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

        if (totalSize > 0) {
          const sizeMB = Math.round(totalSize / 1024 / 1024);
          info(`Downloading ${sizeMB} MB...`);
        }

        // Stream to file with progress
        const file = await Deno.open(tempPath, {
          write: true,
          create: true,
          truncate: true,
        });

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("Failed to get response reader");
        }

        let downloaded = 0;
        let lastPercent = -1;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          await file.write(value);
          downloaded += value.length;

          // Show progress
          if (totalSize > 0) {
            const percent = Math.round((downloaded / totalSize) * 100);
            if (percent !== lastPercent && percent % 5 === 0) {
              const downloadedMB = Math.round(downloaded / 1024 / 1024);
              const totalMB = Math.round(totalSize / 1024 / 1024);
              Deno.stdout.writeSync(
                new TextEncoder().encode(
                  `\r  Progress: ${percent}% (${downloadedMB}/${totalMB} MB)`
                )
              );
              lastPercent = percent;
            }
          }
        }

        file.close();
        console.log(""); // New line after progress

        // Make executable
        await Deno.chmod(tempPath, 0o755);

        // Replace current executable
        // On Unix, we can rename even while running
        const backupPath = `${execPath}.backup`;

        try {
          // Create backup of current version
          await Deno.rename(execPath, backupPath);
        } catch (err) {
          // If we can't rename (e.g., permission issues), try to provide helpful message
          if (err instanceof Deno.errors.PermissionDenied) {
            await Deno.remove(tempPath);
            error(
              "Permission denied. Try running with sudo:\n  sudo gtm upgrade"
            );
            Deno.exit(1);
          }
          throw err;
        }

        try {
          // Move new version into place
          await Deno.rename(tempPath, execPath);

          // Remove backup
          await Deno.remove(backupPath);
        } catch (err) {
          // Restore backup if something went wrong
          try {
            await Deno.rename(backupPath, execPath);
          } catch {
            // Ignore restore errors
          }
          throw err;
        }

        console.log("");
        success(`Successfully upgraded to ${latestVersion}!`);
        console.log("");
        console.log("Run 'gtm --version' to verify the update.");
      } catch (err) {
        // Clean up temp file on error
        try {
          await Deno.remove(tempPath);
        } catch {
          // Ignore cleanup errors
        }
        throw err;
      }
    } catch (err) {
      error(`Upgrade failed: ${err instanceof Error ? err.message : String(err)}`);
      Deno.exit(1);
    }
  });
