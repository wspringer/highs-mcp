import { test, expect } from "vitest";
import { z } from "zod";
import { OptimizationArgsSchema } from "../../src/schemas.js";
import { encode } from "../../src/encode.js";
import { decode } from "../../src/decode.js";
import highsLoader from "highs";

test("solves simple convex QP problem with HiGHS", async () => {
  const highs = await highsLoader();
  
  // Simple QP: minimize x^2 + y^2 subject to x + y >= 2
  const problem: z.infer<typeof OptimizationArgsSchema>["problem"] = {
    sense: "minimize",
    objective: {
      quadratic: {
        format: "dense",
        matrix: [[2, 0], [0, 2]]  // Q = 2*I (scaled by 2 because of 0.5 factor)
      }
    },
    constraints: {
      dense: [[1, 1]],
      sense: [">="],
      rhs: [2]
    },
    variables: [
      {},
      {}
    ]
  };

  const lpString = encode(problem);
  console.log("LP String for QP:", lpString);
  
  const result = highs.solve(lpString);
  const decoded = decode(result, problem);
  
  expect(decoded.status).toBe("optimal");
  if (decoded.status === "optimal") {
    expect(decoded.objective_value).toBeCloseTo(2.0); // Minimum at x=y=1
    expect(decoded.solution).toHaveLength(2);
    expect(decoded.solution[0]).toBeCloseTo(1.0);
    expect(decoded.solution[1]).toBeCloseTo(1.0);
  }
});

test("solves QP with linear and quadratic terms", async () => {
  const highs = await highsLoader();
  
  // minimize x^2 + y^2 - x - 2y subject to x + y <= 2, x,y >= 0
  const problem: z.infer<typeof OptimizationArgsSchema>["problem"] = {
    sense: "minimize",
    objective: {
      linear: [-1, -2],
      quadratic: {
        format: "dense",
        matrix: [[2, 0], [0, 2]]
      }
    },
    constraints: {
      dense: [[1, 1]],
      sense: ["<="],
      rhs: [2]
    },
    variables: [
      { lb: 0 },
      { lb: 0 }
    ]
  };

  const lpString = encode(problem);
  const result = highs.solve(lpString);
  const decoded = decode(result, problem);
  
  expect(decoded.status).toBe("optimal");
  if (decoded.status === "optimal") {
    // Optimal solution should be around x=0.5, y=1
    expect(decoded.solution[0]).toBeCloseTo(0.5, 2);
    expect(decoded.solution[1]).toBeCloseTo(1.0, 2);
  }
});

test("solves portfolio optimization with sparse matrix", async () => {
  const highs = await highsLoader();
  
  // Portfolio optimization: minimize risk (variance) with return constraint
  const problem: z.infer<typeof OptimizationArgsSchema>["problem"] = {
    sense: "minimize",
    objective: {
      // Covariance matrix (symmetric, positive definite) - doubled for 0.5 factor
      quadratic: {
        format: "sparse",
        rows: [0, 0, 0, 1, 1, 2],
        cols: [0, 1, 2, 1, 2, 2],
        values: [0.2, 0.04, 0.02, 0.1, 0.04, 0.16], // Doubled values
        shape: [3, 3]
      }
    },
    constraints: {
      dense: [
        [1, 1, 1],        // Sum of weights = 1
        [0.1, 0.12, 0.08] // Expected return >= 0.1
      ],
      sense: ["=", ">="],
      rhs: [1, 0.1]
    },
    variables: [
      { name: "stock_a", lb: 0 },
      { name: "stock_b", lb: 0 },
      { name: "stock_c", lb: 0 }
    ]
  };

  const lpString = encode(problem);
  console.log("LP String for portfolio:", lpString);
  
  const result = highs.solve(lpString);
  const decoded = decode(result, problem);
  
  expect(decoded.status).toBe("optimal");
  if (decoded.status === "optimal") {
    // Check that weights sum to 1
    const sum = decoded.solution.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
    
    // Check that all weights are non-negative
    decoded.solution.forEach(weight => {
      expect(weight).toBeGreaterThanOrEqual(-1e-6); // Allow small numerical errors
    });
  }
});