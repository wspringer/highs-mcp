import { describe, it, expect } from "vitest";
import { decode, type DecodedResult } from "./decode.js";
import type { z } from "zod";
import type { ProblemSchema } from "./schemas.js";

// Type guard functions
function isOptimalResult(result: DecodedResult): result is Extract<DecodedResult, { status: "optimal" }> {
  return result.status === "optimal";
}

function isNonOptimalResult(result: DecodedResult): result is Extract<DecodedResult, { message: string }> {
  return result.status !== "optimal";
}

describe("decode", () => {
  // Helper function to create a test problem
  const createTestProblem = (numVars: number, varNames?: string[]): z.infer<typeof ProblemSchema> => ({
    sense: "minimize",
    objective: {
      linear: Array(numVars).fill(1),
    },
    constraints: {
      dense: [Array(numVars).fill(1)],
      sense: ["<="],
      rhs: [10],
    },
    variables: Array(numVars).fill(null).map((_, i) => ({
      name: varNames?.[i] || undefined,
    })),
  });

  describe("optimal results", () => {
    it("should decode optimal solution with all values present", () => {
      const problem = createTestProblem(3, ["x", "y", "z"]);
      const highsResult = {
        Status: "Optimal",
        ObjectiveValue: 6.5,
        Columns: {
          x: { Primal: 1.5, Dual: 0.2 },
          y: { Primal: 2.0, Dual: 0.0 },
          z: { Primal: 3.0, Dual: -0.1 },
        },
        Rows: [
          { Dual: 0.5 },
        ],
      };

      const result = decode(highsResult, problem);

      expect(result).toEqual({
        status: "optimal",
        objective_value: 6.5,
        solution: [1.5, 2.0, 3.0],
        dual_solution: [0.5],
        variable_duals: [0.2, 0.0, -0.1],
      });
    });

    it("should handle missing dual values", () => {
      const problem = createTestProblem(2, ["a", "b"]);
      const highsResult = {
        Status: "Optimal",
        ObjectiveValue: 10,
        Columns: {
          a: { Primal: 5 },
          b: { Primal: 5, Dual: 0.3 },
        },
        Rows: [
          {},
        ],
      };

      const result = decode(highsResult, problem);

      expect(result).toEqual({
        status: "optimal",
        objective_value: 10,
        solution: [5, 5],
        dual_solution: [0],
        variable_duals: [0, 0.3],
      });
    });

    it("should use default variable names when not provided", () => {
      const problem = createTestProblem(3);
      const highsResult = {
        Status: "Optimal",
        ObjectiveValue: 15,
        Columns: {
          x1: { Primal: 3, Dual: 0.1 },
          x2: { Primal: 4, Dual: 0.2 },
          x3: { Primal: 8, Dual: 0.3 },
        },
        Rows: [
          { Dual: 1.5 },
        ],
      };

      const result = decode(highsResult, problem);

      expect(result).toEqual({
        status: "optimal",
        objective_value: 15,
        solution: [3, 4, 8],
        dual_solution: [1.5],
        variable_duals: [0.1, 0.2, 0.3],
      });
    });

    it("should handle missing columns in result", () => {
      const problem = createTestProblem(3, ["x", "y", "z"]);
      const highsResult = {
        Status: "Optimal",
        ObjectiveValue: 5,
        Columns: {
          x: { Primal: 5, Dual: 0.5 },
          // y is missing - should default to 0
          z: { Primal: 0, Dual: 0 },
        },
        Rows: [
          { Dual: 2.0 },
        ],
      };

      const result = decode(highsResult, problem);

      expect(result).toEqual({
        status: "optimal",
        objective_value: 5,
        solution: [5, 0, 0],
        dual_solution: [2.0],
        variable_duals: [0.5, 0, 0],
      });
    });

    it("should handle multiple constraints", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "maximize",
        objective: {
          linear: [2, 3],
        },
        constraints: {
          dense: [
            [1, 0],
            [0, 1],
            [1, 1],
          ],
          sense: ["<=", "<=", "<="],
          rhs: [4, 6, 8],
        },
        variables: [{ name: "x" }, { name: "y" }],
      };

      const highsResult = {
        Status: "Optimal",
        ObjectiveValue: 18,
        Columns: {
          x: { Primal: 2, Dual: 0 },
          y: { Primal: 6, Dual: 0 },
        },
        Rows: [
          { Dual: 0 },
          { Dual: 3 },
          { Dual: 0 },
        ],
      };

      const result = decode(highsResult, problem);

      expect(result).toEqual({
        status: "optimal",
        objective_value: 18,
        solution: [2, 6],
        dual_solution: [0, 3, 0],
        variable_duals: [0, 0],
      });
    });
  });

  describe("non-optimal results", () => {
    it("should decode infeasible status", () => {
      const problem = createTestProblem(2);
      const highsResult = {
        Status: "Infeasible",
        ObjectiveValue: 0,
        Columns: {},
        Rows: [],
      };

      const result = decode(highsResult, problem);

      expect(result).toEqual({
        status: "infeasible",
        message: "Problem status: Infeasible",
        objective_value: 0,
      });
    });

    it("should decode unbounded status", () => {
      const problem = createTestProblem(1);
      const highsResult = {
        Status: "Unbounded",
        ObjectiveValue: -Infinity,
        Columns: {},
        Rows: [],
      };

      const result = decode(highsResult, problem);

      expect(result).toEqual({
        status: "unbounded",
        message: "Problem status: Unbounded",
        objective_value: -Infinity,
      });
    });

    it("should normalize status strings with spaces", () => {
      const problem = createTestProblem(1);
      const highsResult = {
        Status: "Time Limit Reached",
        ObjectiveValue: 42,
        Columns: {},
        Rows: [],
      };

      const result = decode(highsResult, problem);

      expect(result).toEqual({
        status: "time_limit_reached",
        message: "Problem status: Time Limit Reached",
        objective_value: 42,
      });
    });

    it("should handle unknown status", () => {
      const problem = createTestProblem(1);
      const highsResult = {
        Status: "Unknown Error",
        ObjectiveValue: NaN,
        Columns: {},
        Rows: [],
      };

      const result = decode(highsResult, problem);

      expect(result).toEqual({
        status: "unknown_error",
        message: "Problem status: Unknown Error",
        objective_value: NaN,
      });
    });
  });

  describe("type safety", () => {
    it("should allow type narrowing for optimal results", () => {
      const problem = createTestProblem(1);
      const highsResult = {
        Status: "Optimal",
        ObjectiveValue: 5,
        Columns: {
          x1: { Primal: 5, Dual: 0 },
        },
        Rows: [{ Dual: 1 }],
      };

      const result = decode(highsResult, problem);

      expect(result.status).toBe("optimal");
      if (isOptimalResult(result)) {
        // TypeScript now knows this is an OptimalResult
        expect(result.solution).toEqual([5]);
        expect(result.dual_solution).toEqual([1]);
        expect(result.variable_duals).toEqual([0]);
      }
    });

    it("should allow type narrowing for non-optimal results", () => {
      const problem = createTestProblem(1);
      const highsResult = {
        Status: "Infeasible",
        ObjectiveValue: 0,
        Columns: {},
        Rows: [],
      };

      const result = decode(highsResult, problem);

      expect(result.status).toBe("infeasible");
      if (isNonOptimalResult(result)) {
        // TypeScript now knows this is a NonOptimalResult
        expect(result.message).toBe("Problem status: Infeasible");
        // Verify solution properties don't exist
        expect('solution' in result).toBe(false);
        expect('dual_solution' in result).toBe(false);
        expect('variable_duals' in result).toBe(false);
      }
    });
  });
});