import { describe, it, expect, beforeEach } from "vitest";
import { parseBlueprint, loadBlueprint, discoverBundledBlueprints } from "./loader.js";

describe("parseBlueprint", () => {
  it("parses valid YAML blueprint", () => {
    const yaml = `
id: my-bp
bees:
  - id: worker
    role: coding
    chamber:
      base_dir: worker
      files: {}
flights:
  - id: do-work
    bee: worker
    type: single
    input: "Build: {{task}}"
    expects: "STATUS: done"
    max_retries: 2
`;
    const result = parseBlueprint(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.blueprint.id).toBe("my-bp");
      expect(result.blueprint.bees).toHaveLength(1);
      expect(result.blueprint.flights).toHaveLength(1);
    }
  });

  it("rejects invalid YAML syntax", () => {
    const result = parseBlueprint("key: [unclosed bracket");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid YAML");
    }
  });

  it("rejects missing required fields", () => {
    const yaml = `
bees: []
flights: []
`;
    const result = parseBlueprint(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("validation failed");
    }
  });

  it("rejects empty bees array", () => {
    const yaml = `
id: bad-bp
bees: []
flights:
  - id: f1
    bee: worker
    type: single
    input: test
    expects: done
    max_retries: 1
`;
    const result = parseBlueprint(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("validation failed");
    }
  });

  it("rejects flight referencing nonexistent bee", () => {
    const yaml = `
id: bad-ref
bees:
  - id: worker
    role: coding
    chamber:
      base_dir: w
      files: {}
flights:
  - id: f1
    bee: ghost
    type: single
    input: test
    expects: done
    max_retries: 1
`;
    const result = parseBlueprint(yaml);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("ghost");
    }
  });

  it("rejects invalid bee role", () => {
    const yaml = `
id: bad-role
bees:
  - id: worker
    role: wizardry
    chamber:
      base_dir: w
      files: {}
flights:
  - id: f1
    bee: worker
    type: single
    input: test
    expects: done
    max_retries: 1
`;
    const result = parseBlueprint(yaml);
    expect(result.success).toBe(false);
  });

  it("parses loop flight with verify_each config", () => {
    const yaml = `
id: loop-bp
bees:
  - id: worker
    role: coding
    chamber:
      base_dir: w
      files: {}
  - id: inspector
    role: verification
    chamber:
      base_dir: i
      files: {}
flights:
  - id: implement
    bee: worker
    type: loop
    loop:
      over: cells
      verify_each: true
      verify_flight: verify
      completion: all_done
    input: "Do: {{current_cell}}"
    expects: "STATUS: done"
    max_retries: 3
  - id: verify
    bee: inspector
    type: single
    input: "Check: {{current_cell}}"
    expects: "STATUS: pass/retry"
    max_retries: 2
`;
    const result = parseBlueprint(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      const loopFlight = result.blueprint.flights.find(f => f.type === "loop");
      expect(loopFlight?.loop?.verify_each).toBe(true);
      expect(loopFlight?.loop?.verify_flight).toBe("verify");
    }
  });

  it("accepts optional fields", () => {
    const yaml = `
id: full-bp
name: Full Blueprint
version: 2
description: A detailed blueprint
bees:
  - id: worker
    name: Super Worker
    description: Does everything
    role: coding
    model: opus
    timeout_seconds: 300
    chamber:
      base_dir: worker
      files:
        README.md: "# Hello"
flights:
  - id: f1
    bee: worker
    type: single
    input: test
    expects: done
    max_retries: 1
nectar:
  language: typescript
`;
    const result = parseBlueprint(yaml);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.blueprint.name).toBe("Full Blueprint");
      expect(result.blueprint.version).toBe(2);
      expect(result.blueprint.bees[0].name).toBe("Super Worker");
      expect(result.blueprint.nectar?.language).toBe("typescript");
    }
  });
});

describe("loadBlueprint", () => {
  it("returns error for nonexistent blueprint", () => {
    const result = loadBlueprint("nonexistent-xyz-12345");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("loads bundled blueprints", () => {
    // The test setup sets CLAUDE_PLUGIN_ROOT to the project root,
    // where bundled blueprints live in blueprints/
    const bundled = discoverBundledBlueprints();
    if (bundled.length > 0) {
      const result = loadBlueprint(bundled[0].id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.blueprint.id).toBe(bundled[0].id);
      }
    }
  });
});

describe("discoverBundledBlueprints", () => {
  it("discovers bundled blueprints from plugin root", () => {
    const blueprints = discoverBundledBlueprints();
    // We know the plugin ships with at least feature-dev, bug-fix, security-audit
    expect(blueprints.length).toBeGreaterThanOrEqual(1);
    const ids = blueprints.map(b => b.id);
    expect(ids).toContain("feature-dev");
  });
});
