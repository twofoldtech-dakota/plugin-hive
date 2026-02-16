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

## Architecture

- **MCP Server** provides 20 tools (`hive_*`) for swarm orchestration
- **SQLite DB** at `~/.plugin-hive/hive.db` stores all state
- **Flight pipeline** advances automatically as bees complete work
- **Conditional flights** (`when:`) skip flights based on nectar values
- **Flight gates** (`gate: approval`) pause for human confirmation
- **Loop flights** iterate over cells (e.g., implementing each sub-task)
- **Retry backoff** supports immediate, linear, and exponential strategies
- **Pollinator** matches pending flights to bees and builds spawn requests
- **Input schema** validates required/optional variables at swarm start

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
