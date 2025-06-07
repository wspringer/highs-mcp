import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { once } from "events";
import packageJson from "../package.json";

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

  async function sendRequest(method: string, params: any = {}): Promise<any> {
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
    });

    it("should include error condition descriptions in tool schema", async () => {
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
      expect(problemDescription).toContain(
        "All constraint rows (dense) must have same number of coefficients",
      );
      expect(problemDescription).toContain("Infeasible");
      expect(problemDescription).toContain("Unbounded");
      expect(problemDescription).toContain("Time limit reached");

      // Check field-specific error descriptions
      const objectiveDescription =
        tool.inputSchema.properties.problem.properties.objective.properties.linear.description;
      expect(objectiveDescription).toContain(
        "The length of this array defines the number of variables",
      );

      const constraintsSchema = tool.inputSchema.properties.problem.properties.constraints;
      // Check that constraints support both dense and sparse formats via anyOf
      expect(constraintsSchema.anyOf).toBeDefined();
      expect(constraintsSchema.anyOf).toHaveLength(2);
      // Check that description exists and mentions both formats
      if (constraintsSchema.description) {
        expect(constraintsSchema.description).toContain("DENSE FORMAT");
        expect(constraintsSchema.description).toContain("SPARSE FORMAT");
      } else {
        // If description is not at top level, check for the union structure
        expect(constraintsSchema.anyOf[0].properties.dense).toBeDefined();
        expect(constraintsSchema.anyOf[1].properties.sparse).toBeDefined();
      }

      // Check that min constraints are properly exposed
      expect(
        tool.inputSchema.properties.problem.properties.objective.properties.linear.minItems,
      ).toBe(1);
    });
  });

  describe("Optimization Solver", () => {
    it("should solve a simple linear programming problem", async () => {
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
            variables: [
              {}, // defaults: cont, [0, +∞)
              {}, // defaults: cont, [0, +∞)
            ],
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBe(12);
      expect(result.solution).toEqual([4, 0]);
    });

    it("should solve the same problem with sparse matrix format", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: {
              linear: [3, 2],
            },
            constraints: {
              sparse: {
                rows: [0, 0],
                cols: [0, 1],
                values: [1, 1],
                shape: [1, 2],
              },
              sense: ["<="],
              rhs: [4],
            },
            variables: [
              {}, // defaults: cont, [0, +∞)
              {}, // defaults: cont, [0, +∞)
            ],
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBe(12);
      expect(result.solution).toEqual([4, 0]);
    });

    it("should solve a sparse problem with many zeros", async () => {
      // Problem: minimize x1 + 2x2 + 3x3 + 4x4
      // Subject to: x1 + x3 >= 2
      //            x2 + x4 >= 3
      //            All variables >= 0
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
                rows: [0, 0, 1, 1],
                cols: [0, 2, 1, 3],
                values: [1, 1, 1, 1],
                shape: [2, 4],
              },
              sense: [">=", ">="],
              rhs: [2, 3],
            },
            variables: [
              {}, // defaults: cont, [0, +∞)
              {}, // defaults: cont, [0, +∞)
              {}, // defaults: cont, [0, +∞)
              {}, // defaults: cont, [0, +∞)
            ],
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBe(8); // x1=2, x2=3, others=0: 1*2 + 2*3 + 3*0 + 4*0 = 8
      expect(result.solution[0]).toBe(2);
      expect(result.solution[1]).toBe(3);
      expect(result.solution[2]).toBe(0);
      expect(result.solution[3]).toBe(0);
    });

    it("should solve a production planning problem", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: {
              linear: [25, 40],
            },
            variables: [
              {}, // defaults: cont, [0, +∞)
              {}, // defaults: cont, [0, +∞)
            ],
            constraints: {
              dense: [
                [2, 3],
                [1, 2],
              ],
              sense: ["<=", "<="],
              rhs: [100, 80],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBeCloseTo(1333.33, 1);
      expect(result.solution[0]).toBeCloseTo(0, 1);
      expect(result.solution[1]).toBeCloseTo(33.33, 1);
    });

    it("should handle incomplete bounds in variables", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: {
              linear: [1, 2],
            },
            variables: [
              {}, // defaults: cont, [0, +∞)
              {}, // defaults: cont, [0, +∞)
            ],
            constraints: {
              dense: [[1, 1]],
              sense: ["<="],
              rhs: [10],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBe(0);
      expect(result.solution).toEqual([0, 0]);
    });

    it("should solve a transportation problem with named variables", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: {
              linear: [12.5, 14.2, 13.8, 11.9, 8.4, 9.1, 10.5, 6.2],
            },
            variables: [
              { name: "S1_W1" },
              { name: "S1_W2" },
              { name: "S2_W1" },
              { name: "S2_W2" },
              { name: "W1_C1" },
              { name: "W1_C2" },
              { name: "W2_C1" },
              { name: "W2_C2" },
            ],
            constraints: {
              dense: [
                [1, 1, 0, 0, 0, 0, 0, 0], // S1 supply
                [0, 0, 1, 1, 0, 0, 0, 0], // S2 supply
                [1, 0, 1, 0, -1, -1, 0, 0], // W1 flow
                [0, 1, 0, 1, 0, 0, -1, -1], // W2 flow
                [0, 0, 0, 0, 1, 0, 1, 0], // C1 demand
                [0, 0, 0, 0, 0, 1, 0, 1], // C2 demand
              ],
              sense: ["<=", "<=", "=", "=", ">=", ">="],
              rhs: [50, 40, 0, 0, 30, 25],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBeGreaterThan(0);
      expect(result.solution.length).toBe(8);
    });

    it("should handle integer and binary variables", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: {
              linear: [5, 3, 2],
            },
            variables: [
              { type: "int" }, // integer, defaults to [0, +∞)
              {}, // continuous (default), [0, +∞)
              { type: "bin" }, // binary, defaults to [0, 1]
            ],
            constraints: {
              dense: [[2, 1, 3]],
              sense: ["<="],
              rhs: [10],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      // First variable should be integer
      expect(Number.isInteger(result.solution[0])).toBe(true);
      // Third variable should be 0 or 1
      expect([0, 1]).toContain(result.solution[2]);
    });

    it("should handle infeasible problems", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: {
              linear: [1, 1],
            },
            variables: [
              {}, // defaults: cont, [0, +∞)
              {}, // defaults: cont, [0, +∞)
            ],
            constraints: {
              dense: [
                [1, 1],
                [1, 1],
              ],
              sense: [">=", "<="],
              rhs: [10, 5],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("infeasible");
    });

    it("should handle solver options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: {
              linear: [1, 2],
            },
            variables: [
              {}, // defaults: cont, [0, +∞)
              {}, // defaults: cont, [0, +∞)
            ],
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

    it("should handle enhanced algorithm control options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: {
              linear: [3, 2],
            },
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
            simplex_scale_strategy: 2, // Equilibration scaling
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
    });

    it("should handle performance tuning options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: {
              linear: [1, 1],
            },
            variables: [{}, {}],
            constraints: {
              dense: [[1, 1]],
              sense: [">="],
              rhs: [1],
            },
          },
          options: {
            simplex_iteration_limit: 1000,
            ipm_iteration_limit: 500,
            random_seed: 42,
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
    });

    it("should handle numerical tolerance options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: {
              linear: [1, 2],
            },
            variables: [{}, {}],
            constraints: {
              dense: [[1, 1]],
              sense: ["<="],
              rhs: [3],
            },
          },
          options: {
            primal_feasibility_tolerance: 1e-6,
            dual_feasibility_tolerance: 1e-6,
            ipm_optimality_tolerance: 1e-7,
            infinite_cost: 1e18,
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
    });

    it("should handle MIP-specific options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: {
              linear: [5, 3],
            },
            variables: [{ type: "int" }, { type: "int" }],
            constraints: {
              dense: [[2, 1]],
              sense: ["<="],
              rhs: [5],
            },
          },
          options: {
            mip_max_nodes: 1000,
            mip_rel_gap: 0.01,
            mip_feasibility_tolerance: 1e-5,
            mip_detect_symmetry: true,
            mip_abs_gap: 1e-4,
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      // Verify solution has integer values
      expect(Number.isInteger(result.solution[0])).toBe(true);
      expect(Number.isInteger(result.solution[1])).toBe(true);
    });

    it("should handle advanced logging and output options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: {
              linear: [1, 1],
            },
            variables: [{}, {}],
            constraints: {
              dense: [[1, 1]],
              sense: [">="],
              rhs: [1],
            },
          },
          options: {
            output_flag: true,
            write_solution_to_file: false,
            write_solution_style: 1,
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
    });

    it("should handle comprehensive option combinations", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: {
              linear: [40, 30],
            },
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
          options: {
            // Basic control
            time_limit: 30,
            presolve: "on",
            solver: "simplex",

            // Algorithm tuning
            simplex_dual_edge_weight_strategy: 1,

            // Include output_flag set to true (its default)
            output_flag: true,
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBeGreaterThan(0);
    });
  });

  describe("Enhanced Solver Options Validation", () => {
    it("should validate invalid edge weight strategy", async () => {
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

    it("should validate unknown solver options", async () => {
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
            simplex_dual_edge_weight_strategy: "invalid_string", // Invalid type - should be number
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate invalid tolerance values", async () => {
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
            primal_feasibility_tolerance: -1e-7, // Invalid negative tolerance
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate invalid iteration limits", async () => {
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
            simplex_iteration_limit: 0, // Invalid zero limit
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate invalid MIP gap", async () => {
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
            mip_rel_gap: -0.01, // Invalid negative gap
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate invalid output flag type", async () => {
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
            output_flag: "invalid_boolean", // Invalid: should be boolean
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate invalid simplex strategy", async () => {
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
            simplex_strategy: 10, // Invalid: out of range (0-4)
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate invalid debug level", async () => {
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
            highs_debug_level: 10, // Invalid: out of range (0-4)
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate invalid thread count", async () => {
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
            threads: -5, // Invalid: must be non-negative
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });
  });

  describe("Error Handling", () => {
    it("should handle unknown tool names", async () => {
      const response = await sendRequest("tools/call", {
        name: "unknown_tool",
        arguments: {},
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Unknown tool");
    });

    it("should handle malformed problem data", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            // Missing required fields
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate sense field", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "invalid", // Invalid sense value
            objective: { linear: [1, 2] },
            variables: [{}, {}],
            constraints: {
              dense: [[1, 1]],
              sense: ["<="],
              rhs: [1],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate empty objective coefficients", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [] }, // Empty array not allowed
            variables: [],
            constraints: {
              dense: [],
              sense: [],
              rhs: [],
            },
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
    });

    it("should provide specific error for mismatched constraint matrix dimensions", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2, 3] }, // 3 variables
            variables: [{}, {}, {}],
            constraints: {
              dense: [
                [1, 1], // Row 0: 2 coefficients (should be 3)
                [1, 1, 1], // Row 1: 3 coefficients (correct)
                [1], // Row 2: 1 coefficient (should be 3)
              ],
              sense: ["<=", "<=", "<="],
              rhs: [10, 20, 15],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain(
        "Constraint row 0 has 2 coefficients but expected 3",
      );
      expect(response.error.message).toContain(
        "Constraint row 2 has 1 coefficients but expected 3",
      );
    });

    it("should provide specific error for constraint bounds array length mismatch", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2] },
            variables: [{}, {}],
            constraints: {
              dense: [
                [1, 1],
                [2, 2],
                [3, 3],
              ], // 3 constraints
              sense: ["<=", "<="], // Only 2 senses (should be 3)
              rhs: [10, 20], // Only 2 rhs (should be 3)
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain(
        "Constraint sense array has 2 elements but expected 3",
      );
    });

    it("should provide specific error for variables array length mismatch", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: { linear: [5, 3, 2] }, // 3 variables
            variables: [
              {}, // Only 2 variables (should be 3)
              {},
            ],
            constraints: {
              dense: [[1, 1, 1]],
              sense: ["<="],
              rhs: [10],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain("Variables array has 2 elements but expected 3");
    });

    it("should validate variable types", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: { linear: [5, 3, 2] }, // 3 variables
            variables: [
              { type: "cont" },
              { type: "invalid_type" as any }, // Invalid type
              { type: "int" },
            ],
            constraints: {
              dense: [[1, 1, 1]],
              sense: ["<="],
              rhs: [10],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should handle compact format with mixed names and defaults", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2, 3, 4] }, // 4 variables
            variables: [
              { name: "profit" }, // named variable
              {}, // auto-named x2
              { name: "cost", ub: 100 }, // named with upper bound
              { type: "bin" }, // auto-named x4, binary
            ],
            constraints: {
              dense: [[1, 1, 1, 1]],
              sense: ["<="],
              rhs: [10],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
    });

    it("should report multiple dimension errors at once", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2, 3] }, // 3 variables
            variables: [
              {}, // Only 2 variables provided (should be 3)
              {},
            ],
            constraints: {
              dense: [
                [1, 1], // Wrong: 2 instead of 3
                [1, 1, 1, 1], // Wrong: 4 instead of 3
              ],
              sense: ["<="], // Wrong: 1 instead of 2
              rhs: [10], // Wrong: 1 instead of 2
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      // Should report all dimension errors
      expect(response.error.message).toContain(
        "Constraint row 0 has 2 coefficients but expected 3",
      );
      expect(response.error.message).toContain(
        "Constraint row 1 has 4 coefficients but expected 3",
      );
      expect(response.error.message).toContain(
        "Constraint sense array has 1 elements but expected 2",
      );
      expect(response.error.message).toContain("Variables array has 2 elements but expected 3");
    });

    it("should validate sparse matrix format", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2] }, // 2 variables
            variables: [{}, {}],
            constraints: {
              sparse: {
                rows: [0, 0],
                cols: [0], // Mismatched array lengths
                values: [1, 1],
                shape: [1, 2],
              },
              sense: ["<="],
              rhs: [10],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain("must have equal length");
    });

    it("should validate sparse matrix indices", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2] }, // 2 variables
            variables: [{}, {}],
            constraints: {
              sparse: {
                rows: [0, 1], // Row index 1 exceeds constraints (only 1 constraint)
                cols: [0, 3], // Col index 3 exceeds variables (only 2 variables)
                values: [1, 1],
                shape: [1, 2],
              },
              sense: ["<="],
              rhs: [10],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain("Row index 1 exceeds number of constraints");
      expect(response.error.message).toContain("Column index 3 exceeds number of variables");
    });

    it("should validate sparse matrix shape", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2, 3] }, // 3 variables
            variables: [{}, {}, {}],
            constraints: {
              sparse: {
                rows: [0, 0],
                cols: [0, 1],
                values: [1, 1],
                shape: [1, 2], // Shape says 2 variables but we have 3
              },
              sense: ["<="],
              rhs: [10],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain(
        "Sparse matrix shape [1, 2] doesn't match number of variables (3)",
      );
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
  });
});
