import { z } from "zod";
export const VariableBoundSchema = z.object({
  lower: z.number().nullable().optional().describe("Lower bound for the variable"),
  upper: z.number().nullable().optional().describe("Upper bound for the variable"),
});

export const ConstraintSenseSchema = z
  .enum(["<=", ">=", "="])
  .describe("Constraint sense (direction)");

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

// Sparse matrix schema
export const SparseMatrixSchema = z.object({
  rows: z
    .array(z.number().int().nonnegative())
    .describe("Row indices of non-zero coefficients (0-indexed)"),
  cols: z
    .array(z.number().int().nonnegative())
    .describe("Column indices of non-zero coefficients (0-indexed)"),
  values: z.array(z.number()).describe("Non-zero coefficient values"),
  shape: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .describe("[num_constraints, num_variables] dimensions of the full matrix"),
});

// Dense constraints schema
export const DenseConstraintsSchema = z.object({
  dense: z
    .array(z.array(z.number()))
    .min(1, "At least one constraint is required")
    .describe(
      "Dense constraint coefficient matrix (A in Ax ≤/=/≥ b). Each row represents one constraint and must have exactly as many coefficients as there are variables in the objective function.",
    ),
  sense: z
    .array(ConstraintSenseSchema)
    .describe(
      "Constraint sense array. Each element specifies the constraint direction: '<=', '>=', or '='.",
    ),
  rhs: z
    .array(z.number())
    .describe(
      "Right-hand side values for constraints. The array length must equal the number of constraint rows.",
    ),
});

// Sparse constraints schema
export const SparseConstraintsSchema = z.object({
  sparse: SparseMatrixSchema.describe(
    "Sparse matrix in COO (Coordinate) format - only specify non-zero values with their positions",
  ),
  sense: z
    .array(ConstraintSenseSchema)
    .describe(
      "Constraint sense array. Length must equal the number of constraints (first element of shape).",
    ),
  rhs: z
    .array(z.number())
    .describe(
      "Right-hand side values. Length must equal the number of constraints (first element of shape).",
    ),
});

// Union of dense and sparse formats
export const ConstraintsSchema = z
  .union([DenseConstraintsSchema, SparseConstraintsSchema])
  .describe(
    `Constraints can be specified in two formats:

1. DENSE FORMAT (for small problems):
   - dense: 2D array where each row is a constraint
   - Example: { "dense": [[1, 2, 0], [0, 1, 3]], "sense": ["<=", "<="], "rhs": [10, 15] }

2. SPARSE FORMAT (for large problems with many zeros):
   - sparse: Only specify non-zero coefficients using:
     - rows: which constraint (0-indexed)
     - cols: which variable (0-indexed)  
     - values: the coefficient value
     - shape: [num_constraints, num_variables]
   - Example: { "sparse": { "rows": [0, 0, 1, 1], "cols": [0, 1, 1, 2], "values": [1, 2, 1, 3], "shape": [2, 3] }, "sense": ["<=", "<="], "rhs": [10, 15] }
   
Use SPARSE format when: problem has > 1000 variables/constraints or < 10% non-zero coefficients.`,
  );

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
    constraints: ConstraintsSchema,
    variables: VariablesSchema.describe(
      "Variable specifications including bounds, types, and names. All arrays must have length matching the objective function.",
    ),
  })
  .superRefine((data, ctx) => {
    // Ensure matrix dimensions are consistent
    const numVars = data.objective.linear.length;
    let numConstraints: number;

    // Handle both dense and sparse formats
    if ("dense" in data.constraints) {
      // Dense format validation
      numConstraints = data.constraints.dense.length;

      // Check that all constraint rows have the same number of variables
      data.constraints.dense.forEach((row, index) => {
        if (row.length !== numVars) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Constraint row ${index} has ${row.length} coefficients but expected ${numVars} (matching the number of variables in the objective function)`,
            path: ["constraints", "dense", index],
          });
        }
      });
    } else if ("sparse" in data.constraints) {
      // Sparse format validation
      const sparse = data.constraints.sparse;
      [numConstraints] = sparse.shape;
      const matrixVars = sparse.shape[1];

      // Check shape matches problem size
      if (matrixVars !== numVars) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sparse matrix shape [${numConstraints}, ${matrixVars}] doesn't match number of variables (${numVars})`,
          path: ["constraints", "sparse", "shape"],
        });
      }

      // Check arrays have same length
      if (
        sparse.rows.length !== sparse.values.length ||
        sparse.cols.length !== sparse.values.length
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Sparse matrix arrays (rows, cols, values) must have equal length",
          path: ["constraints", "sparse"],
        });
      }

      // Check indices are within bounds
      sparse.rows.forEach((row, i) => {
        if (row >= numConstraints) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Row index ${row} exceeds number of constraints (${numConstraints})`,
            path: ["constraints", "sparse", "rows", i],
          });
        }
      });

      sparse.cols.forEach((col, i) => {
        if (col >= numVars) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Column index ${col} exceeds number of variables (${numVars})`,
            path: ["constraints", "sparse", "cols", i],
          });
        }
      });
    } else {
      // This should never happen due to union type, but TypeScript doesn't know that
      numConstraints = 0;
    }

    // Check that sense and rhs arrays have correct length
    if (data.constraints.sense.length !== numConstraints) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Constraint sense array has ${data.constraints.sense.length} elements but expected ${numConstraints} (matching the number of constraints)`,
        path: ["constraints", "sense"],
      });
    }

    if (data.constraints.rhs.length !== numConstraints) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Constraint rhs array has ${data.constraints.rhs.length} elements but expected ${numConstraints} (matching the number of constraints)`,
        path: ["constraints", "rhs"],
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
    
    CONSTRAINT MATRIX FORMATS:
    - DENSE: Use 'dense' property with 2D array for small problems or dense matrices
    - SPARSE: Use 'sparse' property with COO format for large/sparse problems
    
    DIMENSION CONSISTENCY REQUIREMENTS:
    - All constraint rows (dense) must have same number of coefficients as variables in objective
    - For sparse format: shape[1] must equal number of variables in objective
    - constraints.sense length must equal number of constraints
    - constraints.rhs length must equal number of constraints
    - variables.bounds length must equal number of variables (objective coefficients)
    - variables.types length (if provided) must equal number of variables
    - variables.names length (if provided) must equal number of variables
    
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
