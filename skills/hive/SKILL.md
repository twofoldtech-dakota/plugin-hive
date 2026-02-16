---
name: hive
description: "Manage Plugin Hive swarms, blueprints, and bees"
allowed-tools: Read, Grep, Glob, mcp__hive__hive_blueprint_list, mcp__hive__hive_blueprint_install, mcp__hive__hive_blueprint_uninstall, mcp__hive__hive_blueprint_info, mcp__hive__hive_blueprint_scaffold, mcp__hive__hive_blueprint_validate, mcp__hive__hive_blueprint_dryrun, mcp__hive__hive_blueprint_install_remote, mcp__hive__hive_blueprint_export, mcp__hive__hive_blueprint_import, mcp__hive__hive_blueprint_history, mcp__hive__hive_blueprint_diff, mcp__hive__hive_swarm_start, mcp__hive__hive_swarm_status, mcp__hive__hive_swarm_list, mcp__hive__hive_swarm_stop, mcp__hive__hive_swarm_resume, mcp__hive__hive_swarm_replay, mcp__hive__hive_swarm_analytics, mcp__hive__hive_swarm_usage, mcp__hive__hive_swarm_archive, mcp__hive__hive_swarm_report, mcp__hive__hive_swarm_estimate, mcp__hive__hive_swarm_compare, mcp__hive__hive_swarm_dag, mcp__hive__hive_flight_peek, mcp__hive__hive_flight_claim, mcp__hive__hive_flight_complete, mcp__hive__hive_flight_fail, mcp__hive__hive_flight_trace, mcp__hive__hive_flight_pulse, mcp__hive__hive_flight_progress, mcp__hive__hive_flight_inject, mcp__hive__hive_flight_skip, mcp__hive__hive_gate_approve, mcp__hive__hive_gate_list, mcp__hive__hive_pollinate, mcp__hive__hive_cell_list, mcp__hive__hive_beekeeper_check, mcp__hive__hive_beekeeper_status, mcp__hive__hive_bee_stats, mcp__hive__hive_snapshot_create, mcp__hive__hive_snapshot_list, mcp__hive__hive_snapshot_restore, mcp__hive__hive_checkpoint_create, mcp__hive__hive_chain_status, mcp__hive__hive_chain_list, mcp__hive__hive_notification_config, mcp__hive__hive_notification_test, mcp__hive__hive_notification_history, mcp__hive__hive_notification_retry, mcp__hive__hive_observatory_start, mcp__hive__hive_observatory_stop, mcp__hive__hive_observatory_status, mcp__hive__hive_queue_status, mcp__hive__hive_storage_status, mcp__hive__hive_config, mcp__hive__hive_fleet_metrics, mcp__hive__hive_maintain, mcp__hive__hive_adaptive_tune, mcp__hive__hive_nectar_set, mcp__hive__hive_nectar_get, mcp__hive__hive_budget_set, mcp__hive__hive_budget_status, mcp__hive__hive_cache_status, mcp__hive__hive_cache_clear, mcp__hive__hive_template_save, mcp__hive__hive_template_list, mcp__hive__hive_template_run, mcp__hive__hive_subswarm_status, mcp__hive__hive_routing_history, mcp__hive__hive_anomaly_alerts, mcp__hive__hive_anomaly_acknowledge, mcp__hive__hive_anomaly_baselines, mcp__hive__hive_stream_status, mcp__hive__hive_nectar_shares, mcp__hive__hive_nectar_resolve, mcp__hive__hive_registry_search, mcp__hive__hive_registry_install, mcp__hive__hive_blueprint_rate, mcp__hive__hive_channel_create, mcp__hive__hive_channel_list, mcp__hive__hive_channel_delete, mcp__hive__hive_route_create, mcp__hive__hive_route_list, mcp__hive__hive_route_delete, mcp__hive__hive_webhook_token_create, mcp__hive__hive_webhook_token_list, mcp__hive__hive_webhook_token_revoke, mcp__hive__hive_webhook_audit
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
| `estimate <blueprint_id>` | Predict swarm cost/duration (see **estimate**) |
| `gates` | List pending gated flights (see **gates**) |
| `tune <blueprint_id> [--apply]` | Analyze and tune bee parameters (see **tune**) |
| `nectar set <N> <key> <value>` | Set a nectar key on a swarm (see **nectar set**) |
| `nectar get <N> [key]` | Get nectar values from a swarm (see **nectar get**) |
| `history <blueprint_id>` | View blueprint version history (see **history**) |
| `diff <blueprint_id> [from] [to]` | Diff blueprint versions (see **diff**) |
| `budget <number\|id> [amount]` | View/set token budget for a swarm (see **budget**) |
| `cache [clear]` | View cache stats or clear cache (see **cache**) |
| `compare <N> <M>` | Compare two swarm runs side-by-side (see **compare**) |
| `inject <N> <after_flight_id> <bee_id> <input>` | Inject a flight into a running pipeline (see **inject**) |
| `skip <flight_id> [reason]` | Skip a pending/waiting flight (see **skip**) |
| `template save <name> <blueprint_id>` | Save a swarm template (see **template save**) |
| `template list` | List saved templates (see **template list**) |
| `template run <name> <task>` | Start a swarm from a template (see **template run**) |
| `dag <number\|id>` | Show DAG visualization (see **dag**) |
| `subswarm <flight_id>` | Check sub-swarm status (see **subswarm**) |
| `routing [flight_id\|swarm_id\|bee_id]` | View model routing history (see **routing**) |
| `anomalies [--severity=X] [--status=X]` | List anomaly alerts (see **anomalies**) |
| `anomaly ack <alert_id>` | Acknowledge an anomaly (see **anomaly ack**) |
| `baselines [blueprint_id]` | View performance baselines (see **baselines**) |
| `stream status` | Check SSE stream status (see **stream status**) |
| `nectar shares <number\|id>` | List nectar shares (see **nectar shares**) |
| `nectar resolve <number\|id> <source> <keys>` | Resolve a nectar ref (see **nectar resolve**) |
| `registry search <query>` | Search blueprint registry (see **registry search**) |
| `registry install <id>` | Install from registry (see **registry install**) |
| `rate <blueprint_id> <1-5> [comment]` | Rate a blueprint (see **rate**) |
| `channel create <name> <type> <config>` | Create notification channel (see **channel create**) |
| `channel list` | List notification channels (see **channel list**) |
| `channel delete <id>` | Delete notification channel (see **channel delete**) |
| `route create <channel_id> <pattern>` | Create notification route (see **route create**) |
| `route list` | List notification routes (see **route list**) |
| `route delete <id>` | Delete notification route (see **route delete**) |
| `webhook token create <name> <perms>` | Create webhook token (see **webhook token create**) |
| `webhook token list` | List webhook tokens (see **webhook token list**) |
| `webhook token revoke <id>` | Revoke webhook token (see **webhook token revoke**) |
| `webhook audit [--limit=N]` | View webhook audit log (see **webhook audit**) |

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
4. Valid keys: `max_concurrent_swarms`, `max_flights_per_bee`, `retention_days`, `auto_archive`, `default_priority`, `event_retention_days`, `trace_retention_days`, `check_retention_days`, `webhook_retention_days`, `auto_maintain`, `adaptive_enabled`, `default_token_budget`, `default_budget_action`, `cache_enabled`, `cache_ttl_hours`, `anomaly_detection_enabled`, `anomaly_sigma_threshold`, `anomaly_critical_sigma`, `anomaly_min_samples`, `registry_url`, `registry_cache_hours`.

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

### estimate

Predict cost and duration for a swarm before starting it.

1. The argument is the blueprint ID.
2. Call `mcp__hive__hive_swarm_estimate` with the blueprint_id.
3. Display: total estimated duration, total tokens, confidence score, success rate, and per-flight breakdown.

### gates

List all pending gated flights with policy details and timeout countdowns.

1. Call `mcp__hive__hive_gate_list` with no params.
2. Format as a table: `flight_id | swarm_id | bee_id | policy | gated_at | timeout remaining`.

### tune

Analyze bee performance and recommend parameter adjustments.

1. The argument is the blueprint ID.
2. If `--apply` is given, set apply=true.
3. Call `mcp__hive__hive_adaptive_tune` with the blueprint_id and apply flag.
4. Display recommendations: parameter, current value, recommended value, reasoning, confidence.
5. If applied, confirm that the blueprint was updated and a new version was recorded.

### nectar set

Manually set or override a nectar key on a swarm.

1. The first argument is the swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. The second argument is the key, the third is the value.
4. Call `mcp__hive__hive_nectar_set` with swarm_id, key, and value.
5. Report the old value (if any) and the new epoch.

### nectar get

Get nectar values from a swarm.

1. The first argument is the swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. The second argument (optional) is a specific key.
4. Call `mcp__hive__hive_nectar_get` with swarm_id and optional key.
5. Display nectar as a key-value table.

### history

View blueprint version history.

1. The argument is the blueprint ID.
2. Call `mcp__hive__hive_blueprint_history` with the blueprint_id.
3. Format as a table: `version | changes_summary | installed_at`.

### diff

Show structural diff between two versions of a blueprint.

1. The first argument is the blueprint ID.
2. Optional second and third arguments are from_version and to_version numbers.
3. Call `mcp__hive__hive_blueprint_diff` with blueprint_id and optional version numbers.
4. Display: bees added/removed/changed, flights added/removed/changed, and other changes.

### budget

View or set token budget for a swarm.

1. The first argument is the swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. If a second argument (amount) is given, call `mcp__hive__hive_budget_set` with the resolved swarm ID and token_budget.
   - Parse optional `--action=X` flag (warn, pause, cancel). Default is "warn".
4. If no amount given, call `mcp__hive__hive_budget_status` with the resolved swarm ID.
5. Display: consumed tokens, remaining budget, utilization percentage, projection, and configured action.

### cache

View cache statistics or clear the cache.

1. If no arguments, call `mcp__hive__hive_cache_status`.
2. Display: enabled state, total entries, hit count, miss count, hit rate, and TTL.
3. If the argument is `clear`, call `mcp__hive__hive_cache_clear`.
   - Parse optional `--blueprint=X` and `--flight=X` flags to scope the clear.
4. Report how many entries were deleted and the scope.

### compare

Compare two swarm runs side-by-side.

1. The first argument is swarm A (number or ID). The second argument is swarm B (number or ID).
2. Call `mcp__hive__hive_swarm_compare` with both identifiers.
3. Display the markdown comparison report showing: swarm metadata, flight-by-flight status comparison, nectar diffs, duration differences, and token usage differences.

### inject

Inject a flight into a running pipeline.

1. The first argument is the swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. The second argument is the after_flight_id (the flight_id after which to insert).
4. The third argument is the bee_id.
5. Remaining arguments are the input text for the flight.
6. Parse optional `--expects=X` flag.
7. Call `mcp__hive__hive_flight_inject` with swarm_id, after_flight_id, bee_id, input, and optional expects.
8. Report the injected flight ID and its initial status.

### skip

Skip a pending or waiting flight.

1. The argument is the flight UUID.
2. Parse optional reason after the flight ID.
3. Call `mcp__hive__hive_flight_skip` with flight_id and optional reason.
4. Report the result and note that the pipeline will advance automatically.

### template save

Save a swarm configuration as a named template.

1. The first argument is the template name.
2. The second argument is the blueprint ID.
3. Parse optional flags: `--description="..."`, `--priority=N`, `--variables=key=val,key2=val2`.
4. Call `mcp__hive__hive_template_save` with name, blueprint_id, and optional description, priority, variables.
5. Report the saved template name and configuration.

### template list

List all saved swarm templates.

1. Call `mcp__hive__hive_template_list`.
2. Format as a table: `name | blueprint_id | description | priority | usage_count | created_at`.

### template run

Start a swarm from a saved template.

1. The first argument is the template name.
2. Remaining arguments are the task description.
3. Parse optional flags: `--priority=N`, `--variables=key=val,key2=val2`.
4. Call `mcp__hive__hive_template_run` with template_name, task, and optional priority/variable overrides.
5. Report the new swarm number and template used.
6. Immediately call `mcp__hive__hive_pollinate` with the returned swarm_id to kick off work.
7. Suggest: "Use `/hive-drive` to run this swarm autonomously."

### dag

Show DAG visualization for a swarm.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_swarm_dag` with the resolved swarm ID.
4. Display: nodes with status/level, edges, critical path, and parallelism ratio.

### subswarm

Check sub-swarm status for a flight.

1. The argument is the flight UUID.
2. Call `mcp__hive__hive_subswarm_status` with the flight_id.
3. Display: parent flight info, child swarm status, child flight progress, and nectar map.

### routing

View model routing decisions.

1. If a flight_id is given, call `mcp__hive__hive_routing_history` with flight_id.
2. If a swarm number/ID is given, resolve it then call with swarm_id.
3. If a bee_id is given, call with bee_id.
4. If no argument, call with no params to show recent routing history.
5. Format as a table: `flight_id | bee_id | tier | model | reason | timestamp`.

### anomalies

List anomaly alerts.

1. Parse `--severity=X` (warning, critical) and `--status=X` (open, acknowledged) from args.
2. Call `mcp__hive__hive_anomaly_alerts` with optional filters.
3. Format as a table: `alert_id | blueprint | flight | metric | sigma | severity | status`.

### anomaly ack

Acknowledge an anomaly alert.

1. The argument is the alert ID.
2. Call `mcp__hive__hive_anomaly_acknowledge` with the alert_id.
3. Confirm acknowledgment.

### baselines

View computed performance baselines.

1. If a blueprint_id is given, call `mcp__hive__hive_anomaly_baselines` with it.
2. If no argument, call with no params to show all baselines.
3. Format as a table: `blueprint | flight | metric | mean | stddev | samples`.

### stream status

Check SSE event stream status.

1. Call `mcp__hive__hive_stream_status`.
2. Report: connected clients and uptime.

### nectar shares

List nectar shares for a swarm.

1. The argument can be a swarm number or ID.
2. **Number resolution:** If the argument is a short number, call `mcp__hive__hive_swarm_status` with it first to resolve the full swarm ID.
3. Call `mcp__hive__hive_nectar_shares` with the resolved swarm ID.
4. Format as a table: `source_swarm | keys | resolved_at`.

### nectar resolve

Manually resolve a nectar reference.

1. The first argument is the swarm number or ID.
2. **Number resolution:** Resolve short numbers as usual.
3. The second argument is the source (swarm UUID, `latest:blueprint-id`, or `{{var}}`).
4. The third argument is a comma-separated list of keys.
5. Call `mcp__hive__hive_nectar_resolve` with swarm_id, source, and keys array.
6. Display the resolved key-value pairs.

### registry search

Search the blueprint registry.

1. The argument is the search query.
2. Parse optional `--url=X` for a specific registry URL.
3. Call `mcp__hive__hive_registry_search` with query and optional registry_url.
4. Format as a table: `blueprint_id | name | description | version | author`.

### registry install

Install a blueprint from the registry.

1. The argument is the blueprint ID.
2. Parse optional `--url=X` for a specific registry URL.
3. Call `mcp__hive__hive_registry_install` with blueprint_id and optional registry_url.
4. Report success and the installed blueprint ID.

### rate

Rate an installed blueprint.

1. The first argument is the blueprint ID.
2. The second argument is the rating (1-5).
3. Optional remaining text is the comment.
4. Call `mcp__hive__hive_blueprint_rate` with blueprint_id, rating, and optional comment.
5. Confirm the rating was recorded.

### channel create

Create a notification channel.

1. The first argument is the channel name.
2. The second argument is the type (webhook, slack, discord, pagerduty).
3. Remaining arguments are the config as JSON or key=value pairs.
4. Call `mcp__hive__hive_channel_create` with name, type, and config object.
5. Report the created channel ID.

### channel list

List notification channels.

1. Call `mcp__hive__hive_channel_list`.
2. Format as a table: `id | name | type | enabled | created_at`.

### channel delete

Delete a notification channel.

1. The argument is the channel ID.
2. Call `mcp__hive__hive_channel_delete` with channel_id.
3. Confirm deletion.

### route create

Create a notification route.

1. The first argument is the channel ID.
2. The second argument is the event pattern (glob, e.g. `swarm.*`, `flight.failed`).
3. Parse optional `--priority=N`.
4. Call `mcp__hive__hive_route_create` with channel_id, event_pattern, and optional priority.
5. Report the created route ID.

### route list

List notification routes.

1. Call `mcp__hive__hive_route_list`.
2. Format as a table: `id | channel | event_pattern | priority`.

### route delete

Delete a notification route.

1. The argument is the route ID.
2. Call `mcp__hive__hive_route_delete` with route_id.
3. Confirm deletion.

### webhook token create

Create an inbound webhook token.

1. The first argument is the token name.
2. The second argument is a comma-separated list of permissions (swarm:start, gate:approve, nectar:set, swarm:stop).
3. Parse optional `--expires=ISO8601` for expiry date.
4. Call `mcp__hive__hive_webhook_token_create` with name, permissions array, and optional expires_at.
5. **IMPORTANT:** Display the raw token to the user and warn that it cannot be shown again.

### webhook token list

List webhook tokens.

1. Call `mcp__hive__hive_webhook_token_list`.
2. Format as a table: `id | name | permissions | created_at | expires_at | revoked`.

### webhook token revoke

Revoke a webhook token.

1. The argument is the token ID.
2. Call `mcp__hive__hive_webhook_token_revoke` with token_id.
3. Confirm revocation.

### webhook audit

View inbound webhook audit log.

1. Parse optional `--limit=N` (default 20).
2. Call `mcp__hive__hive_webhook_audit` with limit.
3. Format as a table: `id | token_id | action | result | ip_address | timestamp`.

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
