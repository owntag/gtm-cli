# GTM CLI

A powerful command-line interface for Google Tag Manager. Manage your GTM resources directly from the terminal - perfect for automation, CI/CD pipelines, and AI agents.

## Features

- **Full GTM API Coverage** - Manage all GTM resources: accounts, containers, workspaces, tags, triggers, variables, and more
- **Local Workspaces** - Pull a container workspace to disk as JSON files, edit offline with instant validation, diff, and push everything back in one go ([details](#local-workspaces))
- **Flexible Authentication** - OAuth or Service Account
- **Self-Updating** - Built-in upgrade command to stay up to date
- **AI-Friendly** - Structured JSON output that AI agents can easily parse
- **Human-Friendly** - Colored output, tables, and progress indicators
- **Offline Token Storage** - Authenticate once, stay logged in
- **Default Configuration** - Set default account/container to avoid repetitive flags
- **Server-Side GTM Support** - Full support for sGTM clients, templates, and transformations
- **Shell Completions** - Built-in completion scripts for bash, zsh, and fish

## Installation

### Quick Install (Recommended)

**macOS, Linux, WSL:**

```bash
curl -fsSL https://raw.githubusercontent.com/owntag/gtm-cli/main/install.sh | bash
```

> **Note:** Windows is not currently supported. Please use [WSL (Windows Subsystem for Linux)](https://docs.microsoft.com/en-us/windows/wsl/install) instead.

### Install via npm

Best for CI/CD pipelines with version pinning:

```bash
npm install -g @owntag/gtm-cli

# Or pin to a specific version
npm install -g @owntag/gtm-cli@1.5.6
```

### Manual Download

Download the binary for your platform from [Releases](https://github.com/owntag/gtm-cli/releases):

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `gtm-darwin-arm64` |
| macOS (Intel) | `gtm-darwin-x64` |
| Linux (x64) | `gtm-linux-x64` |

```bash
# Example for macOS Apple Silicon
curl -fsSL https://github.com/owntag/gtm-cli/releases/latest/download/gtm-darwin-arm64 -o gtm
chmod +x gtm
sudo mv gtm /usr/local/bin/
```

### Run with Deno

If you have Deno installed, run directly without installing:

```bash
deno run --allow-net --allow-read --allow-write --allow-env --allow-run \
  https://raw.githubusercontent.com/owntag/gtm-cli/main/src/main.ts
```

> **Note:** Running directly from source does not include the OAuth credentials shipped with official releases. Either authenticate with a [service account](#option-2-service-account), or [provide your own OAuth client](#oauth-when-building-from-source) before running `gtm auth login`.

### Build from Source

```bash
git clone https://github.com/owntag/gtm-cli.git
cd gtm-cli
deno task compile
./gtm --help
```

> **Note:** Source builds do not include the OAuth credentials shipped with official releases. Either authenticate with a [service account](#option-2-service-account), or [provide your own OAuth client](#oauth-when-building-from-source) before running `gtm auth login`.

#### OAuth when building from source

If you want to use `gtm auth login` (browser-based OAuth) with a source build, you need to supply your own Google OAuth client:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create an OAuth 2.0 Client ID. Choose *Desktop app*, or *Web application* with `http://localhost:8085/callback` registered as an authorized redirect URI.
2. Enable the Tag Manager API on the same project.
3. Set the credentials before running the CLI — either as environment variables or in a `.env` file at the repo root:

   ```bash
   export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   gtm auth login
   ```

Alternatively, skip OAuth entirely and use a [service account](#option-2-service-account) — no redirect URI required.

## Quick Start

### 1. Authenticate

```bash
gtm auth login
```

This opens your browser for Google OAuth authentication. Your credentials are stored securely in `~/.config/gtm-cli/credentials.json`.

### 2. Set Up Defaults (Optional)

Run the interactive setup to configure default account and container:

```bash
gtm config setup
```

This lets you run commands without specifying `--account-id` and `--container-id` every time.

### 3. Start Using

```bash
# List your accounts
gtm accounts list

# List containers in an account
gtm containers list --account-id 123456789

# List tags in a workspace
gtm tags list --account-id 123 --container-id 456 --workspace-id 1

# Or, if you've set up defaults:
gtm tags list
```

## Local Workspaces

`gtm local` lets you work on a **complete copy of a GTM workspace on your disk**: every tag, trigger, variable, folder, template (and, for server containers, every client and transformation) becomes one small JSON file. You edit those files, or let an AI agent do it, and the CLI validates every change instantly and offline. When you are done, one `push` uploads all changes to the remote GTM workspace, where you review and publish them in the GTM UI as usual.

### Why

The classic per-resource commands (`gtm tags create ...`) talk to the GTM API for every single change. That is fine for one-off edits, but for anything bigger it has three problems that local workspaces solve:

| Problem | With `gtm local` |
|---------|------------------|
| The GTM API is slow and every change is a round trip. Fifty changes take minutes. | Fifty changes are fifty file writes. They take a second. Only `pull` and `push` talk to the API, and `push` retries automatically when GTM rate-limits. |
| Everyone using the public OAuth client shares one API quota, so rate-limit errors happen. | Dramatically fewer API calls, and the ones that remain are batched into one `push` with built-in backoff. |
| A formatting mistake (wrong parameter type, misspelled key, unknown trigger) only surfaces as a cryptic API error. | Every change is validated locally against GTM's rules, with plain-English, actionable messages. Unknown parameter keys that GTM would silently drop are flagged too. Custom templates are validated against the template's own parameter definitions. |

This is especially effective with AI agents: an agent can create or modify hundreds of entities in one go, check `gtm local status`, fix validation errors immediately, and only then push. Changes to several containers (for example a web container and the matching server container) can live side by side as separate local workspaces and be pushed together.

### Quick start

```bash
# 1. Create a local workspace for a container (pulls the remote workspace + live version)
gtm local init --account-id 123456 --container-id 789012          # -> ./GTM-XXXXXXX/
cd GTM-XXXXXXX

# 2. Make changes: with commands ...
gtm local variables add --name "GA4 ID" --type c --value G-ABC123
gtm local triggers add --name "event.purchase" --event purchase
gtm local tags add --name "GA4 - purchase" --type gaawe \
  --param eventName=purchase --param "measurementIdOverride={{GA4 ID}}" \
  --param sendEcommerceData:boolean=true --trigger event.purchase

# ... or by editing/creating the JSON files directly (validated on status/push)
$EDITOR tags/GA4\ -\ purchase.json

# 3. Review
gtm local status            # changes vs remote workspace + validation + unpublished remote changes
gtm local diff              # field-level diff (add --against live to compare with the published version)
gtm local ui                # GTM-style web UI with live updates (great while an agent is working)

# 4. Upload, then review & publish in GTM
gtm local push
```

### How it works

```
GTM-XXXXXXX/
├── gtm-workspace.json         # account / container / workspace IDs, container info
├── tags/<name>.json           # one file per entity, GTM API format
├── triggers/<name>.json
├── variables/<name>.json
├── folders/  templates/  zones/           (web containers)
├── clients/  transformations/             (server containers)
├── built-in-variables.json    # enabled built-in variables
└── .gtm/                      # machine-managed snapshots
    ├── base.json              #   remote workspace as of the last pull/push (for diff + conflict detection)
    └── live.json              #   the published version (for `diff --against live`)
```

- **File format = GTM API format.** A file contains exactly what `gtm tags get -o json` returns, minus read-only fields (`path`, `accountId`, `fingerprint`, ...). Entities pulled from GTM keep their ID (`tagId`, `triggerId`, ...); new files simply have none, GTM assigns the ID on push and the CLI writes it back.
- **Conveniences on input** (normalized automatically): container-export casing (`"TEMPLATE"`, `"CUSTOM_EVENT"`), a simplified parameter notation (`"parameter": {"eventName": "purchase", "sendPageView": false}` instead of the verbose typed array), simplified conditions (`{"type": "equals", "arg0": "{{_event}}", "arg1": "purchase"}`), and **trigger / folder references by name** (`"firingTriggerId": ["event.purchase", "All Pages"]`).
- **Custom templates by name.** `"template": "Facebook Pixel by Stape"` on a tag, variable or client is resolved to the template's `cvt_...` type on push, so a template and the entities using it go out in a single push. `gtm local templates add --gallery stape-io/fb-tag` imports the newest published gallery version of a community template; `gtm local templates params <ref>` lists a template's parameters.
- **Renames propagate.** `gtm local variables set "Old" --name "New"` rewrites `{{Old}}` to `{{New}}` in every file, just like the GTM UI does; the same goes for trigger, tag and folder references.
- **Push is a plan.** `push` validates, fetches the current remote state, detects conflicts (something changed remotely since your last pull), orders the operations so references resolve (folders → templates → triggers → variables → ... → tags; deletions in reverse), executes them sequentially with retries, and refreshes the snapshots. `push --dry-run` shows the plan. Nothing is ever published: you still review and publish in GTM.
- **Validation is deterministic and offline.** Errors are things GTM would reject (missing required parameters, unknown trigger references, invalid condition types, forbidden name characters, a `customEvent` trigger without a filter, web-only types in a server container, ...). Warnings are things GTM accepts silently but almost certainly are mistakes (unknown parameter keys that get dropped, references to variables that do not exist, built-in variables that are not enabled, ...). `push` refuses on errors and `--strict` also on warnings.
- **Two output modes.** Human output on a terminal, dense JSON when piped or with `-o json`, for every command. JSON mode prints nothing else, so `2>&1 | jq` is safe; a single workspace yields one object, several workspaces an array.

### Command reference

```bash
gtm local init -a <account> -c <container> [-w <workspace>] [--dir <path>] [--create-workspace <name>]
gtm local pull [--force]                 # refresh from remote (refuses to overwrite unpushed changes)
gtm local status                         # summary: changes, validation, unpublished remote changes
gtm local diff [--against remote|live] [--refresh] [--names-only]
gtm local validate [--strict]            # exit code 1 on errors (or warnings with --strict)
gtm local push [--dry-run] [--force] [--strict] [-y]
gtm local ui [--port <n>] [--no-open]    # local web UI
gtm local open                           # open the remote workspace in the GTM UI

# Entities: tags, triggers, variables, folders, templates, clients, transformations, zones
gtm local tags list
gtm local tags get <name|id> [--simple]
gtm local tags add --name <n> --type <t> [--param k=v ...] [--trigger <name|id> ...] [--json '{...}' | --file x.json]
gtm local tags set <name|id> [--name <new>] [--param k=v] [--unset-param k] [--add-trigger t] [--remove-trigger t] [--paused true|false] [--json '{...}']
gtm local tags rm <name|id> [--force]
gtm local triggers add --name <n> --event <event name>        # customEvent shorthand
gtm local variables add --name <n> --type c --value <v>        # constant shorthand
gtm local tags add --name <n> --template <template name> ...    # custom template by name (also variables, clients)
gtm local templates add --gallery <owner/repo> [--name <n>]    # import a community gallery template
gtm local templates add --name <n> --template-file <x.tpl>     # import an exported template file
gtm local templates params <ref>                               # parameters a template defines

gtm local built-in-variables list [--available]
gtm local built-in-variables enable pageUrl clickText ...
gtm local built-in-variables disable pageUrl
```

`--param` syntax: `key=value` (text), `key:boolean=true`, `key:integer=5`, `key:json='[{"parameter":"send_page_view","parameterValue":"false"}]'` (tables).

All commands accept `--dir <path>`. Pointing `--dir` at a folder that *contains* several local workspaces (e.g. `web/` and `server/`) runs `status`, `diff`, `validate`, `pull` and `push` for all of them.

## Updating

GTM CLI can update itself:

```bash
# Check for updates
gtm upgrade --check

# Upgrade to the latest version
gtm upgrade
```

The CLI will also notify you when a new version is available (checks once per day).

## Authentication Options

GTM CLI supports three authentication methods to fit different use cases:

### Option 1: OAuth (Default)

Best for: **Individual users** who want a quick, interactive setup.

```bash
gtm auth login
```

Opens your browser for Google sign-in. Uses the GTM CLI application's API quotas.

### Option 2: Service Account

Best for: **CI/CD pipelines**, **automation**, and **organizations** who want to use their own GCP project.

```bash
# Login with a service account key file
gtm auth login --service-account /path/to/service-account-key.json

# Or use the standard Google environment variable
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
gtm accounts list
```

**Benefits:**
- Uses your own GCP project's API quotas
- No interactive browser login required
- Perfect for CI/CD and automation
- Your organization controls the credentials

**Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a Service Account with Tag Manager roles
3. Download the JSON key file
4. Grant the service account access to your GTM containers

### Checking Auth Status

```bash
gtm auth status
```

Shows which authentication method is active and the associated account.

### Logging Out

```bash
gtm auth logout
```

Clears stored credentials. For service accounts, only removes the CLI's reference to the key file (doesn't delete the key file itself).

## Command Reference

### Authentication

```bash
gtm auth login                                # OAuth (browser)
gtm auth login --service-account <file>       # Service account
gtm auth logout                               # Sign out
gtm auth status                               # Check authentication status
```

### Configuration

```bash
gtm config setup              # Interactive setup for defaults
gtm config get                # Show all configuration
gtm config set <key> <value>  # Set a configuration value
gtm config unset <key>        # Remove a configuration value
```

Available configuration keys:
- `defaultAccountId` - Default GTM account ID
- `defaultContainerId` - Default GTM container ID  
- `defaultWorkspaceId` - Default GTM workspace ID
- `outputFormat` - Default output format (json, table, compact)

### Upgrade

```bash
gtm upgrade           # Upgrade to the latest version
gtm upgrade --check   # Check for updates without installing
gtm upgrade --force   # Force reinstall current version
```

### Accounts

```bash
gtm accounts list                              # List all accounts
gtm accounts get --account-id 123456           # Get account details
gtm accounts update --account-id 123 --name "New Name"
```

### Containers

```bash
gtm containers list --account-id 123456
gtm containers get --account-id 123 --container-id 456
gtm containers create --name "My Container" --type web
gtm containers update --container-id 456 --name "New Name"
gtm containers delete --container-id 456 --force
gtm containers snippet --container-id 456     # Get installation snippet
```

### Local Workspaces

```bash
gtm local init -a 123 -c 456      # Pull a workspace to ./GTM-XXXXXXX/ as JSON files
gtm local status                  # Local changes + validation
gtm local diff --against live     # Compare with the published version
gtm local push                    # Upload all changes (validated, conflict-checked)
gtm local ui                      # GTM-style web UI
```

See [Local Workspaces](#local-workspaces) for the full workflow.

### Workspaces

```bash
gtm workspaces list
gtm workspaces get --workspace-id 1
gtm workspaces create --name "Feature Branch"
gtm workspaces update --workspace-id 1 --name "Updated Name"
gtm workspaces delete --workspace-id 1 --force
gtm workspaces status --workspace-id 1        # Show pending changes
gtm workspaces sync --workspace-id 1          # Sync with live version
gtm workspaces preview --workspace-id 1       # Quick preview
```

### Tags, Triggers, Variables

All three follow the same pattern:

```bash
# List
gtm tags list
gtm triggers list
gtm variables list

# Get
gtm tags get --tag-id 42
gtm triggers get --trigger-id 42
gtm variables get --variable-id 42

# Create
gtm tags create --name "GA4 Event" --type gaawe --config '{"parameter": [...]}'
gtm triggers create --name "Page View" --type pageview
gtm variables create --name "Page URL" --type u

# Update
gtm tags update --tag-id 42 --name "New Name" --config '{"paused": true}'

# Delete
gtm tags delete --tag-id 42 --force

# Revert (undo workspace changes)
gtm tags revert --tag-id 42
```

### Versions

```bash
gtm versions create --name "v1.0" --notes "Initial release"
gtm versions get --version-id 42
gtm versions live                              # Get live version
gtm versions publish --version-id 42           # Publish a version
gtm versions set-latest --version-id 42
gtm version-headers list                       # List all versions (lightweight)
```

### Other Resources

```bash
# Folders
gtm folders list
gtm folders create --name "Marketing Tags"
gtm folders entities --folder-id 1            # List folder contents

# Environments
gtm environments list
gtm environments create --name "Staging" --url "https://staging.example.com"
gtm environments reauthorize --environment-id 1

# Built-in Variables
gtm built-in-variables list
gtm built-in-variables enable --types "pageUrl,pageHostname,pagePath"
gtm built-in-variables disable --types "pageUrl"

# User Permissions
gtm user-permissions list
gtm user-permissions create --email "user@example.com" --account-access admin
```

### Server-Side GTM (sGTM)

```bash
# Clients
gtm clients list
gtm clients create --name "GA4 Client" --type gaaw_client

# Templates
gtm templates list
gtm templates create --name "Custom Template" --template-data "..."

# Transformations
gtm transformations list
gtm transformations create --name "Data Cleanup" --type modify

# Zones
gtm zones list
gtm zones create --name "EU Zone"

# Destinations
gtm destinations list
gtm destinations link --destination-id "AW-123456789"

# Gtag Configs
gtm gtag-configs list
gtm gtag-configs create --type "googleAnalytics"
```

## Output Formats

Control output format with the `--output` flag:

```bash
# Table output (default for terminals)
gtm tags list --output table

# JSON output (default when piping)
gtm tags list --output json

# Compact output (just IDs and names)
gtm tags list --output compact
```

When piping to other commands or files, JSON is used automatically:

```bash
# Piped output is automatically JSON
gtm tags list | jq '.[].name'

# Save to file
gtm tags list --output json > tags.json
```

## Global Options

```bash
--help, -h      Show help
--version, -V   Show version
--quiet, -q     Suppress non-essential output
--no-color      Disable colored output
```

## Shell Completions

Generate shell completion scripts:

```bash
# Bash
gtm completions bash > ~/.bash_completion.d/gtm

# Zsh
gtm completions zsh > ~/.zsh/completions/_gtm

# Fish
gtm completions fish > ~/.config/fish/completions/gtm.fish
```

## Environment Variables

- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account key file (takes precedence over saved auth)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Override the OAuth client used by `gtm auth login` (only needed for source builds; see [OAuth when building from source](#oauth-when-building-from-source))
- `GTM_CLI_CONFIG_DIR` - Override configuration directory (default: `~/.config/gtm-cli`)
- `NO_COLOR` - Disable colored output

## For AI Agents

GTM CLI works great with AI assistants and LLMs. A comprehensive guide with examples, best practices, and troubleshooting is embedded in the CLI itself—agents can access it by running `gtm agent guide`.

For anything beyond a single change, point agents at [local workspaces](#local-workspaces): they can write hundreds of entity files in seconds, get every mistake flagged immediately by `gtm local validate`, review with `gtm local diff`, and upload in one `gtm local push`. The dense JSON output of every `gtm local` command (`-o json`, automatic when piped) is designed for agents; `gtm local ui` gives the human a familiar GTM-like view of what the agent is doing, updating live.

## CI/CD Integration

GTM CLI works great in CI/CD pipelines with service account authentication:

```yaml
# GitHub Actions example
jobs:
  export-gtm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install GTM CLI
        run: npm install -g @owntag/gtm-cli@1.5.0

      - name: Export live container
        run: |
          echo '${{ secrets.GTM_SERVICE_ACCOUNT_KEY }}' > /tmp/sa-key.json
          gtm auth login --service-account /tmp/sa-key.json
          gtm versions live -a ${{ vars.GTM_ACCOUNT_ID }} -c ${{ vars.GTM_CONTAINER_ID }} -o json > container.json
          rm /tmp/sa-key.json
```

## Development

### Prerequisites

- [Deno](https://deno.land/) 2.0+

### Commands

```bash
deno task dev        # Run in development mode with watch
deno task start      # Run the CLI
deno task compile    # Build standalone binary for current platform
deno task lint       # Run linter
deno task fmt        # Format code
deno task check      # Type check
deno task test       # Run unit tests
```

### Project Structure

```
src/
├── main.ts           # CLI entry point
├── auth/             # Authentication (OAuth, Service Account)
├── api/              # GTM API client wrapper
├── commands/         # CLI command definitions
├── config/           # Configuration management
├── local/            # Local workspaces (store, validation, diff, push, web UI)
└── utils/            # Utilities (output, errors, update checker)
```

GitHub Actions will automatically build binaries for macOS and Linux and create a release.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Privacy

GTM CLI stores authentication credentials locally on your machine. No data is sent to owntag or any third party — all communication is directly between your machine and Google's APIs. See [PRIVACY.md](PRIVACY.md) for details.

## Credits

Built by [owntag](https://owntag.eu) - 100% European hosting for Server Side Google Tag Manager.