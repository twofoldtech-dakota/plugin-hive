---
name: hive-status
description: "Check Plugin Hive swarm status"
allowed-tools: mcp__hive__hive_swarm_status, mcp__hive__hive_swarm_list, mcp__hive__hive_cell_list, mcp__hive__hive_beekeeper_status
---

# /hive-status — Swarm Status Check

Quick status check. Shortcut for `/hive status`.

**Arguments:** `$ARGUMENTS`

## Behavior

### With arguments (specific swarm)

The argument is a swarm number, ID, or task substring.

1. Call `mcp__hive__hive_swarm_status` with the argument as query.
2. Call `mcp__hive__hive_cell_list` with the resolved swarm ID.
3. Format a detailed status report:

```
Swarm #N — <status>
Blueprint: <blueprint_id>
Task: <task description>
Created: <timestamp>

Flight Pipeline:
  1. <flight_id> (<bee>) .......... <status>
  2. <flight_id> (<bee>) .......... <status>  <-- current
  3. <flight_id> (<bee>) .......... waiting

Cells: 3/7 done
  [done]    auth-middleware — Add JWT validation middleware
  [done]    user-model — Create user database model
  [done]    login-endpoint — Implement /api/login
  [active]  session-store — Redis session storage
  [pending] logout-endpoint — Implement /api/logout
  [pending] password-reset — Password reset flow
  [pending] rate-limiting — Add rate limiting to auth routes
```

### Without arguments (overview)

1. Call `mcp__hive__hive_swarm_list` to get all swarms.
2. Format as an overview table:

```
Plugin Hive — Swarm Overview

#  | Blueprint      | Task                              | Status    | Created
---|----------------|-----------------------------------|-----------|--------
1  | feature-dev    | Add dark mode toggle to sett...   | buzzing   | 2h ago
2  | bug-fix        | Login fails when email conta...   | completed | 1d ago
3  | security-audit | Scan API routes for injectio...   | failed    | 3d ago
```

3. If there are active (buzzing) swarms, also call `mcp__hive__hive_beekeeper_status` to show the last health check summary.

## Formatting

- Show relative timestamps when possible (e.g. "2h ago", "1d ago").
- Truncate task descriptions to ~40 chars in table views.
- Use status labels: buzzing, completed, failed, cancelled, paused, blocked.
- For cell status, use bracket indicators: `[done]`, `[active]`, `[pending]`, `[failed]`, `[verifying]`.
- Show cell completion as a ratio (e.g. `3/7 done`).

## Important

- This is a read-only status check. Do NOT modify anything.
- Do NOT write code or edit files.
