# Plugin Hive

Multi-agent swarm orchestration for Claude Code. Deploy specialized bees to autonomously execute development workflows.

## Quick Start

```
/hive install feature-dev          # Install a blueprint
/hive-swarm feature-dev Add auth   # Start a swarm
/hive-status 1                     # Check swarm #1
/hive beekeeper                    # Health check
```

## Commands

| Command | Description |
|---|---|
| `/hive` | Show all sub-commands |
| `/hive swarm <bp> <task>` | Start a swarm from a blueprint |
| `/hive status [query]` | Check swarm status (number, ID, or task search) |
| `/hive list [--status=X]` | List all swarms |
| `/hive stop <N>` | Cancel swarm #N |
| `/hive resume <N>` | Resume a failed swarm |
| `/hive blueprints` | List available blueprints |
| `/hive install <id>` | Install a blueprint |
| `/hive uninstall <id>` | Uninstall a blueprint |
| `/hive info <id>` | Show blueprint info including input schema |
| `/hive approve <flight_id>` | Approve a gated flight |
| `/hive analytics <N>` | Show swarm performance analytics |
| `/hive beekeeper` | Run health check (resets stuck flights) |
| `/hive cells <N>` | List cells for swarm #N |
| `/hive pollinate` | Trigger pollination cycle |
| `/hive scaffold <id>` | Scaffold a new blueprint directory |
| `/hive validate <id>` | Validate a blueprint with semantic checks |
| `/hive dryrun <id>` | Simulate pipeline execution |
| `/hive install-remote <url>` | Install blueprint from a Git repo |
| `/hive chain <chain_id>` | View chain status (parent-child swarms) |
| `/hive chains` | List all chains |
| `/hive snapshot <N>` | Create a swarm state snapshot |
| `/hive restore <snapshot_id>` | Restore swarm to a snapshot |
| `/hive trace <flight_id>` | View flight execution traces |
| `/hive notify config` | Get/set webhook notification config |
| `/hive notify test` | Send test webhook |
| `/hive notify history` | View webhook delivery history |
| `/hive notify retry` | Retry failed webhook deliveries |
| `/hive usage <N>` | Show token usage for swarm #N |
| `/hive bee-stats [bee_id]` | Show bee performance history |
| `/hive progress <flight_id\|N>` | Show live flight progress pulses |
| `/hive queue` | Show concurrency queue status |
| `/hive archive <N>` | Archive a completed/failed swarm |
| `/hive report <N>` | Generate structured swarm report |
| `/hive storage` | Show database storage status |
| `/hive config [key] [value]` | Get/set global configuration |
| `/hive replay <N>` | Re-run a completed/failed swarm |
| `/hive metrics [--period=30d]` | Show fleet-level aggregate metrics |
| `/hive maintain [--dry-run]` | Run data maintenance cleanup |
| `/hive export <id> [dir]` | Export blueprint as portable bundle |
| `/hive import <path>` | Import blueprint from bundle file |
| `/hive estimate <id>` | Predict swarm cost/duration before starting |
| `/hive gates` | List pending gated flights with policies |
| `/hive tune <id> [--apply]` | Analyze and tune bee parameters |
| `/hive nectar set <N> <key> <value>` | Manually set a nectar key |
| `/hive nectar get <N> [key]` | Get nectar values from a swarm |
| `/hive history <id>` | View blueprint version history |
| `/hive diff <id> [from] [to]` | Diff blueprint versions |
| `/hive budget <N> [amount]` | View/set token budget for swarm #N |
| `/hive cache [clear]` | View cache stats or clear cache |
| `/hive compare <N> <M>` | Compare two swarm runs side-by-side |
| `/hive inject <N> <after> <bee> <input>` | Inject a flight into a running pipeline |
| `/hive skip <flight_id> [reason]` | Skip a pending/waiting flight |
| `/hive template save <name> <bp>` | Save a swarm template |
| `/hive template list` | List saved templates |
| `/hive template run <name> <task>` | Start swarm from a saved template |
| `/hive dag <N>` | Show DAG visualization for swarm #N |
| `/hive subswarm <flight_id>` | Check sub-swarm status for a flight |
| `/hive routing [flight_id]` | View model routing history |
| `/hive anomalies [--severity=X]` | List anomaly alerts |
| `/hive anomaly ack <alert_id>` | Acknowledge an anomaly alert |
| `/hive baselines [blueprint_id]` | View performance baselines |
| `/hive stream status` | Check SSE stream status |
| `/hive nectar shares <N>` | List nectar shares for swarm #N |
| `/hive nectar resolve <N>` | Resolve a nectar reference |
| `/hive registry search <query>` | Search the blueprint registry |
| `/hive registry install <id>` | Install a blueprint from the registry |
| `/hive rate <id> <1-5> [comment]` | Rate a blueprint |
| `/hive channel create <name> <type>` | Create a notification channel |
| `/hive channel list` | List notification channels |
| `/hive channel delete <id>` | Delete a notification channel |
| `/hive route create <channel> <pattern>` | Create a notification route |
| `/hive route list` | List notification routes |
| `/hive route delete <id>` | Delete a notification route |
| `/hive webhook token create <name>` | Create an inbound webhook token |
| `/hive webhook token list` | List webhook tokens |
| `/hive webhook token revoke <id>` | Revoke a webhook token |
| `/hive webhook audit` | View webhook audit log |
| `/hive-drive <bp> <task>` | Autonomously drive a swarm start-to-finish |
| `/hive-drive <N>` | Resume driving an existing buzzing swarm |

**Shortcuts:** `/hive-swarm`, `/hive-status`, `/hive-install`, `/hive-drive`

## Bundled Blueprints

| ID | Name | Description |
|---|---|---|
| `feature-dev` | Feature Development | Decomposes features into cells, implements, tests, and verifies |
| `bug-fix` | Bug Fix | Investigates root cause, applies fix, reviews, and validates |
| `security-audit` | Security Audit | Maps attack surface, scans for vulns, remediates, and reports |

## Vocabulary

| Term | Meaning |
|---|---|
| **Swarm** | A running instance of a blueprint executing a task |
| **Blueprint** | A workflow template defining bees and flights |
| **Bee** | A specialized subagent (queen, worker, inspector, etc.) |
| **Flight** | A unit of work assigned to a bee in the pipeline |
| **Cell** | A decomposed sub-task within a loop flight |
| **Nectar** | Key-value data produced by flights, consumed by later flights |
| **Gate** | A pause point requiring human approval before proceeding |
| **Pollinate** | Check for ready work and generate spawn requests |
| **Beekeeper** | Health monitor that detects stuck flights and stalled swarms |
| **Chain** | A linked sequence of swarms triggered by completion/failure events |
| **Trigger** | A blueprint rule that spawns a new swarm on swarm completion/failure |
| **Snapshot** | A point-in-time export of full swarm state (flights, cells, nectar) |
| **Trace** | A structured execution log entry for flight lifecycle events |
| **Checkpoint** | An automatic snapshot created at configurable intervals |
| **Pulse** | An incremental progress report from a bee during flight execution |
| **Honey Ledger** | Token usage records for flights and swarms |
| **Queue** | Concurrency waiting area for swarms when limits are reached |
| **Archive** | Compressed storage for completed swarms after retention |
| **Contract** | Nectar I/O declaration on flights (produces/requires keys) |
| **Replay** | Re-running a completed/failed swarm with same or overridden parameters |
| **Maintenance** | Automated cleanup of old events, traces, checks, and webhook data |
| **Fleet Metrics** | Aggregate statistics across all swarms over a time window |
| **Blueprint Bundle** | Portable JSON package for sharing blueprints (`.hive-blueprint.json`) |
| **Estimation** | Pre-flight cost/duration prediction using historical bee_stats data |
| **Gate Policy** | Extended gate config with auto-approve conditions and timeouts |
| **Adaptive Tuning** | Automated analysis of bee performance with parameter recommendations |
| **Nectar Injection** | Manual override of nectar values for debugging and intervention |
| **Blueprint Version** | Tracked installation history with structural diffs between versions |
| **Budget** | Token consumption limit per swarm with configurable action (warn/pause/cancel) |
| **Flight Cache** | Content-addressable memoization of flight outputs keyed on input hash |
| **Swarm Comparison** | Side-by-side analysis of two swarm runs (flights, nectar, timing, tokens) |
| **Dynamic Pipeline** | Runtime modification of live pipelines (inject/skip flights) |
| **Swarm Template** | Named reusable swarm configuration (blueprint, variables, priority) |
| **Sub-swarm** | A child swarm launched by a parent flight for blueprint composition |
| **Failover** | Alternative bee/model chain applied on flight retry failure |
| **Model Routing** | Rule-based model selection per bee (fast/balanced/quality tiers) |
| **Anomaly Detection** | Statistical deviation alerting based on flight performance baselines |
| **Baseline** | Historical mean/stddev for a (blueprint, flight, metric) triple |
| **DAG View** | Dependency graph visualization of a swarm's flight pipeline |
| **Event Stream** | Real-time SSE feed of hive events with optional filters |
| **Nectar Ref** | Cross-swarm nectar import declaration on a flight |
| **Registry** | Remote index of community blueprints with local caching |
| **Notification Channel** | Named delivery target (webhook, Slack, Discord, PagerDuty) |
| **Notification Route** | Glob-pattern rule mapping events to channels |
| **Inbound Webhook** | Authenticated HTTP endpoint for external system integration |
| **Webhook Token** | Bearer token with scoped permissions for inbound webhooks |

## Architecture

- **MCP Server** provides 92 tools (`hive_*`) for swarm orchestration
- **SQLite DB** at `~/.plugin-hive/hive.db` stores all state (includes `hive_config`, `swarm_archives`, `blueprint_versions`, `flight_cache`, `swarm_templates`, `model_routing_log`, `flight_baselines`, `anomaly_alerts`, `nectar_shares`, `registry_cache`, `blueprint_ratings`, `notification_channels`, `notification_routes`, `webhook_tokens`, and `webhook_audit_log` tables)
- **Flight pipeline** advances automatically as bees complete work
- **Conditional flights** (`when:`) skip flights based on nectar values
- **Flight gates** (`gate: approval`) pause for human confirmation
- **Loop flights** iterate over cells (e.g., implementing each sub-task)
- **Retry backoff** supports immediate, linear, and exponential strategies
- **Pollinator** matches pending flights to bees and builds spawn requests
- **Input schema** validates required/optional variables at swarm start
- **Swarm chaining** triggers new swarms on completion/failure via blueprint triggers
- **Webhook notifications** deliver events to external URLs with retry and backoff
- **Flight traces** record structured lifecycle events for debugging
- **Snapshots** export and restore full swarm state for recovery
- **Blueprint ecosystem** supports scaffolding, validation, dry-run, and remote install
- **Flight pulses** report live progress from bees during execution
- **Token accounting** tracks resource usage per flight and swarm
- **Blueprint inheritance** (`extends:`) creates lightweight overlays on existing blueprints
- **Swarm scheduling** delays start and **priorities** order the claim queue
- **Bee stats** track lifetime performance per bee for quality monitoring
- **Concurrency control** limits simultaneous swarms (global and per-blueprint); excess swarms are queued
- **Nectar contracts** (`produces`/`requires`) declare flight I/O keys; validated at install and completion
- **Swarm archival** compresses completed swarm data to `swarm_archives` and deletes originals
- **Swarm reporting** generates structured JSON + markdown reports with analytics
- **Global configuration** (`hive_config` table) stores limits, retention, and defaults
- **Swarm replay** re-runs completed/failed swarms with optional overrides; links via `replayed_from`
- **Fleet metrics** aggregates success rates, durations, trends, and top bees across time windows
- **Data maintenance** cleans old events, traces, checks, webhooks, and orphaned pulses; respects retention config
- **Blueprint export/import** packages blueprints as portable `.hive-blueprint.json` bundles with base64 files
- **Swarm estimation** predicts cost/duration using historical bee_stats; supports DAG critical-path analysis
- **Gate policies** extend gates with auto-approve conditions (`auto_approve_when`) and timeouts (`timeout_minutes`)
- **Adaptive tuning** analyzes bee performance and recommends timeout/retry adjustments; optional apply mode
- **Nectar injection** allows manual set/override of nectar keys for debugging and intervention
- **Blueprint versioning** tracks install history in `blueprint_versions` table with structural diffs
- **Token budgets** enforce per-swarm consumption limits with configurable actions (warn/pause/cancel)
- **Flight caching** memoizes flight outputs by input hash; cache hits skip bee spawning entirely
- **Swarm comparison** produces side-by-side analysis of two runs (flights, nectar, timing, tokens)
- **Dynamic pipelines** allow runtime injection of new flights and manual skipping of pending flights
- **Swarm templates** save named configurations for recurring tasks with variable/priority overrides
- **DAG visualization** computes dependency graphs with critical path and parallelism ratio
- **Flight failover** provides alternative bee/model chains applied automatically on retry
- **Model routing** selects models per-flight based on configurable rules and tier mapping (fast/balanced/quality)
- **Anomaly detection** computes statistical baselines and alerts on sigma deviations (warning/critical)
- **Sub-swarms** compose blueprints by launching child swarms from parent flights with nectar mapping
- **Event streaming** (SSE) broadcasts real-time events to connected clients with optional filters
- **Cross-swarm nectar** shares data between swarms via `nectar_refs` declarations on flights
- **Blueprint registry** syncs community blueprints from remote JSON indexes with local caching and ratings
- **Notification channels v2** routes events to webhook, Slack, Discord, and PagerDuty via glob-pattern rules
- **Inbound webhooks** provide authenticated HTTP endpoints for external systems to start swarms, approve gates, set nectar, and stop swarms

## Workflow

1. Install a blueprint (`/hive install feature-dev`)
2. Start a swarm with a task (`/hive swarm feature-dev Build user dashboard`)
3. The queen bee decomposes the task into cells
4. Worker bees implement each cell in parallel
5. Inspector bees verify each cell meets acceptance criteria
6. Gated flights pause for user approval (e.g., PR creation)
7. The pipeline advances through all flights until completion
8. Check progress anytime (`/hive status 1`)
9. View analytics after completion (`/hive analytics 1`)

## Data

- Config/DB: `~/.plugin-hive/`
- Override with `HIVE_DATA_DIR` env var
- Bundled blueprints ship with the plugin in `blueprints/`
