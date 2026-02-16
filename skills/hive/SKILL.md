---
name: hive
description: "Manage Plugin Hive swarms, blueprints, and bees"
allowed-tools: Read, Grep, Glob, mcp__hive__hive_blueprint_list, mcp__hive__hive_blueprint_install, mcp__hive__hive_blueprint_uninstall, mcp__hive__hive_blueprint_info, mcp__hive__hive_swarm_start, mcp__hive__hive_swarm_status, mcp__hive__hive_swarm_list, mcp__hive__hive_swarm_stop, mcp__hive__hive_swarm_resume, mcp__hive__hive_swarm_analytics, mcp__hive__hive_flight_peek, mcp__hive__hive_flight_claim, mcp__hive__hive_flight_complete, mcp__hive__hive_flight_fail, mcp__hive__hive_gate_approve, mcp__hive__hive_pollinate, mcp__hive__hive_cell_list, mcp__hive__hive_beekeeper_check, mcp__hive__hive_beekeeper_status, mcp__hive__hive_observatory_start, mcp__hive__hive_observatory_stop, mcp__hive__hive_observatory_status
---

# /hive — Plugin Hive Management

You are the Plugin Hive coordinator. Route the user's request to the appropriate sub-command below.

**Arguments:** `$ARGUMENTS`

## Routing

Parse the first word of `$ARGUMENTS` as the sub-command. If no arguments are given, show the **Help** section.

| Sub-command | Action |
|---|---|
| `swarm <blueprint> <task...>` | Start a new swarm (see **swarm**) |
| `status [query]` | Check swarm status (see **status**) |
| `list [--status=X]` | List swarms (see **list**) |
| `stop <number\|id>` | Stop a swarm (see **stop**) |
| `resume <number\|id>` | Resume a failed swarm (see **resume**) |
| `blueprints` | List available blueprints (see **blueprints**) |
| `install <id>` | Install a blueprint (see **install**) |
| `uninstall <id>` | Uninstall a blueprint (see **uninstall**) |
| `beekeeper` | Run a health check (see **beekeeper**) |
| `cells <number\|id>` | List cells for a swarm (see **cells**) |
| `pollinate [swarm_id]` | Trigger a pollination cycle (see **pollinate**) |
| `approve <flight_id>` | Approve a gated flight (see **approve**) |
| `analytics <number\|id>` | Show swarm performance analytics (see **analytics**) |
| `info <blueprint_id>` | Show blueprint info including input schema (see **info**) |
| `drive [blueprint task\|number]` | Autonomously drive a swarm (suggest `/hive-drive`) |
| `observatory [start\|stop\|status]` | Manage the Observatory dashboard (see **observatory**) |

---

## Sub-commands

### Help (no arguments)

Display this command reference as a formatted table. Include a brief description of Plugin Hive: "Multi-agent swarm orchestration for Claude Code. Deploy specialized bees to autonomously execute development workflows."

### swarm

Start a new swarm from a blueprint.

1. The first arg after `swarm` is the blueprint ID. Remaining args are the task description.
2. If no blueprint ID given, call `mcp__hive__hive_blueprint_list` and ask the user to pick one.
3. If no task given, ask the user for a task description.
4. Call `mcp__hive__hive_swarm_start` with the blueprint_id and task.
5. Immediately call `mcp__hive__hive_pollinate` with the returned swarm_id to kick off the first work cycle.
6. Report the swarm number and any spawn requests returned by pollinate.
7. Suggest: "Use `/hive-drive` to run this swarm autonomously."

### status

Check the status of a swarm.

1. If an argument is given, call `mcp__hive__hive_swarm_status` with it as the query.
2. Also call `mcp__hive__hive_cell_list` with the resolved swarm ID to show cell progress.
3. If no argument is given, call `mcp__hive__hive_swarm_list` to show all swarms.
4. Format as a readable status report showing: swarm info, current flight pipeline position, and cell completion progress.

### list

List swarms with optional filters.

1. Parse `--status=X` from args if present.
2. Call `mcp__hive__hive_swarm_list` with the status filter.
3. Format as a table: `#number | blueprint | task (truncated) | status | created`.

### stop

Stop a running swarm.

1. The argument can be a swarm number (e.g. `1`, `3`) or a swarm ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_swarm_stop` with the resolved swarm ID.
4. Confirm cancellation to the user.

### resume

Resume a failed or paused swarm.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_swarm_resume` with the resolved swarm ID.
4. Optionally call `mcp__hive__hive_pollinate` with the swarm ID to immediately kick off work.
5. Report how many flights and cells were reset.

### blueprints

List available and installed blueprints.

1. Call `mcp__hive__hive_blueprint_list`.
2. Format results showing installed vs. available, with name, description, bee count, and flight count.

### install

Install a blueprint.

1. If an ID is given, call `mcp__hive__hive_blueprint_install` with it.
2. If no ID given, call `mcp__hive__hive_blueprint_list` and prompt the user to choose.

### uninstall

Uninstall a blueprint.

1. Call `mcp__hive__hive_blueprint_uninstall` with the given ID.
2. Confirm removal to the user.

### beekeeper

Run a health check on the hive.

1. Call `mcp__hive__hive_beekeeper_check`.
2. Also call `mcp__hive__hive_beekeeper_status` to show recent check history.
3. Report findings: stuck flights, stalled swarms, and actions taken.

### cells

List cells for a swarm.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_cell_list` with the resolved swarm ID.
4. Format as a table: `index | cell_id | title | status | retries`.

### pollinate

Trigger a pollination cycle.

1. If a swarm_id is given, call `mcp__hive__hive_pollinate` with it.
2. If no argument, call `mcp__hive__hive_pollinate` without a swarm_id (polls all swarms).
3. Report spawn requests: which bees need to be spawned and for which flights.

### approve

Approve a gated flight to unblock the swarm pipeline.

1. The argument is the flight UUID.
2. If no argument, call `mcp__hive__hive_swarm_list` with status=blocked to find blocked swarms, then show their gated flights.
3. Call `mcp__hive__hive_gate_approve` with the flight_id.
4. Report the result and updated swarm status.

### analytics

Show performance analytics for a swarm.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_swarm_analytics` with the resolved swarm ID.
4. Format the results showing: flight durations, bottleneck, cell durations, bee utilization, and parallelism ratio.

### info

Show detailed blueprint information including input schema.

1. Call `mcp__hive__hive_blueprint_info` with the given blueprint ID.
2. Format results showing: bees, flights, required/optional inputs, and beekeeper thresholds.

### observatory

Manage the Observatory dashboard web UI.

1. Parse the argument after `observatory` as the action: `start`, `stop`, or `status`.
2. If no action is given, call `mcp__hive__hive_observatory_status` to show current state.
3. Actions:
   - `start [port]` — Call `mcp__hive__hive_observatory_start` with optional port. Report the URL on success.
   - `stop` — Call `mcp__hive__hive_observatory_stop`. Confirm shutdown.
   - `status` — Call `mcp__hive__hive_observatory_status`. Report running state, PID, port, and URL.

---

## Formatting Guidelines

- Use tables for list output.
- Truncate task descriptions to ~60 chars in list views.
- Show swarm numbers as `#N` for readability.
- Use status indicators: buzzing, completed, failed, cancelled, paused, blocked.
- When showing cell progress, include a completion ratio (e.g. `3/7 cells done`).

## Important

- This is a **management interface**. Do NOT write code, edit files, or run bash commands.
- All actions go through the MCP tools listed above.
- When a swarm is started, always pollinate immediately to begin the first work cycle.
- For `stop` and `resume`, always resolve swarm numbers to IDs before calling the action tool.
