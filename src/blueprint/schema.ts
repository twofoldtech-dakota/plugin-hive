import { z } from "zod";

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

const BeeRoleSchema = z.enum([
  "analysis",
  "coding",
  "verification",
  "testing",
  "pr",
  "scanning",
]);

const ChamberConfigSchema = z.object({
  base_dir: z.string().min(1),
  files: z.record(z.string(), z.string()),
});

const BeeSpecSchema = z.object({
  id: z.string().regex(ID_PATTERN, "Bee ID must be lowercase alphanumeric with hyphens"),
  name: z.string().optional(),
  description: z.string().optional(),
  role: BeeRoleSchema,
  model: z.string().optional(),
  polling_model: z.string().optional(),
  timeout_seconds: z.number().positive().optional(),
  chamber: ChamberConfigSchema,
});

const LoopConfigSchema = z.object({
  over: z.string().min(1),
  verify_each: z.boolean().optional(),
  verify_flight: z.string().optional(),
  completion: z.literal("all_done"),
});

const RetryStrategySchema = z.object({
  type: z.enum(["immediate", "linear", "exponential"]),
  delay_seconds: z.number().positive().optional(),
});

const FlightSpecSchema = z.object({
  id: z.string().regex(ID_PATTERN, "Flight ID must be lowercase alphanumeric with hyphens"),
  bee: z.string().min(1),
  type: z.enum(["single", "loop"]).default("single"),
  loop: LoopConfigSchema.optional(),
  depends_on: z.array(z.string().min(1)).optional(),
  when: z.string().optional(),
  gate: z.enum(["approval"]).optional(),
  retry_strategy: RetryStrategySchema.optional(),
  input: z.string().min(1),
  expects: z.string().min(1),
  max_retries: z.number().int().min(0).default(2),
});

const PollingConfigSchema = z.object({
  model: z.string().optional(),
  timeout_seconds: z.number().positive().optional(),
});

const InputSpecSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().optional(),
  default: z.string().optional(),
  description: z.string().optional(),
});

const BeekeeperConfigSchema = z.object({
  stuck_flight_minutes: z.number().positive().optional(),
  stalled_swarm_minutes: z.number().positive().optional(),
  verification_loop_max: z.number().int().positive().optional(),
  cell_stuck_minutes: z.number().positive().optional(),
});

export const BlueprintSpecSchema = z
  .object({
    id: z.string().regex(ID_PATTERN, "Blueprint ID must be lowercase alphanumeric with hyphens"),
    name: z.string().optional(),
    version: z.number().int().positive().optional(),
    description: z.string().optional(),
    polling: PollingConfigSchema.optional(),
    bees: z.array(BeeSpecSchema).min(1, "Blueprint must define at least one bee"),
    flights: z.array(FlightSpecSchema).min(1, "Blueprint must define at least one flight"),
    nectar: z.record(z.string(), z.string()).optional(),
    notifications: z
      .object({
        url: z.string().url().optional(),
      })
      .optional(),
    inputs: z.array(InputSpecSchema).optional(),
    beekeeper: BeekeeperConfigSchema.optional(),
  })
  .superRefine((blueprint, ctx) => {
    // Validate bee IDs are unique
    const beeIds = new Set<string>();
    for (const bee of blueprint.bees) {
      if (beeIds.has(bee.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate bee ID: ${bee.id}`,
          path: ["bees"],
        });
      }
      beeIds.add(bee.id);
    }

    // Validate flight IDs are unique
    const flightIds = new Set<string>();
    for (const flight of blueprint.flights) {
      if (flightIds.has(flight.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate flight ID: ${flight.id}`,
          path: ["flights"],
        });
      }
      flightIds.add(flight.id);
    }

    // Validate each flight references a valid bee
    for (const flight of blueprint.flights) {
      if (!beeIds.has(flight.bee)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Flight "${flight.id}" references unknown bee "${flight.bee}"`,
          path: ["flights"],
        });
      }
    }

    // Validate loop flights have loop config
    for (const flight of blueprint.flights) {
      if (flight.type === "loop" && !flight.loop) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Loop flight "${flight.id}" must have a loop configuration`,
          path: ["flights"],
        });
      }
    }

    // Validate depends_on references (DAG mode)
    const hasAnyDeps = blueprint.flights.some(f => f.depends_on && f.depends_on.length > 0);
    if (hasAnyDeps) {
      for (const flight of blueprint.flights) {
        if (flight.depends_on) {
          for (const dep of flight.depends_on) {
            if (!flightIds.has(dep)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Flight "${flight.id}" depends_on unknown flight "${dep}"`,
                path: ["flights"],
              });
            }
            if (dep === flight.id) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Flight "${flight.id}" cannot depend on itself`,
                path: ["flights"],
              });
            }
          }
        }
      }

      // Kahn's algorithm for cycle detection
      const inDegree = new Map<string, number>();
      const adj = new Map<string, string[]>();
      for (const flight of blueprint.flights) {
        inDegree.set(flight.id, 0);
        adj.set(flight.id, []);
      }
      for (const flight of blueprint.flights) {
        if (flight.depends_on) {
          for (const dep of flight.depends_on) {
            if (adj.has(dep)) {
              adj.get(dep)!.push(flight.id);
              inDegree.set(flight.id, (inDegree.get(flight.id) ?? 0) + 1);
            }
          }
        }
      }

      const queue: string[] = [];
      for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
      }
      let visited = 0;
      while (queue.length > 0) {
        const node = queue.shift()!;
        visited++;
        for (const neighbor of adj.get(node) ?? []) {
          const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDeg);
          if (newDeg === 0) queue.push(neighbor);
        }
      }
      if (visited < blueprint.flights.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Flight dependency graph contains a cycle",
          path: ["flights"],
        });
      }
    }
  });

export type ValidatedBlueprintSpec = z.infer<typeof BlueprintSpecSchema>;
