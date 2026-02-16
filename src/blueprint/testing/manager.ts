import * as db from "../../db.js";
import { safeJsonParse } from "../../lib/json.js";
import type { BlueprintTestCaseRecord, TestAssertion } from "../../types.js";

export type TestCaseCreateResult =
  | { success: true; test_case: BlueprintTestCaseRecord }
  | { success: false; error: string };

export function addTestCase(params: {
  blueprint_id: string;
  name: string;
  description?: string;
  mock_inputs: Record<string, string>;
  mock_outputs: Record<string, string>;
  assertions: TestAssertion[];
}): TestCaseCreateResult {
  // Validate blueprint exists
  const bp = db.getBlueprint(params.blueprint_id);
  if (!bp) {
    return { success: false, error: `Blueprint "${params.blueprint_id}" not found` };
  }

  // Validate assertions
  for (const assertion of params.assertions) {
    if (!["nectar_equals", "nectar_contains", "nectar_exists", "flight_status"].includes(assertion.type)) {
      return { success: false, error: `Invalid assertion type: "${assertion.type}"` };
    }
    if (!assertion.target) {
      return { success: false, error: "Each assertion must have a target" };
    }
    if ((assertion.type === "nectar_equals" || assertion.type === "nectar_contains" || assertion.type === "flight_status") && !assertion.expected) {
      return { success: false, error: `Assertion type "${assertion.type}" requires an expected value` };
    }
  }

  const testCase = db.insertTestCase(
    params.blueprint_id,
    params.name,
    JSON.stringify(params.mock_inputs),
    JSON.stringify(params.mock_outputs),
    JSON.stringify(params.assertions),
    params.description,
  );

  return { success: true, test_case: testCase };
}

export function listTestCasesQuery(blueprintId: string): BlueprintTestCaseRecord[] {
  return db.listTestCases(blueprintId);
}

export function deleteTestCaseById(testCaseId: string): { success: boolean; error?: string } {
  const tc = db.getTestCase(testCaseId);
  if (!tc) {
    return { success: false, error: `Test case "${testCaseId}" not found` };
  }
  db.deleteTestCase(testCaseId);
  return { success: true };
}
