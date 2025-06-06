import { z } from "zod";
export const VariableBoundSchema = z.object({
  lower: z.number().nullable().optional().describe("Lower bound for the variable"),
  upper: z.number().nullable().optional().describe("Upper bound for the variable"),
});

export const ConstraintBoundSchema = z.object({
  lower: z.number().nullable().optional().describe("Lower bound for the constraint"),
  upper: z.number().nullable().optional().describe("Upper bound for the constraint"),
});

export const VariableTypeSchema = z
  .enum(["continuous", "integer", "binary"])
  .describe("Type of variable");

export const ObjectiveSchema = z.object({
  linear: z
    .array(z.number())
    .min(1, "At least one objective coefficient is required")
    .describe(
      "Linear coefficients for each variable. The length of this array defines the number of variables in the problem. All other arrays (constraint matrix rows, variable bounds, types, and names) must match this length.",
    ),
});

export const ConstraintsSchema = z.object({
  matrix: z
    .array(z.array(z.number()))
    .min(1, "At least one constraint is required")
    .describe(
      "Constraint coefficient matrix (A in Ax ≤/=/≥ b). Each row represents one constraint and must have exactly as many coefficients as there are variables in the objective function. Dimension mismatch will cause validation errors.",
    ),
  bounds: z
    .array(ConstraintBoundSchema)
    .describe(
      "Bounds for each constraint row. The array length must equal the number of rows in the constraint matrix. Use null for unbounded constraints.",
    ),
});

export const VariablesSchema = z.object({
  bounds: z
    .array(VariableBoundSchema)
    .describe(
      "Bounds for each variable. The array length must equal the number of variables in the objective function. Use null for unbounded variables.",
    ),
  types: z
    .array(VariableTypeSchema)
    .optional()
    .describe(
      "Type of each variable (optional, defaults to continuous). If provided, the array length must equal the number of variables in the objective function. Valid values: 'continuous', 'integer', 'binary'.",
    ),
  names: z
    .array(z.string())
    .optional()
    .describe(
      "Names for each variable (optional). If provided, the array length must equal the number of variables in the objective function.",
    ),
});

export const ProblemSchema = z
  .object({
    sense: z
      .enum(["minimize", "maximize"])
      .describe("Optimization direction. Valid values: 'minimize' or 'maximize'."),
    objective: ObjectiveSchema.describe(
      "Objective function coefficients. At least one coefficient is required.",
    ),
    constraints: ConstraintsSchema.describe(
      "Constraint specifications. At least one constraint is required. Common errors: dimension mismatch between constraint matrix and objective coefficients.",
    ),
    variables: VariablesSchema.describe(
      "Variable specifications including bounds, types, and names. All arrays must have length matching the objective function.",
    ),
  })
  .superRefine((data, ctx) => {
    // Ensure matrix dimensions are consistent
    const numVars = data.objective.linear.length;
    const numConstraints = data.constraints.matrix.length;

    // Check that all constraint rows have the same number of variables
    data.constraints.matrix.forEach((row, index) => {
      if (row.length !== numVars) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Constraint row ${index} has ${row.length} coefficients but expected ${numVars} (matching the number of variables in the objective function)`,
          path: ["constraints", "matrix", index],
        });
      }
    });

    // Check that bounds arrays have correct length
    if (data.constraints.bounds.length !== numConstraints) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Constraint bounds array has ${data.constraints.bounds.length} elements but expected ${numConstraints} (matching the number of constraint rows)`,
        path: ["constraints", "bounds"],
      });
    }

    if (data.variables.bounds.length !== numVars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Variable bounds array has ${data.variables.bounds.length} elements but expected ${numVars} (matching the number of variables in the objective function)`,
        path: ["variables", "bounds"],
      });
    }

    if (data.variables.types && data.variables.types.length !== numVars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Variable types array has ${data.variables.types.length} elements but expected ${numVars} (matching the number of variables in the objective function)`,
        path: ["variables", "types"],
      });
    }

    if (data.variables.names && data.variables.names.length !== numVars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Variable names array has ${data.variables.names.length} elements but expected ${numVars} (matching the number of variables in the objective function)`,
        path: ["variables", "names"],
      });
    }
  });

export const OptionsSchema = z
  .object({
    time_limit: z
      .number()
      .positive()
      .optional()
      .describe(
        "Time limit in seconds. Must be positive. Solver will terminate with 'Time limit reached' status if exceeded.",
      ),
    presolve: z
      .enum(["off", "choose", "on"])
      .optional()
      .describe("Presolve option. Valid values: 'off', 'choose', 'on'. Default is 'choose'."),
    solver: z
      .enum(["simplex", "choose", "ipm", "pdlp"])
      .optional()
      .describe(
        "Solver method. Valid values: 'simplex', 'choose', 'ipm', 'pdlp'. Default is 'choose'.",
      ),
  })
  .optional()
  .describe("Solver options. Controls solver behavior and termination criteria.");

export const OptimizationArgsSchema = z.object({
  problem: ProblemSchema.describe(`The optimization problem specification. 
    
    DIMENSION CONSISTENCY REQUIREMENTS:
    - All constraint rows must have the same number of coefficients as variables in the objective
    - constraints.bounds length must equal the number of constraints (matrix rows)
    - variables.bounds length must equal the number of variables (objective coefficients)
    - variables.types length (if provided) must equal the number of variables
    - variables.names length (if provided) must equal the number of variables
    
    POSSIBLE SOLVER STATUSES:
    - 'Optimal': Solution found successfully
    - 'Infeasible': No solution exists that satisfies all constraints
    - 'Unbounded': Objective can be improved infinitely (check for missing constraints)
    - 'Time limit reached': Solver exceeded the specified time_limit
    - 'Iteration limit reached': Solver exceeded internal iteration limits
    - 'Numerical error': Numerical difficulties encountered
    
    INPUT VALIDATION ERRORS:
    - At least one objective coefficient is required
    - At least one constraint is required
    - All arrays must have consistent dimensions
    - Time limit must be positive if specified
    - Variable types must be one of: 'continuous', 'integer', 'binary'
    - Sense must be either 'minimize' or 'maximize'`),
  options: OptionsSchema,
});
