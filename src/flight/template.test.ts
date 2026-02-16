import { describe, it, expect } from "vitest";
import { resolveNectar } from "./template.js";

describe("resolveNectar", () => {
  it("substitutes a simple variable", () => {
    expect(resolveNectar("Hello {{name}}", { name: "Bee" })).toBe("Hello Bee");
  });

  it("leaves unresolved variables as-is", () => {
    expect(resolveNectar("Hello {{name}}", {})).toBe("Hello {{name}}");
  });

  it("substitutes multiple variables", () => {
    const result = resolveNectar("{{a}} and {{b}}", { a: "foo", b: "bar" });
    expect(result).toBe("foo and bar");
  });

  it("handles adjacent variables with no separator", () => {
    expect(resolveNectar("{{a}}{{b}}", { a: "1", b: "2" })).toBe("12");
  });

  it("substitutes the same variable multiple times", () => {
    expect(resolveNectar("{{x}} {{x}}", { x: "hi" })).toBe("hi hi");
  });

  it("includes conditional block when key is present", () => {
    const result = resolveNectar("before {{#msg}}content{{/msg}} after", { msg: "yes" });
    expect(result).toBe("before content after");
  });

  it("removes conditional block when key is absent", () => {
    const result = resolveNectar("before {{#msg}}content{{/msg}} after", {});
    expect(result).toBe("before  after");
  });

  it("removes conditional block when key is empty string", () => {
    const result = resolveNectar("before {{#msg}}content{{/msg}} after", { msg: "" });
    expect(result).toBe("before  after");
  });

  it("substitutes variables inside conditional blocks", () => {
    const result = resolveNectar("{{#feedback}}Feedback: {{feedback}}{{/feedback}}", { feedback: "Good" });
    expect(result).toBe("Feedback: Good");
  });

  it("handles multiline templates", () => {
    const template = "Line 1: {{task}}\nLine 2: {{detail}}";
    const result = resolveNectar(template, { task: "Build", detail: "widget" });
    expect(result).toBe("Line 1: Build\nLine 2: widget");
  });

  it("handles multiline conditional blocks", () => {
    const template = "{{#notes}}Notes:\n{{notes}}{{/notes}}";
    const result = resolveNectar(template, { notes: "see above" });
    expect(result).toBe("Notes:\nsee above");
  });

  it("returns template unchanged when nectar is empty", () => {
    expect(resolveNectar("no vars here", {})).toBe("no vars here");
  });

  it("returns empty string when template is empty", () => {
    expect(resolveNectar("", { a: "b" })).toBe("");
  });

  it("ignores extra nectar keys not in template", () => {
    expect(resolveNectar("{{a}}", { a: "1", b: "2", c: "3" })).toBe("1");
  });

  it("handles special regex characters in values", () => {
    expect(resolveNectar("{{val}}", { val: "foo $1 bar" })).toBe("foo $1 bar");
  });

  // ── Filter tests (Phase 9) ─────────────────────────────────────────

  describe("filters", () => {
    it("applies default filter when key is missing", () => {
      expect(resolveNectar("{{missing|default:none}}", {})).toBe("none");
    });

    it("applies default filter when key is empty", () => {
      expect(resolveNectar("{{key|default:fallback}}", { key: "" })).toBe("fallback");
    });

    it("uses actual value over default when present", () => {
      expect(resolveNectar("{{key|default:fallback}}", { key: "real" })).toBe("real");
    });

    it("applies json filter", () => {
      expect(resolveNectar("{{key|json}}", { key: "hello world" })).toBe('"hello world"');
    });

    it("applies json filter for missing key", () => {
      expect(resolveNectar("{{key|json}}", {})).toBe('""');
    });

    it("applies upper filter", () => {
      expect(resolveNectar("{{key|upper}}", { key: "hello" })).toBe("HELLO");
    });

    it("applies lower filter", () => {
      expect(resolveNectar("{{key|lower}}", { key: "HELLO" })).toBe("hello");
    });

    it("returns placeholder for unknown filter", () => {
      expect(resolveNectar("{{key|unknown}}", {})).toBe("{{key|unknown}}");
    });

    it("handles default with empty arg", () => {
      expect(resolveNectar("{{key|default:}}", {})).toBe("");
    });

    it("mixes filters with regular substitution", () => {
      const result = resolveNectar("{{a}} {{b|upper}} {{c|default:N/A}}", {
        a: "hello",
        b: "world",
      });
      expect(result).toBe("hello WORLD N/A");
    });
  });
});
