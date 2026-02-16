import * as db from "../../db.js";
import { safeJsonParse } from "../../lib/json.js";
import { emitEvent } from "../../lib/events.js";
import { evaluateWhen } from "../../flight/when.js";
import type {
  BlueprintSpec,
  FlightSpec,
  BlueprintTestCaseRecord,
  TestAssertion,
  TestAssertionResult,
} from "../../types.js";

interface TestRunResult {
  test_case_id: string;
  test_case_name: string;
  passed: boolean;
  assertions: TestAssertionResult[];
  duration_ms: number;
  nectar_state: Record<string, string>;
  flight_statuses: Record<string, string>;
}

/**
 * Run a single blueprint test case.
 */
export function runBlueprintTest(testCaseId: string): { success: boolean; result?: TestRunResult; error?: string } {
  const testCase = db.getTestCase(testCaseId);
  if (!testCase) {
    return { success: false, error: `Test case "${testCaseId}" not found` };
  }

  const bp = db.getBlueprint(testCase.blueprint_id);
  if (!bp) {
    return { success: false, error: `Blueprint "${testCase.blueprint_id}" not found` };
  }

  const spec = safeJsonParse<BlueprintSpec | null>(bp.spec, null);
  if (!spec) {
    return { success: false, error: `Failed to parse blueprint spec` };
  }

  const startTime = Date.now();
  const result = executeTest(spec, testCase);
  const durationMs = Date.now() - startTime;

  // Persist result
  db.insertTestRun(
    testCase.blueprint_id,
    testCase.id,
    result.passed,
    JSON.stringify(result.assertions),
    durationMs,
  );

  // Emit event
  emitEvent({
    eventType: result.passed ? "blueprint.test_passed" : "blueprint.test_failed",
    payload: {
      blueprint_id: testCase.blueprint_id,
      test_case_id: testCase.id,
      test_case_name: testCase.name,
      passed: result.passed,
      assertion_count: result.assertions.length,
    },
  });

  return {
    success: true,
    result: { ...result, duration_ms: durationMs, test_case_id: testCase.id, test_case_name: testCase.name },
  };
}

/**
 * Run all test cases for a blueprint.
 */
export function runBlueprintTestSuite(blueprintId: string): {
  success: boolean;
  results?: TestRunResult[];
  summary?: { total: number; passed: number; failed: number };
  error?: string;
} {
  const testCases = db.listTestCases(blueprintId);
  if (testCases.length === 0) {
    return { success: false, error: `No test cases found for blueprint "${blueprintId}"` };
  }

  const results: TestRunResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const runResult = runBlueprintTest(tc.id);
    if (runResult.success && runResult.result) {
      results.push(runResult.result);
      if (runResult.result.passed) passed++;
      else failed++;
    }
  }

  return {
    success: true,
    results,
    summary: { total: testCases.length, passed, failed },
  };
}

/**
 * Execute a test case against a blueprint spec (pure logic).
 */
function executeTest(
  spec: BlueprintSpec,
  testCase: BlueprintTestCaseRecord,
): { passed: boolean; assertions: TestAssertionResult[]; nectar_state: Record<string, string>; flight_statuses: Record<string, string> } {
  const mockInputs = safeJsonParse<Record<string, string>>(testCase.mock_inputs, {});
  const mockOutputs = safeJsonParse<Record<string, string>>(testCase.mock_outputs, {});
  const assertions = safeJsonParse<TestAssertion[]>(testCase.assertions, []);

  // Build initial nectar from mock_inputs
  const nectar: Record<string, string> = { ...mockInputs };
  const flightStatuses: Record<string, string> = {};

  // Compute topological order (reuse simple sort: respect depends_on)
  const orderedFlights = topologicalSort(spec.flights);

  // Simulate each flight
  for (const flight of orderedFlights) {
    // Evaluate when clause
    if (flight.when) {
      if (!evaluateWhen(flight.when, nectar)) {
        flightStatuses[flight.id] = "skipped";
        continue;
      }
    }

    // Check if this flight has mock output
    const mockOutput = mockOutputs[flight.id];
    if (mockOutput) {
      // Parse KEY: VALUE lines from mock output into nectar
      const lines = mockOutput.split("\n");
      for (const line of lines) {
        const match = line.match(/^([A-Z_]+):\s*(.+)$/);
        if (match) {
          nectar[match[1].toLowerCase()] = match[2].trim();
        }
      }
      flightStatuses[flight.id] = "done";
    } else {
      // No mock output — flight is "done" with no output
      flightStatuses[flight.id] = "done";
    }
  }

  // Evaluate assertions
  const assertionResults: TestAssertionResult[] = assertions.map(assertion =>
    evaluateAssertion(assertion, nectar, flightStatuses),
  );

  const allPassed = assertionResults.every(r => r.passed);

  return {
    passed: allPassed,
    assertions: assertionResults,
    nectar_state: nectar,
    flight_statuses: flightStatuses,
  };
}

function evaluateAssertion(
  assertion: TestAssertion,
  nectar: Record<string, string>,
  flightStatuses: Record<string, string>,
): TestAssertionResult {
  const target = assertion.target;
  const expected = assertion.expected ?? "";

  switch (assertion.type) {
    case "nectar_equals": {
      const actual = nectar[target];
      const display = actual ?? "(undefined)";
      const passed = actual === expected;
      return {
        assertion,
        passed,
        actual: display,
        message: passed
          ? "nectar[" + target + "] equals " + expected
          : "nectar[" + target + "] expected " + expected + ", got " + display,
      };
    }
    case "nectar_contains": {
      const actual = nectar[target];
      const display = actual ?? "(undefined)";
      const passed = actual !== undefined && actual.includes(expected);
      return {
        assertion,
        passed,
        actual: display,
        message: passed
          ? "nectar[" + target + "] contains " + expected
          : "nectar[" + target + "] does not contain " + expected,
      };
    }
    case "nectar_exists": {
      const passed = target in nectar;
      return {
        assertion,
        passed,
        actual: passed ? nectar[target] : "(undefined)",
        message: passed
          ? "nectar[" + target + "] exists"
          : "nectar[" + target + "] does not exist",
      };
    }
    case "flight_status": {
      const actual = flightStatuses[target];
      const display = actual ?? "(unknown)";
      const passed = actual === expected;
      return {
        assertion,
        passed,
        actual: display,
        message: passed
          ? "flight " + target + " status is " + expected
          : "flight " + target + " expected status " + expected + ", got " + display,
      };
    }
    default:
      return {
        assertion,
        passed: false,
        message: "Unknown assertion type: " + assertion.type,
      };
  }
}

/**
 * Simple topological sort respecting depends_on.
 */
function topologicalSort(flights: FlightSpec[]): FlightSpec[] {
  const flightMap = new Map(flights.map(f => [f.id, f]));
  const visited = new Set<string>();
  const result: FlightSpec[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const flight = flightMap.get(id);
    if (!flight) return;
    if (flight.depends_on) {
      for (const dep of flight.depends_on) {
        visit(dep);
      }
    }
    result.push(flight);
  }

  for (const flight of flights) {
    visit(flight.id);
  }

  return result;
}
