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
import { zodToJsonSchema } from "zod-to-json-schema";
import { OptimizationArgsSchema } from "./schemas.js";
import { problemToLPFormat } from "./lp-format.js";

const TOOL_NAME = "optimize-mip-lp-tool";

const server = new Server(
  {
    name: "highs-mcp",
    version: "0.0.1",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: TOOL_NAME,
      description:
        "Solve linear programming (LP) or mixed-integer programming (MIP) problems using HiGHS solver",
      inputSchema: zodToJsonSchema(OptimizationArgsSchema, {
        $refStrategy: "none",
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

// Solve optimization problem
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== TOOL_NAME) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  }

  // Validate input using Zod
  const validationResult = OptimizationArgsSchema.safeParse(request.params.arguments);

  if (!validationResult.success) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid parameters: ${validationResult.error.errors.map((e) => e.message).join(", ")}`,
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
              2,
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
              2,
            ),
          },
        ],
      };
    }
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to solve optimization problem: ${error}`);
  }
});

async function main() {
  console.error("Starting HiGHS MCP server v0.0.1...");

  const transport = new StdioServerTransport();

  console.error("Connecting to stdio transport...");
  await server.connect(transport);

  console.error("HiGHS MCP server running - ready to solve optimization problems");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
