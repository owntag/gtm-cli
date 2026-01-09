/**
 * ASCII art banner for GTM CLI
 */

// RGB 0/51/153 (GTM blue)
const BLUE = "\x1b[38;2;0;51;153m";
const RESET = "\x1b[0m";

const BANNER = `
  ██████╗ ████████╗███╗   ███╗     ██████╗██╗     ██╗
 ██╔════╝ ╚══██╔══╝████╗ ████║    ██╔════╝██║     ██║
 ██║  ███╗   ██║   ██╔████╔██║    ██║     ██║     ██║
 ██║   ██║   ██║   ██║╚██╔╝██║    ██║     ██║     ██║
 ╚██████╔╝   ██║   ██║ ╚═╝ ██║    ╚██████╗███████╗██║
  ╚═════╝    ╚═╝   ╚═╝     ╚═╝     ╚═════╝╚══════╝╚═╝
`;

/**
 * Print the GTM CLI banner
 * @param useColor Whether to use color output
 */
export function printBanner(useColor = true): void {
  if (useColor && !Deno.noColor) {
    console.log(BLUE + BANNER + RESET);
  } else {
    console.log(BANNER);
  }
}
