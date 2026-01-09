# GTM CLI

A powerful command-line interface for Google Tag Manager. Manage your GTM resources directly from the terminal - perfect for automation, CI/CD pipelines, and AI agents.

## Features

- **Full GTM API Coverage** - Manage all GTM resources: accounts, containers, workspaces, tags, triggers, variables, and more
- **Flexible Authentication** - OAuth, Service Account, or Application Default Credentials
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
curl -fsSL https://raw.githubusercontent.com/justusbluemer/gtm-cli/main/install.sh | bash
```

### Manual Download

Download the binary for your platform from [Releases](https://github.com/justusbluemer/gtm-cli/releases):

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `gtm-darwin-arm64` |
| macOS (Intel) | `gtm-darwin-x64` |
| Linux | `gtm-linux-x64` |
| Windows | `gtm-windows-x64.exe` |

```bash
# Example for macOS Apple Silicon
curl -fsSL https://github.com/justusbluemer/gtm-cli/releases/latest/download/gtm-darwin-arm64 -o gtm
chmod +x gtm
sudo mv gtm /usr/local/bin/
```

### Run with Deno

If you have Deno installed, run directly without installing:

```bash
deno run --allow-net --allow-read --allow-write --allow-env --allow-run \
  https://raw.githubusercontent.com/justusbluemer/gtm-cli/main/src/main.ts
```

### Build from Source

```bash
git clone https://github.com/justusbluemer/gtm-cli.git
cd gtm-cli
deno task compile
./gtm --help
```

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

### Option 3: Application Default Credentials (ADC)

Best for: **Developers** who already use `gcloud` CLI.

```bash
# First, set up ADC with gcloud
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/tagmanager.edit.containers,https://www.googleapis.com/auth/tagmanager.readonly

# Then tell GTM CLI to use ADC
gtm auth login --adc
```

**Benefits:**
- Uses your personal Google account's quotas
- Integrates with your existing gcloud workflow
- No separate credentials to manage

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
gtm auth login --adc                          # Application Default Credentials
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
- `GTM_CLI_CONFIG_DIR` - Override configuration directory (default: `~/.config/gtm-cli`)
- `NO_COLOR` - Disable colored output

## For AI Agents

GTM CLI is designed to work well with AI agents:

1. **JSON Output** - Use `--output json` for structured, parseable output
2. **Predictable Errors** - Errors are written to stderr with consistent format
3. **Exit Codes** - Non-zero exit codes on failure
4. **Idempotent Operations** - Safe to retry failed commands

Example agent workflow:

```bash
# List tags and parse with jq
gtm tags list --output json | jq '.[] | select(.type == "html")'

# Get specific tag details
gtm tags get --tag-id 42 --output json

# Create tag from JSON config
gtm tags create --name "Event Tag" --type gaawe --config "$(cat tag-config.json)"

# Publish version
gtm versions create --name "Agent Update $(date +%Y%m%d)" | jq -r '.containerVersion.containerVersionId' | xargs -I {} gtm versions publish --version-id {}
```

## CI/CD Integration

GTM CLI works great in CI/CD pipelines with service account authentication:

```yaml
# GitHub Actions example
jobs:
  deploy-gtm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        
      - name: Install GTM CLI
        run: |
          curl -fsSL https://raw.githubusercontent.com/justusbluemer/gtm-cli/main/install.sh | bash
          
      - name: Deploy to GTM
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GTM_SERVICE_ACCOUNT_KEY }}
        run: |
          # Create and publish a new version
          gtm versions create --name "Deploy ${{ github.sha }}" --output json
          gtm versions publish --version-id $(gtm version-headers list --output json | jq -r '.[0].containerVersionId')
```

## Development

### Prerequisites

- [Deno](https://deno.land/) 2.0+

### Commands

```bash
deno task dev        # Run in development mode with watch
deno task start      # Run the CLI
deno task compile    # Build standalone binary for current platform
deno task compile:all # Build for all platforms
deno task lint       # Run linter
deno task fmt        # Format code
deno task check      # Type check
```

### Project Structure

```
src/
├── main.ts           # CLI entry point
├── auth/             # Authentication (OAuth, Service Account, ADC)
├── api/              # GTM API client wrapper
├── commands/         # CLI command definitions
├── config/           # Configuration management
└── utils/            # Utilities (output, errors, pagination)
```

## Releasing

To create a new release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions will automatically build binaries for all platforms and create a release.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Credits

Built by [Justus Blümer](https://github.com/justusbluemer).
