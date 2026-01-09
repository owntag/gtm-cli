/**
 * Agent command - AI/LLM guide for using GTM CLI
 *
 * The guide is embedded at compile time from docs/agent-guide.md
 */

import { Command } from "@cliffy/command";
import { dirname, fromFileUrl, join } from "@std/path";

/**
 * Get the guide content
 * Reads from src/agent-guide.md (included in binary via --include flag)
 */
async function getGuideContent(): Promise<string> {
  try {
    // Read from the same directory as this module
    const moduleDir = dirname(fromFileUrl(import.meta.url));
    const guidePath = join(moduleDir, "..", "agent-guide.md");
    return await Deno.readTextFile(guidePath);
  } catch {
    return `Error: Could not load agent guide.

The guide file was not found. Please visit:
https://github.com/owntag/gtm-cli/blob/main/src/agent-guide.md`;
  }
}

export const agentCommand = new Command()
  .name("agent")
  .description("Resources for AI agents and LLMs using GTM CLI")
  .action(function () {
    this.showHelp();
  })
  // Guide subcommand
  .command("guide")
  .description("Display the comprehensive AI agent guide for GTM CLI")
  .option("--raw", "Output raw markdown without formatting hints")
  .action(async (options) => {
    const guide = await getGuideContent();
    
    if (!options.raw) {
      console.log("\n" + "=".repeat(70));
      console.log("  GTM CLI - AI Agent Guide");
      console.log("  For AI assistants and LLMs integrating with Google Tag Manager");
      console.log("=".repeat(70) + "\n");
    }
    
    console.log(guide);
    
    if (!options.raw) {
      console.log("\n" + "=".repeat(70));
      console.log("  End of Guide | https://github.com/owntag/gtm-cli");
      console.log("=".repeat(70) + "\n");
    }
  });
