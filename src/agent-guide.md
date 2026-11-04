# AI Agent Guide to gtm CLI

## Table of Contents
1. [Quick Start](#quick-start)
2. [Local Workspaces (recommended for anything beyond a single change)](#local-workspaces)
3. [Core Concepts](#core-concepts)
4. [Configuration Management](#configuration-management)
5. [Common Workflows](#common-workflows)
6. [Variables](#variables)
7. [Triggers](#triggers)
8. [Tags](#tags)
9. [Custom Templates](#custom-templates)
10. [Performance Optimization](#performance-optimization)
11. [Troubleshooting](#troubleshooting)
12. [Complete Examples](#complete-examples)

---

## Quick Start

### Initial Setup
```bash
# Authenticate
gtm auth login

# List accounts to get IDs
gtm accounts list

# List containers for an account
gtm containers list --account-id 123456

# List workspaces
gtm workspaces list --account-id 123456 --container-id 789012

# Set defaults to avoid repeating IDs
gtm config set defaultAccountId 123456
gtm config set defaultContainerId 789012
gtm config set defaultWorkspaceId 2
```

### Verify Configuration
```bash
gtm config get
```

---

## Local Workspaces

**Use `gtm local` whenever you make more than one or two changes, or touch several containers.** It gives you a full copy of a GTM workspace as JSON files on disk. You write files (fast, no API calls, no rate limits), the CLI validates everything instantly and deterministically, and one `gtm local push` uploads all changes. The human then reviews and publishes in the GTM UI unless they gave other instructions.

### Workflow

```bash
# 1. Pull (once per container). Creates ./<GTM-public-id>/ with one JSON file per entity.
gtm local init --account-id 123456 --container-id 789012 --dir web
gtm local init --account-id 123456 --container-id 345678 --dir server   # e.g. the matching server container

# 2. Look around (fast, offline)
gtm local tags list --dir web -o json
gtm local tags get "GA4 - page_view" --dir web --simple     # parameters in readable key/value form
cat web/tags/*.json                                          # the files ARE the workspace

# 3. Change things - either with commands (validated before the file is written) ...
gtm local variables add --dir web --name "GA4 ID" --type c --value G-ABC123
gtm local triggers add --dir web --name "event.purchase" --event purchase
gtm local tags add --dir web --name "GA4 - purchase" --type gaawe \
  --param eventName=purchase --param "measurementIdOverride={{GA4 ID}}" \
  --param sendEcommerceData:boolean=true --trigger event.purchase
gtm local tags set --dir web "GA4 - purchase" --param eventName=purchase_v2 --add-trigger "All Pages"

# ... or by writing JSON files directly (validate afterwards)
cat > web/tags/GA4\ -\ add_to_cart.json << 'EOF'
{
  "name": "GA4 - add_to_cart",
  "type": "gaawe",
  "parameter": { "eventName": "add_to_cart", "measurementIdOverride": "{{GA4 ID}}", "sendEcommerceData": true },
  "firingTriggerId": ["event.add_to_cart"]
}
EOF

# 4. Validate and review. Fix every error before pushing; read the warnings.
gtm local validate --dir web -o json
gtm local status --dir .          # all workspaces below the current folder
gtm local diff --dir web          # field-level diff vs the remote workspace
gtm local diff --dir web --against live

# 5. Upload. Nothing is published - the human publishes in GTM.
gtm local push --dir web --dry-run
gtm local push --dir web -o json
```

`--dir` can be omitted when the current directory is inside a workspace. Every command prints dense JSON when its output is piped (or with `-o json`) and human-readable text on a terminal. In JSON mode nothing else is printed (no progress lines), so `2>&1 | jq` is safe. When a command covers exactly one workspace the JSON is a single object; with several workspaces (`--dir` pointing at a parent folder) it is an array.

`gtm local status -o json` returns `{root, workspaceId, workspaceUrl, container, pulledAt, liveVersion, summary:{added,modified,deleted}, changes:[...], summaryVsLive, unpublishedRemoteChanges, validation:{ok,errors,warnings,issues}}`. `push -o json` returns `{ok, workspaceUrl, operations, results:[{op,kind,name,ok,id,error,drift}]}`; give the user the `workspaceUrl` for review.

### File format

A file is the GTM API representation of the entity (what `gtm tags get -o json` returns) without read-only fields. Copy the structure of an existing file of the same type when in doubt.

```json
{
  "tagId": "23",
  "name": "GA4 - page_view",
  "type": "gaawe",
  "firingTriggerId": ["2147479553"],
  "parameter": [
    { "type": "template", "key": "eventName", "value": "page_view" },
    { "type": "template", "key": "measurementIdOverride", "value": "{{GA4 ID}}" },
    { "type": "boolean", "key": "sendEcommerceData", "value": "false" }
  ]
}
```

Rules and conveniences:

- **IDs**: files pulled from GTM carry `tagId` / `triggerId` / `variableId` / ... Never invent IDs. New files have no ID; GTM assigns one on push and the CLI writes it back.
- **Parameters** may be written in the **simplified notation** as an object: strings become `template`, JSON booleans `boolean`, whole numbers `integer`, arrays `list`, objects `map`:
  ```json
  "parameter": {
    "eventName": "purchase",
    "sendEcommerceData": true,
    "eventSettingsTable": [ { "parameter": "send_page_view", "parameterValue": "false" } ]
  }
  ```
  Files written by the CLI always use the canonical GTM array form; both forms are accepted everywhere.
- **Triggers are referenced by name or ID** in `firingTriggerId` / `blockingTriggerId`: `["event.purchase", "All Pages"]`. Built-in triggers: web containers have `All Pages` (2147479553), `Initialization - All Pages` (2147479573) and `Consent Initialization - All Pages` (2147479572); server containers have `All Pages` (2147479574).
- **Variables are referenced as `{{Variable Name}}`** inside values (GTM's own syntax), **tags by name** in `setupTag` / `teardownTag`, **folders by name or ID** in `parentFolderId`.
- **Conditions** (trigger `filter`, `customEventFilter`, `autoEventFilter`) may be simplified: `{ "type": "equals", "arg0": "{{_event}}", "arg1": "purchase" }` (also `"negate": true`; `ignore_case` only works with `matchRegex`). Valid types: equals, contains, startsWith, endsWith, matchRegex, greater, greaterOrEquals, less, lessOrEquals, cssSelector, urlMatches.
- **Enum casing** from container exports (`"TEMPLATE"`, `"CUSTOM_EVENT"`, `"ONCE_PER_EVENT"`) is accepted and normalized to the API form (`template`, `customEvent`, `oncePerEvent`).
- **Built-in variables** live in `built-in-variables.json`; enable them with `gtm local built-in-variables enable pageUrl clickText` before referencing `{{Page URL}}` / `{{Click Text}}`.
- **Custom templates**: reference a template **by name** with `"template": "Facebook Pixel by Stape"` instead of `"type"` (works for tags, variables and clients, also before the template has been pushed; the CLI resolves it to the `cvt_...` type id on push, so templates and the entities using them go out in one push). Pulled entities carry the resolved form: `"type": "cvt_<galleryTemplateId>"` (gallery-imported) or `"type": "cvt_<containerId>_<templateId>"`. `gtm local templates params <ref>` lists a template's parameters (name, wire type, required, options, enabling conditions); the validator checks your parameters against those definitions.
- **Adding templates**: `gtm local templates add --gallery stape-io/fb-tag` downloads the newest *published* gallery version (from `metadata.yaml`, not HEAD) of a community template; `--template-file x.tpl` imports a local export. API-created templates are always plain custom templates: `galleryReference` is rejected by the API on create (validation reports `GALLERY_REFERENCE_ON_CREATE`), so they do not get gallery update notices. Only the GTM UI can add a gallery-linked template. Never remove `galleryReference` from a *pulled* gallery template: pushing it without the field detaches it from the gallery (validation warns).
- **Server containers** use `customEvent` and `always` triggers (no `pageview`), the variable types `ed` (Event Data: `keyPath`), `qp`, `rh`, `c`, `smm`, `remm`, and tag types such as `sgtmgaaw`, `sgtmadsct`. Web-only types are rejected by validation.
- **Renaming**: `gtm local variables set "Old" --name "New"` updates `{{Old}}` references in all files (same for triggers, tags, folders). Do not rename by editing files manually unless you also update references.
- **Deleting**: delete the file (or `gtm local tags rm <name>`); the remote entity is deleted on the next push. `rm` refuses while other entities still reference it.

### Reading validation output

```json
{ "severity": "error", "code": "TRIGGER_NOT_FOUND", "file": "tags/GA4 - purchase.json",
  "path": "firingTriggerId[0]", "message": "... references trigger \"event.purchas\", which does not exist ...",
  "hint": "Use the name or ID of a trigger in triggers/ ... Did you mean \"event.purchase\"?" }
```

- `error` = GTM would reject it; `push` refuses until fixed. `warning` = GTM accepts it but it is almost certainly a mistake (an unknown parameter key is **silently dropped** by GTM; a `{{variable}}` that does not exist evaluates to undefined).
- `file` + `path` tell you exactly where; `hint` tells you how to fix it. Fix and re-run `gtm local validate -o json` - it takes milliseconds.
- `add`/`set` refuse to write a file with errors (use `--force` to write anyway, e.g. when you will create the referenced trigger next).

### Push semantics

- `push` = validate → fetch remote → detect conflicts → plan → execute → write back IDs → refresh snapshots. Order is dependency-safe (folders, templates, triggers, variables, clients, transformations, tags, zones; deletions reversed, dependents first).
- **Conflicts**: if an entity changed remotely since your last pull *and* locally, push stops and lists the conflicts. Resolve with `gtm local pull --force` (take remote) or `gtm local push --force` (take local).
- **Drift**: if GTM stores an entity differently than requested (it drops unknown parameters), push reports exactly what changed and updates the local file to match, so `status` is clean afterwards.
- Rate limits (HTTP 429) are retried automatically with backoff. Entities created remotely since your pull are left alone; run `gtm local pull` afterwards to get them.
- Nothing is published. Tell the user to review the workspace in GTM (the push output prints the URL) and publish.

### Watching an agent work

`gtm local ui` starts a local, read-only web UI styled like GTM that shows every entity, the diff vs remote/live and all validation issues, refreshing every two seconds while files change.

---

## Core Concepts

### Resource Structure
```
Account
└── Container
    └── Workspace
        ├── Tags
        ├── Triggers
        ├── Variables
        ├── Templates
        └── Folders
```

### ID Types
- **Account ID**: Numeric (e.g., `2596355618`)
- **Container ID**: Numeric (e.g., `240161374`)
- **Workspace ID**: Numeric (e.g., `2`)
- **Tag/Trigger/Variable ID**: Numeric, auto-assigned sequentially

### Output Formats
```bash
# Table (default, human-readable)
gtm tags list

# JSON (for programmatic parsing)
gtm tags list -o json

# Compact (minimal output)
gtm tags list -o compact
```

---

## Configuration Management

### Essential Commands
```bash
# View current config
gtm config get

# Set defaults (recommended for AI agents)
gtm config set defaultAccountId YOUR_ACCOUNT_ID
gtm config set defaultContainerId YOUR_CONTAINER_ID
gtm config set defaultWorkspaceId YOUR_WORKSPACE_ID
gtm config set outputFormat json  # For programmatic use

# Get specific config value
gtm config get defaultAccountId
```

### Best Practice for AI Agents
**Always set defaults at the start of your session** to avoid repetitive `--account-id`, `--container-id`, `--workspace-id` flags.

---

## Common Workflows

### 1. Discovery & Inspection

#### List Resources
```bash
# List all tags
gtm tags list

# List specific tag
gtm tags get --tag-id 5

# List with JSON output for parsing
gtm tags list -o json

# List triggers
gtm triggers list

# List variables
gtm variables list

# List custom templates
gtm templates list
```

#### Inspect Existing Resources
```bash
# Get full tag details (including configuration)
gtm tags get --tag-id 27 -o json

# This shows the exact structure needed for creating similar tags
```

**AI Agent Tip**: Always inspect an existing resource before creating a similar one to understand the exact parameter structure.

### 2. Creating Resources in Parallel

**Critical for Performance**: The CLI supports parallel operations. Use multiple commands in a single message when operations are independent.

```bash
# Create multiple triggers in parallel
gtm triggers create --name "CE - event1" --type CUSTOM_EVENT --config '...' &
gtm triggers create --name "CE - event2" --type CUSTOM_EVENT --config '...' &
gtm triggers create --name "CE - event3" --type CUSTOM_EVENT --config '...' &
wait
```

### 3. Working with JSON Configurations

**Best Practice**: Use temporary files for complex JSON configurations to avoid escaping issues.

```bash
# Create config file
cat > /tmp/config.json << 'EOF'
{
  "parameter": [
    {
      "type": "TEMPLATE",
      "key": "name",
      "value": "ecommerce.currency"
    }
  ]
}
EOF

# Use in command
gtm variables create --name "DLV - Currency" --type v --config "$(cat /tmp/config.json)"
```

---

## Variables

### Variable Types
| Type | Description | Example Use Case |
|------|-------------|------------------|
| `c` | Constant | Pixel IDs, API keys |
| `v` | Data Layer Variable | ecommerce.currency |
| `jsm` | Custom JavaScript | Data transformations |
| `u` | URL Variable | Page path, hostname |
| `k` | 1st Party Cookie | User preferences |

### Creating Variables

#### Constant Variable
```bash
gtm variables create \
  --name "Meta Pixel ID" \
  --type c \
  --config '{
    "parameter": [
      {
        "type": "TEMPLATE",
        "key": "value",
        "value": "1234567890123456"
      }
    ]
  }'
```

#### Data Layer Variable
```bash
gtm variables create \
  --name "DLV - ecommerce.currency" \
  --type v \
  --config '{
    "parameter": [
      {
        "type": "INTEGER",
        "key": "dataLayerVersion",
        "value": "2"
      },
      {
        "type": "BOOLEAN",
        "key": "setDefaultValue",
        "value": "false"
      },
      {
        "type": "TEMPLATE",
        "key": "name",
        "value": "ecommerce.currency"
      }
    ]
  }'
```

#### Custom JavaScript Variable
```bash
# Using heredoc for complex JavaScript
cat > /tmp/custom_js.json << 'EOF'
{
  "parameter": [
    {
      "type": "TEMPLATE",
      "key": "javascript",
      "value": "function() {\n  var items = {{DLV - ecommerce.items}};\n  if (!items || !Array.isArray(items)) return [];\n  \n  return items.map(function(item) {\n    return item.item_id || '';\n  });\n}"
    }
  ]
}
EOF

gtm variables create \
  --name "CJS - Meta Pixel Content IDs" \
  --type jsm \
  --config "$(cat /tmp/custom_js.json)"
```

### Common Variable Patterns

#### GA4 Ecommerce Variables
```bash
# Create all ecommerce variables in parallel
gtm variables create --name "DLV - ecommerce.currency" --type v --config '...' &
gtm variables create --name "DLV - ecommerce.value" --type v --config '...' &
gtm variables create --name "DLV - ecommerce.items" --type v --config '...' &
gtm variables create --name "DLV - ecommerce.transaction_id" --type v --config '...' &
wait
```

---

## Triggers

### Trigger Types
| Type | Description | Common Use |
|------|-------------|------------|
| `PAGEVIEW` | Page View | All Pages, specific URLs |
| `CUSTOM_EVENT` | Custom Event | dataLayer events |
| `CLICK` | Click | Button clicks, link clicks |
| `FORM_SUBMISSION` | Form Submit | Form tracking |
| `WINDOW_LOADED` | Window Loaded | Delayed initialization |

### Creating Triggers

#### All Pages Trigger
```bash
gtm triggers create \
  --name "All Pages" \
  --type PAGEVIEW \
  --config '{}'
```

#### Custom Event Trigger
```bash
gtm triggers create \
  --name "CE - purchase" \
  --type CUSTOM_EVENT \
  --config '{
    "customEventFilter": [
      {
        "type": "EQUALS",
        "parameter": [
          {
            "type": "TEMPLATE",
            "key": "arg0",
            "value": "{{_event}}"
          },
          {
            "type": "TEMPLATE",
            "key": "arg1",
            "value": "purchase"
          }
        ]
      }
    ]
  }'
```

**Critical**: Custom event triggers MUST use `{{_event}}` as `arg0`, not a custom variable.

### Bulk Creating GA4 Ecommerce Triggers
```bash
# Create all GA4 ecommerce event triggers in parallel
for event in view_item add_to_cart begin_checkout purchase add_payment_info; do
  gtm triggers create \
    --name "CE - ${event}" \
    --type CUSTOM_EVENT \
    --config "{
      \"customEventFilter\": [{
        \"type\": \"EQUALS\",
        \"parameter\": [
          {\"type\": \"TEMPLATE\", \"key\": \"arg0\", \"value\": \"{{_event}}\"},
          {\"type\": \"TEMPLATE\", \"key\": \"arg1\", \"value\": \"${event}\"}
        ]
      }]
    }" &
done
wait
```

---

## Tags

### Tag Types
| Type | Description | Example |
|------|-------------|---------|
| `html` | Custom HTML | Pixels, scripts |
| `cvt_{containerId}_{templateId}` | Custom Template | Community templates |
| `ua` | Universal Analytics | UA tags (legacy) |
| `gaawe` | GA4 Config/Event | GA4 tracking |

### Creating Tags

#### Custom HTML Tag
```bash
gtm tags create \
  --name "Custom Pixel" \
  --type html \
  --firing-trigger-id 20 \
  --config '{
    "parameter": [
      {
        "type": "TEMPLATE",
        "key": "html",
        "value": "<script>console.log(\"Hello\");</script>"
      },
      {
        "type": "BOOLEAN",
        "key": "supportDocumentWrite",
        "value": "false"
      }
    ]
  }'
```

#### Custom Template Tag (CRITICAL)

**Discovery**: Custom template tags use the format `cvt_{containerId}_{templateId}`

```bash
# Step 1: Find your template ID
gtm templates list

# Output example:
# Template ID: 26
# Name: Facebook Pixel

# Step 2: Create tag using cvt_{containerId}_{templateId}
# Format: cvt_240161374_26 (where 240161374 is container ID, 26 is template ID)

gtm tags create \
  --name "Meta Pixel - Base" \
  --type "cvt_240161374_26" \
  --firing-trigger-id 20 \
  --config '{
    "parameter": [
      {
        "type": "TEMPLATE",
        "key": "pixelIds",
        "value": "{{Meta Pixel ID}}"
      },
      {
        "type": "TEMPLATE",
        "key": "inheritEventName",
        "value": "override"
      },
      {
        "type": "TEMPLATE",
        "key": "eventName",
        "value": "standard"
      },
      {
        "type": "TEMPLATE",
        "key": "eventNameStandard",
        "value": "PageView"
      }
    ]
  }'
```

**How to Discover Template Type Format**:
1. Ask user to create a sample tag in GTM UI using the template
2. Inspect the tag: `gtm tags get --tag-id SAMPLE_TAG_ID -o json`
3. Look at the `"type"` field - it will show the correct format
4. Use that format for all subsequent tag creations

### Tag Management

#### Multiple Firing Triggers
```bash
gtm tags create \
  --name "Multi-Trigger Tag" \
  --type html \
  --firing-trigger-id 20,21,22 \
  --config '{...}'
```

#### Blocking Triggers
```bash
gtm tags create \
  --name "Blocked Tag" \
  --type html \
  --firing-trigger-id 20 \
  --blocking-trigger-id 25 \
  --config '{...}'
```

#### Delete Tags
```bash
# With confirmation
gtm tags delete --tag-id 27

# Skip confirmation (for automation)
gtm tags delete --tag-id 27 --force
```

---

## Custom Templates

### Importing Templates

#### From File
```bash
# Download template file
curl -s "https://raw.githubusercontent.com/facebookarchive/GoogleTagManager-WebTemplate-For-FacebookPixel/refs/heads/main/template.tpl" \
  -o /tmp/template.tpl

# Import into GTM
gtm templates create \
  --name "Facebook Pixel" \
  --template-data "$(cat /tmp/template.tpl)"
```

#### Listing Templates
```bash
gtm templates list

# Get template details
gtm templates get --template-id 26 -o json
```

### Using Custom Templates

**Critical Pattern**:
1. Import template → Get template ID
2. Note container ID from config
3. Use format: `cvt_{containerId}_{templateId}` as tag type

```bash
# Example workflow
TEMPLATE_ID=$(gtm templates list -o json | jq -r '.[0].templateId')
CONTAINER_ID=$(gtm config get defaultContainerId | awk '{print $NF}')
TAG_TYPE="cvt_${CONTAINER_ID}_${TEMPLATE_ID}"

gtm tags create \
  --name "Template Tag" \
  --type "$TAG_TYPE" \
  --firing-trigger-id 20 \
  --config '{...}'
```

---

## Performance Optimization

### 1. Set Defaults First
```bash
# Do this at session start
gtm config set defaultAccountId 123456
gtm config set defaultContainerId 789012
gtm config set defaultWorkspaceId 2
```

**Impact**: Eliminates 3 parameters from every command, reducing token usage and command length.

### 2. Parallel Operations

**Rule**: If operations are independent, run them in parallel.

```bash
# Good: Parallel execution
gtm variables create --name "Var1" --type c --config '{...}' &
gtm variables create --name "Var2" --type c --config '{...}' &
gtm variables create --name "Var3" --type c --config '{...}' &
wait

# Bad: Sequential execution
gtm variables create --name "Var1" --type c --config '{...}'
gtm variables create --name "Var2" --type c --config '{...}'
gtm variables create --name "Var3" --type c --config '{...}'
```

**When NOT to parallelize**:
- When one resource depends on another's ID
- When order matters (rare in GTM)

### 3. Use JSON Output for Parsing
```bash
# Instead of parsing table output
gtm tags list -o json | jq -r '.[].tagId'

# Get specific field
gtm tags get --tag-id 27 -o json | jq -r '.type'
```

### 4. Batch Similar Operations

Use loops and parallel execution:
```bash
# Create multiple similar triggers
events=("view_item" "add_to_cart" "begin_checkout" "purchase")
for event in "${events[@]}"; do
  gtm triggers create \
    --name "CE - ${event}" \
    --type CUSTOM_EVENT \
    --config "{...}" &
done
wait
```

### 5. Use Heredocs for Complex JSON
```bash
# Avoid escaping nightmares
cat > /tmp/config.json << 'EOF'
{
  "parameter": [...]
}
EOF

gtm tags create --name "Tag" --type html --config "$(cat /tmp/config.json)"
```

---

## Troubleshooting

### Common Errors and Solutions

#### 1. "Unknown entity type (template public ID: ...)"
**Problem**: Incorrect tag type for custom template
**Solution**: Use format `cvt_{containerId}_{templateId}`

```bash
# Wrong
gtm tags create --type "cvt_26" ...

# Wrong
gtm tags create --type "26" ...

# Correct
gtm tags create --type "cvt_240161374_26" ...
```

#### 2. "Custom-event trigger must have exactly one custom-event filter"
**Problem**: Missing or malformed customEventFilter
**Solution**: Include proper customEventFilter structure

```bash
# Correct structure
{
  "customEventFilter": [
    {
      "type": "EQUALS",
      "parameter": [
        {"type": "TEMPLATE", "key": "arg0", "value": "{{_event}}"},
        {"type": "TEMPLATE", "key": "arg1", "value": "event_name"}
      ]
    }
  ]
}
```

#### 3. "The value must not be empty"
**Problem**: Empty parameter value in config
**Solution**: Ensure all parameter values are provided

```bash
# Wrong
{"type": "TEMPLATE", "key": "value", "value": ""}

# Correct
{"type": "TEMPLATE", "key": "value", "value": "actual_value"}
```

#### 4. "Tag references an unknown trigger"
**Problem**: Trigger ID doesn't exist
**Solution**: List triggers first to get correct IDs

```bash
# Get trigger IDs
gtm triggers list

# Use correct ID
gtm tags create --firing-trigger-id CORRECT_ID ...
```

#### 5. "Bad escaped character in JSON"
**Problem**: Improper JSON escaping in command line
**Solution**: Use heredoc or temp file

```bash
# Instead of inline JSON with escaping issues
cat > /tmp/config.json << 'EOF'
{"parameter": [...]}
EOF

gtm tags create --config "$(cat /tmp/config.json)"
```

### Debugging Workflow

```bash
# 1. Verify configuration
gtm config get

# 2. List existing resources to understand structure
gtm tags get --tag-id WORKING_TAG_ID -o json

# 3. Test with simple example first
gtm variables create --name "Test" --type c --config '{"parameter":[{"type":"TEMPLATE","key":"value","value":"test"}]}'

# 4. Check output format
gtm tags list -o json | jq '.'

# 5. Verify IDs exist
gtm triggers list | grep "Trigger ID"
```

---

## Complete Examples

### Example 1: GA4 ecommerce events + Meta Pixel, with a local workspace

```bash
#!/bin/bash
set -e

# 1. Pull the web container once (creates ./web/ with one JSON file per entity)
gtm local init --account-id 2596355618 --container-id 240161374 --dir web
cd web

# 2. Look at what exists (offline)
gtm local tags list -o json | jq -r '.[] | [.name, .type, .triggers] | @tsv'
gtm local built-in-variables list

# 3. Import the Meta Pixel template from the gallery (newest published version)
gtm local templates add --gallery facebookarchive/GoogleTagManager-WebTemplate-For-FacebookPixel --name "Facebook Pixel"
gtm local templates params "Facebook Pixel"          # which parameters exist, which are required

# 4. Variables
gtm local variables add --name "Meta Pixel ID" --type c --value YOUR_PIXEL_ID
for key in currency value items; do
  gtm local variables add --name "DLV - ecommerce.$key" --type v \
    --json "{\"parameter\": {\"name\": \"ecommerce.$key\", \"dataLayerVersion\": 2, \"setDefaultValue\": false}}"
done

# 5. Triggers (customEvent shorthand)
for event in view_item add_to_cart begin_checkout purchase; do
  gtm local triggers add --name "CE - $event" --event "$event"
done

# 6. Tags - the template is referenced by name, no template ID needed yet
gtm local tags add --name "Meta Pixel - Base" --template "Facebook Pixel" --trigger "All Pages" \
  --json '{"parameter": {"pixelId": "{{Meta Pixel ID}}", "eventName": "standard", "standardEventName": "PageView"}}'
for pair in "ViewContent:CE - view_item" "AddToCart:CE - add_to_cart" "InitiateCheckout:CE - begin_checkout" "Purchase:CE - purchase"; do
  ev="${pair%%:*}"; trig="${pair#*:}"
  gtm local tags add --name "Meta Pixel - $ev" --template "Facebook Pixel" --trigger "$trig" \
    --json "{\"parameter\": {\"pixelId\": \"{{Meta Pixel ID}}\", \"eventName\": \"standard\", \"standardEventName\": \"$ev\"}}"
done

# 7. Review: validation (already ran on every add), diff, then push everything in one go
gtm local validate
gtm local diff --names-only
gtm local push -o json | jq '{ok, workspaceUrl, results: [.results[] | {op, kind, name, ok, error}]}'
# -> Tell the user to review and publish at the printed workspaceUrl.
```

Bulk work can equally be done by writing the JSON files directly (e.g. from a script) and running `gtm local validate` afterwards; both routes produce the same files.

### Example 2: Inspecting and Cloning Configuration (per-resource API commands)

```bash
#!/bin/bash

# Scenario: Clone an existing tag to a new trigger

# 1. Get existing tag configuration
SOURCE_TAG_ID=27
gtm tags get --tag-id $SOURCE_TAG_ID -o json > /tmp/source_tag.json

# 2. Extract type and parameters
TAG_TYPE=$(jq -r '.type' /tmp/source_tag.json)
jq '.parameter' /tmp/source_tag.json > /tmp/tag_config.json

# 3. Create new tag with same config, different trigger
NEW_TRIGGER_ID=30

gtm tags create \
  --name "Cloned Tag" \
  --type "$TAG_TYPE" \
  --firing-trigger-id "$NEW_TRIGGER_ID" \
  --config "$(cat /tmp/tag_config.json | jq '{parameter: .}')"

echo "✓ Tag cloned successfully"
```

### Example 3: Bulk Update Variable Values

```bash
#!/bin/bash

# Scenario: Update Pixel ID across all tags

OLD_PIXEL_ID="1234567890"
NEW_PIXEL_ID="9876543210"

# 1. Get all tags using the old Pixel ID
gtm tags list -o json | \
  jq -r --arg old "$OLD_PIXEL_ID" '.[] | select(.parameter[]?.value == $old) | .tagId' | \
  while read tag_id; do
    echo "Updating tag $tag_id"

    # Get current config
    gtm tags get --tag-id "$tag_id" -o json > /tmp/tag_${tag_id}.json

    # Update parameter value
    jq --arg new "$NEW_PIXEL_ID" \
      '(.parameter[] | select(.key == "pixelIds") | .value) = $new' \
      /tmp/tag_${tag_id}.json > /tmp/tag_${tag_id}_updated.json

    # Update tag (would need update command - not shown in original CLI)
    # This is a conceptual example
  done
```

---

## Best Practices for AI Agents

### 1. Always Inspect Before Creating
```bash
# Before creating similar resource, inspect an example
gtm tags get --tag-id EXAMPLE_ID -o json
```

### 2. Use Descriptive Naming Conventions
```bash
# Good naming patterns
"DLV - ecommerce.currency"  # Data Layer Variable
"CJS - Format Items"         # Custom JavaScript
"CE - purchase"              # Custom Event trigger
"Meta Pixel - Purchase"      # Tag name
```

### 3. Validate IDs Exist
```bash
# Before using an ID, verify it exists
TRIGGER_ID=20
if gtm triggers get --trigger-id $TRIGGER_ID &>/dev/null; then
  echo "Trigger exists"
else
  echo "Trigger not found"
  exit 1
fi
```

### 4. Handle Errors Gracefully
```bash
# Check exit codes
if gtm tags create --name "Test" --type html --config '{...}' 2>/tmp/error.log; then
  echo "Success"
else
  echo "Failed:"
  cat /tmp/error.log
fi
```

### 5. Document Your Work
```bash
# Add comments in scripts
# Purpose: Create GA4 ecommerce triggers for checkout funnel
# Events: view_item, add_to_cart, begin_checkout, purchase
# References: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
```

### 6. Test with Simple Cases First
```bash
# Create one example before bulk operations
gtm variables create --name "Test Var" --type c --config '{"parameter":[{"type":"TEMPLATE","key":"value","value":"test"}]}'

# If successful, proceed with bulk
```

### 7. Use Version Control
```bash
# Export configurations for backup
gtm tags list -o json > tags_backup_$(date +%Y%m%d).json
gtm triggers list -o json > triggers_backup_$(date +%Y%m%d).json
gtm variables list -o json > variables_backup_$(date +%Y%m%d).json
```

---

## Quick Reference Card

### Essential Commands
```bash
# Setup
gtm auth login
gtm config set defaultAccountId ID
gtm config set defaultContainerId ID
gtm config set defaultWorkspaceId ID

# List
gtm accounts list
gtm containers list
gtm workspaces list
gtm tags list
gtm triggers list
gtm variables list
gtm templates list

# Get Details
gtm tags get --tag-id ID -o json
gtm triggers get --trigger-id ID -o json
gtm variables get --variable-id ID -o json

# Create
gtm variables create --name "Name" --type TYPE --config '{...}'
gtm triggers create --name "Name" --type TYPE --config '{...}'
gtm tags create --name "Name" --type TYPE --firing-trigger-id ID --config '{...}'
gtm templates create --name "Name" --template-data "$(cat file.tpl)"

# Delete
gtm tags delete --tag-id ID --force
gtm triggers delete --trigger-id ID --force
gtm variables delete --variable-id ID --force
```

### Common Patterns
```bash
# Parallel execution
command1 & command2 & command3 & wait

# JSON config from file
--config "$(cat /tmp/config.json)"

# Custom template tag type
--type "cvt_{containerId}_{templateId}"

# Extract ID from JSON
ID=$(gtm resources list -o json | jq -r '.[0].resourceId')
```

### Variable Types
- `c` = Constant
- `v` = Data Layer Variable
- `jsm` = Custom JavaScript
- `u` = URL Variable
- `k` = 1st Party Cookie

### Trigger Types
- `PAGEVIEW` = Page View
- `CUSTOM_EVENT` = Custom Event
- `CLICK` = Click
- `FORM_SUBMISSION` = Form Submit
- `WINDOW_LOADED` = Window Loaded