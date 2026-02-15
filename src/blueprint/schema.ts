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
  completion: z.literal("all_done"),
});

const FlightSpecSchema = z.object({
  id: z.string().regex(ID_PATTERN, "Flight ID must be lowercase alphanumeric with hyphens"),
  bee: z.string().min(1),
  type: z.enum(["single", "loop"]).default("single"),
  loop: LoopConfigSchema.optional(),
  input: z.string().min(1),
  expects: z.string().min(1),
  max_retries: z.number().int().min(0).default(2),
});

const PollingConfigSchema = z.object({
  model: z.string().optional(),
  timeout_seconds: z.number().positive().optional(),
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
  });

export type ValidatedBlueprintSpec = z.infer<typeof BlueprintSpecSchema>;
