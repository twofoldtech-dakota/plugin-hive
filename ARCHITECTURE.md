# Plugin Hive -- Architecture Plan

> A Claude Code plugin that brings multi-agent workflow orchestration to Claude Code, themed around a bee colony. Inspired by [snarktank/antfarm](https://github.com/snarktank/antfarm).

---

## Table of Contents

1. [Vision & Theme](#1-vision--theme)
2. [Concept Mapping: Antfarm to Hive](#2-concept-mapping-antfarm-to-hive)
3. [Plugin Structure](#3-plugin-structure)
4. [Core Components](#4-core-components)
5. [Workflow System](#5-workflow-system)
6. [Agent (Bee) System](#6-agent-bee-system)
7. [Execution Engine](#7-execution-engine)
8. [State Management](#8-state-management)
9. [MCP Server](#9-mcp-server)
10. [Skills](#10-skills)
11. [Hooks](#11-hooks)
12. [Subagents](#12-subagents)
13. [Dashboard](#13-dashboard)
14. [Health Monitor (Beekeeper)](#14-health-monitor-beekeeper)
15. [CLI Surface](#15-cli-surface)
16. [Configuration & YAML Schema](#16-configuration--yaml-schema)
17. [Installation & Distribution](#17-installation--distribution)
18. [Implementation Phases](#18-implementation-phases)
19. [Key Architectural Decisions](#19-key-architectural-decisions)

---

## 1. Vision & Theme

Plugin Hive turns Claude Code into a **hive mind** -- a coordinated colony of specialized AI agents (bees) that autonomously execute complex multi-step workflows. Instead of one Claude session juggling everything, work is decomposed into discrete tasks and distributed across specialized bees, each operating in isolated context with fresh sessions.

### Theme Vocabulary

| Concept | Hive Term | Description |
|---------|-----------|-------------|
| The system | **The Hive** | The entire orchestration framework |
| A workflow definition | **Blueprint** | YAML file defining a workflow's structure |
| A running workflow | **Swarm** | An active instance of a blueprint being executed |
| An AI agent | **Bee** | A specialized worker with a defined role |
| The planning agent | **Queen** | Decomposes high-level tasks into cells |
| A workflow step | **Flight** | A single unit of work assigned to a bee |
| A sub-task (story) | **Cell** | A discrete piece of work within a honeycomb |
| The task board | **Honeycomb** | The structured collection of cells to complete |
| Shared context | **Nectar** | Data passed between flights via the shared context |
| The health monitor | **Beekeeper** | Watchdog that monitors hive health |
| The dashboard | **Observatory** | Web UI for monitoring swarm progress |
| A completed output | **Honey** | The final deliverable from a swarm |
| Agent workspace | **Chamber** | An isolated directory where a bee operates |
| Cron polling | **Waggle Dance** | The polling rhythm bees use to check for work |

---

## 2. Concept Mapping: Antfarm to Hive

| Antfarm | Plugin Hive | Notes |
|---------|-------------|-------|
| `antfarm` CLI | `/hive` skill + MCP tools | Native Claude Code integration, no separate CLI binary |
| `workflow.yml` | `blueprint.yml` | Same YAML structure, hive-themed field names |
| `antfarm install` | `/hive install` | Skill command |
| `antfarm workflow run` | `/hive swarm` or MCP `hive_swarm_start` | Trigger a new swarm |
| `antfarm step peek/claim/complete` | MCP tools `hive_flight_*` | Exposed as MCP server tools |
| Agent IDENTITY.md/SOUL.md | Bee IDENTITY.md/NATURE.md | "NATURE" replaces "SOUL" for the bee metaphor |
| `openclaw` gateway | Claude Code subagents | Native subagent spawning replaces external gateway |
| SQLite `antfarm.db` | SQLite `hive.db` | Same approach, Node 22 native sqlite |
| Agent cron jobs | Hooks + native polling | Use Claude Code hooks instead of external cron |
| Web dashboard | Observatory (MCP resource + optional server) | Can render in-terminal via MCP or launch web UI |
| Medic watchdog | Beekeeper | Hook-based health monitoring |
| `~/.openclaw/antfarm/` | `~/.hive/` | Standalone data directory |
| Shared context dict | Nectar store | JSON context passed between flights |

### Key Architectural Difference

Antfarm relies on an **external orchestrator** (OpenClaw + cron jobs + a separate CLI). Plugin Hive is **native to Claude Code** -- it uses the plugin system's own extension points (MCP servers, hooks, subagents, skills) to orchestrate work without any external dependencies beyond Node.js and SQLite.

---

## 3. Plugin Structure

```
plugin-hive/
  .claude-plugin/
    plugin.json                    # Plugin manifest

  skills/
    hive/
      SKILL.md                     # Main /hive command -- entry point for all hive operations
    hive-swarm/
      SKILL.md                     # /hive-swarm -- start and manage swarms
    hive-status/
      SKILL.md                     # /hive-status -- check swarm/flight status
    hive-install/
      SKILL.md                     # /hive-install -- install blueprints

  agents/
    queen.md                       # Queen bee subagent (planner/decomposer)
    worker.md                      # Worker bee subagent (developer/implementer)
    inspector.md                   # Inspector bee subagent (verifier/reviewer)
    scout.md                       # Scout bee subagent (analyzer/researcher)
    guard.md                       # Guard bee subagent (security auditor)
    builder.md                     # Builder bee subagent (tester)

  hooks/
    hooks.json                     # Plugin hook configurations

  .mcp.json                        # MCP server registration

  src/
    index.ts                       # MCP server entry point
    db.ts                          # SQLite database layer
    types.ts                       # Core TypeScript types

    blueprint/
      schema.ts                    # Blueprint YAML parser + validator
      loader.ts                    # Blueprint discovery and loading

    swarm/
      create.ts                    # Swarm creation (run a blueprint)
      status.ts                    # Swarm status queries
      stop.ts                      # Swarm cancellation
      resume.ts                    # Resume failed swarms

    flight/
      peek.ts                      # Check for pending flights (lightweight)
      claim.ts                     # Claim a flight for execution
      complete.ts                  # Mark flight done, advance pipeline
      fail.ts                      # Mark flight failed, handle retry
      template.ts                  # Nectar template resolution ({{var}})

    cell/
      manage.ts                    # Cell (story) CRUD and iteration
      parse.ts                     # Parse cell definitions from Queen output

    pipeline/
      advance.ts                   # Pipeline advancement logic
      context.ts                   # Nectar (shared context) management

    pollinator/
      scheduler.ts                 # Waggle dance scheduling
      poll.ts                      # Two-phase polling logic
      spawn.ts                     # Subagent spawning for work execution

    beekeeper/
      monitor.ts                   # Health check engine
      checks.ts                    # Individual health checks
      remediate.ts                 # Auto-remediation actions

    observatory/
      server.ts                    # Dashboard HTTP server
      api.ts                       # REST API endpoints
      daemon.ts                    # Daemon lifecycle management

    lib/
      logger.ts                    # Structured logging
      paths.ts                     # Filesystem path resolution
      events.ts                    # Event logging + webhooks

  blueprints/
    feature-dev/
      blueprint.yml                # 7-bee feature development pipeline
      bees/
        queen/
          IDENTITY.md
          NATURE.md
        worker/
          IDENTITY.md
          NATURE.md
        inspector/
          IDENTITY.md
          NATURE.md
        builder/
          IDENTITY.md
          NATURE.md

    security-audit/
      blueprint.yml                # 7-bee security audit pipeline
      bees/
        scout/
          IDENTITY.md
          NATURE.md
        guard/
          IDENTITY.md
          NATURE.md
        worker/
          IDENTITY.md
          NATURE.md

    bug-fix/
      blueprint.yml                # 6-bee bug fix pipeline
      bees/
        scout/
          IDENTITY.md
          NATURE.md
        worker/
          IDENTITY.md
          NATURE.md
        inspector/
          IDENTITY.md
          NATURE.md

  package.json
  tsconfig.json
  CLAUDE.md                        # Plugin documentation for Claude
  README.md                        # Human-readable documentation
```

---

## 4. Core Components

### 4.1 Plugin Manifest

```json
// .claude-plugin/plugin.json
{
  "name": "plugin-hive",
  "description": "Multi-agent workflow orchestration for Claude Code. Deploy swarms of specialized AI bees to autonomously execute complex development workflows.",
  "version": "0.1.0",
  "author": {
    "name": "Dakota Smith"
  },
  "repository": "https://github.com/dakotasmith/plugin-hive",
  "license": "MIT"
}
```

### 4.2 Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js >= 22 | Native SQLite support, ESM |
| Language | TypeScript (strict) | Type safety for complex state machines |
| Database | Node.js native `node:sqlite` | Zero dependencies, synchronous API |
| MCP Server | `@modelcontextprotocol/sdk` | Official MCP SDK for tool exposure |
| Build | `tsup` or `esbuild` | Fast bundling for MCP server |
| Schema validation | `zod` | Runtime YAML validation |

### 4.3 Dependencies (Minimal)

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "yaml": "^2.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsup": "^8.x",
    "@types/node": "^22.x",
    "vitest": "^3.x"
  }
}
```

---

## 5. Workflow System

### 5.1 Blueprint Schema (blueprint.yml)

```yaml
# blueprints/feature-dev/blueprint.yml
id: feature-dev
name: "Feature Development"
version: 1
description: "Drop in a feature request. Get back a tested PR."

polling:
  model: haiku                    # Cheap model for waggle dance
  timeout_seconds: 120            # Polling phase timeout

bees:
  - id: queen
    name: "Queen Bee"
    description: "Decomposes feature requests into ordered cells"
    role: analysis
    model: opus
    polling_model: haiku
    timeout_seconds: 900
    chamber:
      base_dir: queen
      files:
        "IDENTITY.md": "bees/queen/IDENTITY.md"
        "NATURE.md": "bees/queen/NATURE.md"

  - id: worker
    name: "Worker Bee"
    description: "Implements code changes for each cell"
    role: coding
    model: sonnet
    polling_model: haiku
    timeout_seconds: 1800
    chamber:
      base_dir: worker
      files:
        "IDENTITY.md": "bees/worker/IDENTITY.md"
        "NATURE.md": "bees/worker/NATURE.md"

  - id: inspector
    name: "Inspector Bee"
    description: "Verifies implementation meets acceptance criteria"
    role: verification
    model: sonnet
    polling_model: haiku
    timeout_seconds: 1200
    chamber:
      base_dir: inspector
      files:
        "IDENTITY.md": "bees/inspector/IDENTITY.md"
        "NATURE.md": "bees/inspector/NATURE.md"

  - id: builder
    name: "Builder Bee"
    description: "Runs tests and validates build integrity"
    role: testing
    model: sonnet
    polling_model: haiku
    timeout_seconds: 1200
    chamber:
      base_dir: builder
      files:
        "IDENTITY.md": "bees/builder/IDENTITY.md"
        "NATURE.md": "bees/builder/NATURE.md"

flights:
  - id: decompose
    bee: queen
    input: |
      Feature request: {{task}}

      Decompose this into ordered implementation cells.
      Output CELLS_JSON with the structured breakdown.
    expects: "CELLS_JSON: array of cells with id, title, description, acceptance_criteria"
    max_retries: 2

  - id: implement
    bee: worker
    type: loop
    loop:
      over: cells
      verify_each: true
      completion: all_done
    input: |
      Implement cell: {{current_cell}}

      Context from previous cells: {{completed_cells}}
      {{#inspect_feedback}}Inspector feedback: {{inspect_feedback}}{{/inspect_feedback}}

      Implement this cell and ensure all acceptance criteria are met.
    expects: "STATUS: done | FILES_CHANGED: list of modified files"
    max_retries: 3

  - id: inspect
    bee: inspector
    input: |
      Verify the implementation of cell: {{current_cell}}
      Files changed: {{files_changed}}
      Acceptance criteria: {{acceptance_criteria}}

      Review the code and verify all criteria are met.
    expects: "STATUS: pass/retry | FEEDBACK: detailed review"
    max_retries: 2

  - id: test
    bee: builder
    input: |
      Run the test suite and validate build integrity.
      Changed files across all cells: {{all_files_changed}}

      Ensure all tests pass and no regressions were introduced.
    expects: "STATUS: pass/fail | TEST_RESULTS: summary"
    max_retries: 2

  - id: finalize
    bee: worker
    input: |
      Create a pull request for the completed feature.
      Task: {{task}}
      Cells completed: {{completed_cells}}
      Test results: {{test_results}}
    expects: "PR_URL: the pull request URL"

nectar:
  project_dir: "."                 # Initial context variables
```

### 5.2 Blueprint Validation (Zod Schema)

```typescript
// src/blueprint/schema.ts
import { z } from "zod";

const BeeRole = z.enum([
  "analysis",    // Queen, Scout -- read-only analysis
  "coding",      // Worker -- full code editing
  "verification",// Inspector -- code review, read-heavy
  "testing",     // Builder -- test execution
  "pr",          // Worker (PR mode) -- git operations
  "scanning",    // Guard -- security scanning
]);

const ChamberConfig = z.object({
  base_dir: z.string(),
  files: z.record(z.string(), z.string()),
});

const BeeSpec = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().optional(),
  description: z.string().optional(),
  role: BeeRole,
  model: z.string().optional(),
  polling_model: z.string().optional(),
  timeout_seconds: z.number().optional(),
  chamber: ChamberConfig,
});

const LoopConfig = z.object({
  over: z.string(),
  verify_each: z.boolean().optional(),
  completion: z.enum(["all_done"]),
});

const FlightSpec = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  bee: z.string(),
  type: z.enum(["single", "loop"]).default("single"),
  loop: LoopConfig.optional(),
  input: z.string(),
  expects: z.string(),
  max_retries: z.number().default(2),
});

export const BlueprintSpec = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().optional(),
  version: z.number().optional(),
  description: z.string().optional(),
  polling: z.object({
    model: z.string().optional(),
    timeout_seconds: z.number().optional(),
  }).optional(),
  bees: z.array(BeeSpec).min(1),
  flights: z.array(FlightSpec).min(1),
  nectar: z.record(z.string(), z.string()).optional(),
  notifications: z.object({
    url: z.string().optional(),
  }).optional(),
});
```

---

## 6. Agent (Bee) System

### 6.1 Bee Roles and Tool Permissions

Each bee role maps to a specific set of allowed Claude Code tools:

| Role | Allowed Tools | Denied Tools | Use Case |
|------|--------------|--------------|----------|
| `analysis` | Read, Grep, Glob, WebFetch, WebSearch | Edit, Write, Bash | Queen, Scout |
| `coding` | Read, Grep, Glob, Edit, Write, Bash | -- | Worker |
| `verification` | Read, Grep, Glob, Bash(test commands) | Edit, Write | Inspector |
| `testing` | Read, Grep, Glob, Bash | Edit, Write | Builder |
| `pr` | Read, Grep, Glob, Bash(git/gh) | Edit, Write | Worker (PR flight) |
| `scanning` | Read, Grep, Glob, Bash(security tools) | Edit, Write | Guard |

### 6.2 Bee Identity Files

Each bee gets two personality files copied into its chamber:

**IDENTITY.md** -- Role declaration and capabilities:
```markdown
# Identity

Name: Queen Bee
Role: Task Decomposition Specialist
Blueprint: feature-dev

You are the Queen of this hive. Your singular purpose is to analyze feature
requests and decompose them into precisely ordered implementation cells.
Each cell must be atomic, testable, and have clear acceptance criteria.
```

**NATURE.md** -- Behavioral directives:
```markdown
# Nature

You are methodical, precise, and strategic. You think in terms of
dependency graphs and implementation order.

## Principles
- Every cell must be independently implementable
- Cells are ordered by dependency -- earlier cells never depend on later ones
- Acceptance criteria are concrete and verifiable, not vague
- You are NOT a coder -- you are an architect and planner
- When in doubt, make cells smaller rather than larger

## Output Format
You MUST output CELLS_JSON as a valid JSON array:
CELLS_JSON: [{"id": "cell-1", "title": "...", "description": "...", "acceptance_criteria": ["..."]}]
```

### 6.3 Bee Subagent Definitions

```markdown
<!-- agents/queen.md -->
---
name: queen
description: "Queen Bee -- decomposes tasks into ordered implementation cells for the hive"
tools: Read, Grep, Glob, WebSearch
model: opus
permissionMode: default
maxTurns: 30
---

You are the Queen Bee of Plugin Hive. Your role is to analyze complex tasks
and decompose them into ordered, atomic implementation cells.

You have access to the codebase for analysis. You produce structured plans,
not code. Your output feeds the honeycomb that worker bees will implement.

When given a task:
1. Analyze the codebase to understand architecture and patterns
2. Break the task into atomic, dependency-ordered cells
3. Define clear acceptance criteria for each cell
4. Output the structured CELLS_JSON

You MUST complete your flight by calling the hive flight tools.
```

---

## 7. Execution Engine

### 7.1 Two-Phase Polling (Waggle Dance)

The execution model mirrors antfarm's efficient two-phase approach, adapted for Claude Code's native subagent system:

```
Phase 1: Waggle Dance (cheap polling)
┌─────────────────────────────────────┐
│  Scheduler triggers bee poll        │
│  ↓                                  │
│  MCP tool: hive_flight_peek(beeId)  │
│  ↓                                  │
│  SQLite COUNT(*) on pending flights │
│  ↓                                  │
│  NO_WORK → log heartbeat, sleep     │
│  HAS_WORK → proceed to Phase 2     │
└─────────────────────────────────────┘

Phase 2: Foraging (full execution)
┌─────────────────────────────────────┐
│  MCP tool: hive_flight_claim(beeId) │
│  ↓                                  │
│  Resolve {{nectar}} templates       │
│  ↓                                  │
│  Spawn bee subagent with work prompt│
│  ↓                                  │
│  Bee executes in isolated context   │
│  ↓                                  │
│  hive_flight_complete(flightId)     │
│  ↓                                  │
│  Parse KEY: value output → nectar   │
│  ↓                                  │
│  Advance pipeline                   │
└─────────────────────────────────────┘
```

### 7.2 Polling Scheduler

Instead of external cron jobs, Plugin Hive uses a **self-sustaining polling loop** managed by the MCP server process:

```typescript
// src/pollinator/scheduler.ts
class WaggleDanceScheduler {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly BASE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly STAGGER_MS = 60 * 1000;            // 1 min stagger per bee

  startForSwarm(swarmId: string, bees: BeeSpec[]): void {
    bees.forEach((bee, index) => {
      const delay = index * this.STAGGER_MS;
      const key = `${swarmId}:${bee.id}`;

      // Initial delayed start
      setTimeout(() => {
        // Then recurring interval
        const interval = setInterval(
          () => this.poll(swarmId, bee),
          this.BASE_INTERVAL_MS
        );
        this.intervals.set(key, interval);
        // Also poll immediately
        this.poll(swarmId, bee);
      }, delay);
    });
  }

  stopForSwarm(swarmId: string): void {
    for (const [key, interval] of this.intervals) {
      if (key.startsWith(swarmId)) {
        clearInterval(interval);
        this.intervals.delete(key);
      }
    }
  }
}
```

### 7.3 Pipeline Advancement

```typescript
// src/pipeline/advance.ts
function advancePipeline(swarmId: string): void {
  const swarm = db.getSwarm(swarmId);
  const flights = db.getFlights(swarmId);

  // Check if all flights are done
  const allDone = flights.every(f => f.status === "done");
  if (allDone) {
    db.updateSwarm(swarmId, { status: "completed" });
    emitEvent("swarm.completed", { swarmId });
    scheduler.stopForSwarm(swarmId);
    return;
  }

  // Find next waiting flight and promote to pending
  const nextWaiting = flights.find(f => f.status === "waiting");
  if (nextWaiting) {
    const prevFlight = flights[nextWaiting.flight_index - 1];
    if (!prevFlight || prevFlight.status === "done") {
      db.updateFlight(nextWaiting.id, { status: "pending" });
      emitEvent("flight.ready", { flightId: nextWaiting.id });
    }
  }
}
```

### 7.4 Nectar Template Resolution

```typescript
// src/flight/template.ts
function resolveNectar(template: string, nectar: Record<string, string>): string {
  // Simple {{variable}} substitution
  let resolved = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return nectar[key] ?? `{{${key}}}`;
  });

  // Conditional sections: {{#key}}content{{/key}}
  resolved = resolved.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => nectar[key] ? content : ""
  );

  return resolved;
}
```

---

## 8. State Management

### 8.1 Database Schema

```sql
-- ~/.hive/hive.db

-- Installed blueprints
CREATE TABLE blueprints (
  id TEXT PRIMARY KEY,
  name TEXT,
  version INTEGER,
  spec TEXT NOT NULL,              -- Full YAML as JSON
  installed_at TEXT DEFAULT (datetime('now'))
);

-- Active swarms (running workflow instances)
CREATE TABLE swarms (
  id TEXT PRIMARY KEY,             -- UUID
  swarm_number INTEGER,            -- Sequential human-friendly number
  blueprint_id TEXT NOT NULL REFERENCES blueprints(id),
  task TEXT NOT NULL,               -- User's original task description
  status TEXT DEFAULT 'buzzing',    -- buzzing|paused|blocked|completed|failed|cancelled
  nectar TEXT DEFAULT '{}',         -- JSON shared context
  notify_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Flights (ordered steps within a swarm)
CREATE TABLE flights (
  id TEXT PRIMARY KEY,             -- UUID
  swarm_id TEXT NOT NULL REFERENCES swarms(id),
  flight_id TEXT NOT NULL,          -- Human-readable from blueprint
  bee_id TEXT NOT NULL,             -- "blueprintId_beeId"
  flight_index INTEGER NOT NULL,    -- Execution order
  input_template TEXT NOT NULL,
  expects TEXT NOT NULL,
  status TEXT DEFAULT 'waiting',    -- waiting|pending|in_flight|done|failed
  output TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  type TEXT DEFAULT 'single',       -- single|loop
  loop_config TEXT,                 -- JSON
  current_cell_id TEXT,
  abandoned_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Cells (decomposed sub-tasks for loop flights)
CREATE TABLE cells (
  id TEXT PRIMARY KEY,
  swarm_id TEXT NOT NULL REFERENCES swarms(id),
  cell_index INTEGER,
  cell_id TEXT,                     -- Human-readable ID
  title TEXT,
  description TEXT,
  acceptance_criteria TEXT,          -- JSON array
  status TEXT DEFAULT 'pending',    -- pending|in_progress|done|failed
  output TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Beekeeper health check log
CREATE TABLE beekeeper_checks (
  id TEXT PRIMARY KEY,
  checked_at TEXT DEFAULT (datetime('now')),
  issues_found INTEGER DEFAULT 0,
  actions_taken INTEGER DEFAULT 0,
  summary TEXT,
  details TEXT                      -- JSON
);

-- Event log
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  swarm_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT,                     -- JSON
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 8.2 Status Lifecycle

```
Swarm:    buzzing → paused → buzzing → completed
                  → blocked → buzzing     ↘ failed
                                           ↘ cancelled

Flight:   waiting → pending → in_flight → done
                                        → failed → pending (retry)

Cell:     pending → in_progress → done
                                → failed → pending (retry)
```

---

## 9. MCP Server

The MCP server is the primary interface between Claude Code and the hive. It exposes tools for all hive operations.

### 9.1 Registration

```json
// .mcp.json (at plugin root)
{
  "mcpServers": {
    "hive": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js"],
      "env": {
        "HIVE_DATA_DIR": "${HOME}/.hive",
        "HIVE_PROJECT_DIR": "${CLAUDE_PROJECT_DIR}"
      }
    }
  }
}
```

### 9.2 MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| **Blueprint Management** | | |
| `hive_blueprint_list` | List available and installed blueprints | -- |
| `hive_blueprint_install` | Install a blueprint | `blueprint_id` |
| `hive_blueprint_uninstall` | Remove a blueprint | `blueprint_id` |
| **Swarm Operations** | | |
| `hive_swarm_start` | Start a new swarm from a blueprint | `blueprint_id, task, options?` |
| `hive_swarm_status` | Get swarm status with flight details | `swarm_id_or_number` |
| `hive_swarm_list` | List all swarms with filters | `status?, blueprint_id?, limit?` |
| `hive_swarm_stop` | Cancel a running swarm | `swarm_id` |
| `hive_swarm_resume` | Resume a failed/paused swarm | `swarm_id` |
| **Flight Operations** | | |
| `hive_flight_peek` | Check if a bee has pending work (lightweight) | `bee_id` |
| `hive_flight_claim` | Claim the next pending flight for a bee | `bee_id` |
| `hive_flight_complete` | Mark a flight as done with output | `flight_id, output` |
| `hive_flight_fail` | Mark a flight as failed with error | `flight_id, error` |
| **Cell Operations** | | |
| `hive_cell_list` | List cells for a swarm | `swarm_id` |
| `hive_cell_status` | Get detailed cell status | `cell_id` |
| **Observatory** | | |
| `hive_observatory_start` | Launch the dashboard | `port?` |
| `hive_observatory_stop` | Stop the dashboard | -- |
| `hive_observatory_status` | Check dashboard status | -- |
| **Beekeeper** | | |
| `hive_beekeeper_check` | Run health check manually | -- |
| `hive_beekeeper_status` | Get beekeeper status | -- |

### 9.3 MCP Resources

| Resource URI | Description |
|-------------|-------------|
| `hive://swarms/active` | List of currently running swarms |
| `hive://swarm/{id}/status` | Real-time status of a specific swarm |
| `hive://swarm/{id}/nectar` | Current shared context for a swarm |
| `hive://blueprints` | Available blueprint catalog |
| `hive://beekeeper/health` | Current hive health summary |

### 9.4 MCP Server Implementation

```typescript
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initDb } from "./db.js";
import { WaggleDanceScheduler } from "./pollinator/scheduler.js";

const server = new McpServer({
  name: "hive",
  version: "0.1.0",
});

const db = initDb();
const scheduler = new WaggleDanceScheduler(db);

// --- Blueprint tools ---

server.tool("hive_blueprint_list", {}, async () => {
  const installed = db.listBlueprints();
  const bundled = discoverBundledBlueprints();
  return { content: [{ type: "text", text: JSON.stringify({ installed, bundled }) }] };
});

server.tool("hive_swarm_start",
  { blueprint_id: z.string(), task: z.string() },
  async ({ blueprint_id, task }) => {
    const swarm = createSwarm(db, blueprint_id, task);
    scheduler.startForSwarm(swarm.id, swarm.bees);
    return { content: [{ type: "text", text: JSON.stringify(swarm) }] };
  }
);

// ... additional tools ...

// --- Resources ---

server.resource("hive://swarms/active", "Active swarms", async () => {
  const swarms = db.listSwarms({ status: "buzzing" });
  return { contents: [{ uri: "hive://swarms/active", text: JSON.stringify(swarms) }] };
});

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 10. Skills

### 10.1 Main Entry Point: /hive

```yaml
# skills/hive/SKILL.md
---
name: hive
description: "Manage the Plugin Hive -- multi-agent workflow orchestration. Start swarms, check status, install blueprints, and monitor your hive."
argument-hint: "[command] [args]"
allowed-tools: Read, Grep, Glob, Bash, mcp__hive__hive_blueprint_list, mcp__hive__hive_swarm_start, mcp__hive__hive_swarm_status, mcp__hive__hive_swarm_list, mcp__hive__hive_swarm_stop
---

# The Hive

You are the Hive Commander. You orchestrate multi-agent workflows using Plugin Hive.

## Available Commands

Parse the user's arguments ($ARGUMENTS) and execute the appropriate action:

| Command | Action | Tool |
|---------|--------|------|
| `swarm <blueprint> "<task>"` | Start a new swarm | `hive_swarm_start` |
| `status [swarm-id]` | Check swarm status | `hive_swarm_status` |
| `list` | List all swarms | `hive_swarm_list` |
| `stop <swarm-id>` | Cancel a swarm | `hive_swarm_stop` |
| `resume <swarm-id>` | Resume a failed swarm | `hive_swarm_resume` |
| `blueprints` | List available blueprints | `hive_blueprint_list` |
| `install <blueprint>` | Install a blueprint | `hive_blueprint_install` |
| `observatory` | Launch the dashboard | `hive_observatory_start` |
| `beekeeper` | Run health check | `hive_beekeeper_check` |

## Usage Examples

- `/hive swarm feature-dev "Add dark mode toggle to settings page"`
- `/hive status 3`
- `/hive blueprints`
- `/hive beekeeper`

If no command is given, show this help text.
```

### 10.2 Quick Swarm: /hive-swarm

```yaml
# skills/hive-swarm/SKILL.md
---
name: hive-swarm
description: "Start a new hive swarm -- deploy bees to work on a task"
argument-hint: "<blueprint> \"<task description>\""
allowed-tools: mcp__hive__hive_swarm_start, mcp__hive__hive_swarm_status, mcp__hive__hive_blueprint_list
---

# Start a Swarm

Start a new swarm to execute a task.

Arguments: $ARGUMENTS

Parse the first argument as the blueprint ID and the rest as the task description.
If no blueprint is specified, list available blueprints and ask the user to choose.

Use `hive_swarm_start` to begin the swarm, then show the initial status.
```

---

## 11. Hooks

### 11.1 Plugin Hooks Configuration

```json
// hooks/hooks.json
{
  "description": "Plugin Hive lifecycle hooks",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/session-start.js",
            "timeout": 5000
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/check-active-swarms.js",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### 11.2 Hook Behaviors

| Hook | Event | Behavior |
|------|-------|----------|
| **Session Start** | `SessionStart` | Check for active swarms, display summary if any are running |
| **Session Stop** | `Stop` | Warn if active swarms are running, suggest checking status |

---

## 12. Subagents

### 12.1 Queen Bee (Planner)

```markdown
<!-- agents/queen.md -->
---
name: queen
description: "Queen Bee -- analyzes tasks and decomposes them into ordered implementation cells for the hive's honeycomb"
tools: Read, Grep, Glob, WebSearch, mcp__hive__hive_flight_complete, mcp__hive__hive_flight_fail
disallowedTools: Edit, Write, Bash
model: opus
permissionMode: default
maxTurns: 30
---

# Queen Bee

You are the Queen Bee of this hive. Your singular purpose is to analyze
complex tasks and decompose them into a perfectly ordered honeycomb of
implementation cells.

## Your Mission
When assigned a flight, you will:
1. Read and understand the codebase relevant to the task
2. Identify all components, files, and systems affected
3. Decompose the task into atomic, dependency-ordered cells
4. Define precise acceptance criteria for each cell
5. Complete your flight with the structured output

## Output Format
You MUST output CELLS_JSON as a valid JSON array:
```
CELLS_JSON: [{"id": "cell-1", "title": "...", "description": "...", "acceptance_criteria": ["criterion 1", "criterion 2"]}]
```

## Rules
- Cells MUST be ordered by dependency (earlier cells never depend on later ones)
- Each cell must be independently implementable and testable
- Acceptance criteria must be concrete and verifiable
- You are NOT a coder -- you are a strategist
- When in doubt, make cells smaller rather than larger
- ALWAYS complete your flight using hive_flight_complete
```

### 12.2 Worker Bee (Implementer)

```markdown
<!-- agents/worker.md -->
---
name: worker
description: "Worker Bee -- implements code changes for assigned cells in the honeycomb"
tools: Read, Grep, Glob, Edit, Write, Bash, mcp__hive__hive_flight_complete, mcp__hive__hive_flight_fail
model: sonnet
permissionMode: acceptEdits
maxTurns: 50
---

# Worker Bee

You are a Worker Bee. You implement code changes precisely and efficiently.

## Your Mission
When assigned a flight, you will:
1. Read the cell description and acceptance criteria
2. Study relevant code and patterns in the codebase
3. Implement the required changes
4. Verify your changes meet all acceptance criteria
5. Complete your flight with STATUS and FILES_CHANGED

## Output Format
```
STATUS: done
FILES_CHANGED: path/to/file1.ts, path/to/file2.ts
```

## Rules
- Follow existing code patterns and conventions exactly
- Make minimal, focused changes -- only what's needed for this cell
- Do NOT refactor surrounding code or add unnecessary improvements
- If blocked or unsure, fail the flight with a clear error rather than guessing
- ALWAYS complete your flight using hive_flight_complete or hive_flight_fail
```

### 12.3 Inspector Bee (Verifier)

```markdown
<!-- agents/inspector.md -->
---
name: inspector
description: "Inspector Bee -- verifies implementations meet acceptance criteria"
tools: Read, Grep, Glob, Bash, mcp__hive__hive_flight_complete, mcp__hive__hive_flight_fail
disallowedTools: Edit, Write
model: sonnet
permissionMode: default
maxTurns: 30
---

# Inspector Bee

You are an Inspector Bee. You verify that implementations are correct
and meet all acceptance criteria.

## Your Mission
When assigned a flight, you will:
1. Read the acceptance criteria for the cell
2. Review all changed files
3. Run relevant tests if applicable
4. Determine if all criteria are met

## Output Format
If passing:
```
STATUS: pass
FEEDBACK: All acceptance criteria met. [details]
```

If needs rework:
```
STATUS: retry
FEEDBACK: [specific issues that need fixing]
```

## Rules
- Be thorough but fair -- only fail for genuine issues
- Provide specific, actionable feedback when requesting rework
- You are NOT an implementer -- do not suggest specific code changes
- ALWAYS complete your flight
```

### 12.4 Additional Bees

Similar patterns for:
- **Scout** (`agents/scout.md`) -- Research and analysis agent for bug-fix and security-audit blueprints
- **Guard** (`agents/guard.md`) -- Security-focused scanning agent
- **Builder** (`agents/builder.md`) -- Test execution and build validation agent

---

## 13. Dashboard (Observatory)

### 13.1 Architecture

The Observatory is a lightweight HTTP server serving a single-page application:

```typescript
// src/observatory/server.ts
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

export function createObservatory(db: Database, port: number = 3333) {
  const indexHtml = readFileSync(
    new URL("./index.html", import.meta.url), "utf-8"
  );

  return createServer((req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);

    // API routes
    if (url.pathname.startsWith("/api/")) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");

      switch (url.pathname) {
        case "/api/swarms":
          return json(res, db.listSwarms(parseFilters(url)));
        case "/api/blueprints":
          return json(res, db.listBlueprints());
        // ... more endpoints
      }
    }

    // SPA fallback
    res.setHeader("Content-Type", "text/html");
    res.end(indexHtml);
  });
}
```

### 13.2 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/blueprints` | List installed blueprints |
| `GET /api/swarms?blueprint=X&status=Y` | List swarms with filters |
| `GET /api/swarms/:id` | Swarm detail with flights |
| `GET /api/swarms/:id/cells` | Cells for a swarm |
| `GET /api/swarms/:id/events` | Event timeline |
| `GET /api/beekeeper/status` | Health status |
| `GET /api/beekeeper/checks` | Recent checks |

### 13.3 Dashboard UI

The SPA (`observatory/index.html`) will feature:
- Honeycomb visualization of cells with status colors
- Swarm timeline showing flight progress
- Real-time updates via polling (every 5s)
- Bee activity log
- Beekeeper health panel
- Hive-themed design (amber/gold/dark color scheme)

---

## 14. Health Monitor (Beekeeper)

### 14.1 Health Checks

```typescript
// src/beekeeper/checks.ts
export const checks = {
  stuckFlights: (db: Database) => {
    // Flights in "in_flight" for longer than bee timeout + 5min buffer
    const stuck = db.query(`
      SELECT * FROM flights
      WHERE status = 'in_flight'
      AND updated_at < datetime('now', '-35 minutes')
    `);
    return stuck.map(f => ({
      severity: "warning",
      message: `Flight ${f.flight_id} stuck in_flight for bee ${f.bee_id}`,
      action: "reset_to_pending",
    }));
  },

  stalledSwarms: (db: Database) => {
    // Swarms with no flight progress in 30+ minutes
    const stalled = db.query(`
      SELECT s.* FROM swarms s
      WHERE s.status = 'buzzing'
      AND s.updated_at < datetime('now', '-30 minutes')
    `);
    return stalled.map(s => ({
      severity: "warning",
      message: `Swarm ${s.swarm_number} stalled -- no progress in 30 minutes`,
      action: "investigate",
    }));
  },

  zombieSwarms: (db: Database) => {
    // Swarms marked buzzing but all flights done/failed
    // ...
  },

  orphanedSchedulers: (scheduler: WaggleDanceScheduler, db: Database) => {
    // Schedulers running for completed/cancelled swarms
    // ...
  },
};
```

### 14.2 Auto-Remediation

| Issue | Action |
|-------|--------|
| Stuck flight (beyond timeout) | Reset to `pending`, increment abandoned_count |
| Stalled swarm | Log warning, attempt to advance pipeline |
| Zombie swarm | Mark as `completed` or `failed` based on flight states |
| Orphaned scheduler | Stop the scheduler |
| Exhausted retries | Mark flight/cell as `failed`, fail the swarm |

---

## 15. CLI Surface

Plugin Hive exposes its functionality primarily through **skills** (slash commands) and **MCP tools**, not a separate CLI binary. This keeps everything native to Claude Code.

### User-Facing Commands

| Command | Description |
|---------|-------------|
| `/hive` | Main entry point, shows help and status |
| `/hive swarm feature-dev "Add X"` | Start a feature development swarm |
| `/hive status` | Show active swarm status |
| `/hive status 3` | Show specific swarm by number |
| `/hive list` | List all swarms |
| `/hive stop 3` | Cancel swarm #3 |
| `/hive resume 3` | Resume a failed swarm |
| `/hive blueprints` | List available blueprints |
| `/hive install feature-dev` | Install a blueprint |
| `/hive observatory` | Launch web dashboard |
| `/hive beekeeper` | Run health check |
| `/hive-swarm feature-dev "Add X"` | Quick shortcut to start a swarm |
| `/hive-status` | Quick shortcut for status |

---

## 16. Configuration & YAML Schema

### 16.1 Blueprint YAML Reference

```yaml
# Full blueprint.yml reference
id: string                         # Unique ID (lowercase, hyphens only)
name: string                       # Human-readable name
version: number                    # Schema version
description: string                # What this blueprint does

polling:
  model: string                    # Default polling model for all bees
  timeout_seconds: number          # Default polling timeout

bees:
  - id: string                     # Unique bee ID within blueprint
    name: string                   # Human-readable name
    description: string            # What this bee does
    role: enum                     # analysis|coding|verification|testing|pr|scanning
    model: string                  # LLM model for work execution
    polling_model: string          # LLM model for polling (cheap)
    timeout_seconds: number        # Max execution time
    chamber:
      base_dir: string             # Workspace subdirectory name
      files:                       # Files to copy into chamber
        "TARGET.md": "source/path/FILE.md"

flights:
  - id: string                     # Unique flight ID
    bee: string                    # References bee.id
    type: single|loop              # Execution mode
    loop:                          # Only for type: loop
      over: string                 # What to iterate (e.g., "cells")
      verify_each: boolean         # Run verification between iterations
      completion: all_done         # Completion condition
    input: string                  # Markdown template with {{nectar}} variables
    expects: string                # Description of expected KEY: value output
    max_retries: number            # Retry limit (default: 2)

nectar:                            # Initial context variables
  key: value

notifications:
  url: string                      # Webhook URL for events
```

### 16.2 Nectar (Context) Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `{{task}}` | User input | Original task description |
| `{{swarm_id}}` | System | Current swarm UUID |
| `{{current_cell}}` | Loop engine | Current cell being worked on |
| `{{completed_cells}}` | Loop engine | Summary of completed cells |
| `{{cells_remaining}}` | Loop engine | Count of remaining cells |
| `{{inspect_feedback}}` | Inspector output | Feedback from verification |
| `{{files_changed}}` | Worker output | Files modified by worker |
| `{{progress}}` | System | "Flight 3/7, Cell 2/5" |
| Custom `KEY` | Flight output | Any KEY: value from flight output |

---

## 17. Installation & Distribution

### 17.1 Plugin Installation

```bash
# From marketplace/GitHub
claude plugin install dakotasmith/plugin-hive

# Local development
claude --plugin-dir ./plugin-hive

# Or add to project settings
# .claude/settings.json
{
  "enabledPlugins": {
    "plugin-hive": true
  }
}
```

### 17.2 First-Run Setup

On first `/hive` invocation:
1. Create `~/.hive/` data directory
2. Initialize `hive.db` with schema
3. Install bundled blueprints (feature-dev, security-audit, bug-fix)
4. Display welcome message with available commands

### 17.3 Build Process

```bash
npm install
npm run build    # tsup builds src/ → dist/
npm test         # vitest runs test suite
```

---

## 18. Implementation Phases

### Phase 1: Foundation (Core Infrastructure)
- [ ] Project scaffolding (package.json, tsconfig, plugin manifest)
- [ ] SQLite database layer (`src/db.ts`) with schema and migrations
- [ ] Core types (`src/types.ts`)
- [ ] Path resolution (`src/lib/paths.ts`)
- [ ] Logger (`src/lib/logger.ts`)
- [ ] Blueprint YAML parser and validator (`src/blueprint/`)
- [ ] Basic MCP server skeleton (`src/index.ts`)

### Phase 2: Blueprint & Swarm Management
- [ ] Blueprint discovery and loading (`src/blueprint/loader.ts`)
- [ ] Blueprint install/uninstall MCP tools
- [ ] Swarm creation (`src/swarm/create.ts`)
- [ ] Swarm status and listing (`src/swarm/status.ts`)
- [ ] Swarm stop/cancel (`src/swarm/stop.ts`)
- [ ] Nectar template resolution (`src/flight/template.ts`)
- [ ] Flight peek/claim/complete/fail (`src/flight/`)
- [ ] Pipeline advancement (`src/pipeline/advance.ts`)
- [ ] Event logging (`src/lib/events.ts`)

### Phase 3: Execution Engine
- [ ] Waggle dance scheduler (`src/pollinator/scheduler.ts`)
- [ ] Two-phase polling logic (`src/pollinator/poll.ts`)
- [ ] Subagent spawning (`src/pollinator/spawn.ts`)
- [ ] Cell management for loop flights (`src/cell/`)
- [ ] Verify-each flow
- [ ] Retry logic with abandoned step recovery
- [ ] Swarm resume functionality

### Phase 4: Bee Definitions & Blueprints
- [ ] Queen bee subagent definition
- [ ] Worker bee subagent definition
- [ ] Inspector bee subagent definition
- [ ] Scout bee subagent definition
- [ ] Guard bee subagent definition
- [ ] Builder bee subagent definition
- [ ] Feature-dev blueprint with bee identity files
- [ ] Security-audit blueprint
- [ ] Bug-fix blueprint

### Phase 5: User Interface (Skills & Hooks)
- [ ] `/hive` main skill
- [ ] `/hive-swarm` quick-start skill
- [ ] `/hive-status` status skill
- [ ] `/hive-install` blueprint installation skill
- [ ] SessionStart hook (active swarm notification)
- [ ] Stop hook (active swarm warning)
- [ ] CLAUDE.md plugin documentation

### Phase 6: Observatory & Beekeeper
- [ ] Observatory HTTP server (`src/observatory/`)
- [ ] Dashboard SPA (index.html) with honeycomb UI
- [ ] REST API endpoints
- [ ] Daemon management
- [ ] Beekeeper health checks (`src/beekeeper/`)
- [ ] Auto-remediation engine
- [ ] MCP resources for real-time status

### Phase 7: Polish & Distribution
- [ ] Comprehensive test suite (vitest)
- [ ] README.md with setup guide and usage
- [ ] Error handling and edge cases
- [ ] Performance optimization
- [ ] Plugin marketplace publishing

---

## 19. Key Architectural Decisions

### 19.1 Why Plugin, Not Standalone CLI?

Antfarm requires an external tool (OpenClaw) and cron system. Plugin Hive is **native to Claude Code**, using its own extension points:
- **MCP server** replaces the antfarm CLI for programmatic operations
- **Skills** replace the command-line interface for user interaction
- **Subagents** replace the external gateway for agent execution
- **Hooks** replace external cron for lifecycle events

### 19.2 Why MCP Server for Core Logic?

The MCP server process is long-lived, making it ideal for:
- Maintaining the polling scheduler in memory
- Managing database connections
- Serving the Observatory dashboard
- Providing tools that both Claude and subagents can call

### 19.3 Why Not a Central Orchestrator Process?

Following antfarm's decentralized model, bees operate independently. The MCP server provides infrastructure (database, tools) but doesn't dictate execution flow. Each bee polls for work, claims flights, and completes them autonomously. This prevents single-point-of-failure and enables concurrent execution.

### 19.4 Subagent Execution Model

Instead of antfarm's cron-to-OpenClaw-gateway approach, Plugin Hive spawns bee subagents directly via Claude Code's `Task` tool or subagent system. The polling scheduler detects pending work and the MCP server facilitates the handoff, but each bee runs in an isolated Claude Code subagent context.

### 19.5 Fresh Context Per Flight

Like antfarm, each bee gets a fresh context per flight. This prevents context window bloat and hallucinated state. Bees communicate only through the nectar (shared context) store in the database, never through shared memory or conversation history.

---

## Appendix: Antfarm Feature Parity Checklist

| Antfarm Feature | Plugin Hive Equivalent | Status |
|----------------|----------------------|--------|
| YAML workflow definitions | Blueprint YAML | Planned |
| 7-agent feature-dev workflow | Feature-dev blueprint (4+ bees) | Planned |
| 7-agent security-audit workflow | Security-audit blueprint | Planned |
| 6-agent bug-fix workflow | Bug-fix blueprint | Planned |
| SQLite state management | hive.db | Planned |
| Two-phase polling | Waggle dance scheduler | Planned |
| Step claim/complete/fail | Flight peek/claim/complete/fail | Planned |
| Story-based loops | Cell-based loops | Planned |
| Verify-each cycles | Verify-each with inspector feedback | Planned |
| Context-passing pipeline | Nectar template resolution | Planned |
| Web dashboard | Observatory | Planned |
| Health watchdog (medic) | Beekeeper | Planned |
| Webhook notifications | Event webhooks | Planned |
| Retry + abandoned recovery | Retry + abandoned recovery | Planned |
| CLI commands | Skills + MCP tools | Planned |
| Role-based tool permissions | Bee role tool restrictions | Planned |
| Agent identity files | Bee IDENTITY.md + NATURE.md | Planned |

---

---

## Phase 8: Autonomous Coordinator & Parallel Flights

### 8.1 Coordinator Skill (`/hive-drive`)

The `/hive-drive` skill closes the automation gap. Instead of the user manually calling `/hive pollinate` repeatedly, `/hive-drive` enters a wave-based loop that autonomously drives a swarm from start to finish:

1. Pollinate to discover ready work
2. Spawn bee subagents as background `Task` agents
3. Monitor via `TaskOutput` until all bees complete
4. Check swarm status via `hive_swarm_summary`
5. Repeat until completed, failed, or safety limits hit (50 waves)

### 8.2 Parallel Flight DAG

Blueprints can now declare flight dependencies via `depends_on: string[]`. When present, the pipeline switches from sequential to DAG mode:

- Multiple flights whose dependencies are all "done" become "pending" simultaneously
- Blueprints without `depends_on` use the existing sequential logic (backward compatible)
- Kahn's algorithm validates no cycles exist at blueprint install time

### 8.3 Flight Duration Tracking

`started_at` and `completed_at` columns on flights and cells tables. Set on claim/complete/fail transitions. Duration computed via `julianday()` arithmetic. Exposed via Observatory timing endpoint and `hive_swarm_summary`.

### 8.4 Epoch-Based Change Detection

A monotonic epoch counter in `hive_meta` table. Every state mutation bumps the epoch. The coordinator calls `hive_check_epoch` before expensive queries — if unchanged, skip the poll cycle.

### 8.5 New MCP Tools

| Tool | Description |
|------|-------------|
| `hive_swarm_summary` | Compact status for coordinator loop (pipeline, cells, active bees, epoch) |
| `hive_check_epoch` | Monotonic counter for change detection |

---

## Phase 9: Workflow Intelligence & Production Hardening

### 9.1 Conditional Flights (`when:` clause)

Flights can declare `when: "{{key}}"` to skip execution based on nectar values. Three forms supported:
- `when: "{{key}}"` — truthy (key exists and non-empty)
- `when: "{{key}} == value"` — equality
- `when: "{{key}} != value"` — inequality

Evaluated at promotion time in `advancePipeline()`. Skipped flights marked `done` with output `SKIPPED: when clause not met`, which correctly unblocks DAG dependents.

### 9.2 Flight Gates (`gate: approval`)

Flights can declare `gate: approval` to pause for human confirmation. When a gated flight would be promoted, it gets status `gated` and the swarm goes `blocked`. New `hive_gate_approve` tool unblocks it. In DAG mode, only blocks if ALL promotable flights are gated; parallel flights can still advance.

### 9.3 Retry Backoff

Configurable per-flight via `retry_strategy: { type: exponential, delay_seconds: 30 }`. Types: `immediate` (default), `linear`, `exponential`. Stores `retry_at` on flight; claim queries filter by `WHERE retry_at IS NULL OR retry_at <= datetime('now')`.

### 9.4 Swarm Input Schema

Blueprints declare required/optional variables: `inputs: [{ name: task, required: true }]`. Validated at swarm start. New `variables` param on `hive_swarm_start`. New `hive_blueprint_info` tool exposes input metadata.

### 9.5 Enhanced Beekeeper

Three new checks added to the health monitor:
1. **Verification loop detection** — cells retried N+ times still pending (configurable threshold)
2. **Cell stuck detection** — cells in_progress beyond threshold
3. **Slow flight advisory** — flights approaching timeout (warning only)

Thresholds configurable per-blueprint via `beekeeper:` section in YAML.

### 9.6 Performance Analytics

New `hive_swarm_analytics` tool exposing: flight durations, cell durations, bottleneck identification, bee utilization, and parallelism ratio. Also enriches `swarm.completed` event with timing summary.

### 9.7 Nectar Transforms

Template filters extending `{{key}}` syntax: `{{key|default:fallback}}`, `{{key|json}}`, `{{key|upper}}`, `{{key|lower}}`. Backward-compatible regex extension.

### 9.8 New MCP Tools

| Tool | Description |
|------|-------------|
| `hive_gate_approve` | Approve a gated flight to unblock the pipeline |
| `hive_blueprint_info` | Get detailed blueprint info including input schema |
| `hive_swarm_analytics` | Performance analytics for a swarm |

*This architecture document is the foundation for building Plugin Hive. Each section maps directly to implementation work in the phased plan above.*

---

## Phase 10: Blueprint Ecosystem, Swarm Chaining, Notifications & Resilience

### 10.1 Custom Blueprint Authoring & Ecosystem

Users can now create, validate, simulate, and install blueprints from external sources.

**New MCP Tools:**
| Tool | Description |
|------|-------------|
| `hive_blueprint_scaffold` | Generate a new blueprint directory with skeleton YAML and bee identity files |
| `hive_blueprint_validate` | Validate blueprint against schema plus semantic checks (nectar reachability, role consistency, trigger validity) |
| `hive_blueprint_dryrun` | Simulate pipeline execution — shows flight order, dependency graph, template resolution preview |
| `hive_blueprint_install_remote` | Install a blueprint from a Git repo URL (shallow clone, validate, copy) |

**Blueprint Discovery:** Project-local blueprints discovered at `{projectDir}/.hive/blueprints/{id}/blueprint.yml` before installed and bundled locations.

**New DB Table:** `blueprint_sources` tracks origin (bundled/local/project/git), version, and source URI for installed blueprints.

### 10.2 Swarm Chaining & Triggers

Blueprints can declare `triggers:` that fire new swarms on completion or failure, enabling multi-swarm workflows.

**Blueprint Schema Addition:**
```yaml
triggers:
  - on: swarm.completed
    blueprint: deploy-staging
    nectar_forward: [pr_url, files_changed]
    task_template: "Deploy {{pr_url}} to staging"
    variables: { environment: staging }
    condition: "{{status}} == pass"
```

**Trigger Execution Flow:**
1. On swarm completion/failure, load blueprint triggers matching event type
2. Evaluate optional `condition` against parent nectar (reuses `evaluateWhen()`)
3. Forward specified nectar keys and resolve task template
4. Create child swarm with `chain_id` (creating chain record if first trigger in lineage)

**New MCP Tools:**
| Tool | Description |
|------|-------------|
| `hive_chain_status` | View all swarms in a chain with parent-child relationships |
| `hive_chain_list` | List all chains with status filter |

**New DB Table:** `chains` with `root_swarm_id`, status, timestamps. Swarms gain `chain_id`, `parent_swarm_id`, `trigger_config` columns.

**New Events:** `chain.created`, `chain.completed`, `chain.failed`, `swarm.triggered`

### 10.3 Event Notifications & Webhooks

Replaces fire-and-forget webhook delivery with a robust system including retries, payload formatting, and delivery history.

**Webhook Delivery System:**
1. On event emission, check swarm-level `notify_url` AND global `notification_config`
2. Filter events against `enabled_events` list
3. Create `webhook_deliveries` record
4. Attempt immediate delivery; on failure, schedule retry with exponential backoff

**Payload Formats:**
- **Standard:** `{ event_type, swarm_id, payload, timestamp }`
- **Slack:** `{ text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] }`
- **Discord:** `{ content, embeds: [{ title, description, color, timestamp }] }`

**New MCP Tools:**
| Tool | Description |
|------|-------------|
| `hive_notification_config` | Get/set global notification config (URL, events, format) |
| `hive_notification_test` | Send a test webhook and report success/failure |
| `hive_notification_history` | View webhook delivery history with status filters |
| `hive_notification_retry` | Retry failed deliveries (specific or all) |

**New DB Tables:** `notification_config` (global URL, enabled events, format) and `webhook_deliveries` (delivery tracking with retry state).

**Beekeeper Integration:** New `checkFailedWebhooks` health check and `retryWebhook` auto-remediation.

### 10.4 Resilience & Debugging

Flight traces, snapshots, and checkpoints provide debugging and state recovery capabilities.

**Flight Trace Instrumentation:** Trace records inserted at key lifecycle points:
- `claimed` — bee_id, resolved input length
- `output` — output length, nectar keys produced
- `error` — error message, context, retry count
- `retry` — delay seconds, retry count

**Snapshot System:** Full swarm state export (swarm, flights, cells, nectar) as JSON. Supports manual creation, restoration, and automatic checkpointing at configurable intervals.

**Enhanced Error Context:** `hive_flight_fail` accepts optional `context` parameter for bee agent output/stack traces, stored on `flights.error_context`.

**New MCP Tools:**
| Tool | Description |
|------|-------------|
| `hive_snapshot_create` | Export full swarm state as JSON snapshot |
| `hive_snapshot_list` | List snapshots for a swarm |
| `hive_snapshot_restore` | Restore swarm to a snapshot state |
| `hive_checkpoint_create` | Create a checkpoint (auto-checkpoint on interval) |
| `hive_flight_trace` | View structured execution traces for a flight or swarm |

**New DB Tables:** `snapshots` (state data, type) and `flight_traces` (structured trace records).

### 10.5 Schema Changes Summary

**New Tables (6):** chains, blueprint_sources, snapshots, flight_traces, notification_config, webhook_deliveries

**New Columns:**
- `swarms`: chain_id, parent_swarm_id, trigger_config
- `flights`: error_context, checkpoint_data
- `blueprints`: source_type, source_uri

**Total MCP Tools:** 44 (29 from Phases 1-9 + 15 new in Phase 10)

---

## Phase 11: Observability & Operational Maturity

### 11.1 Flight Progress Reporting (Live Pulse)

Bees can report incremental progress during long-running flights via `hive_flight_pulse`. Each pulse contains a step label, a progress fraction (0.0–1.0), and an optional message. Pulses are stored in a `flight_pulses` table and ring-buffered to 20 per flight. They are deleted when a flight completes or fails.

The coordinator (`/hive-drive`) reads pulses via `hive_flight_progress` while waiting for bees. The beekeeper uses pulse recency to distinguish genuinely stuck flights from merely slow ones — if a recent pulse exists within half the stuck-flight threshold, severity is downgraded to advisory. The Observatory exposes pulses via `/api/swarms/:id/pulses`.

### 11.2 Resource & Token Accounting (Honey Ledger)

A `flight_usage` table records token consumption per flight completion. Bees report tokens via a `TOKEN_USAGE` key in their completion output (parsed alongside existing `KEY: value` lines). When no explicit data is provided, tokens are estimated from input/output length. Aggregation via `hive_swarm_usage` produces per-bee, per-flight, and per-swarm breakdowns. Usage data is included in `hive_swarm_analytics` and surfaced in the Observatory.

### 11.3 Blueprint Inheritance (Extends)

Blueprints can declare `extends: base-blueprint-id` to inherit structure from a parent. The child overrides specific bees and flights by matching on `id` — matched IDs merge fields (child wins), unmatched IDs are appended. Top-level fields (polling, beekeeper, nectar, notifications, triggers) are replaced if present in the child.

```yaml
id: feature-dev-opus
extends: feature-dev
bees:
  - id: worker
    model: opus
    timeout_seconds: 2400
flights:
  - id: finalize
    gate: null
```

Inheritance is resolved at install time (max depth 5, cycle detection). The fully merged spec is stored in the database. `bees` and `flights` are optional in child blueprints when `extends` is set.

### 11.4 Swarm Scheduling & Priorities

`hive_swarm_start` gains optional `priority` (1–10, default 5) and `schedule_at` (ISO 8601) parameters. Scheduled swarms are created with status `scheduled` and promoted to `buzzing` by a beekeeper check when their start time arrives. Priority affects flight claim ordering — higher-priority swarm flights are claimed first.

### 11.5 Bee Performance History (Hive Memory)

A `bee_stats` table aggregates lifetime statistics per qualified bee ID (e.g., `feature-dev_worker`): total flights, successes, failures, average duration, total tokens consumed, and rolling success rate. Updated on every flight completion and failure via upsert. Exposed via `hive_bee_stats`. The beekeeper flags bees with success rate below 50% after 5+ flights (advisory only).

### 11.6 Enhanced MCP Resources (Live Feeds)

Five new MCP resources for passive monitoring without tool calls:

| Resource URI | Description |
|-------------|-------------|
| `hive://swarm/{id}/pulses` | Live flight progress pulses |
| `hive://swarm/{id}/usage` | Token usage breakdown |
| `hive://swarm/{id}/events` | Event stream (last 50) |
| `hive://swarm/{id}/flights` | Detailed flight statuses with timing |
| `hive://bees/stats` | Aggregate bee performance stats |

### 11.7 Auto-Checkpointing on State Transitions

Extends the existing `maybeAutoCheckpoint()` system to fire on gate approvals, verification outcomes, swarm status transitions, and swarm cancellation. Controlled by a new `checkpoint_on_transitions: true` flag in the blueprint's `beekeeper` config (default false for backward compatibility).

### 11.8 New MCP Tools

| Tool | Description |
|------|-------------|
| `hive_flight_pulse` | Report incremental progress during a flight (step, progress 0.0–1.0, message) |
| `hive_flight_progress` | Get latest pulses for a flight or all active flights in a swarm |
| `hive_swarm_usage` | Get token/cost breakdown for a swarm by bee, flight, and totals |
| `hive_bee_stats` | Get historical performance stats for a bee or all bees in a blueprint |

### 11.9 Schema Changes Summary

**New Tables (3):** flight_pulses, flight_usage, bee_stats

**New Columns:**
- `swarms`: priority, schedule_at

**New Status:** `scheduled` added to SwarmStatus lifecycle

**New Event Types (3):** `flight.pulse`, `swarm.scheduled`, `swarm.promoted`

**Updated Status Lifecycle:**
```
Swarm:    scheduled → buzzing → paused → buzzing → completed
                                → blocked → buzzing     ↘ failed
                                                          ↘ cancelled
```

**Total MCP Tools:** 39 (35 from Phases 1-10 + 4 new)

---

## Phase 12: Queue Intelligence, Nectar Contracts, Archival & Reporting

### 12.1 Concurrency Control & Queue Intelligence

Swarm creation now enforces concurrency limits. When limits are exceeded, swarms enter a `queued` status and are automatically promoted when slots open.

**Concurrency Enforcement (`src/concurrency/enforce.ts`):**
- `checkConcurrency(blueprintId)` — checks global `max_concurrent_swarms` (from `hive_config`) and blueprint-level `concurrency.max_swarms`
- `promoteQueuedSwarms()` — promotes highest-priority queued swarms when slots become available; registers promoted swarms with the scheduler

**Queue Status (`src/concurrency/queue-status.ts`):**
- `getQueueStatus()` — global utilization, per-blueprint breakdown, active flights per bee, queued swarm details

**Integration Points:**
- `swarm/create.ts` — checks concurrency before creating; sets status to `queued` if limit reached
- `pipeline/advance.ts` — calls `promoteQueuedSwarms()` after swarm completion
- `swarm/stop.ts` — calls `promoteQueuedSwarms()` after cancellation; allows stopping queued swarms
- `index.ts` — `hive_swarm_start` skips scheduler registration for queued swarms

**Blueprint Schema Addition:**
```yaml
concurrency:
  max_swarms: 3              # Max simultaneous swarms for this blueprint
  max_flights_per_bee: 1     # Max concurrent flights per bee
```

### 12.2 Nectar Contracts

Flights can now declare `produces` and `requires` arrays specifying nectar keys they output and consume. This enables static validation and runtime warnings.

**Contract Validation (`src/nectar/contracts.ts`):**
- `validateContracts(spec)` — walks pipeline in order, verifies every `requires` key has a producer (from a prior flight's `produces`, `spec.nectar`, `spec.inputs`, or system keys)
- `checkProducedKeys(flightId, swarmId, declaredProduces, currentNectar)` — warns at completion time if declared keys are missing from nectar (non-blocking)
- System keys: `task, swarm_id, progress, current_cell, acceptance_criteria, completed_cells, cells_remaining, inspect_feedback, verify_cell_*`

**Integration Points:**
- `blueprint/validate.ts` — contract validation in semantic checks
- `flight/complete.ts` — runtime produced-key check (warnings only)
- `blueprint/dryrun.ts` — nectar flow info in dry-run output

**Blueprint Schema Addition:**
```yaml
flights:
  - id: decompose
    bee: queen
    produces: [cells_json, plan_summary]
    requires: [task]
    input: "..."
```

### 12.3 Global Configuration

A centralized `hive_config` key-value table stores operational settings with type validation.

**Configuration Layer (`src/config/global.ts`):**
- `getGlobalConfig(key?)` — returns config entries with descriptions
- `setGlobalConfig(key, value)` — validates key and value type
- Helper accessors: `getConfigValue()`, `getConfigNumber()`, `getConfigBoolean()`

**Valid Keys:**

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `max_concurrent_swarms` | number | 5 | Maximum simultaneous buzzing swarms |
| `max_flights_per_bee` | number | 1 | Maximum concurrent flights per bee |
| `retention_days` | number | 30 | Days before completed swarms are archivable |
| `auto_archive` | boolean | false | Automatically archive old swarms via beekeeper |
| `default_priority` | number | 5 | Default swarm priority (1-10) |

### 12.4 Swarm Archival & Storage

Completed swarms can be archived to compressed storage, freeing up the main database.

**Archival (`src/archive/archive.ts`):**
- `archiveSwarm(swarmId)` — validates terminal status (completed/failed/cancelled), collects full state (swarm, flights, cells, events, traces, usage, snapshots, nectar), inserts into `swarm_archives`, cascading-deletes originals, emits `swarm.archived`

**Storage Status (`src/archive/storage.ts`):**
- `getStorageStatus()` — DB file size, table row counts, oldest entries, retention settings, archivable swarm count

**Beekeeper Integration:**
- `checkAutoArchive()` — when `auto_archive=true`, flags completed/failed swarms older than `retention_days`
- `autoArchiveSwarm()` remediation handler in `remediate.ts`
- `checkQueuedSwarms()` — warns if any swarm queued >60 minutes

### 12.5 Swarm Reporting

Structured report generation for completed (or in-progress) swarms.

**Report Generator (`src/report/generate.ts`):**
- `generateSwarmReport(swarmId)` — returns `{ report: SwarmReport, markdown: string }`
- Report contents: swarm metadata, summary stats (flights/cells/duration), flight timeline with durations/produces/requires, cell results, nectar data, analytics (bottleneck, parallelism ratio, token usage)
- `formatReportMarkdown(report)` — renders readable markdown with tables

### 12.6 Schema Changes

**New Tables:**
- `hive_config` (key TEXT PK, value TEXT, updated_at TEXT) — global configuration
- `swarm_archives` (id TEXT PK, swarm_number, blueprint_id, task, original_status, data TEXT, archived_at) — compressed swarm data

**New Columns:**
- `flights.produces TEXT` — JSON array of nectar keys this flight declares it will produce
- `flights.requires TEXT` — JSON array of nectar keys this flight declares it needs

**New SwarmStatus:** `queued` (waiting for concurrency slot)

**New Events:** `swarm.queued`, `swarm.archived`

**Updated Status Lifecycle:**
```
Swarm:    scheduled → queued → buzzing → paused → buzzing → completed
                                       → blocked → buzzing     ↘ failed
                                                                 ↘ cancelled
```

### 12.7 New MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `hive_queue_status` | Queue depth, active flights per bee, concurrency utilization | — |
| `hive_swarm_archive` | Archive a completed/failed/cancelled swarm to compressed storage | `swarm_id` |
| `hive_swarm_report` | Generate structured JSON + markdown report for a swarm | `swarm_id, format?` |
| `hive_storage_status` | DB file size, table counts, retention status | — |
| `hive_config` | Get/set global configuration (concurrency, retention, defaults) | `key?, value?` |

**Total MCP Tools:** 44 (39 from Phases 1-11 + 5 new)

---

## Phase 13 — Fleet Operations, Replay & Lifecycle Automation

Phase 13 closes operational gaps with swarm replay, fleet-level metrics, automated data maintenance, blueprint portability, and observatory completeness.

### 13.1 Swarm Replay (`src/replay/replay.ts`)

Re-run a completed/failed/cancelled swarm with same or overridden parameters.

- `replaySwarm(swarmId, options?)` — validates terminal status, loads blueprint spec, applies overrides (task, variables, priority), calls `createSwarmFromBlueprint()`, sets `replayed_from` column on new swarm
- For archived swarms: resolves via `getSwarmOrArchive()` which checks `swarm_archives` table
- New swarm is fully independent — separate flights, cells, nectar
- Emits `swarm.replayed` event linking new to original

### 13.2 Fleet Metrics (`src/metrics/fleet.ts`)

Aggregate statistics computed from existing tables (no new tables).

- `getFleetMetrics(period?)` — accepts "7d", "30d", "90d", "all" (default "30d")
- Returns `FleetMetrics` with:
  - Totals: swarm count, completed, failed, cancelled, success rate
  - Daily trend: per-day started/completed/failed counts
  - Per-blueprint: swarm count, success rate, avg duration
  - Top bees: from `bee_stats` table sorted by flight count
- All data from SQL aggregations — `getSwarmCountsByStatus()`, `getDailySwarmCounts()`, `getPerBlueprintStats()`

### 13.3 Data Maintenance (`src/maintenance/janitor.ts`)

Cleanup engine for accumulated ephemeral data.

- `runMaintenance(dryRun?)` — reads retention config from `hive_config`, deletes old data:
  - `deleteOldEvents(days)` — events older than `event_retention_days` (default 30)
  - `deleteOldTraces(days)` — flight traces older than `trace_retention_days` (default 14)
  - `deleteOldChecks(days)` — beekeeper checks older than `check_retention_days` (default 7)
  - `deleteOldWebhooks(days)` — webhook deliveries older than `webhook_retention_days` (default 14)
  - `deleteOrphanedPulses()` — pulses for deleted swarms
- **Safety:** never deletes data for active swarms (buzzing, paused, blocked, queued, scheduled)
- Returns `MaintenanceResult` with per-table deletion counts
- Emits `maintenance.completed` event; updates `hive_meta.last_maintenance_at`

**Beekeeper integration:**
- `checkMaintenance()` in `checks.ts` — if `auto_maintain=true` and last maintenance >24h ago, returns advisory
- `autoMaintain()` in `remediate.ts` — calls `runMaintenance(false)`
- Added to `monitor.ts` check/remediation lists

### 13.4 Blueprint Export/Import (`src/blueprint/export.ts`)

Package blueprints as portable JSON bundles (`.hive-blueprint.json`).

**Export:** `exportBlueprint(blueprintId, outputDir?)`
- Locates blueprint directory (project-local → installed → bundled)
- Reads all files recursively, encodes as base64
- Writes JSON bundle with `format_version`, `blueprint_id`, `exported_at`, `spec`, `files`

**Import:** `importBlueprint(path)`
- Reads JSON bundle, validates format_version and manifest
- Extracts files to `~/.plugin-hive/blueprints/{id}/` (with path traversal prevention)
- Calls `loadBlueprint()` for validation, installs via `insertBlueprint()`
- Records source as `"package"` type in `blueprint_sources`

### 13.5 Observatory Expansion (`src/observatory/api.ts`, `src/observatory/dashboard.ts`)

**11 new API endpoints:**

| Endpoint | Source |
|----------|--------|
| `GET /api/queue` | `getQueueStatus()` |
| `GET /api/archives` | `listSwarmArchives()` |
| `GET /api/archives/:id` | `getSwarmArchive()` |
| `GET /api/config` | `getAllHiveConfig()` |
| `GET /api/storage` | `getStorageStatus()` |
| `GET /api/swarms/:id/report` | `generateSwarmReport()` |
| `GET /api/swarms/:id/traces` | `getTracesForSwarm()` |
| `GET /api/swarms/:id/snapshots` | `getSnapshotsForSwarm()` |
| `GET /api/chains` | `listChains()` |
| `GET /api/chains/:id` | `getChainStatus()` |
| `GET /api/metrics/fleet` | `getFleetMetrics()` |

**Dashboard additions:**
- Navigation tabs: Swarms | Fleet | Archives | Config
- Fleet view: stat cards, daily trend bars, blueprint table, top bees
- Pulse progress bars on in-flight flight nodes
- Usage panel with per-bee token breakdown table
- Chain indicator badge on linked swarms
- Archive browser with expandable detail view
- Config view with key-value table and storage info
- Added badge styles for `scheduled` and `queued` statuses

### 13.6 Schema Changes

**New column:** `swarms.replayed_from TEXT` — links replayed swarm to original

**New meta key:** `last_maintenance_at` in `hive_meta`

**New config keys (5):**
- `event_retention_days` (default: 30) — days before events are maintenance-eligible
- `trace_retention_days` (default: 14) — days before traces are maintenance-eligible
- `check_retention_days` (default: 7) — days before beekeeper checks are maintenance-eligible
- `webhook_retention_days` (default: 14) — days before webhook deliveries are maintenance-eligible
- `auto_maintain` (default: false) — enable auto-maintenance during beekeeper checks

**New events (2):** `swarm.replayed`, `maintenance.completed`

**New blueprint source type:** `"package"` for imported bundles

### 13.7 New MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `hive_swarm_replay` | Re-run a completed/failed/cancelled swarm | `swarm_id, task?, variables?, priority?, reset_nectar?` |
| `hive_fleet_metrics` | Aggregate statistics across all swarms | `period?` |
| `hive_maintain` | Run data maintenance cleanup | `dry_run?` |
| `hive_blueprint_export` | Export blueprint as portable bundle | `blueprint_id, output_dir?` |
| `hive_blueprint_import` | Import blueprint from bundle file | `path` |

**Total MCP Tools:** 49 (44 from Phases 1-12 + 5 new)

### 13.8 New Files

| File | Purpose |
|------|---------|
| `src/replay/replay.ts` | Swarm replay logic |
| `src/replay/replay.test.ts` | Replay tests |
| `src/metrics/fleet.ts` | Fleet aggregate metrics |
| `src/metrics/fleet.test.ts` | Fleet metrics tests |
| `src/maintenance/janitor.ts` | Data cleanup engine |
| `src/maintenance/janitor.test.ts` | Maintenance tests |
| `src/blueprint/export.ts` | Blueprint export/import |
| `src/blueprint/export.test.ts` | Export/import tests |

---

## Phase 14 — Estimation, Gate Policies, Adaptive Tuning, Nectar Injection & Blueprint Versioning

Phase 14 adds pre-flight intelligence, extended gate capabilities, automated performance tuning, manual nectar intervention, and blueprint history tracking.

### 14.1 Swarm Estimation (`src/estimate/estimate.ts`)

Predict cost and duration before starting a swarm. Uses historical `bee_stats` data to project per-flight durations and token costs. For DAG blueprints, computes critical-path duration. Returns confidence scores based on data availability.

### 14.2 Gate Policies (`src/flight/gate-policy.ts`)

Extends the basic `gate: approval` mechanism with structured policies:
- `auto_approve_when` — conditions under which gates auto-approve (e.g., `"{{test_status}} == pass"`)
- `timeout_minutes` — auto-cancel or auto-approve after timeout
- `timeout_action` — action on timeout: `approve`, `cancel`, or `block` (default)

Gate policies are evaluated at promotion time. The beekeeper checks for expired gates.

### 14.3 Adaptive Tuning (`src/adaptive/tune.ts`)

Analyzes bee performance from `bee_stats` and recommends parameter adjustments:
- Timeout increases for consistently slow bees
- Retry increases for flaky bees
- Model upgrades for low-success-rate bees
- Confidence scoring based on sample size

Optional `--apply` mode writes recommendations back to the blueprint YAML and records a new version.

### 14.4 Nectar Injection (`src/nectar/inject.ts`)

Manual set/override of nectar keys for debugging and intervention:
- `hive_nectar_set` — writes a key-value pair into swarm nectar, bumps epoch
- `hive_nectar_get` — reads nectar values (all or specific key)
- Emits `nectar.injected` event with old/new values

### 14.5 Blueprint Versioning (`src/blueprint/version.ts`)

Tracks blueprint installation history in `blueprint_versions` table:
- Records version number, changes summary, and full spec on each install
- `hive_blueprint_history` — lists all versions with summaries
- `hive_blueprint_diff` — structural diff between two versions (bees added/removed/changed, flights added/removed/changed)

### 14.6 Schema Changes

**New Tables:**
- `blueprint_versions` (id, blueprint_id, version, spec, changes_summary, installed_at)

**New Columns:**
- `flights.gate_policy TEXT` — JSON gate policy config

**New Config Keys (1):**
- `adaptive_enabled` (boolean, default true) — enable adaptive tuning recommendations

**New Events (1):** `nectar.injected`

### 14.7 New MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `hive_swarm_estimate` | Predict cost/duration for a swarm | `blueprint_id` |
| `hive_gate_list` | List pending gated flights with policies | — |
| `hive_adaptive_tune` | Analyze and tune bee parameters | `blueprint_id, apply?` |
| `hive_nectar_set` | Set a nectar key on a swarm | `swarm_id, key, value` |
| `hive_nectar_get` | Get nectar values from a swarm | `swarm_id, key?` |
| `hive_blueprint_history` | View blueprint version history | `blueprint_id` |
| `hive_blueprint_diff` | Diff blueprint versions | `blueprint_id, from_version?, to_version?` |

**Total MCP Tools:** 60 (49 from Phases 1-13 + 11 new)

### 14.8 New Files

| File | Purpose |
|------|---------|
| `src/estimate/estimate.ts` | Swarm cost/duration estimation |
| `src/estimate/estimate.test.ts` | Estimation tests |
| `src/flight/gate-policy.ts` | Extended gate policy evaluation |
| `src/flight/gate-policy.test.ts` | Gate policy tests |
| `src/adaptive/tune.ts` | Adaptive parameter tuning |
| `src/adaptive/tune.test.ts` | Tuning tests |
| `src/nectar/inject.ts` | Manual nectar injection |
| `src/nectar/inject.test.ts` | Nectar injection tests |
| `src/blueprint/version.ts` | Blueprint version tracking |
| `src/blueprint/version.test.ts` | Version tests |

---

## Phase 15 — Guardrails, Caching & Runtime Flexibility

Phase 15 adds production safety (token budgets), development velocity (flight caching), runtime flexibility (dynamic pipeline modification), swarm comparison for replay validation, and reusable templates for recurring workflows.

### 15.1 Token Budgets & Guardrails (`src/budget/budget.ts`)

Per-swarm token budget enforcement with configurable actions when exceeded.

**Budget Lifecycle:**
1. Set budget via `hive_budget_set` (token limit + action: warn/pause/cancel)
2. After each flight completion, `checkBudget()` sums `flight_usage` tokens against budget
3. At 80% utilization, emits `swarm.budget_warning` event
4. When exceeded, takes configured action:
   - `warn` — emits `swarm.budget_exceeded`, continues execution
   - `pause` — pauses the swarm
   - `cancel` — cancels the swarm

**Beekeeper Integration:** `checkBudgetOverruns()` flags buzzing swarms that exceeded budget but only have `warn` action configured.

### 15.2 Flight Result Caching (`src/cache/cache.ts`)

Content-addressable memoization of flight outputs. Cache hits skip bee spawning entirely, dramatically reducing cost for repeated or replayed swarms.

**Cache Key:** `(blueprint_id, flight_id, SHA-256(resolved_input))`

**Cache Flow:**
1. Before claiming a flight, compute input hash from resolved template
2. Check `flight_cache` table for a matching non-expired entry
3. On hit: mark flight as done with cached output, emit `flight.cache_hit`, skip bee spawn
4. On miss: proceed normally; after completion, store result with configurable TTL

**Global Config:**
- `cache_enabled` (boolean, default false) — global toggle
- `cache_ttl_hours` (number, default 24) — default TTL for cache entries

**Beekeeper Integration:** `checkExpiredCache()` advisory check with `cleanExpiredCache` auto-remediation.

### 15.3 Swarm Comparison (`src/compare/compare.ts`)

Side-by-side analysis of two swarm runs. Works with both live swarms and archives.

**Comparison Output:**
- Swarm metadata (blueprint, task, status, timing)
- Flight-by-flight status comparison (matched by flight_id)
- Nectar diff (keys that differ between runs)
- Duration and token usage totals
- Structured markdown report

Useful for replay validation and blueprint A/B testing. Exposed via Observatory at `/api/compare/:idA/:idB`.

### 15.4 Dynamic Pipeline Operations (`src/pipeline/dynamic.ts`)

Runtime modification of live pipelines without restarting swarms.

**Flight Injection (`injectFlight`):**
- Validates swarm is buzzing/paused/blocked (not completed/cancelled/failed)
- Inserts new flight after specified `after_flight_id`
- Sets status to `pending` (if after-flight is done) or `waiting` (otherwise)
- Bumps epoch for coordinator detection
- Emits `flight.injected` event

**Flight Skip (`skipFlight`):**
- Validates flight is pending or waiting (not in_flight or done)
- Marks flight as `done` with output `SKIPPED: {reason}`
- Calls `advancePipeline()` to progress the swarm
- Emits `flight.skipped_manual` event

### 15.5 Swarm Templates (`src/swarm/templates.ts`)

Named reusable swarm configurations for recurring tasks.

**Template CRUD:**
- `saveTemplate(name, blueprintId, description?, variables?, priority?)` — validates blueprint exists, checks name uniqueness
- `listSavedTemplates()` — returns all templates sorted by usage count
- `deleteTemplateByName(name)` — removes template, emits `template.deleted`

**Template Execution:**
- `runTemplate(name, task, variableOverrides?, priorityOverride?)` — merges saved variables with overrides, calls `createSwarmFromBlueprint()`, increments usage counter

### 15.6 Schema Changes

**New Tables (2):**
- `flight_cache` (id, blueprint_id, flight_id, input_hash, output, nectar_keys, created_at, expires_at, hit_count) — with unique constraint on `(blueprint_id, flight_id, input_hash)`
- `swarm_templates` (id, name, blueprint_id, description, variables, priority, options, usage_count, created_at, updated_at)

**New Columns (4):**
- `swarms.token_budget INTEGER` — token limit (0 = unlimited)
- `swarms.budget_action TEXT` — action on exceed: warn, pause, cancel
- `flights.cache_key TEXT` — SHA-256 hash for cache lookup
- `flights.cached INTEGER DEFAULT 0` — 1 if result was from cache

**New Config Keys (4):**
- `default_token_budget` (number, default 0) — default budget for new swarms
- `default_budget_action` (string, default "warn") — default action when budget exceeded
- `cache_enabled` (boolean, default false) — global flight result cache toggle
- `cache_ttl_hours` (number, default 24) — default cache entry TTL

**New Events (7):**
- `swarm.budget_warning` — 80% of budget consumed
- `swarm.budget_exceeded` — budget exceeded, action taken
- `flight.cache_hit` — flight result served from cache
- `flight.injected` — flight dynamically added to pipeline
- `flight.skipped_manual` — flight manually skipped by user
- `template.created` — template saved
- `template.deleted` — template removed

### 15.7 New MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `hive_budget_set` | Set/update token budget for a swarm | `swarm_id, token_budget, action?` |
| `hive_budget_status` | Check budget utilization and projection | `swarm_id` |
| `hive_cache_status` | View cache statistics (hit rate, entries) | — |
| `hive_cache_clear` | Invalidate cached results | `blueprint_id?, flight_id?` |
| `hive_swarm_compare` | Compare two swarm runs with markdown diff | `swarm_a, swarm_b` |
| `hive_flight_inject` | Add a flight to a running pipeline | `swarm_id, after_flight_id, bee_id, input, expects?` |
| `hive_flight_skip` | Skip a pending/waiting flight | `flight_id, reason?` |
| `hive_template_save` | Save swarm configuration as named template | `name, blueprint_id, description?, variables?, priority?` |
| `hive_template_list` | List saved templates | — |
| `hive_template_run` | Start a swarm from a template | `template_name, task, variables?, priority?` |

**Total MCP Tools:** 70 (60 from Phases 1-14 + 10 new)

### 15.8 New Files

| File | Purpose |
|------|---------|
| `src/budget/budget.ts` | Budget enforcement engine |
| `src/budget/budget.test.ts` | Budget tests |
| `src/cache/cache.ts` | Flight result caching |
| `src/cache/cache.test.ts` | Cache tests |
| `src/compare/compare.ts` | Swarm comparison engine |
| `src/compare/compare.test.ts` | Comparison tests |
| `src/pipeline/dynamic.ts` | Dynamic pipeline operations |
| `src/pipeline/dynamic.test.ts` | Dynamic pipeline tests |
| `src/swarm/templates.ts` | Swarm template CRUD |
| `src/swarm/templates.test.ts` | Template tests |

---

## Phase 16: Hive Intelligence — Composition, Smart Routing & Anomaly Detection

5 features, 12 new files, 5 MCP tools, 3 new DB tables, 6 new columns, 4 config keys, 8 event types.

### 16.1 Dependency Visualization (`src/observatory/dag.ts`)

Computes and returns a DAG view of a swarm's flight pipeline showing nodes, edges, critical path, and parallelism ratio.

**DAG Computation (`computeDAG`):**
- Loads flights for a swarm, builds adjacency from `depends_on`
- Computes topological levels for layout
- Identifies critical path via longest-path algorithm using actual or estimated durations
- Calculates parallelism ratio (max concurrent / total flights)
- Returns `DAGView` with nodes (id, label, status, level, duration, critical), edges (from/to), criticalPath array, and parallelismRatio

**Types:** `DAGNode`, `DAGEdge`, `DAGView`
**Tool:** `hive_swarm_dag`
**API:** `GET /api/swarms/:id/dag`

### 16.2 Flight Retry Failover (`src/flight/failover.ts`)

Flights can define `failover:` array of alternative bee/model configurations. On failure with retries remaining, the failover chain provides an alternative.

**Failover Resolution (`resolveFailover`):**
- Takes a flight record, reads failover_config JSON array
- Returns the failover step at index `retry_count` (0-based) or null if exhausted

**Failover Application (`applyFailover`):**
- Sets `model_override` on the flight for the next retry
- Preserves `original_bee_id` for tracking
- If failover step has an alternative `bee_id`, updates the flight's bee assignment
- Emits `flight.failover` event with step details

**Schema:** `flights.failover_config TEXT`, `flights.model_override TEXT`, `flights.original_bee_id TEXT`
**Types:** `FailoverStep`
**Events:** `flight.failover`
**Integration:** `flight/fail.ts` (resolve failover on retry), `pollinator/spawn.ts` (check model_override), `blueprint/schema.ts` (FailoverStepSchema)

### 16.3 Bee Model Routing (`src/routing/model-router.ts`)

Selects the best model for a flight based on bee configuration, routing rules, and historical performance.

**Model Selection (`selectModel`):**
- Checks for `model_override` on flight (from failover) — returns immediately if set
- Evaluates bee's `model_routing` config rules in order
- Each rule has a condition (task_contains, retry_above, token_budget_remaining_below, flight_index_above) and a target tier
- Maps tier (fast/balanced/quality) to concrete model name
- Falls back to default model if no rules match
- Logs routing decision to `model_routing_log` table

**Schema:** New `model_routing_log` table (id, flight_id, swarm_id, bee_id, selected_tier, selected_model, reason, created_at)
**Types:** `ModelTier`, `ModelRoutingRule`, `ModelRoutingConfig`, `ModelRoutingLogRecord`
**Events:** `flight.model_routed`
**Tool:** `hive_routing_history`
**Integration:** `pollinator/spawn.ts` (call selectModel in buildSpawnRequest), `blueprint/schema.ts` (ModelRoutingConfigSchema)

### 16.4 Anomaly Detection (`src/anomaly/detector.ts`, `src/anomaly/baselines.ts`)

Statistical anomaly detection for flight performance. Computes baselines from historical data and alerts on sigma deviations.

**Baseline Computation (`baselines.ts`):**
- `computeBaseline(blueprintId, flightId, metric)` — queries historical data, computes mean/stddev/sample_count
- `refreshAllBaselines()` — recomputes baselines for all (blueprint, flight, metric) combos with ≥ min_samples
- Metrics tracked: duration_seconds, total_tokens, failure_rate

**Anomaly Checking (`detector.ts`):**
- `checkFlightAnomaly(flight, blueprintId, durationSec, tokens)` — checks actual values against baselines
- Computes sigma deviation: `(actual - mean) / stddev`
- Severity: "warning" for > anomaly_sigma_threshold (default 2.0), "critical" for > anomaly_critical_sigma (default 3.0)
- Inserts alerts into `anomaly_alerts` table
- Emits `anomaly.detected` event for critical alerts

**Alert Management:**
- `getAnomalyAlerts(filters)` — query with status/severity/blueprint filters
- `acknowledgeAnomaly(alertId)` — marks alert as acknowledged
- `getBaselines(blueprintId?)` — returns stored baselines

**Schema:** New `flight_baselines` table (unique on blueprint_id+flight_id+metric), new `anomaly_alerts` table (id, blueprint_id, flight_id, swarm_id, metric, expected_mean, expected_stddev, actual_value, sigma_deviation, severity, status, created_at)
**Config:** `anomaly_detection_enabled` (false), `anomaly_sigma_threshold` (2.0), `anomaly_critical_sigma` (3.0), `anomaly_min_samples` (10)
**Events:** `anomaly.detected`, `anomaly.acknowledged`
**Tools:** `hive_anomaly_alerts`, `hive_anomaly_acknowledge`, `hive_anomaly_baselines`
**Integration:** `flight/complete.ts` (check after completion), `beekeeper/checks.ts` (surface unacked criticals), `beekeeper/monitor.ts` (periodic baseline refresh)

### 16.5 Blueprint Composition — Sub-swarms (`src/flight/sub-swarm.ts`)

Flights can invoke another blueprint as a child swarm. The parent flight enters `sub_swarm` status while the child executes.

**Sub-swarm Launch (`launchSubSwarm`):**
- Reads `sub_swarm_config` from flight (blueprint, task_template, variables, nectar_map, timeout_minutes)
- Resolves task template with `{{nectar_key}}` substitutions from parent swarm's nectar
- Creates child swarm via `createSwarmFromBlueprint()` with parent linkage
- Sets parent flight status to `sub_swarm`, stores `child_swarm_id`
- Sets `parent_flight_id` on child swarm
- Emits `subswarm.started` event

**Sub-swarm Completion (`handleSubSwarmCompletion`):**
- Called when all flights in a child swarm complete
- Maps child swarm's nectar back to parent via `nectar_map` configuration
- Marks parent flight as `done` with completion output
- Advances parent pipeline
- Emits `subswarm.completed` event

**Sub-swarm Failure (`handleSubSwarmFailure`):**
- Marks parent flight as `failed`
- Propagates failure to parent swarm
- Emits `subswarm.failed` event

**Sub-swarm Timeout:**
- Beekeeper checks for sub_swarm flights exceeding `timeout_minutes`
- Calls `handleSubSwarmFailure` on timeout
- Emits `subswarm.timeout` event

**Sub-swarm Status (`getSubSwarmStatus`):**
- Returns parent flight info, child swarm status, child flight progress, and nectar map config

**Schema:** `flights.sub_swarm_config TEXT`, `flights.child_swarm_id TEXT`, `swarms.parent_flight_id TEXT`
**Types:** `SubSwarmConfig`, FlightStatus adds `"sub_swarm"`
**Events:** `subswarm.started`, `subswarm.completed`, `subswarm.failed`, `subswarm.timeout`
**Tool:** `hive_subswarm_status`
**Integration:** `pipeline/advance.ts` (launch sub_swarm flights), `flight/complete.ts` (propagate child completion), `beekeeper/checks.ts` (timeout detection), `beekeeper/remediate.ts` (timeoutSubSwarm handler)

### 16.6 Schema Changes

**New Tables (3):**
- `model_routing_log` (id, flight_id, swarm_id, bee_id, selected_tier, selected_model, reason, created_at)
- `flight_baselines` (id, blueprint_id, flight_id, metric, mean, stddev, sample_count, updated_at) — unique on (blueprint_id, flight_id, metric)
- `anomaly_alerts` (id, blueprint_id, flight_id, swarm_id, metric, expected_mean, expected_stddev, actual_value, sigma_deviation, severity, status, created_at)

**New Columns (6):**
- `flights.sub_swarm_config TEXT` — JSON sub-swarm configuration
- `flights.child_swarm_id TEXT` — UUID of spawned child swarm
- `flights.failover_config TEXT` — JSON array of failover steps
- `flights.model_override TEXT` — model override from failover
- `flights.original_bee_id TEXT` — original bee before failover
- `swarms.parent_flight_id TEXT` — links child swarm to parent flight

**New Config Keys (4):**
- `anomaly_detection_enabled` (boolean, default false)
- `anomaly_sigma_threshold` (number, default 2.0)
- `anomaly_critical_sigma` (number, default 3.0)
- `anomaly_min_samples` (number, default 10)

**New Events (8):**
- `flight.failover` — failover step applied on retry
- `flight.model_routed` — model routing decision made
- `anomaly.detected` — performance anomaly detected
- `anomaly.acknowledged` — anomaly alert acknowledged
- `subswarm.started` — child swarm launched
- `subswarm.completed` — child swarm completed successfully
- `subswarm.failed` — child swarm failed
- `subswarm.timeout` — child swarm exceeded timeout

### 16.7 New MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `hive_swarm_dag` | Compute DAG visualization for a swarm | `swarm_id` |
| `hive_subswarm_status` | Get sub-swarm status for a flight | `flight_id` |
| `hive_routing_history` | View model routing decisions | `flight_id?, swarm_id?, bee_id?` |
| `hive_anomaly_alerts` | List anomaly alerts | `status?, severity?, blueprint_id?` |
| `hive_anomaly_acknowledge` | Acknowledge an anomaly alert | `alert_id` |
| `hive_anomaly_baselines` | View computed baselines | `blueprint_id?` |

**Total MCP Tools:** 76 (70 from Phase 15 + 6 new)

### 16.8 New Files

| File | Purpose |
|------|---------|
| `src/observatory/dag.ts` | DAG computation and visualization |
| `src/flight/failover.ts` | Flight retry failover chain |
| `src/routing/model-router.ts` | Bee model routing engine |
| `src/anomaly/detector.ts` | Anomaly detection and alerting |
| `src/anomaly/baselines.ts` | Historical baseline computation |
| `src/flight/sub-swarm.ts` | Sub-swarm lifecycle management |

---

## Phase 17: Connected Hive — Streaming, Collaboration & Ecosystem

5 features, 16 new files, 16 MCP tools, 7 new DB tables, 1 new column, 2 config keys, 9 event types, 8 API endpoints.

### 17.1 Event Streaming — SSE (`src/observatory/stream.ts`)

Server-Sent Events endpoint for real-time event streaming with optional filters.

**SSE Server:**
- `handleStreamRequest(req, res)` — establishes SSE connection, registers client
- Supports query filters: `?swarm_id=X` and `?events=type1,type2`
- In-memory client registry with unique client IDs
- Heartbeat every 30 seconds to keep connections alive
- Auto-cleanup on client disconnect

**Broadcasting:**
- `broadcastEvent(event)` — called from `emitEvent()` in `lib/events.ts`
- Filters events per client based on swarm_id and event type filters
- Formats as SSE: `event: <type>\ndata: <json>\n\n`

**Status:**
- `getStreamStatus()` — returns connected client count and uptime
- `shutdownStream()` — closes all connections and clears registry

**Tool:** `hive_stream_status`
**API:** `GET /api/stream` (SSE endpoint), `GET /api/stream/status`
**Integration:** `lib/events.ts` (broadcasts after DB write)

### 17.2 Cross-swarm Nectar Sharing (`src/nectar/share.ts`)

Flights can import nectar from other swarms using `nectar_refs` declarations.

**Nectar Resolution (`resolveNectarRefs`):**
- Reads `nectar_refs` from flight configuration
- Supports three source types:
  - Direct swarm UUID: `{ source_swarm_id: "uuid", keys: [...] }`
  - Template variable: `{ source_swarm_id: "{{var_name}}", keys: [...] }` — resolves from current nectar
  - Latest blueprint: `{ source_swarm_id: "latest:blueprint-id", keys: [...] }` — finds most recent completed swarm
- Fetches nectar from source swarm and extracts requested keys
- Records share in `nectar_shares` table
- Emits `nectar.shared` or `nectar.share_failed` events

**Manual Resolution (`manualResolve`):**
- Explicitly resolve a nectar ref outside the claim flow
- Returns resolved key-value pairs

**Schema:** New `nectar_shares` table (id, source_swarm_id, target_swarm_id, flight_id, keys, resolved_at, created_at), `flights.nectar_refs TEXT`
**Types:** `NectarRef`, `NectarShareRecord`
**Events:** `nectar.shared`, `nectar.share_failed`
**Tools:** `hive_nectar_shares`, `hive_nectar_resolve`
**Integration:** `flight/claim.ts` (resolve refs before building input), `blueprint/schema.ts` (NectarRefSchema)

### 17.3 Blueprint Registry (`src/registry/client.ts`)

Remote JSON index of community blueprints with local caching and ratings.

**Registry Sync (`syncRegistry`):**
- Fetches JSON index from configured `registry_url`
- Checks cache freshness against `registry_cache_hours` config
- Parses `RegistryIndex` with `blueprints[]` array
- Clears and re-populates local `registry_cache` table
- Emits `registry.synced` event

**Search (`searchRegistry`):**
- Queries local cache with text matching against blueprint_id, name, description, and tags

**Install (`installFromRegistry`):**
- Looks up blueprint in cache, fetches full spec from `{registry_url}/{blueprint_id}.json`
- Installs via `db.insertBlueprint()` (INSERT OR REPLACE)

**Ratings:**
- `rateBlueprint(blueprintId, rating, comment?)` — integer 1-5 with optional comment
- `getBlueprintRatings(blueprintId)` — returns all ratings for a blueprint

**Schema:** New `registry_cache` table (unique on registry_url+blueprint_id), new `blueprint_ratings` table (id, blueprint_id, rating, comment, created_at)
**Config:** `registry_url` (""), `registry_cache_hours` (24)
**Events:** `registry.synced`, `blueprint.rated`
**Tools:** `hive_registry_search`, `hive_registry_install`, `hive_blueprint_rate`
**API:** `GET /api/registry`, `GET /api/registry/search`, `GET /api/blueprints/:id/ratings`

### 17.4 Notification Channels v2 (`src/notification/channels.ts`, `src/notification/router.ts`)

Multi-channel notifications with type-specific formatters and glob-pattern event routing.

**Channel Management (`channels.ts`):**
- `createChannel(name, type, config)` — validates config per type:
  - `webhook`: requires `url`
  - `slack`: requires `webhook_url` starting with `https://hooks.slack.com/`
  - `discord`: requires `webhook_url` starting with `https://discord.com/api/webhooks/`
  - `pagerduty`: requires `routing_key`
- `listChannels()`, `deleteChannel(channelId)`

**Event Routing (`router.ts`):**
- `createRoute(channelId, eventPattern, priority?)` — glob pattern matching (e.g., `swarm.*`, `flight.failed`)
- `routeEventToChannels(event)` — matches event type against routes, delivers to matched channels
- Type-specific formatters:
  - Slack: Block Kit format with color-coded attachments (`slack-blocks.ts`)
  - Discord: Embed format with color coding (`discord-embed.ts`)
  - PagerDuty: Events API v2 with severity inference (`pagerduty.ts`)
  - Webhook: standard JSON payload (existing format)

**Schema:** New `notification_channels` table, new `notification_routes` table
**Types:** `NotificationChannelRecord`, `NotificationRouteRecord`
**Events:** `channel.created`, `channel.deleted`, `route.created`
**Tools:** `hive_channel_create`, `hive_channel_list`, `hive_channel_delete`, `hive_route_create`, `hive_route_list`, `hive_route_delete`
**Integration:** `lib/events.ts` (route events after legacy webhook delivery)

### 17.5 Inbound Webhooks (`src/webhook/inbound.ts`, `src/webhook/tokens.ts`)

Authenticated HTTP endpoints for external systems to interact with the hive.

**Token Management (`tokens.ts`):**
- `generateToken()` — creates `hive_` prefixed 32-byte hex tokens
- `hashToken(token)` — SHA-256 hash for storage (raw tokens never stored)
- `createToken(name, permissions, expiresAt?)` — returns the raw token once
- `validateToken(token)` — checks hash match, expiry, and returns permissions
- `listTokens()` — returns token metadata (no hashes)
- `revokeToken(tokenId)` — soft-deletes by setting revoked_at

**Inbound Endpoints (`inbound.ts`):**
- `POST /api/webhook/swarm/start` — start a new swarm (permission: `swarm:start`)
- `POST /api/webhook/gate/approve` — approve a gated flight (permission: `gate:approve`)
- `POST /api/webhook/nectar/set` — set nectar on a swarm (permission: `nectar:set`)
- `POST /api/webhook/swarm/stop` — stop a running swarm (permission: `swarm:stop`)
- Bearer token authentication via `Authorization` header
- All actions logged to `webhook_audit_log` table

**Schema:** New `webhook_tokens` table (id, name, token_hash, permissions, created_at, expires_at, revoked_at), new `webhook_audit_log` table (id, token_id, action, payload, ip_address, result, created_at)
**Types:** `WebhookTokenRecord`, `WebhookAuditRecord`, `InboundWebhookPermission`
**Events:** `webhook.inbound`, `webhook.token_created`, `webhook.token_revoked`
**Tools:** `hive_webhook_token_create`, `hive_webhook_token_list`, `hive_webhook_token_revoke`, `hive_webhook_audit`
**API:** `POST /api/webhook/swarm/start`, `POST /api/webhook/gate/approve`, `POST /api/webhook/nectar/set`, `POST /api/webhook/swarm/stop`, `GET /api/webhook/audit`

### 17.6 Schema Changes

**New Tables (7):**
- `nectar_shares` (id, source_swarm_id, target_swarm_id, flight_id, keys, resolved_at, created_at)
- `registry_cache` (id, registry_url, blueprint_id, name, description, version, author, tags, synced_at) — unique on (registry_url, blueprint_id)
- `blueprint_ratings` (id, blueprint_id, rating, comment, created_at)
- `notification_channels` (id, name, type, config, enabled, created_at, updated_at)
- `notification_routes` (id, channel_id, event_pattern, priority, created_at)
- `webhook_tokens` (id, name, token_hash, permissions, created_at, expires_at, revoked_at)
- `webhook_audit_log` (id, token_id, action, payload, ip_address, result, created_at)

**New Columns (1):**
- `flights.nectar_refs TEXT` — JSON array of nectar reference declarations

**New Config Keys (2):**
- `registry_url` (string, default "") — URL of the blueprint registry
- `registry_cache_hours` (number, default 24) — cache freshness threshold

**New Events (9):**
- `nectar.shared` — nectar successfully shared between swarms
- `nectar.share_failed` — nectar sharing failed
- `registry.synced` — registry cache refreshed
- `blueprint.rated` — blueprint rating submitted
- `channel.created` — notification channel created
- `channel.deleted` — notification channel removed
- `route.created` — notification route created
- `webhook.inbound` — inbound webhook request processed
- `webhook.token_created` — webhook token generated
- `webhook.token_revoked` — webhook token revoked

### 17.7 New MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `hive_stream_status` | Get SSE stream connection status | — |
| `hive_nectar_shares` | List nectar shares for a swarm | `swarm_id` |
| `hive_nectar_resolve` | Manually resolve a nectar reference | `swarm_id, source, keys` |
| `hive_registry_search` | Search blueprint registry | `query, registry_url?` |
| `hive_registry_install` | Install blueprint from registry | `blueprint_id, registry_url?` |
| `hive_blueprint_rate` | Rate an installed blueprint | `blueprint_id, rating, comment?` |
| `hive_channel_create` | Create a notification channel | `name, type, config` |
| `hive_channel_list` | List notification channels | — |
| `hive_channel_delete` | Delete a notification channel | `channel_id` |
| `hive_route_create` | Create a notification route | `channel_id, event_pattern, priority?` |
| `hive_route_list` | List notification routes | — |
| `hive_route_delete` | Delete a notification route | `route_id` |
| `hive_webhook_token_create` | Create an inbound webhook token | `name, permissions, expires_at?` |
| `hive_webhook_token_list` | List webhook tokens | — |
| `hive_webhook_token_revoke` | Revoke a webhook token | `token_id` |
| `hive_webhook_audit` | View webhook audit log | `limit?` |

**Total MCP Tools:** 92 (76 from Phase 16 + 16 new)

### 17.8 New Files

| File | Purpose |
|------|---------|
| `src/observatory/stream.ts` | SSE event streaming server |
| `src/nectar/share.ts` | Cross-swarm nectar sharing |
| `src/registry/client.ts` | Blueprint registry client |
| `src/notification/channels.ts` | Multi-channel notification management |
| `src/notification/router.ts` | Event-to-channel routing engine |
| `src/notification/formatters/slack-blocks.ts` | Slack Block Kit formatter |
| `src/notification/formatters/discord-embed.ts` | Discord embed formatter |
| `src/notification/formatters/pagerduty.ts` | PagerDuty Events API v2 formatter |
| `src/webhook/tokens.ts` | Webhook token management |
| `src/webhook/inbound.ts` | Inbound webhook HTTP handler |

---

## Phase 18 — Hive Autonomy: Scheduling, Resilience & Quality Assurance

Phase 18 hardens the system around three pillars: temporal autonomy (scheduled recurring swarms), failure resilience (circuit breakers + dead letter queue), and quality confidence (blueprint testing + composite health scoring).

### 18.1 Scheduled Swarms (`src/scheduler/`)

Cron-based recurring swarm execution with overlap control and history tracking.

- **`cron.ts`** — Pure-function 5-field cron parser (parseCron, cronMatches, nextCronRun)
- **`manager.ts`** — Schedule CRUD: createSchedule, listSchedules, deleteSchedule, toggleSchedule, getScheduleHistory
- **`evaluate.ts`** — Evaluator for due schedules with overlap behavior (skip/queue/cancel_previous)
- **6 MCP tools:** `hive_schedule_create`, `hive_schedule_list`, `hive_schedule_delete`, `hive_schedule_toggle`, `hive_schedule_history`, `hive_schedule_evaluate`

### 18.2 Circuit Breakers (`src/resilience/circuit-breaker.ts`)

Per-bee failure isolation with three-state machine: closed → open → half_open → closed.

- **`circuitAllowsClaim()`** gates flight claims when circuit is open
- **`recordCircuitSuccess/Failure()`** tracks outcomes and transitions states
- **`transitionExpiredCircuits()`** auto-recovers open circuits after timeout
- Integrated with flight claim, complete, and fail paths
- **2 MCP tools:** `hive_circuit_list`, `hive_circuit_reset`

### 18.3 Dead Letter Queue (`src/resilience/dlq.ts`)

Flights that exhaust retries land in DLQ instead of killing the swarm. Controlled via `on_exhausted: "dlq"` on flight specs.

- **`deadLetterFlight()`** — moves flight to dead_letter status, swarm continues
- **`replayDeadLetter()`** — resets flight to pending, marks DL as replayed
- **`purgeDeadLetters()`** — marks dead letters as purged
- Pipeline advance handles dead_letter status (counts as done for completion, blocks in DAG dependents)
- **3 MCP tools:** `hive_dlq_list`, `hive_dlq_replay`, `hive_dlq_purge`

### 18.4 Blueprint Test Framework (`src/blueprint/testing/`)

Automated tests for blueprints with mocked bee outputs and nectar assertions.

- **`manager.ts`** — Test case CRUD: addTestCase, listTestCases, deleteTestCase
- **`runner.ts`** — Test execution: runBlueprintTest, runBlueprintTestSuite
- Topological sort for DAG flight order, when-clause evaluation, KEY: VALUE nectar parsing
- Assertion types: nectar_equals, nectar_contains, nectar_exists, flight_status
- **4 MCP tools:** `hive_blueprint_test_add`, `hive_blueprint_test_list`, `hive_blueprint_test_run`, `hive_blueprint_test_delete`

### 18.5 Hive Health Score (`src/observatory/health.ts`, `health-factors.ts`)

Composite 0-100 health score from 8 weighted factors with trend analysis.

- **Factors:** failure_rate (0.25), circuit_breaker (0.15), dlq (0.15), anomaly (0.10), queue_depth (0.10), budget (0.10), scheduler (0.10), bee_performance (0.05)
- Trend detection: improving (>+5), declining (<-5), stable
- Auto-snapshots during beekeeper checks
- Health alerts when score drops below configurable threshold
- **2 MCP tools:** `hive_health`, `hive_health_history`

### Schema Changes

- **7 new tables:** swarm_schedules, schedule_runs, circuit_breakers, dead_letters, blueprint_test_cases, blueprint_test_runs, hive_health_snapshots
- **1 new column:** flights.on_exhausted TEXT
- **6 config keys:** schedule_evaluation_enabled, circuit_breaker_enabled, circuit_breaker_threshold, circuit_breaker_timeout_minutes, health_alert_threshold, health_snapshot_enabled
- **14 events:** schedule.created, schedule.triggered, schedule.skipped, schedule.toggled, schedule.deleted, circuit.opened, circuit.closed, circuit.half_open, flight.dead_lettered, dlq.replayed, dlq.purged, blueprint.test_passed, blueprint.test_failed, health.snapshot, health.alert
- **6 API endpoints:** GET /api/schedules, /api/schedules/:id/history, /api/circuits, /api/dlq, /api/health, /api/health/history

### Beekeeper Integration

- **checkDueSchedules()** — advisory check for overdue schedules with evaluateSchedules remediation
- **checkOpenCircuits()** — transitions expired circuits, reports open/half-open states
- **checkDeadLetters()** — reports pending dead letters requiring attention
- **computeHealthScore()** — auto-snapshots health at end of each beekeeper cycle

### Cumulative Totals

- MCP tools: 109
- DB tables: 37+
- Source files: 150+
- Events: 70+
