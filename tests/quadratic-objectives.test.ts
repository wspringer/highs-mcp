import { test, expect } from "vitest";
import { z } from "zod";
import { OptimizationArgsSchema } from "../src/schemas.js";
import { encode } from "../src/encode.js";

test("schema validates quadratic objective with dense format", () => {
  const problem = {
    problem: {
      sense: "minimize",
      objective: {
        linear: [1, 2],
        quadratic: {
          format: "dense",
          matrix: [[2, 1], [1, 4]]
        }
      },
      constraints: {
        dense: [[1, 1]],
        sense: [">="],
        rhs: [1]
      },
      variables: [
        {},
        {}
      ]
    }
  };

  const result = OptimizationArgsSchema.safeParse(problem);
  expect(result.success).toBe(true);
});

test("schema validates quadratic objective with sparse format", () => {
  const problem = {
    problem: {
      sense: "minimize",
      objective: {
        linear: [1, 2, 3],
        quadratic: {
          format: "sparse",
          rows: [0, 0, 1, 2],
          cols: [0, 1, 1, 2],
          values: [2.0, 1.0, 4.0, 8.0],
          shape: [3, 3]
        }
      },
      constraints: {
        dense: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        sense: [">=", ">=", ">="],
        rhs: [0, 0, 0]
      },
      variables: [
        {},
        {},
        {}
      ]
    }
  };

  const result = OptimizationArgsSchema.safeParse(problem);
  expect(result.success).toBe(true);
});

test("schema rejects quadratic objective with integer variables", () => {
  const problem = {
    problem: {
      sense: "minimize",
      objective: {
        linear: [1, 2],
        quadratic: {
          format: "dense",
          matrix: [[2, 1], [1, 4]]
        }
      },
      constraints: {
        dense: [[1, 1]],
        sense: [">="],
        rhs: [1]
      },
      variables: [
        { type: "int" },
        {}
      ]
    }
  };

  const result = OptimizationArgsSchema.safeParse(problem);
  expect(result.success).toBe(false);
  expect(result.error?.issues[0].message).toContain("MIQP not supported");
});

test("schema allows quadratic-only objective", () => {
  const problem = {
    problem: {
      sense: "minimize",
      objective: {
        quadratic: {
          format: "dense",
          matrix: [[2, 1], [1, 4]]
        }
      },
      constraints: {
        dense: [[1, 1]],
        sense: [">="],
        rhs: [1]
      },
      variables: [
        {},
        {}
      ]
    }
  };

  const result = OptimizationArgsSchema.safeParse(problem);
  expect(result.success).toBe(true);
});

test("encode generates correct LP format for dense quadratic", () => {
  const problem: z.infer<typeof OptimizationArgsSchema>["problem"] = {
    sense: "minimize",
    objective: {
      linear: [1, 2],
      quadratic: {
        format: "dense",
        matrix: [[2, 1], [1, 4]]
      }
    },
    constraints: {
      dense: [[1, 1]],
      sense: [">="],
      rhs: [1]
    },
    variables: [
      {},
      {}
    ]
  };

  const lpString = encode(problem);
  
  expect(lpString).toContain("Minimize");
  expect(lpString).toContain("obj: x1 + 2 x2 + [ 2 x1^2 + 2 x1 * x2 + 4 x2^2 ] / 2");
  expect(lpString).toContain("c1: x1 + x2 >= 1");
});

test("encode generates correct LP format for sparse quadratic", () => {
  const problem: z.infer<typeof OptimizationArgsSchema>["problem"] = {
    sense: "minimize",
    objective: {
      linear: [0, 0, 0],
      quadratic: {
        format: "sparse",
        rows: [0, 1, 1, 2],
        cols: [0, 0, 1, 2],
        values: [2.0, 1.0, 4.0, 8.0],
        shape: [3, 3]
      }
    },
    constraints: {
      dense: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      sense: [">=", ">=", ">="],
      rhs: [0, 0, 0]
    },
    variables: [
      {},
      {},
      {}
    ]
  };

  const lpString = encode(problem);
  
  expect(lpString).toContain("Minimize");
  expect(lpString).toContain("obj: [ 2 x1^2 + x2 * x1 + 4 x2^2 + 8 x3^2 ] / 2");
});

test("encode handles quadratic-only objective", () => {
  const problem: z.infer<typeof OptimizationArgsSchema>["problem"] = {
    sense: "minimize",
    objective: {
      quadratic: {
        format: "dense",
        matrix: [[1, 0], [0, 1]]
      }
    },
    constraints: {
      dense: [[1, 0], [0, 1]],
      sense: [">=", ">="],
      rhs: [0, 0]
    },
    variables: [
      {},
      {}
    ]
  };

  const lpString = encode(problem);
  
  expect(lpString).toContain("Minimize");
  expect(lpString).toContain("obj: [ x1^2 + x2^2 ] / 2");
});

test("encode handles mixed positive and negative quadratic coefficients", () => {
  const problem: z.infer<typeof OptimizationArgsSchema>["problem"] = {
    sense: "maximize",
    objective: {
      linear: [-1, -2],
      quadratic: {
        format: "dense",
        matrix: [[-2, 1], [1, -4]]
      }
    },
    constraints: {
      dense: [[1, 1]],
      sense: ["<="],
      rhs: [10]
    },
    variables: [
      { name: "a" },
      { name: "b" }
    ]
  };

  const lpString = encode(problem);
  
  expect(lpString).toContain("Maximize");
  expect(lpString).toContain("obj: - a - 2 b + [ -2 a^2 + 2 a * b + -4 b^2 ] / 2");
});