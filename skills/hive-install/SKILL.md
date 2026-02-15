---
name: hive-install
description: "Install or manage Plugin Hive blueprints"
allowed-tools: mcp__hive__hive_blueprint_list, mcp__hive__hive_blueprint_install, mcp__hive__hive_blueprint_uninstall
---

# /hive-install — Blueprint Installation

Install, uninstall, or browse blueprints. Shortcut for `/hive install`.

**Arguments:** `$ARGUMENTS`

## Behavior

### With arguments

The argument is a blueprint ID to install.

1. Call `mcp__hive__hive_blueprint_install` with the ID.
2. On success, report:
   - Blueprint name and version
   - Number of bees and flights
   - Suggest: "Run `/hive-swarm <id> <task>` to start a swarm."

### Without arguments

1. Call `mcp__hive__hive_blueprint_list`.
2. Display installed and available blueprints:

```
Installed Blueprints:
  - feature-dev v1 — Feature Development (4 bees, 5 flights)

Available Blueprints (not yet installed):
  - bug-fix v1 — Bug Fix (3 bees, 5 flights)
  - security-audit v1 — Security Audit (3 bees, 5 flights)
```

3. Prompt: "Which blueprint would you like to install?"

### Uninstall

If the first argument is `--uninstall` or `uninstall`, treat the second argument as the blueprint ID to uninstall.

1. Call `mcp__hive__hive_blueprint_uninstall` with the ID.
2. Confirm removal.

## Error handling

- If the blueprint ID is not found, show available blueprints and suggest the correct ID.
- If already installed, inform the user it's already installed.

## Important

- This skill only manages blueprints. It does NOT start swarms.
- Do NOT write code or edit files.
