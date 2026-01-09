# CLAUDE.md - GTM CLI Project Documentation

## Project Overview

**GTM CLI** is a command-line interface for Google Tag Manager, built with Deno and Cliffy. It provides full access to the GTM API v2, enabling users to manage all GTM resources from the terminal.

**Maintained by**: owntag GmbH

**Supported Platforms**: macOS, Linux (no Windows support)

## Architecture

### Runtime Environment
- **Deno** - TypeScript/JavaScript runtime
- **Cliffy** - CLI framework (command parsing, prompts, tables)
- **Google APIs** - Official googleapis npm package for GTM API

### Key Technologies
- `@cliffy/command` - Command-line parsing and subcommands
- `@cliffy/prompt` - Interactive prompts
- `@cliffy/table` - Table output formatting
- `@cliffy/ansi` - Colored terminal output
- `googleapis` - Google Tag Manager API v2 client

## Project Structure

```
src/
├── main.ts                 # CLI entry point, command registration
├── auth/
│   ├── mod.ts             # Auth module exports
│   ├── credentials.ts     # Local credential storage
│   ├── oauth.ts           # OAuth 2.0 flow implementation
│   └── service-account.ts # Service account & ADC auth
├── api/
│   ├── mod.ts             # API module exports
│   └── client.ts          # GTM API client wrapper, type exports
├── commands/
│   ├── mod.ts             # Command exports
│   ├── auth.ts            # Login, logout, status
│   ├── config.ts          # Configuration management
│   ├── upgrade.ts         # Self-update command
│   ├── accounts.ts        # Account operations
│   ├── containers.ts      # Container CRUD
│   ├── workspaces.ts      # Workspace management
│   ├── tags.ts            # Tag CRUD + revert
│   ├── triggers.ts        # Trigger CRUD + revert
│   ├── variables.ts       # Variable CRUD + revert
│   ├── folders.ts         # Folder management
│   ├── versions.ts        # Version operations
│   ├── version-headers.ts # Version listing (lightweight)
│   ├── environments.ts    # Environment management
│   ├── built-in-variables.ts # Built-in variable enable/disable
│   ├── clients.ts         # sGTM client operations
│   ├── templates.ts       # Custom template management
│   ├── transformations.ts # Transformation operations
│   ├── zones.ts           # Zone operations
│   ├── destinations.ts    # Destination operations
│   ├── gtag-configs.ts    # Gtag config operations
│   └── user-permissions.ts # User permission management
├── config/
│   ├── mod.ts             # Config module exports
│   ├── constants.ts       # App constants, OAuth config
│   └── store.ts           # User config persistence
└── utils/
    ├── mod.ts             # Utils module exports
    ├── output.ts          # Output formatting (JSON, table, compact)
    ├── errors.ts          # Error handling utilities
    ├── pagination.ts      # Pagination helpers
    ├── banner.ts          # ASCII banner display
    └── update-checker.ts  # Version checking and self-update
```

## Development Commands

```bash
deno task dev        # Run with watch mode
deno task start      # Run the CLI
deno task compile    # Build binary for current platform
deno task lint       # Run Deno linter
deno task fmt        # Format code
deno task check      # Type check
```

## Authentication Flow

1. User runs `gtm auth login`
2. CLI starts local HTTP server on port 8085
3. Browser opens to Google OAuth consent screen
4. User authenticates and grants permissions
5. Google redirects to `localhost:8085/callback` with auth code
6. CLI exchanges code for access token and refresh token
7. Tokens stored in `~/.config/gtm-cli/credentials.json`
8. Subsequent commands use stored tokens (auto-refresh when expired)

### Alternative Auth Methods
- **Service Account**: `gtm auth login --service-account /path/to/key.json`
- **ADC**: `gtm auth login --adc` (uses gcloud credentials)

## Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| `credentials.json` | `~/.config/gtm-cli/` | OAuth tokens (access, refresh) |
| `config.json` | `~/.config/gtm-cli/` | User preferences, defaults |
| `auth-method.json` | `~/.config/gtm-cli/` | Selected auth method (OAuth/SA/ADC) |
| `update-check.json` | `~/.config/gtm-cli/` | Last update check time & version |

## Available Commands

### Core Commands
- `gtm auth` - Authentication (login, logout, status)
- `gtm config` - Configuration (get, set, unset, setup)
- `gtm upgrade` - Self-update to latest version
- `gtm accounts` - Account management
- `gtm containers` - Container CRUD
- `gtm workspaces` - Workspace management

### Resource Commands (Tags, Triggers, Variables)
All support: list, get, create, update, delete, revert

### Version Commands
- `gtm versions` - Create, get, publish, update, delete versions
- `gtm version-headers` - List version headers (lightweight)

### Additional Commands
- `gtm folders` - Folder management
- `gtm environments` - Environment management
- `gtm built-in-variables` - Built-in variable enable/disable

### Server-Side GTM Commands
- `gtm clients` - sGTM client management
- `gtm templates` - Custom template management
- `gtm transformations` - Transformation operations
- `gtm zones` - Zone management
- `gtm destinations` - Destination linking
- `gtm gtag-configs` - Gtag configuration

### User Management
- `gtm user-permissions` - User permission management

## Key Design Decisions

### 1. Default Configuration
Users can set default account/container/workspace IDs to avoid repetitive flags:
```bash
gtm config setup  # Interactive wizard
gtm config set defaultAccountId 123456
```

### 2. Output Formats
- `--output table` - Human-readable tables (default for TTY)
- `--output json` - Machine-parseable JSON (default for pipes)
- `--output compact` - Minimal output (ID + name only)

### 3. Error Handling
- All errors go to stderr
- Non-zero exit codes on failure
- Consistent error message format

### 4. Fingerprint Handling
Most update operations require a fingerprint for optimistic concurrency control. The CLI automatically fetches the current fingerprint if not provided.

### 5. Self-Update
- `gtm upgrade` downloads and replaces the binary
- Update check runs once per day (cached)
- Shows hint after commands when update available

## Building for Distribution

```bash
# Build for current platform
deno task compile

# GitHub Actions builds for all platforms on tag push:
#   gtm-darwin-arm64 (macOS Apple Silicon)
#   gtm-darwin-x64 (macOS Intel)
#   gtm-linux-x64 (Linux)
```

## OAuth Credentials

**For development:** Set environment variables in `.env` file:
```bash
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
```

**For production builds:** OAuth credentials are embedded during CI build from GitHub secrets:
- `GOOGLE_CLIENT_ID` - GitHub repo secret
- `GOOGLE_CLIENT_SECRET` - GitHub repo secret

The placeholders `__OAUTH_CLIENT_ID__` and `__OAUTH_CLIENT_SECRET__` in `src/config/constants.ts` are replaced by the GitHub Actions workflow during the release build. This keeps secrets out of the codebase.

## Testing the CLI

```bash
# Run directly
deno task start auth login

# Or after compiling
./gtm auth login
./gtm accounts list
./gtm containers list --account-id 123456
```

## Releasing

```bash
git tag v1.1.0
git push origin v1.1.0
```

GitHub Actions will:
1. Build binaries for macOS (arm64 + x64) and Linux (x64)
2. Embed OAuth credentials from secrets
3. Create GitHub Release with binaries attached
