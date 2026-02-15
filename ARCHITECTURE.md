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

*This architecture document is the foundation for building Plugin Hive. Each section maps directly to implementation work in the phased plan above.*
