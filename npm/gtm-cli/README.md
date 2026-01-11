# GTM CLI

Command-line interface for managing Google Tag Manager.

## Installation

```bash
# Global installation
npm install -g gtm-cli

# Or as a project dependency
npm install --save-dev gtm-cli
```

## Usage

```bash
# Authenticate
gtm auth login

# List accounts
gtm accounts list

# List containers
gtm containers list --account-id 123456

# Use with npx (no install required)
npx gtm-cli accounts list
```

## Documentation

For full documentation, see the [GitHub repository](https://github.com/owntag/gtm-cli).

## For AI Agents

Run `gtm agent guide` for a comprehensive guide on using GTM CLI programmatically.

## License

MIT
