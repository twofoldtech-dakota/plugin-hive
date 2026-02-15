---
name: hive-drive
description: "Autonomously drive a Plugin Hive swarm from start to finish"
allowed-tools: Task, TaskOutput, mcp__hive__hive_swarm_start, mcp__hive__hive_swarm_status, mcp__hive__hive_swarm_summary, mcp__hive__hive_blueprint_list, mcp__hive__hive_pollinate, mcp__hive__hive_beekeeper_check, mcp__hive__hive_check_epoch, mcp__hive__hive_swarm_list
---

# /hive-drive — Autonomous Swarm Coordinator

Drive a swarm from start to finish autonomously. This skill enters a wave-based loop: pollinate, spawn bees as background Task agents, monitor via TaskOutput, re-pollinate, and repeat until the swarm completes or fails.

**Arguments:** `$ARGUMENTS`

## Modes

### Mode 1: Start and drive a new swarm
**Pattern:** `/hive-drive <blueprint_id> <task...>`

Example: `/hive-drive feature-dev Add user authentication system`

1. Call `mcp__hive__hive_swarm_start` with the blueprint_id and task.
2. Enter the **Wave Loop** with the returned swarm_id.

### Mode 2: Drive an existing swarm
**Pattern:** `/hive-drive <number>`

Example: `/hive-drive 3`

1. Call `mcp__hive__hive_swarm_summary` with the swarm_id resolved from the number.
2. Verify the swarm is `buzzing`. If not, report the status and exit.
3. Enter the **Wave Loop** with the swarm_id.

### Mode 3: No arguments
**Pattern:** `/hive-drive`

1. Call `mcp__hive__hive_swarm_list` with status=buzzing.
2. If buzzing swarms exist, show them and ask the user which to drive.
3. If no buzzing swarms, show available blueprints and offer to start one.

---

## Wave Loop

The core execution loop. Repeat until the swarm completes, fails, or safety limits are hit.

### Variables
- `wave` — Counter starting at 1 (max 50)
- `empty_polls` — Counter of consecutive empty pollinates (max 3)
- `last_epoch` — Last seen epoch value (start at -1)
- `swarm_id` — The swarm being driven

### Each Wave

**Step 1: Check epoch (skip if first wave)**
- Call `mcp__hive__hive_check_epoch`.
- If epoch equals `last_epoch`, sleep 5 seconds and re-check (up to 3 times).
- Update `last_epoch`.

**Step 2: Pollinate**
- Call `mcp__hive__hive_pollinate` with the swarm_id.
- If zero spawns returned, increment `empty_polls`.
- If spawns returned, reset `empty_polls` to 0.

**Step 3: Spawn bees**
- For each SpawnRequest in the pollinate result:
  - Use the `Task` tool to spawn a background agent:
    - `subagent_type`: "general-purpose"
    - `run_in_background`: true
    - `prompt`: The SpawnRequest's `prompt` field
    - `model`: The SpawnRequest's `model` field
    - `max_turns`: The SpawnRequest's `maxTurns` field
  - Report: "Dispatched bee `{beeId}`: {flightDescription}"

**Step 4: Monitor background tasks**
- Wait for all spawned tasks to complete using `TaskOutput` with block=true.
- Report completion of each bee.

**Step 5: Check swarm status**
- Call `mcp__hive__hive_swarm_summary` with the swarm_id.
- Report progress: flight pipeline position, cell completion ratio.
- If swarm status is `completed`: report success and **exit loop**.
- If swarm status is `failed`: report failure and **exit loop**.
- If swarm status is `cancelled`: report and **exit loop**.

**Step 6: Safety checks**
- If `wave >= 50`: report max waves reached, suggest `/hive-drive {number}` to continue. **Exit loop.**
- If `empty_polls >= 3`: call `mcp__hive__hive_beekeeper_check`. If beekeeper finds issues, reset `empty_polls` to 0. If no issues found, report possible stall and **exit loop.**

**Step 7: Next wave**
- Increment `wave`.
- Go to Step 1.

---

## Output Format

Report progress after each wave:

```
Wave {N} — Swarm #{number}
  Dispatched: {count} bee(s)
  Pipeline: {done}/{total} flights done
  Cells: {done}/{total} done
  Status: {status}
```

On completion:
```
Swarm #{number} completed successfully!
  Task: {task}
  Waves: {count}
  Flights: {total} completed
  Cells: {done}/{total} done
```

On failure:
```
Swarm #{number} failed.
  Task: {task}
  Waves: {count}
  Use `/hive resume {number}` to retry failed flights.
```

---

## Important Rules

- This skill DRIVES swarms autonomously. It spawns bee subagents and waits for them.
- Do NOT write code, edit files, or run bash commands yourself. Bees do the work.
- Do NOT call `hive_flight_claim`, `hive_flight_complete`, or `hive_flight_fail` directly. Bees call these.
- Always spawn bees as **background** Task agents so they run in parallel.
- Use `hive_check_epoch` to avoid expensive polls when nothing has changed.
- If a bee task returns an error, the flight will be marked failed by the bee. Continue the loop.
- Maximum 50 waves per invocation. The user can re-run `/hive-drive {number}` to continue.
