# AI Agent Guide to gtm CLI

## Table of Contents
1. [Quick Start](#quick-start)
2. [Core Concepts](#core-concepts)
3. [Configuration Management](#configuration-management)
4. [Common Workflows](#common-workflows)
5. [Variables](#variables)
6. [Triggers](#triggers)
7. [Tags](#tags)
8. [Custom Templates](#custom-templates)
9. [Performance Optimization](#performance-optimization)
10. [Troubleshooting](#troubleshooting)
11. [Complete Examples](#complete-examples)

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
| `cvt_{containerId}_{templateId}` | Custom Template | Stape templates, community templates |
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
# Name: Facebook Pixel by Stape

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
curl -s "https://raw.githubusercontent.com/stape-io/fb-tag/master/template.tpl" \
  -o /tmp/template.tpl

# Import into GTM
gtm templates create \
  --name "Facebook Pixel by Stape" \
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

### Example 1: GA4 Ecommerce Setup with Meta Pixel

```bash
#!/bin/bash

# 1. Setup
gtm config set defaultAccountId 2596355618
gtm config set defaultContainerId 240161374
gtm config set defaultWorkspaceId 2

# 2. Create constant variable for Pixel ID
gtm variables create \
  --name "Meta Pixel ID" \
  --type c \
  --config '{
    "parameter": [{
      "type": "TEMPLATE",
      "key": "value",
      "value": "YOUR_PIXEL_ID"
    }]
  }'

# 3. Create data layer variables in parallel
gtm variables create --name "DLV - ecommerce.currency" --type v \
  --config '{"parameter":[{"type":"INTEGER","key":"dataLayerVersion","value":"2"},{"type":"BOOLEAN","key":"setDefaultValue","value":"false"},{"type":"TEMPLATE","key":"name","value":"ecommerce.currency"}]}' &

gtm variables create --name "DLV - ecommerce.value" --type v \
  --config '{"parameter":[{"type":"INTEGER","key":"dataLayerVersion","value":"2"},{"type":"BOOLEAN","key":"setDefaultValue","value":"false"},{"type":"TEMPLATE","key":"name","value":"ecommerce.value"}]}' &

gtm variables create --name "DLV - ecommerce.items" --type v \
  --config '{"parameter":[{"type":"INTEGER","key":"dataLayerVersion","value":"2"},{"type":"BOOLEAN","key":"setDefaultValue","value":"false"},{"type":"TEMPLATE","key":"name","value":"ecommerce.items"}]}' &

wait

# 4. Create triggers in parallel
for event in view_item add_to_cart begin_checkout purchase; do
  gtm triggers create \
    --name "CE - ${event}" \
    --type CUSTOM_EVENT \
    --config "{\"customEventFilter\":[{\"type\":\"EQUALS\",\"parameter\":[{\"type\":\"TEMPLATE\",\"key\":\"arg0\",\"value\":\"{{_event}}\"},{\"type\":\"TEMPLATE\",\"key\":\"arg1\",\"value\":\"${event}\"}]}]}" &
done

# Create PageView trigger
gtm triggers create --name "All Pages" --type PAGEVIEW --config '{}' &

wait

# 5. Import Meta Pixel template
curl -s "https://raw.githubusercontent.com/stape-io/fb-tag/master/template.tpl" -o /tmp/fb_template.tpl
gtm templates create --name "Facebook Pixel by Stape" --template-data "$(cat /tmp/fb_template.tpl)"

# 6. Get template ID and create tag type
TEMPLATE_ID=$(gtm templates list -o json | jq -r '.[0].templateId')
CONTAINER_ID=240161374
TAG_TYPE="cvt_${CONTAINER_ID}_${TEMPLATE_ID}"

# 7. Get trigger IDs
ALL_PAGES_ID=$(gtm triggers list -o json | jq -r '.[] | select(.name=="All Pages") | .triggerId')
VIEW_ITEM_ID=$(gtm triggers list -o json | jq -r '.[] | select(.name=="CE - view_item") | .triggerId')
ADD_TO_CART_ID=$(gtm triggers list -o json | jq -r '.[] | select(.name=="CE - add_to_cart") | .triggerId')
BEGIN_CHECKOUT_ID=$(gtm triggers list -o json | jq -r '.[] | select(.name=="CE - begin_checkout") | .triggerId')
PURCHASE_ID=$(gtm triggers list -o json | jq -r '.[] | select(.name=="CE - purchase") | .triggerId')

# 8. Create base config
cat > /tmp/meta_base_config.json << 'EOF'
{
  "parameter": [
    {"type": "TEMPLATE", "key": "pixelIds", "value": "{{Meta Pixel ID}}"},
    {"type": "TEMPLATE", "key": "inheritEventName", "value": "override"},
    {"type": "TEMPLATE", "key": "eventName", "value": "standard"},
    {"type": "TEMPLATE", "key": "eventNameStandard", "value": "PageView"},
    {"type": "BOOLEAN", "key": "enableDataLayerMapping", "value": "true"},
    {"type": "BOOLEAN", "key": "enableEdvancedMatching", "value": "true"}
  ]
}
EOF

cat > /tmp/meta_event_config.json << 'EOF'
{
  "parameter": [
    {"type": "TEMPLATE", "key": "pixelIds", "value": "{{Meta Pixel ID}}"},
    {"type": "TEMPLATE", "key": "inheritEventName", "value": "inherit"},
    {"type": "BOOLEAN", "key": "enableDataLayerMapping", "value": "true"},
    {"type": "BOOLEAN", "key": "enableEdvancedMatching", "value": "true"}
  ]
}
EOF

# 9. Create tags
gtm tags create \
  --name "Meta Pixel - Base (PageView)" \
  --type "$TAG_TYPE" \
  --firing-trigger-id "$ALL_PAGES_ID" \
  --config "$(cat /tmp/meta_base_config.json)"

# Create event tags in parallel
gtm tags create --name "Meta Pixel - ViewContent" --type "$TAG_TYPE" \
  --firing-trigger-id "$VIEW_ITEM_ID" --config "$(cat /tmp/meta_event_config.json)" &

gtm tags create --name "Meta Pixel - AddToCart" --type "$TAG_TYPE" \
  --firing-trigger-id "$ADD_TO_CART_ID" --config "$(cat /tmp/meta_event_config.json)" &

gtm tags create --name "Meta Pixel - InitiateCheckout" --type "$TAG_TYPE" \
  --firing-trigger-id "$BEGIN_CHECKOUT_ID" --config "$(cat /tmp/meta_event_config.json)" &

gtm tags create --name "Meta Pixel - Purchase" --type "$TAG_TYPE" \
  --firing-trigger-id "$PURCHASE_ID" --config "$(cat /tmp/meta_event_config.json)" &

wait

echo "✓ Meta Pixel implementation complete!"
```

### Example 2: Inspecting and Cloning Configuration

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