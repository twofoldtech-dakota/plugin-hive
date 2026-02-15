---
name: hive-swarm
description: "Quick-start a Plugin Hive swarm"
allowed-tools: mcp__hive__hive_swarm_start, mcp__hive__hive_swarm_status, mcp__hive__hive_blueprint_list, mcp__hive__hive_pollinate
---

# /hive-swarm — Quick Start a Swarm

Launch a swarm in one command. Shortcut for `/hive swarm`.

**Arguments:** `$ARGUMENTS`

## Behavior

### With arguments

Parse `$ARGUMENTS` as: `<blueprint_id> <task description...>`

The first word is the blueprint ID. Everything after it is the task.

Examples:
- `/hive-swarm feature-dev Add dark mode toggle to settings page`
- `/hive-swarm bug-fix Login fails when email contains a plus sign`
- `/hive-swarm security-audit Scan the API routes for injection vulnerabilities`

**Steps:**

1. Call `mcp__hive__hive_swarm_start` with the parsed blueprint_id and task.
2. On success, immediately call `mcp__hive__hive_pollinate` with the new swarm_id to kick off the first work cycle.
3. Report to the user:
   - Swarm number and ID
   - Blueprint used
   - Task description
   - Spawn requests from pollinate (which bees are being dispatched)

### Without arguments

1. Call `mcp__hive__hive_blueprint_list` to show available blueprints.
2. Display blueprints in a readable format:
   - **feature-dev** — Feature Development: "Drop in a feature request. Get back a tested PR."
   - **bug-fix** — Bug Fix: "Report a bug. Get back a verified fix with tests."
   - **security-audit** — Security Audit: "Scan a codebase for vulnerabilities."
3. Prompt the user: "Which blueprint? And what's the task?"

### Error handling

- If the blueprint is not installed, suggest running `/hive install <id>` first.
- If `hive_swarm_start` fails, show the error and suggest checking blueprints with `/hive blueprints`.

## Output format

On successful swarm start:

```
Swarm #N started (blueprint: <id>)
Task: <task description>

Dispatching bees:
  - <bee_id>: <flight description>
  ...
```

## Important

- Always pollinate immediately after starting a swarm — this kicks off the first flight.
- Do NOT write code or edit files. This skill only starts swarms.
