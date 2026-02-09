# @owntag/gtm-cli

Command-line interface for Google Tag Manager.

## Installation

```bash
npm install -g @owntag/gtm-cli
```

Or use with npx:

```bash
npx @owntag/gtm-cli --help
```

## CI/CD Usage

For CI/CD workflows, you can pin to a specific version:

```bash
npm install -g @owntag/gtm-cli@1.5.0
```

## Usage

```bash
# Authenticate with Google
gtm auth login

# List accounts
gtm accounts list

# List containers
gtm containers list --account-id <account-id>

# Get help
gtm --help
```

## Documentation

For full documentation, visit: https://github.com/owntag/gtm-cli

## Supported Platforms

- macOS (Intel and Apple Silicon)
- Linux (x64)

## License

MIT
