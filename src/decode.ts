import { z } from "zod";
import { ProblemSchema } from "./schemas.js";

/**
 * Represents a column (variable) in the HiGHS solver result.
 * Contains the primal (solution) and dual values for the variable.
 */
interface HighsColumn {
  /** The primal value (solution value) of the variable */
  Primal?: number;
  /** The dual value (reduced cost) of the variable */
  Dual?: number;
}

/**
 * Represents a row (constraint) in the HiGHS solver result.
 * Contains the dual value for the constraint.
 */
interface HighsRow {
  /** The dual value (shadow price) of the constraint */
  Dual?: number;
}

/**
 * The raw result object returned by the HiGHS solver.
 */
interface HighsResult {
  /** The solver status (e.g., "Optimal", "Infeasible", "Unbounded") */
  Status: string;
  /** The objective function value at the current solution */
  ObjectiveValue: number;
  /** Map of variable names to their column data */
  Columns: Record<string, HighsColumn>;
  /** Array of constraint row data */
  Rows: HighsRow[];
}

/**
 * Result structure for problems that reached optimal solution.
 * Contains complete solution information including primal and dual values.
 */
interface OptimalResult {
  /** Indicates the problem was solved to optimality */
  status: "optimal";
  /** The optimal objective function value */
  objective_value: number;
  /** Solution values for each variable in order */
  solution: number[];
  /** Dual values (shadow prices) for each constraint */
  dual_solution: number[];
  /** Dual values (reduced costs) for each variable */
  variable_duals: number[];
}

/**
 * Result structure for problems that did not reach optimal solution.
 * Includes status information and any available objective value.
 */
interface NonOptimalResult {
  /** The solver status (normalized to lowercase with underscores) */
  status: string;
  /** Human-readable message about the problem status */
  message: string;
  /** The objective value (may not be meaningful for infeasible problems) */
  objective_value: number;
}

/**
 * Union type representing all possible decoded results.
 * Use type guards to distinguish between optimal and non-optimal results.
 */
export type DecodedResult = OptimalResult | NonOptimalResult;

/**
 * Decodes the raw HiGHS solver result into a structured format.
 * 
 * This function extracts solution values, dual values, and status information
 * from the HiGHS result object and organizes them into a consistent structure
 * that can be easily consumed by API clients.
 * 
 * For optimal solutions, it provides:
 * - Solution values for each variable
 * - Dual values (shadow prices) for each constraint
 * - Dual values (reduced costs) for each variable
 * 
 * For non-optimal solutions, it provides:
 * - Normalized status string
 * - Human-readable message
 * - Objective value (if available)
 * 
 * @param result - The raw result object from HiGHS solver
 * @param problem - The original problem definition (needed to map variable names)
 * @returns A decoded result object with consistent structure
 * 
 * @example
 * ```typescript
 * const result = highs.solve(lpString, options);
 * const decoded = decode(result, problem);
 * 
 * if (decoded.status === "optimal") {
 *   console.log("Solution:", decoded.solution);
 *   console.log("Objective:", decoded.objective_value);
 * } else {
 *   console.log("Failed:", decoded.message);
 * }
 * ```
 */
export function decode(
  result: HighsResult,
  problem: z.infer<typeof ProblemSchema>
): DecodedResult {
  if (result.Status === "Optimal") {
    // Extract solution values and dual values for each variable
    const solutionValues: number[] = [];
    const dualValues: number[] = [];

    // Iterate through variables in the same order as defined in the problem
    for (let i = 0; i < problem.objective.linear.length; i++) {
      // Use custom name if provided, otherwise default to x1, x2, etc.
      const varName = problem.variables[i].name || `x${i + 1}`;
      const column = result.Columns[varName];
      
      if (column) {
        // Extract primal (solution) and dual (reduced cost) values
        solutionValues.push(column.Primal || 0);
        dualValues.push(column.Dual || 0);
      } else {
        // Variable not found in result - default to 0
        solutionValues.push(0);
        dualValues.push(0);
      }
    }

    // Extract dual values (shadow prices) for constraints
    const constraintDuals = result.Rows.map((row) => row.Dual || 0);

    return {
      status: "optimal",
      objective_value: result.ObjectiveValue,
      solution: solutionValues,
      dual_solution: constraintDuals,
      variable_duals: dualValues,
    };
  } else {
    // Handle non-optimal results (infeasible, unbounded, etc.)
    return {
      // Normalize status to lowercase with underscores for consistency
      status: result.Status.toLowerCase().replace(/\s+/g, "_"),
      message: `Problem status: ${result.Status}`,
      objective_value: result.ObjectiveValue,
    };
  }
}