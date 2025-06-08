import { describe, it, expect } from "vitest";
import { encode } from "./encode.js";
import type { z } from "zod";
import type { ProblemSchema } from "./schemas.js";

describe("encode", () => {
  describe("with dense constraints", () => {
    it("should encode a simple minimization problem", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "minimize",
        objective: {
          linear: [2, 3, 4],
        },
        constraints: {
          dense: [
            [1, 2, 3],
            [4, 5, 6],
          ],
          sense: ["<=", ">="],
          rhs: [10, 20],
        },
        variables: [{ name: "x" }, { name: "y" }, { name: "z" }],
      };

      const result = encode(problem);

      expect(result).toContain("Minimize");
      expect(result).toContain("obj: 2 x + 3 y + 4 z");
      expect(result).toContain("Subject To");
      expect(result).toContain("c1: x + 2 y + 3 z <= 10");
      expect(result).toContain("c2: 4 x + 5 y + 6 z >= 20");
      expect(result).toContain("Bounds");
      expect(result).toContain("0 <= x <= +inf");
      expect(result).toContain("0 <= y <= +inf");
      expect(result).toContain("0 <= z <= +inf");
      expect(result).toContain("End");
    });

    it("should encode a maximization problem with mixed variable types", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "maximize",
        objective: {
          linear: [10, -5, 0, 3],
        },
        constraints: {
          dense: [[1, 1, 1, 1]],
          sense: ["="],
          rhs: [100],
        },
        variables: [
          { name: "a", type: "cont" },
          { name: "b", type: "int", lb: -10, ub: 10 },
          { name: "c", type: "bin" },
          { name: "d", type: "cont", lb: 5 },
        ],
      };

      const result = encode(problem);

      expect(result).toContain("Maximize");
      expect(result).toContain("obj: 10 a - 5 b + 3 d");
      expect(result).toContain("c1: a + b + c + d = 100");
      expect(result).toContain("-10 <= b <= 10");
      expect(result).toContain("0 <= c <= 1");
      expect(result).toContain("5 <= d <= +inf");
      expect(result).toContain("General\n b");
      expect(result).toContain("Binary\n c");
    });

    it("should handle coefficients of 1 and -1 correctly", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "minimize",
        objective: {
          linear: [1, -1, 2, -2],
        },
        constraints: {
          dense: [[1, -1, 0, 0]],
          sense: ["<="],
          rhs: [5],
        },
        variables: [{}, {}, {}, {}],
      };

      const result = encode(problem);

      expect(result).toContain("obj: x1 - x2 + 2 x3 - 2 x4");
      expect(result).toContain("c1: x1 - x2 <= 5");
    });

    it("should handle free variables", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "minimize",
        objective: {
          linear: [1],
        },
        constraints: {
          dense: [[1]],
          sense: [">="],
          rhs: [0],
        },
        variables: [{ name: "x", lb: -Infinity, ub: Infinity }],
      };

      const result = encode(problem);

      expect(result).toContain("Bounds");
      expect(result).toContain("x free");
    });
  });

  describe("with sparse constraints", () => {
    it("should encode a sparse constraint matrix", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "minimize",
        objective: {
          linear: [1, 2, 3, 4],
        },
        constraints: {
          sparse: {
            rows: [0, 0, 1, 1, 2],
            cols: [0, 2, 1, 3, 0],
            values: [2, 3, 1, 4, 5],
            shape: [3, 4],
          },
          sense: ["<=", ">=", "="],
          rhs: [10, 20, 15],
        },
        variables: [{}, {}, {}, {}],
      };

      const result = encode(problem);

      expect(result).toContain("Subject To");
      expect(result).toContain("c1: 2 x1 + 3 x3 <= 10");
      expect(result).toContain("c2: x2 + 4 x4 >= 20");
      expect(result).toContain("c3: 5 x1 = 15");
    });

    it("should handle empty rows in sparse format", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "maximize",
        objective: {
          linear: [1, 1],
        },
        constraints: {
          sparse: {
            rows: [0],
            cols: [1],
            values: [2],
            shape: [2, 2],
          },
          sense: ["<=", "<="],
          rhs: [5, 0],
        },
        variables: [{}, {}],
      };

      const result = encode(problem);

      expect(result).toContain("c1: 2 x2 <= 5");
      expect(result).toContain("c2:  <= 0");
    });
  });

  describe("edge cases", () => {
    it("should handle zero coefficients in objective", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "minimize",
        objective: {
          linear: [0, 5, 0, -3],
        },
        constraints: {
          dense: [[1, 1, 1, 1]],
          sense: ["="],
          rhs: [10],
        },
        variables: [{}, {}, {}, {}],
      };

      const result = encode(problem);

      expect(result).toContain("obj: 5 x2 - 3 x4");
      expect(result).not.toContain("0 x");
    });

    it("should handle binary variables with custom bounds", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "maximize",
        objective: {
          linear: [1],
        },
        constraints: {
          dense: [[1]],
          sense: ["<="],
          rhs: [1],
        },
        variables: [{ type: "bin", lb: 0.5, ub: 0.8 }],
      };

      const result = encode(problem);

      expect(result).toContain("0.5 <= x1 <= 0.8");
      expect(result).toContain("Binary\n x1");
    });

    it("should handle all variables being integer or binary", () => {
      const problem: z.infer<typeof ProblemSchema> = {
        sense: "minimize",
        objective: {
          linear: [1, 2, 3],
        },
        constraints: {
          dense: [[1, 1, 1]],
          sense: ["<="],
          rhs: [10],
        },
        variables: [{ type: "int" }, { type: "bin" }, { type: "int" }],
      };

      const result = encode(problem);

      expect(result).toContain("General\n x1 x3");
      expect(result).toContain("Binary\n x2");
    });
  });
});
