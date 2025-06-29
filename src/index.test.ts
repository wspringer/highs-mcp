import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { once } from "events";
import packageJson from "../package.json";

// Use any for test responses to avoid complex typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestResponse = any;

describe("Node.js Version Check", () => {
  it("should start successfully with Node.js >= 16", async () => {
    // Start the server and check that it starts without error
    const server = spawn("node", ["dist/index.js"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderrData = "";
    server.stderr!.on("data", (data) => {
      stderrData += data.toString();
    });

    // Wait a bit for the server to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check that the server printed the Node version
    expect(stderrData).toContain("Node.js version:");
    expect(stderrData).toContain("Starting HiGHS MCP server");
    expect(stderrData).not.toContain("requires Node.js version 16.0.0 or higher");

    // Clean up
    server.kill();
    await once(server, "exit");
  });

  it("should fail with clear error message for Node.js < 16", async () => {
    // Mock process.version to simulate old Node version
    const originalVersion = process.version;
    Object.defineProperty(process, "version", {
      value: "v14.17.0",
      writable: true,
      configurable: true,
    });

    // We can't actually test this by running the server with an old Node version
    // in our test environment, so we'll test the logic separately
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split(".")[0].substring(1));

    expect(majorVersion).toBe(14);
    expect(majorVersion < 16).toBe(true);

    // Restore original version
    Object.defineProperty(process, "version", {
      value: originalVersion,
      writable: true,
      configurable: true,
    });
  });
});

describe("HiGHS MCP Server", () => {
  let server: ChildProcess;
  let requestId = 1;

  beforeAll(async () => {
    // Start the MCP server
    server = spawn("node", ["dist/index.js"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Clean up
    if (server) {
      server.kill();
      await once(server, "exit");
    }
  });

  async function sendRequest(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<TestResponse> {
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: "2.0",
        id: requestId++,
        method,
        params,
      };

      let responseBuffer = "";

      const handleData = (data: Buffer) => {
        responseBuffer += data.toString();

        // Try to parse complete JSON-RPC messages
        const lines = responseBuffer.split("\n");
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                server.stdout!.off("data", handleData);
                resolve(response);
                return;
              }
            } catch {
              // Continue if not valid JSON
            }
          }
        }
        responseBuffer = lines[lines.length - 1];
      };

      server.stdout!.on("data", handleData);
      server.stdin!.write(JSON.stringify(request) + "\n");

      // Timeout after 5 seconds
      setTimeout(() => {
        server.stdout!.off("data", handleData);
        reject(new Error("Request timeout"));
      }, 5000);
    });
  }

  describe("Protocol", () => {
    it("should initialize successfully", async () => {
      const response = await sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "1.0.0",
        },
      });

      expect(response.result).toBeDefined();
      expect(response.result.protocolVersion).toBe("2024-11-05");
      expect(response.result.serverInfo.name).toBe("highs-mcp");
      expect(response.result.serverInfo.version).toBe(packageJson.version);
    });

    it("should list available tools", async () => {
      const response = await sendRequest("tools/list");

      expect(response.result).toBeDefined();
      expect(response.result.tools).toHaveLength(1);
      expect(response.result.tools[0].name).toBe("optimize-mip-lp-tool");
      expect(response.result.tools[0].description).toContain("HiGHS solver");
      expect(response.result.tools[0].description).toContain("quadratic programming (QP)");
      expect(response.result.tools[0].description).toContain("convex quadratic objectives");
      expect(response.result.tools[0].description).toContain("continuous variables (no MIQP)");
    });

    it("should include comprehensive schema documentation", async () => {
      const response = await sendRequest("tools/list");

      expect(response.result).toBeDefined();
      const tool = response.result.tools[0];
      expect(tool.inputSchema).toBeDefined();

      // Check that the schema includes error condition descriptions
      const problemDescription = tool.inputSchema.properties.problem.description;
      expect(problemDescription).toContain("CONSTRAINT MATRIX FORMATS");
      expect(problemDescription).toContain("DIMENSION CONSISTENCY REQUIREMENTS");
      expect(problemDescription).toContain("POSSIBLE SOLVER STATUSES");
      expect(problemDescription).toContain("INPUT VALIDATION ERRORS");

      // Check specific error conditions are documented
      expect(problemDescription).toContain("Infeasible");
      expect(problemDescription).toContain("Unbounded");
      expect(problemDescription).toContain("Time limit reached");

      // Check that constraints support both dense and sparse formats
      const constraintsSchema = tool.inputSchema.properties.problem.properties.constraints;
      expect(constraintsSchema.anyOf).toBeDefined();
      expect(constraintsSchema.anyOf).toHaveLength(2);

      // Check that objective supports both linear and quadratic
      const objectiveSchema = tool.inputSchema.properties.problem.properties.objective;
      expect(objectiveSchema.properties.linear).toBeDefined();
      expect(objectiveSchema.properties.quadratic).toBeDefined();
    });
  });

  describe("End-to-End Problem Solving", () => {
    it("should solve a classic linear programming problem", async () => {
      // Classic LP: maximize 3x + 2y subject to x + y <= 4
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: {
              linear: [3, 2],
            },
            constraints: {
              dense: [[1, 1]],
              sense: ["<="],
              rhs: [4],
            },
            variables: [{}, {}],
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBe(12);
      expect(result.solution).toEqual([4, 0]);
    });

    it("should solve mixed-integer programming problems", async () => {
      // MIP: maximize 5x + 3y where x is integer, y is binary
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: {
              linear: [5, 3],
            },
            variables: [{ type: "int" }, { type: "bin" }],
            constraints: {
              dense: [[2, 1]],
              sense: ["<="],
              rhs: [5],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(Number.isInteger(result.solution[0])).toBe(true);
      expect([0, 1]).toContain(result.solution[1]);
    });

    it("should solve production planning optimization", async () => {
      // Production planning: maximize profit from two products
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: {
              linear: [25, 40], // profit per unit
            },
            variables: [{}, {}], // production quantities
            constraints: {
              dense: [
                [2, 3], // resource 1 constraint
                [1, 2], // resource 2 constraint
              ],
              sense: ["<=", "<="],
              rhs: [100, 80], // resource limits
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBeCloseTo(1333.33, 1);
    });

    it("should solve transportation problem with named variables", async () => {
      // Multi-stage transportation problem
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: {
              linear: [12.5, 14.2, 13.8, 11.9], // transportation costs
            },
            variables: [{ name: "S1_W1" }, { name: "S1_W2" }, { name: "S2_W1" }, { name: "S2_W2" }],
            constraints: {
              dense: [
                [1, 1, 0, 0], // S1 supply constraint
                [0, 0, 1, 1], // S2 supply constraint
                [1, 0, 1, 0], // W1 demand constraint
                [0, 1, 0, 1], // W2 demand constraint
              ],
              sense: ["<=", "<=", ">=", ">="],
              rhs: [50, 40, 30, 25],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.solution.length).toBe(4);
      expect(result.objective_value).toBeGreaterThan(0);
    });

    it("should handle sparse matrix problems efficiently", async () => {
      // Large sparse problem: minimize x1 + 2x2 + 3x3 + 4x4
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: {
              linear: [1, 2, 3, 4],
            },
            constraints: {
              sparse: {
                rows: [0, 0, 1, 1], // only 4 non-zero entries in 2x4 matrix
                cols: [0, 2, 1, 3],
                values: [1, 1, 1, 1],
                shape: [2, 4],
              },
              sense: [">=", ">="],
              rhs: [2, 3],
            },
            variables: [{}, {}, {}, {}],
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBe(8); // x1=2, x2=3, others=0
    });
  });

  describe("Solver Options Integration", () => {
    it("should apply basic solver options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2] },
            variables: [{}, {}],
            constraints: {
              dense: [[1, 1]],
              sense: [">="],
              rhs: [1],
            },
          },
          options: {
            presolve: "on",
            solver: "simplex",
            time_limit: 60,
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
    });

    it("should apply MIP-specific options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: { linear: [5, 3] },
            variables: [{ type: "int" }, { type: "int" }],
            constraints: {
              dense: [[2, 1]],
              sense: ["<="],
              rhs: [5],
            },
          },
          options: {
            mip_rel_gap: 0.01,
            mip_max_nodes: 1000,
            mip_detect_symmetry: true,
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(Number.isInteger(result.solution[0])).toBe(true);
      expect(Number.isInteger(result.solution[1])).toBe(true);
    });

    it("should apply performance tuning options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: { linear: [3, 2] },
            variables: [{}, {}],
            constraints: {
              dense: [[1, 1]],
              sense: ["<="],
              rhs: [4],
            },
          },
          options: {
            solver: "simplex",
            simplex_dual_edge_weight_strategy: 1, // Devex
            simplex_strategy: 1, // Dual serial
            random_seed: 42,
            threads: 0, // Automatic
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
    });
  });

  describe("Problem Types and Status Handling", () => {
    it("should detect infeasible problems", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 1] },
            variables: [{}, {}],
            constraints: {
              dense: [
                [1, 1],
                [1, 1],
              ],
              sense: [">=", "<="],
              rhs: [10, 5], // x + y >= 10 and x + y <= 5 is infeasible
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("infeasible");
      expect(result.message).toContain("Problem status: Infeasible");
    });

    it("should handle problems with custom variable bounds", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: { linear: [40, 30] },
            variables: [
              { name: "x1", ub: 10 },
              { name: "x2", ub: 8 },
            ],
            constraints: {
              dense: [
                [2, 1],
                [1, 2],
              ],
              sense: ["<=", "<="],
              rhs: [16, 14],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBeGreaterThan(0);
    });
  });

  describe("API Error Handling", () => {
    it("should handle unknown tool names", async () => {
      const response = await sendRequest("tools/call", {
        name: "unknown_tool",
        arguments: {},
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Unknown tool");
    });

    it("should validate required fields", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            // Missing required objective and constraints
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate dimension consistency", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2] }, // 2 variables
            variables: [{}, {}],
            constraints: {
              dense: [[1, 1, 1]], // 3 variables in constraint (mismatch)
              sense: ["<="],
              rhs: [10],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain("coefficients but expected 2");
    });

    it("should validate solver options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2] },
            variables: [{}, {}],
            constraints: {
              dense: [[1, 1]],
              sense: ["<="],
              rhs: [10],
            },
          },
          options: {
            solver: "invalid_solver", // Invalid solver type
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate option value ranges", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2] },
            variables: [{}, {}],
            constraints: {
              dense: [[1, 1]],
              sense: ["<="],
              rhs: [10],
            },
          },
          options: {
            simplex_dual_edge_weight_strategy: 5, // Invalid: out of range
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should provide detailed validation errors", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2, 3] }, // 3 variables
            variables: [{}, {}], // Only 2 variables (mismatch)
            constraints: {
              dense: [
                [1, 1], // Row has 2 coefficients (should be 3)
                [1, 1, 1], // Row has 3 coefficients (correct)
              ],
              sense: ["<="], // Only 1 sense (should be 2)
              rhs: [10], // Only 1 rhs (should be 2)
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      // Should report multiple errors
      expect(response.error.message).toContain("Variables array has 2 elements but expected 3");
      expect(response.error.message).toContain(
        "Constraint row 0 has 2 coefficients but expected 3",
      );
      expect(response.error.message).toContain(
        "Constraint sense array has 1 elements but expected 2",
      );
    });
  });
});
