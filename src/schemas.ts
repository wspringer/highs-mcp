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
    .describe("Linear coefficients for each variable"),
});

export const ConstraintsSchema = z.object({
  matrix: z
    .array(z.array(z.number()))
    .min(1, "At least one constraint is required")
    .describe("Constraint coefficient matrix (A in Ax ≤/=/≥ b)"),
  bounds: z.array(ConstraintBoundSchema).describe("Bounds for each constraint row"),
});

export const VariablesSchema = z.object({
  bounds: z.array(VariableBoundSchema).describe("Bounds for each variable"),
  types: z
    .array(VariableTypeSchema)
    .optional()
    .describe("Type of each variable (optional, defaults to continuous)"),
  names: z.array(z.string()).optional().describe("Names for each variable (optional)"),
});

export const ProblemSchema = z
  .object({
    sense: z.enum(["minimize", "maximize"]).describe("Optimization direction"),
    objective: ObjectiveSchema.describe("Objective function coefficients"),
    constraints: ConstraintsSchema.describe("Constraint specifications"),
    variables: VariablesSchema.describe("Variable specifications"),
  })
  .refine(
    (data) => {
      // Ensure matrix dimensions are consistent
      const numVars = data.objective.linear.length;
      const numConstraints = data.constraints.matrix.length;

      // Check that all constraint rows have the same number of variables
      for (const row of data.constraints.matrix) {
        if (row.length !== numVars) {
          return false;
        }
      }

      // Check that bounds arrays have correct length
      if (data.constraints.bounds.length !== numConstraints) {
        return false;
      }

      if (data.variables.bounds.length !== numVars) {
        return false;
      }

      if (data.variables.types && data.variables.types.length !== numVars) {
        return false;
      }

      if (data.variables.names && data.variables.names.length !== numVars) {
        return false;
      }

      return true;
    },
    {
      message: "Problem dimensions are inconsistent",
    },
  );

export const OptionsSchema = z
  .object({
    time_limit: z.number().positive().optional().describe("Time limit in seconds"),
    presolve: z.enum(["off", "choose", "on"]).optional().describe("Presolve option"),
    solver: z.enum(["simplex", "choose", "ipm", "pdlp"]).optional().describe("Solver method"),
  })
  .optional()
  .describe("Solver options");

export const OptimizationArgsSchema = z.object({
  problem: ProblemSchema.describe("The optimization problem specification"),
  options: OptionsSchema,
});
