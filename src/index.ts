#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import highsLoader from "highs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Zod schemas for validation
const VariableBoundSchema = z.object({
  lower: z
    .number()
    .nullable()
    .optional()
    .describe("Lower bound for the variable"),
  upper: z
    .number()
    .nullable()
    .optional()
    .describe("Upper bound for the variable"),
});

const ConstraintBoundSchema = z.object({
  lower: z
    .number()
    .nullable()
    .optional()
    .describe("Lower bound for the constraint"),
  upper: z
    .number()
    .nullable()
    .optional()
    .describe("Upper bound for the constraint"),
});

const VariableTypeSchema = z
  .enum(["continuous", "integer", "binary"])
  .describe("Type of variable");

const ObjectiveSchema = z.object({
  linear: z
    .array(z.number())
    .min(1, "At least one objective coefficient is required")
    .describe("Linear coefficients for each variable"),
});

const ConstraintsSchema = z.object({
  matrix: z
    .array(z.array(z.number()))
    .min(1, "At least one constraint is required")
    .describe("Constraint coefficient matrix (A in Ax ≤/=/≥ b)"),
  bounds: z
    .array(ConstraintBoundSchema)
    .describe("Bounds for each constraint row"),
});

const VariablesSchema = z.object({
  bounds: z.array(VariableBoundSchema).describe("Bounds for each variable"),
  types: z
    .array(VariableTypeSchema)
    .optional()
    .describe("Type of each variable (optional, defaults to continuous)"),
  names: z
    .array(z.string())
    .optional()
    .describe("Names for each variable (optional)"),
});

const ProblemSchema = z
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
    }
  );

const OptionsSchema = z
  .object({
    time_limit: z
      .number()
      .positive()
      .optional()
      .describe("Time limit in seconds"),
    presolve: z
      .enum(["off", "choose", "on"])
      .optional()
      .describe("Presolve option"),
    solver: z
      .enum(["simplex", "choose", "ipm", "pdlp"])
      .optional()
      .describe("Solver method"),
  })
  .optional()
  .describe("Solver options");

const SolveOptimizationArgsSchema = z.object({
  problem: ProblemSchema.describe("The optimization problem specification"),
  options: OptionsSchema,
});

const server = new Server(
  {
    name: "highs-mcp",
    version: "0.0.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "solve_optimization",
      description:
        "Solve linear programming (LP) or mixed-integer programming (MIP) problems using HiGHS solver",
      inputSchema: zodToJsonSchema(SolveOptimizationArgsSchema, {
        $refStrategy: "none",
        target: "jsonSchema7",
        name: "SolveOptimizationArgs",
      }),
    },
  ],
}));

let highsInstance: any = null;

async function getHighsInstance() {
  if (!highsInstance) {
    highsInstance = await highsLoader();
  }
  return highsInstance;
}

function problemToLPFormat(problem: z.infer<typeof ProblemSchema>): string {
  const { sense, objective, constraints, variables } = problem;
  const numVars = objective.linear.length;
  const numConstraints = constraints.matrix.length;

  let lpString = "";

  // Objective function
  lpString += sense === "minimize" ? "Minimize\n" : "Maximize\n";
  lpString += " obj: ";

  const objTerms = [];
  for (let i = 0; i < numVars; i++) {
    const coeff = objective.linear[i];
    const varName = variables.names?.[i] || `x${i + 1}`;
    if (coeff !== 0) {
      if (coeff === 1) {
        objTerms.push(varName);
      } else if (coeff === -1) {
        objTerms.push(`- ${varName}`);
      } else if (coeff > 0) {
        objTerms.push(`${coeff} ${varName}`);
      } else {
        objTerms.push(`- ${Math.abs(coeff)} ${varName}`);
      }
    }
  }
  lpString += objTerms.join(" + ").replace(/\+ -/g, "-") + "\n";

  // Constraints
  lpString += "Subject To\n";
  for (let i = 0; i < numConstraints; i++) {
    const row = constraints.matrix[i];
    const bound = constraints.bounds[i];

    const terms = [];
    for (let j = 0; j < numVars; j++) {
      const coeff = row[j];
      const varName = variables.names?.[j] || `x${j + 1}`;
      if (coeff !== 0) {
        if (coeff === 1) {
          terms.push(varName);
        } else if (coeff === -1) {
          terms.push(`- ${varName}`);
        } else if (coeff > 0) {
          terms.push(`${coeff} ${varName}`);
        } else {
          terms.push(`- ${Math.abs(coeff)} ${varName}`);
        }
      }
    }

    const constraintExpr = terms.join(" + ").replace(/\+ -/g, "-");

    // Handle missing upper/lower properties in constraint bounds
    const lower = bound.lower !== undefined ? bound.lower : null;
    const upper = bound.upper !== undefined ? bound.upper : null;

    if (lower !== null && upper !== null) {
      if (lower === upper) {
        lpString += ` c${i + 1}: ${constraintExpr} = ${upper}\n`;
      } else {
        // Split into two constraints for range bounds
        lpString += ` c${i + 1}_lb: ${constraintExpr} >= ${lower}\n`;
        lpString += ` c${i + 1}_ub: ${constraintExpr} <= ${upper}\n`;
      }
    } else if (lower !== null) {
      lpString += ` c${i + 1}: ${constraintExpr} >= ${lower}\n`;
    } else if (upper !== null) {
      lpString += ` c${i + 1}: ${constraintExpr} <= ${upper}\n`;
    }
  }

  // Variable bounds
  lpString += "Bounds\n";
  for (let i = 0; i < numVars; i++) {
    const varName = variables.names?.[i] || `x${i + 1}`;
    const bound = variables.bounds[i];

    // Handle missing upper/lower properties
    const lower = bound.lower !== undefined ? bound.lower : null;
    const upper = bound.upper !== undefined ? bound.upper : null;

    if (lower !== null && upper !== null) {
      if (lower === -Infinity && upper === Infinity) {
        lpString += ` ${varName} free\n`;
      } else if (lower === -Infinity) {
        lpString += ` -inf <= ${varName} <= ${upper}\n`;
      } else if (upper === Infinity) {
        lpString += ` ${lower} <= ${varName} <= +inf\n`;
      } else {
        lpString += ` ${lower} <= ${varName} <= ${upper}\n`;
      }
    } else if (lower !== null && lower !== -Infinity) {
      lpString += ` ${lower} <= ${varName} <= +inf\n`;
    } else if (upper !== null && upper !== Infinity) {
      lpString += ` -inf <= ${varName} <= ${upper}\n`;
    } else {
      lpString += ` ${varName} free\n`;
    }
  }

  // Variable types (integer/binary)
  if (variables.types) {
    const integerVars = [];
    const binaryVars = [];

    for (let i = 0; i < numVars; i++) {
      const varName = variables.names?.[i] || `x${i + 1}`;
      if (variables.types[i] === "integer") {
        integerVars.push(varName);
      } else if (variables.types[i] === "binary") {
        binaryVars.push(varName);
      }
    }

    if (integerVars.length > 0) {
      lpString += "General\n";
      lpString += " " + integerVars.join(" ") + "\n";
    }

    if (binaryVars.length > 0) {
      lpString += "Binary\n";
      lpString += " " + binaryVars.join(" ") + "\n";
    }
  }

  lpString += "End\n";

  return lpString;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "solve_optimization") {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${request.params.name}`
    );
  }

  // Validate input using Zod
  const validationResult = SolveOptimizationArgsSchema.safeParse(
    request.params.arguments
  );

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid parameters: ${validationResult.error.errors
        .map((e) => e.message)
        .join(", ")}`
    );
  }

  const { problem, options } = validationResult.data;

  try {
    const highs = await getHighsInstance();

    // Convert problem to LP format
    const lpString = problemToLPFormat(problem);

    // Solve the problem
    const result = highs.solve(lpString, options || {});

    if (result.Status === "Optimal") {
      // Extract solution values
      const solutionValues = [];
      const dualValues = [];

      for (let i = 0; i < problem.objective.linear.length; i++) {
        const varName = problem.variables.names?.[i] || `x${i + 1}`;
        const column = result.Columns[varName];
        if (column) {
          solutionValues.push(column.Primal || 0);
          dualValues.push(column.Dual || 0);
        } else {
          solutionValues.push(0);
          dualValues.push(0);
        }
      }

      // Extract constraint dual values
      const constraintDuals = result.Rows.map((row: any) => row.Dual || 0);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "optimal",
                objective_value: result.ObjectiveValue,
                solution: solutionValues,
                dual_solution: constraintDuals,
                variable_duals: dualValues,
              },
              null,
              2
            ),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: result.Status.toLowerCase().replace(/\s+/g, "_"),
                message: `Problem status: ${result.Status}`,
                objective_value: result.ObjectiveValue,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to solve optimization problem: ${error}`
    );
  }
});

async function main() {
  console.error("Starting HiGHS MCP server v0.0.1...");

  const transport = new StdioServerTransport();

  console.error("Connecting to stdio transport...");
  await server.connect(transport);

  console.error(
    "HiGHS MCP server running - ready to solve optimization problems"
  );
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
