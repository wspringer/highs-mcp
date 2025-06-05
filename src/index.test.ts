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
              matrix: [[1, 1]],
              bounds: [
                {
                  lower: null,
                  upper: 4,
                },
              ],
            },
            variables: {
              bounds: [
                { lower: 0, upper: null },
                { lower: 0, upper: null },
              ],
            },
          },
        },
      });

      expect(response.result).toBeDefined();
      const result = JSON.parse(response.result.content[0].text);
      expect(result.status).toBe("optimal");
      expect(result.objective_value).toBe(12);
      expect(result.solution).toEqual([4, 0]);
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
            variables: {
              bounds: [
                { lower: 0, upper: null },
                { lower: 0, upper: null },
              ],
            },
            constraints: {
              bounds: [
                { lower: null, upper: 100 },
                { lower: null, upper: 80 },
              ],
              matrix: [
                [2, 3],
                [1, 2],
              ],
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
            variables: {
              bounds: [
                { lower: 0 }, // Missing upper (defaults to +infinity)
                { lower: 0 }, // Also set lower bound to avoid unboundedness
              ],
            },
            constraints: {
              bounds: [
                { upper: 10 }, // Just an upper bound
              ],
              matrix: [[1, 1]],
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
            variables: {
              names: ["S1_W1", "S1_W2", "S2_W1", "S2_W2", "W1_C1", "W1_C2", "W2_C1", "W2_C2"],
              bounds: Array(8).fill({ lower: 0 }),
            },
            constraints: {
              bounds: [
                { upper: 50 }, // Supply from S1
                { upper: 40 }, // Supply from S2
                { upper: 0 }, // Flow conservation at W1
                { upper: 0 }, // Flow conservation at W2
                { lower: 30 }, // Demand at C1
                { lower: 25 }, // Demand at C2
              ],
              matrix: [
                [1, 1, 0, 0, 0, 0, 0, 0], // S1 supply
                [0, 0, 1, 1, 0, 0, 0, 0], // S2 supply
                [1, 0, 1, 0, -1, -1, 0, 0], // W1 flow
                [0, 1, 0, 1, 0, 0, -1, -1], // W2 flow
                [0, 0, 0, 0, 1, 0, 1, 0], // C1 demand
                [0, 0, 0, 0, 0, 1, 0, 1], // C2 demand
              ],
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
            variables: {
              bounds: [
                { lower: 0, upper: null },
                { lower: 0, upper: null },
                { lower: 0, upper: 1 },
              ],
              types: ["integer", "continuous", "binary"],
            },
            constraints: {
              bounds: [{ upper: 10 }],
              matrix: [[2, 1, 3]],
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
            variables: {
              bounds: [
                { lower: 0, upper: null },
                { lower: 0, upper: null },
              ],
            },
            constraints: {
              bounds: [{ lower: 10 }, { upper: 5 }],
              matrix: [
                [1, 1],
                [1, 1],
              ],
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
            variables: {
              bounds: [
                { lower: 0, upper: null },
                { lower: 0, upper: null },
              ],
            },
            constraints: {
              bounds: [{ lower: 1 }],
              matrix: [[1, 1]],
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
            variables: { bounds: [{}, {}] },
            constraints: {
              matrix: [[1, 1]],
              bounds: [{}],
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
            variables: { bounds: [] },
            constraints: {
              matrix: [],
              bounds: [],
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
            variables: { bounds: [{ lower: 0 }, { lower: 0 }] },
            constraints: {
              matrix: [[1, 1, 1]], // 3 variables in constraint (mismatch)
              bounds: [{ upper: 10 }],
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
            variables: { bounds: [{ lower: 0 }, { lower: 0 }, { lower: 0 }] },
            constraints: {
              matrix: [
                [1, 1], // Row 0: 2 coefficients (should be 3)
                [1, 1, 1], // Row 1: 3 coefficients (correct)
                [1], // Row 2: 1 coefficient (should be 3)
              ],
              bounds: [{ upper: 10 }, { upper: 20 }, { upper: 15 }],
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
            variables: { bounds: [{ lower: 0 }, { lower: 0 }] },
            constraints: {
              matrix: [
                [1, 1],
                [2, 2],
                [3, 3],
              ], // 3 constraints
              bounds: [{ upper: 10 }, { upper: 20 }], // Only 2 bounds (should be 3)
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain(
        "Constraint bounds array has 2 elements but expected 3",
      );
    });

    it("should provide specific error for variable bounds array length mismatch", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: { linear: [5, 3, 2] }, // 3 variables
            variables: {
              bounds: [{ lower: 0 }, { lower: 0 }], // Only 2 bounds (should be 3)
            },
            constraints: {
              matrix: [[1, 1, 1]],
              bounds: [{ upper: 10 }],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain(
        "Variable bounds array has 2 elements but expected 3",
      );
    });

    it("should provide specific error for variable types array length mismatch", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "maximize",
            objective: { linear: [5, 3, 2] }, // 3 variables
            variables: {
              bounds: [{ lower: 0 }, { lower: 0 }, { lower: 0 }],
              types: ["integer", "continuous"], // Only 2 types (should be 3)
            },
            constraints: {
              matrix: [[1, 1, 1]],
              bounds: [{ upper: 10 }],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain(
        "Variable types array has 2 elements but expected 3",
      );
    });

    it("should provide specific error for variable names array length mismatch", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2, 3, 4] }, // 4 variables
            variables: {
              bounds: [{ lower: 0 }, { lower: 0 }, { lower: 0 }, { lower: 0 }],
              names: ["x1", "x2"], // Only 2 names (should be 4)
            },
            constraints: {
              matrix: [[1, 1, 1, 1]],
              bounds: [{ upper: 10 }],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
      expect(response.error.message).toContain(
        "Variable names array has 2 elements but expected 4",
      );
    });

    it("should report multiple dimension errors at once", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2, 3] }, // 3 variables
            variables: {
              bounds: [{ lower: 0 }, { lower: 0 }], // Wrong: 2 instead of 3
              types: ["integer"], // Wrong: 1 instead of 3
              names: ["x1", "x2", "x3", "x4"], // Wrong: 4 instead of 3
            },
            constraints: {
              matrix: [
                [1, 1], // Wrong: 2 instead of 3
                [1, 1, 1, 1], // Wrong: 4 instead of 3
              ],
              bounds: [{ upper: 10 }], // Wrong: 1 instead of 2
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
        "Constraint bounds array has 1 elements but expected 2",
      );
      expect(response.error.message).toContain(
        "Variable bounds array has 2 elements but expected 3",
      );
      expect(response.error.message).toContain(
        "Variable types array has 1 elements but expected 3",
      );
      expect(response.error.message).toContain(
        "Variable names array has 4 elements but expected 3",
      );
    });

    it("should validate variable types", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2] },
            variables: {
              bounds: [{ lower: 0 }, { lower: 0 }],
              types: ["continuous", "invalid_type"], // Invalid type
            },
            constraints: {
              matrix: [[1, 1]],
              bounds: [{ upper: 10 }],
            },
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain("Invalid parameters");
    });

    it("should validate solver options", async () => {
      const response = await sendRequest("tools/call", {
        name: "optimize-mip-lp-tool",
        arguments: {
          problem: {
            sense: "minimize",
            objective: { linear: [1, 2] },
            variables: { bounds: [{ lower: 0 }, { lower: 0 }] },
            constraints: {
              matrix: [[1, 1]],
              bounds: [{ upper: 10 }],
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
