---
name: hive
description: "Manage Plugin Hive swarms, blueprints, and bees"
allowed-tools: Read, Grep, Glob, mcp__hive__hive_blueprint_list, mcp__hive__hive_blueprint_install, mcp__hive__hive_blueprint_uninstall, mcp__hive__hive_blueprint_info, mcp__hive__hive_blueprint_scaffold, mcp__hive__hive_blueprint_validate, mcp__hive__hive_blueprint_dryrun, mcp__hive__hive_blueprint_install_remote, mcp__hive__hive_blueprint_export, mcp__hive__hive_blueprint_import, mcp__hive__hive_swarm_start, mcp__hive__hive_swarm_status, mcp__hive__hive_swarm_list, mcp__hive__hive_swarm_stop, mcp__hive__hive_swarm_resume, mcp__hive__hive_swarm_replay, mcp__hive__hive_swarm_analytics, mcp__hive__hive_swarm_usage, mcp__hive__hive_swarm_archive, mcp__hive__hive_swarm_report, mcp__hive__hive_flight_peek, mcp__hive__hive_flight_claim, mcp__hive__hive_flight_complete, mcp__hive__hive_flight_fail, mcp__hive__hive_flight_trace, mcp__hive__hive_flight_pulse, mcp__hive__hive_flight_progress, mcp__hive__hive_gate_approve, mcp__hive__hive_pollinate, mcp__hive__hive_cell_list, mcp__hive__hive_beekeeper_check, mcp__hive__hive_beekeeper_status, mcp__hive__hive_bee_stats, mcp__hive__hive_snapshot_create, mcp__hive__hive_snapshot_list, mcp__hive__hive_snapshot_restore, mcp__hive__hive_checkpoint_create, mcp__hive__hive_chain_status, mcp__hive__hive_chain_list, mcp__hive__hive_notification_config, mcp__hive__hive_notification_test, mcp__hive__hive_notification_history, mcp__hive__hive_notification_retry, mcp__hive__hive_observatory_start, mcp__hive__hive_observatory_stop, mcp__hive__hive_observatory_status, mcp__hive__hive_queue_status, mcp__hive__hive_storage_status, mcp__hive__hive_config, mcp__hive__hive_fleet_metrics, mcp__hive__hive_maintain
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
| `scaffold <id> [--global]` | Scaffold a new blueprint directory (see **scaffold**) |
| `validate <id>` | Validate a blueprint with semantic checks (see **validate**) |
| `dryrun <id> [vars...]` | Simulate pipeline execution (see **dryrun**) |
| `install-remote <url>` | Install blueprint from Git repo (see **install-remote**) |
| `chain <chain_id>` | View chain status (see **chain**) |
| `chains [--status=X]` | List all chains (see **chains**) |
| `snapshot <number\|id>` | Create a swarm snapshot (see **snapshot**) |
| `snapshots <number\|id>` | List snapshots for a swarm (see **snapshots**) |
| `restore <snapshot_id>` | Restore swarm to snapshot (see **restore**) |
| `trace <flight_id\|swarm_id>` | View flight/swarm execution traces (see **trace**) |
| `notify config [url] [--format=X]` | Get/set notification config (see **notify config**) |
| `notify test [url]` | Send test webhook (see **notify test**) |
| `notify history [--status=X]` | View webhook delivery history (see **notify history**) |
| `notify retry [delivery_id]` | Retry failed webhook deliveries (see **notify retry**) |
| `usage <number\|id>` | Show token usage for a swarm (see **usage**) |
| `bee-stats [bee_id]` | Show bee performance history (see **bee-stats**) |
| `progress <flight_id\|number>` | Show live flight progress pulses (see **progress**) |
| `drive [blueprint task\|number]` | Autonomously drive a swarm (suggest `/hive-drive`) |
| `observatory [start\|stop\|status]` | Manage the Observatory dashboard (see **observatory**) |
| `queue` | Show concurrency queue status (see **queue**) |
| `archive <number\|id>` | Archive a completed/failed swarm (see **archive**) |
| `report <number\|id> [--format=X]` | Generate a swarm report (see **report**) |
| `storage` | Show database storage status (see **storage**) |
| `config [key] [value]` | Get/set global configuration (see **config**) |
| `replay <number\|id> [--task="..."] [--priority=N] [--reset-nectar]` | Replay a completed/failed swarm (see **replay**) |
| `metrics [--period=30d]` | Show fleet-level aggregate metrics (see **metrics**) |
| `maintain [--dry-run]` | Run data maintenance cleanup (see **maintain**) |
| `export <blueprint_id> [output_dir]` | Export a blueprint as portable bundle (see **export**) |
| `import <path>` | Import a blueprint from a bundle file (see **import**) |

---

## Sub-commands

### Help (no arguments)

Display this command reference as a formatted table. Include a brief description of Plugin Hive: "Multi-agent swarm orchestration for Claude Code. Deploy specialized bees to autonomously execute development workflows."

### swarm

Start a new swarm from a blueprint.

1. The first arg after `swarm` is the blueprint ID. Remaining args are the task description.
2. If no blueprint ID given, call `mcp__hive__hive_blueprint_list` and ask the user to pick one.
3. If no task given, ask the user for a task description.
4. Parse optional flags: `--priority=N` (1-10, default 5), `--schedule-at=ISO8601` (delay start).
5. Call `mcp__hive__hive_swarm_start` with the blueprint_id, task, and optional priority/schedule_at.
6. If the swarm is scheduled (has schedule_at), report the scheduled start time instead of pollinating.
7. Otherwise, immediately call `mcp__hive__hive_pollinate` with the returned swarm_id to kick off the first work cycle.
8. Report the swarm number and any spawn requests returned by pollinate.
9. Suggest: "Use `/hive-drive` to run this swarm autonomously."

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

### scaffold

Scaffold a new blueprint directory.

1. The argument is the blueprint ID (lowercase, hyphens allowed).
2. If `--global` is passed, set location to "global"; otherwise use "project" (default).
3. Call `mcp__hive__hive_blueprint_scaffold` with the blueprint_id and location.
4. Report the created directory path and suggest editing the `blueprint.yml`.

### validate

Validate a blueprint with extended semantic checks.

1. The argument is the blueprint ID.
2. Call `mcp__hive__hive_blueprint_validate` with the blueprint_id.
3. Report validation result: valid/invalid and any issues found (nectar reachability, role consistency, trigger validity).

### dryrun

Simulate pipeline execution without spawning bees.

1. The argument is the blueprint ID. Additional `key=value` pairs are parsed as variables.
2. Call `mcp__hive__hive_blueprint_dryrun` with the blueprint_id and variables.
3. Display the flight order, mode (sequential/DAG), template resolution preview, and gated/conditional flight counts.

### install-remote

Install a blueprint from a Git repository URL.

1. The argument is the Git repo URL.
2. If `--subdir=X` is given, pass it as the subdirectory.
3. Call `mcp__hive__hive_blueprint_install_remote` with the url and optional subdirectory.
4. Report success and the installed blueprint ID.

### chain

View chain status with parent-child swarm relationships.

1. The argument is the chain ID.
2. Call `mcp__hive__hive_chain_status` with the chain_id.
3. Format as a tree showing: chain info, parent/child swarms with status.

### chains

List all chains with optional status filter.

1. Parse `--status=X` from args if present (active, completed, failed).
2. Call `mcp__hive__hive_chain_list` with the status filter.
3. Format as a table: `chain_id | root_swarm | status | created`.

### snapshot

Create a snapshot of a swarm's state.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_snapshot_create` with the resolved swarm ID.
4. Report the snapshot ID and type.

### snapshots

List snapshots for a swarm.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_snapshot_list` with the resolved swarm ID.
4. Format as a table: `snapshot_id | type | created_at`.

### restore

Restore a swarm to a snapshot state.

1. The argument is the snapshot ID.
2. Call `mcp__hive__hive_snapshot_restore` with the snapshot_id.
3. Report what was restored (flights, cells, nectar reset).

### trace

View execution traces for a flight or swarm.

1. If the argument looks like a flight UUID, call `mcp__hive__hive_flight_trace` with flight_id.
2. If the argument is a swarm number or ID, resolve the swarm ID first, then call `mcp__hive__hive_flight_trace` with swarm_id.
3. Format traces showing: timestamp, trace_type (claimed/output/error/retry), and data details.

### notify config

Get or set global notification configuration.

1. If a URL is given, call `mcp__hive__hive_notification_config` with url set.
2. If `--format=X` is given (standard/slack/discord), include the format.
3. If `--events=X,Y` is given, include the events array.
4. If no arguments, call `mcp__hive__hive_notification_config` with no params to show current config.

### notify test

Send a test webhook to verify the configuration.

1. If a URL is given, pass it to `mcp__hive__hive_notification_test`.
2. Otherwise, call without a URL (uses the configured global URL).
3. Report success/failure with HTTP status.

### notify history

View webhook delivery history.

1. Parse `--status=X` from args if present (pending/delivered/failed).
2. Call `mcp__hive__hive_notification_history` with the status filter.
3. Format as a table: `delivery_id | event_id | url | status | attempts | last_error`.

### notify retry

Retry failed webhook deliveries.

1. If a delivery_id is given, call `mcp__hive__hive_notification_retry` with it.
2. If no argument, call `mcp__hive__hive_notification_retry` without delivery_id to retry all failed.
3. Report how many were retried and how many succeeded.

### usage

Show token usage breakdown for a swarm.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_swarm_usage` with the resolved swarm ID.
4. Format results showing: total tokens (input/output), per-bee breakdown, per-flight breakdown, and estimated vs actual counts.

### bee-stats

Show bee performance history.

1. If a bee_id is given (e.g. `feature-dev_worker`), call `mcp__hive__hive_bee_stats` with `bee_id`.
2. If a blueprint_id is given (e.g. `feature-dev`), call `mcp__hive__hive_bee_stats` with `blueprint_id`.
3. If no argument, call `mcp__hive__hive_bee_stats` with no params to show all bee stats.
4. Format as a table: `bee_id | flights | success_rate | avg_duration | total_tokens`.

### progress

Show live flight progress pulses.

1. If the argument is a flight UUID, call `mcp__hive__hive_flight_progress` with `flight_id`.
2. If the argument is a swarm number or ID, resolve the swarm ID first, then call `mcp__hive__hive_flight_progress` with `swarm_id`.
3. Format results showing: active flights with their latest pulse step, progress bar, and message.

### observatory

Manage the Observatory dashboard web UI.

1. Parse the argument after `observatory` as the action: `start`, `stop`, or `status`.
2. If no action is given, call `mcp__hive__hive_observatory_status` to show current state.
3. Actions:
   - `start [port]` — Call `mcp__hive__hive_observatory_start` with optional port. Report the URL on success.
   - `stop` — Call `mcp__hive__hive_observatory_stop`. Confirm shutdown.
   - `status` — Call `mcp__hive__hive_observatory_status`. Report running state, PID, port, and URL.

### queue

Show concurrency queue status.

1. Call `mcp__hive__hive_queue_status`.
2. Format results showing: global utilization (active/max), per-blueprint breakdown, active flights per bee, and queued swarms waiting for a slot.

### archive

Archive a completed, failed, or cancelled swarm to compressed storage.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_swarm_archive` with the resolved swarm ID.
4. Report success: archive ID and message. Note that original data is deleted after archival.

### report

Generate a structured report for a swarm.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Parse `--format=X` from args if present (json, markdown, both). Default is "both".
4. Call `mcp__hive__hive_swarm_report` with the resolved swarm ID and format.
5. Display the report: summary stats, flight timeline, cell results, nectar data, and analytics.

### storage

Show database storage status.

1. Call `mcp__hive__hive_storage_status`.
2. Format results showing: DB file size, table row counts, oldest entries, retention settings, and archivable swarm count.

### config

Get or set global configuration.

1. If no arguments, call `mcp__hive__hive_config` with no params to show all config entries with descriptions.
2. If a key is given but no value, call `mcp__hive__hive_config` with just the key to show that entry.
3. If both key and value are given, call `mcp__hive__hive_config` with key and value to update it.
4. Valid keys: `max_concurrent_swarms`, `max_flights_per_bee`, `retention_days`, `auto_archive`, `default_priority`, `event_retention_days`, `trace_retention_days`, `check_retention_days`, `webhook_retention_days`, `auto_maintain`.

### replay

Replay a completed, failed, or cancelled swarm.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Parse optional flags: `--task="..."` (override task), `--priority=N` (override priority), `--reset-nectar` (start with clean nectar).
4. Call `mcp__hive__hive_swarm_replay` with the resolved swarm ID and any overrides.
5. Report the new swarm number and the link to the original swarm.
6. Suggest running `/hive-drive` on the new swarm.

### metrics

Show fleet-level aggregate metrics.

1. Parse `--period=X` from args if present (7d, 30d, 90d, all). Default is "30d".
2. Call `mcp__hive__hive_fleet_metrics` with the period.
3. Format results showing: total swarms, success rate, daily trend summary, per-blueprint breakdown, and top bees.

### maintain

Run data maintenance to clean up old ephemeral data.

1. If `--dry-run` is given, pass dry_run=true.
2. Call `mcp__hive__hive_maintain` with the dry_run flag.
3. Report per-table deletion counts (events, traces, checks, webhooks, pulses) and total.

### export

Export an installed blueprint as a portable JSON bundle.

1. The first argument is the blueprint ID.
2. The second argument (optional) is the output directory.
3. Call `mcp__hive__hive_blueprint_export` with blueprint_id and optional output_dir.
4. Report the output file path and number of files included.

### import

Import a blueprint from a .hive-blueprint.json bundle file.

1. The argument is the file path.
2. Call `mcp__hive__hive_blueprint_import` with the path.
3. Report success with the imported blueprint ID.

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
