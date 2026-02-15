# Plugin Hive

Multi-agent swarm orchestration for Claude Code. Deploy specialized bees to autonomously execute complex development workflows.

Plugin Hive turns Claude Code into a **hive mind** -- a coordinated colony of specialized AI agents (bees) that decompose, implement, verify, and ship features without manual intervention.

## Requirements

- Node.js 22+ (uses native `node:sqlite`)
- Claude Code CLI

## Installation

### From a Plugin Marketplace

```bash
/plugin install plugin-hive@<marketplace>
```

### Local Development

```bash
git clone https://github.com/dakotasmith/plugin-hive.git
cd plugin-hive
npm install
npm run build
claude --plugin-dir .
```

## Quick Start

```
/hive install feature-dev          # Install a blueprint
/hive swarm feature-dev Add auth   # Start a swarm
/hive status 1                     # Check swarm #1
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
| `/hive beekeeper` | Run health check (resets stuck flights) |
| `/hive cells <N>` | List cells for swarm #N |
| `/hive pollinate` | Trigger pollination cycle |

**Shortcuts:** `/hive-swarm`, `/hive-status`, `/hive-install`

## Bundled Blueprints

| ID | Description |
|---|---|
| `feature-dev` | Decomposes features into cells, implements, tests, and verifies |
| `bug-fix` | Investigates root cause, applies fix, reviews, and validates |
| `security-audit` | Maps attack surface, scans for vulns, remediates, and reports |

## How It Works

1. **Install a blueprint** -- blueprints define workflows as YAML files with bee roles and flight pipelines
2. **Start a swarm** -- the queen bee decomposes your task into cells (sub-tasks)
3. **Worker bees implement** -- each cell is claimed and implemented by a worker bee in its own session
4. **Inspector bees verify** -- optional verification flights review each cell against acceptance criteria
5. **Pipeline advances** -- flights execute in sequence, sharing data through nectar (key-value context)
6. **Swarm completes** -- when all flights finish, the swarm is marked complete

## Vocabulary

| Term | Meaning |
|---|---|
| **Swarm** | A running instance of a blueprint executing a task |
| **Blueprint** | A workflow template defining bees and flights |
| **Bee** | A specialized subagent (queen, worker, inspector) |
| **Flight** | A unit of work assigned to a bee in the pipeline |
| **Cell** | A decomposed sub-task within a loop flight |
| **Nectar** | Key-value data produced by flights, consumed by later flights |
| **Beekeeper** | Health monitor that detects stuck flights and stalled swarms |

## Architecture

- **MCP Server** provides 17+ tools (`hive_*`) for swarm orchestration
- **SQLite** (Node.js 22 native) stores all state at `~/.plugin-hive/hive.db`
- **Flight pipeline** advances automatically as bees complete work
- **Loop flights** iterate over cells with optional per-cell verification
- **Pollinator** matches pending flights to bees and builds spawn requests
- **Beekeeper** detects and remediates stuck flights, zombie swarms, and exhausted retries

## Creating Custom Blueprints

Blueprints are YAML files placed in `~/.plugin-hive/blueprints/<id>/blueprint.yml`:

```yaml
id: my-workflow
name: My Custom Workflow
version: 1
bees:
  - id: planner
    role: analysis
    chamber: { base_dir: planner, files: {} }
  - id: coder
    role: coding
    chamber: { base_dir: coder, files: {} }
flights:
  - id: plan
    bee: planner
    type: single
    input: "Analyze: {{task}}"
    expects: "CELLS_JSON: array"
    max_retries: 2
  - id: implement
    bee: coder
    type: loop
    loop: { over: cells, completion: all_done }
    input: "Implement: {{current_cell}}"
    expects: "STATUS: done"
    max_retries: 3
```

### Bee Roles

| Role | Capabilities |
|---|---|
| `analysis` | Read-only (Read, Grep, Glob, WebSearch) |
| `coding` | Full access (Read, Edit, Write, Bash) |
| `verification` | Read + Bash (no Edit/Write) |
| `testing` | Read + Bash (no Edit/Write) |
| `pr` | Full access (for git/PR operations) |
| `scanning` | Read + Bash (no Edit/Write) |

## Development

```bash
npm install          # Install dependencies
npm run build        # Build with tsup
npm test             # Run tests (202 tests across 18 files)
npm run test:watch   # Watch mode
npm run typecheck    # Type checking
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `HIVE_DATA_DIR` | `~/.plugin-hive` | Data directory for DB, logs, blueprints |
| `HIVE_PROJECT_DIR` | `$CLAUDE_PROJECT_DIR` or cwd | Project root for bee chambers |

## License

MIT
