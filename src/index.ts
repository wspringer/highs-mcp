#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import highsLoader, { Highs } from "highs";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OptimizationArgsSchema } from "./schemas.js";
import { encode } from "./encode.js";
import { decode } from "./decode.js";
import packageJson from "../package.json";

const TOOL_NAME = "optimize-mip-lp-tool";

const server = new Server(
  {
    name: "highs-mcp",
    version: packageJson.version,
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

let highsInstance: Highs | null = null;

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
    const errorMessages = validationResult.error.errors.map((e) => {
      // Include path information for better error messages
      const path = e.path.join(".");
      return path ? `${path}: ${e.message}` : e.message;
    });
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${errorMessages.join(", ")}`, {
      errors: errorMessages,
    });
  }

  const { problem, options } = validationResult.data;

  try {
    const highs = await getHighsInstance();

    // Convert problem to LP format
    const lpString = encode(problem);

    // Solve the problem
    const result = highs.solve(lpString, options || {});

    // Decode the result
    const decodedResult = decode(result, problem);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(decodedResult, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to solve optimization problem: ${error}`);
  }
});

async function main() {
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.split(".")[0].substring(1));

  console.error(`Node.js version: ${nodeVersion}`);
  console.error(`Starting HiGHS MCP server v${packageJson.version}...`);

  // Check if Node.js version is >= 16.0.0
  if (majorVersion < 16) {
    throw new Error(
      `HiGHS MCP server requires Node.js version 16.0.0 or higher. Current version: ${nodeVersion}. ` +
        `Please upgrade your Node.js installation to version 16.0.0 or higher.`,
    );
  }

  const transport = new StdioServerTransport();

  console.error("Connecting to stdio transport...");
  await server.connect(transport);

  console.error("HiGHS MCP server running - ready to solve optimization problems");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
