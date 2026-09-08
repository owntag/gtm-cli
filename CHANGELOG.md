# Changelog - GTM CLI (@owntag/gtm-cli)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.8] - 2026-05-24

### Added
- Documented safe version publishing and invocation guidelines for autonomous AI agents.
- Clarified OAuth token flow and service account authentication boundaries in README.

### Fixed
- Migrated release CI workflow to Node 24 to resolve npm publish flakiness.

## [1.5.7] - 2026-04-28

### Fixed
- Fixed missing `type` parameter validation across variables, tags, and triggers update commands.

## [1.5.6] - 2026-02-09

### Added
- Upgraded npm dependencies to support npm 11.5.1+ OIDC trusted publishing.

## [1.5.0] - 2026-01-15

### Added
- Complete Google Tag Manager resource coverage (accounts, containers, workspaces, tags, triggers, variables).
- Structured JSON output support for agentic tool use.
- Deno binary cross-compilation for macOS (arm64/x64) and Linux (x64).
