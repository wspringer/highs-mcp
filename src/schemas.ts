import { z } from "zod";

export const ConstraintSenseSchema = z
  .enum(["<=", ">=", "="])
  .describe("Constraint sense (direction)");

// New compact variable type schema
export const CompactVariableTypeSchema = z
  .enum(["cont", "int", "bin"])
  .describe("Type of variable (compact format)");

// New compact variable schema
export const CompactVariableSchema = z.object({
  name: z.string().optional().describe("Variable name (optional, defaults to x1, x2, etc.)"),
  lb: z.number().optional().describe("Lower bound (optional, defaults to 0)"),
  ub: z
    .number()
    .optional()
    .describe("Upper bound (optional, defaults to +∞, except binary gets 1)"),
  type: CompactVariableTypeSchema.optional().describe(
    "Variable type (optional, defaults to 'cont')",
  ),
});

// Quadratic objective schemas
const QuadraticSparseSchema = z.object({
  format: z.literal("sparse"),
  rows: z
    .array(z.number().int().nonnegative())
    .describe("Row indices of quadratic matrix (0-indexed)"),
  cols: z
    .array(z.number().int().nonnegative())
    .describe("Column indices of quadratic matrix (0-indexed)"),
  values: z.array(z.number()).describe("Values of quadratic matrix Q"),
  shape: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .describe("[num_variables, num_variables] dimensions of Q matrix"),
});

const QuadraticDenseSchema = z.object({
  format: z.literal("dense"),
  matrix: z.array(z.array(z.number())).describe("Dense symmetric matrix Q"),
});

const QuadraticObjectiveSchema = z
  .union([QuadraticSparseSchema, QuadraticDenseSchema])
  .refine((data) => {
    if (data.format === "sparse") {
      return (
        data.shape[0] === data.shape[1] && // Must be square
        data.rows.length === data.cols.length && // Array lengths match
        data.rows.length === data.values.length && // Array lengths match
        data.rows.every((r) => r < data.shape[0]) && // Row indices in bounds
        data.cols.every((c) => c < data.shape[1])
      ); // Col indices in bounds
    } else {
      const matrix = data.matrix;
      return (
        matrix.length > 0 && // Non-empty
        matrix.length === matrix[0].length && // Square matrix
        matrix.every((row) => row.length === matrix.length)
      ); // All rows same length
    }
  }, "Quadratic matrix must be square with valid dimensions");

export const ObjectiveSchema = z
  .object({
    linear: z
      .array(z.number())
      .optional()
      .describe(
        "Linear coefficients for each variable (c in: minimize c^T x + 0.5 x^T Q x). If not provided but quadratic is present, defaults to zeros. The length defines the number of variables when quadratic is not present.",
      ),
    quadratic: QuadraticObjectiveSchema.optional().describe(
      "Quadratic terms Q for convex QP (minimize 0.5 x^T Q x + c^T x). Q must be positive semidefinite. Supports both sparse and dense formats.",
    ),
  })
  .refine(
    (data) => {
      // At least one of linear or quadratic must be present
      if (!data.linear && !data.quadratic) {
        return false;
      }
      // If both are present, check dimensions match
      if (data.linear && data.quadratic) {
        const numVars = data.linear.length;
        const qSize =
          data.quadratic.format === "sparse"
            ? data.quadratic.shape[0]
            : data.quadratic.matrix.length;
        return numVars === qSize;
      }
      return true;
    },
    {
      message:
        "At least one of 'linear' or 'quadratic' must be provided. When both are present, dimensions must match.",
    },
  );

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

export const VariablesSchema = z
  .array(CompactVariableSchema)
  .min(1, "At least one variable is required")
  .describe(
    `Variables in compact, self-contained format. Each variable object can specify:
    
- name: Optional variable name (defaults to x1, x2, etc.)
- lb: Lower bound (defaults to 0)
- ub: Upper bound (defaults to +∞, except binary gets 1)
- type: "cont" | "int" | "bin" (defaults to "cont")

Example: [{ name: "profit", ub: 100 }, { type: "bin" }, {}]`,
  );

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
    // Determine number of variables from objective
    let numVars: number;
    if (data.objective.linear) {
      numVars = data.objective.linear.length;
    } else if (data.objective.quadratic) {
      numVars =
        data.objective.quadratic.format === "sparse"
          ? data.objective.quadratic.shape[0]
          : data.objective.quadratic.matrix.length;
    } else {
      // This should be caught by ObjectiveSchema refinement, but just in case
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot determine number of variables from objective",
        path: ["objective"],
      });
      return;
    }

    // Check for QP with integer variables
    if (data.objective.quadratic && data.variables.some((v) => v.type && v.type !== "cont")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Quadratic objectives are not supported with integer or binary variables (MIQP not supported by HiGHS)",
        path: ["objective", "quadratic"],
      });
    }

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

    // Check that variables array length matches objective length
    if (data.variables.length !== numVars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Variables array has ${data.variables.length} elements but expected ${numVars} (matching the number of variables in the objective function)`,
        path: ["variables"],
      });
    }
  });

export const OptionsSchema = z
  .object({
    // Solver Control
    time_limit: z
      .number()
      .positive()
      .optional()
      .describe(
        "Maximum time allowed for solving in seconds. Solver will terminate with 'Time limit reached' status if exceeded.",
      ),
    presolve: z
      .enum(["off", "choose", "on"])
      .optional()
      .describe("Controls the presolve phase. Default is 'choose'."),
    solver: z
      .enum(["simplex", "choose", "ipm", "pdlp"])
      .optional()
      .describe(
        "Selects the solver algorithm. For MIP/QP problems, integrality constraints or quadratic terms are ignored if specific solver is chosen.",
      ),
    parallel: z
      .enum(["off", "choose", "on"])
      .optional()
      .describe("Controls parallel execution. Default is 'choose'."),
    run_crossover: z
      .enum(["off", "choose", "on"])
      .optional()
      .describe("Whether to run crossover after IPM. Default is 'choose'."),
    threads: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Number of threads to use. 0 means automatic. Default is 0."),
    random_seed: z
      .number()
      .int()
      .min(0)
      .max(2147483647)
      .optional()
      .describe("Random seed for reproducibility."),

    // Tolerances
    primal_feasibility_tolerance: z
      .number()
      .min(1e-10)
      .optional()
      .describe("Tolerance for primal feasibility. Default is 1e-7."),
    dual_feasibility_tolerance: z
      .number()
      .min(1e-10)
      .optional()
      .describe("Tolerance for dual feasibility. Default is 1e-7."),
    ipm_optimality_tolerance: z
      .number()
      .min(1e-12)
      .optional()
      .describe("Optimality tolerance for IPM solver. Default is 1e-8."),
    infinite_cost: z
      .number()
      .min(1e15)
      .optional()
      .describe("Values >= this are treated as infinite cost. Default is 1e20."),
    infinite_bound: z
      .number()
      .min(1e15)
      .optional()
      .describe("Values >= this are treated as infinite bounds. Default is 1e20."),
    objective_bound: z
      .number()
      .optional()
      .describe("Objective bound for termination of dual simplex. Default is inf."),
    objective_target: z
      .number()
      .optional()
      .describe("Objective target for termination of MIP solver. Default is -inf."),

    // Simplex Options
    simplex_strategy: z
      .number()
      .int()
      .min(0)
      .max(4)
      .optional()
      .describe(
        "Strategy for simplex solver. 0=auto, 1=dual serial, 2=dual PAMI, 3=dual SIP, 4=primal. Default is 1.",
      ),
    simplex_scale_strategy: z
      .number()
      .int()
      .min(0)
      .max(5)
      .optional()
      .describe(
        "Scaling strategy. 0=none, 1=auto, 2=equilibration, 3=forced equilibration, 4=max value 0, 5=max value 1. Default is 1.",
      ),
    simplex_dual_edge_weight_strategy: z
      .number()
      .int()
      .min(-1)
      .max(2)
      .optional()
      .describe(
        "Dual edge weight strategy. -1=auto, 0=Dantzig, 1=Devex, 2=steepest edge. Default is -1.",
      ),
    simplex_primal_edge_weight_strategy: z
      .number()
      .int()
      .min(-1)
      .max(2)
      .optional()
      .describe(
        "Primal edge weight strategy. -1=auto, 0=Dantzig, 1=Devex, 2=steepest edge. Default is -1.",
      ),
    simplex_iteration_limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum iterations for simplex method. Default is 2147483647."),
    simplex_update_limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum UPDATE operations before refactorization. Default is 5000."),

    // Logging
    output_flag: z
      .boolean()
      .optional()
      .describe("Enables or disables all solver output. Default is true."),
    log_to_console: z
      .boolean()
      .optional()
      .describe("Enables or disables console logging. Default is true."),
    log_file: z.string().optional().describe("Path to log file for solver output."),
    highs_debug_level: z
      .number()
      .int()
      .min(0)
      .max(4)
      .optional()
      .describe("Level of debugging output. 0=none, 4=maximum. Default is 0."),

    // MIP Options
    mip_detect_symmetry: z
      .boolean()
      .optional()
      .describe("Whether to detect and exploit symmetry in MIP. Default is true."),
    mip_max_nodes: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Maximum nodes in branch-and-bound tree. Default is 2147483647."),
    mip_max_stall_nodes: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Maximum nodes where estimate exceeds cutoff bound. Default is 2147483647."),
    mip_max_leaves: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Maximum number of leaf nodes. Default is 2147483647."),
    mip_feasibility_tolerance: z
      .number()
      .min(1e-10)
      .optional()
      .describe("Tolerance for MIP feasibility. Default is 1e-6."),
    mip_rel_gap: z
      .number()
      .min(0)
      .optional()
      .describe("Relative gap |ub-lb|/|ub| tolerance for MIP termination. Default is 1e-4."),
    mip_abs_gap: z
      .number()
      .min(0)
      .optional()
      .describe("Absolute gap |ub-lb| tolerance for MIP termination. Default is 1e-6."),

    // IPM Options
    ipm_iteration_limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum iterations for IPM solver. Default is 2147483647."),

    // PDLP Options
    pdlp_scaling: z
      .boolean()
      .optional()
      .describe("Enable scaling in PDLP solver. Default is true."),
    pdlp_iteration_limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Maximum iterations for PDLP solver. Default is 2147483647."),
    pdlp_d_gap_tol: z
      .number()
      .min(1e-12)
      .optional()
      .describe("Duality gap tolerance for PDLP solver. Default is 1e-4."),

    // File I/O
    write_solution_to_file: z
      .boolean()
      .optional()
      .describe("Whether to write the solution to a file. Default is false."),
    solution_file: z.string().optional().describe("Path where the solution will be written."),
    write_solution_style: z
      .number()
      .int()
      .min(-1)
      .max(4)
      .optional()
      .describe(
        "Style of solution file. 0=HiGHS raw, 1=HiGHS pretty, 2=Glpsol raw, 3=Glpsol pretty, 4=HiGHS sparse. Default is 0.",
      ),
  })
  .optional()
  .describe(
    `Solver options for fine-grained control over HiGHS behavior and performance.
    
Options are organized into categories:

**Solver Control:**
- time_limit, presolve, solver, parallel, threads
- run_crossover, random_seed

**Tolerances:**
- primal/dual_feasibility_tolerance
- ipm_optimality_tolerance
- infinite_cost/bound, objective_bound/target

**Simplex Options:**
- simplex_strategy, simplex_scale_strategy
- edge weight strategies, iteration/update limits

**Logging:**
- output_flag, log_to_console, log_file
- highs_debug_level

**MIP Options:**
- mip_detect_symmetry, max nodes/leaves
- feasibility tolerance, gap tolerances

**Algorithm-specific:**
- IPM: ipm_iteration_limit
- PDLP: pdlp_scaling, pdlp_iteration_limit, pdlp_d_gap_tol

**File I/O:**
- write_solution_to_file, solution_file
- write_solution_style

All options are optional with sensible defaults.`,
  );

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
    - variables array length must equal number of variables (objective coefficients)
    
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
