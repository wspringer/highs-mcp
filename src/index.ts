#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import highsLoader from 'highs';

const server = new Server(
  {
    name: 'highs-mcp',
    version: '0.0.1',
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
      name: 'solve_optimization',
      description: 'Solve linear programming (LP) or mixed-integer programming (MIP) problems using HiGHS solver',
      inputSchema: {
        type: 'object',
        properties: {
          problem: {
            type: 'object',
            description: 'The optimization problem specification',
            properties: {
              sense: {
                type: 'string',
                enum: ['minimize', 'maximize'],
                description: 'Optimization direction',
              },
              objective: {
                type: 'object',
                description: 'Objective function coefficients',
                properties: {
                  linear: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Linear coefficients for each variable',
                  },
                },
                required: ['linear'],
              },
              constraints: {
                type: 'object',
                description: 'Constraint specifications',
                properties: {
                  matrix: {
                    type: 'array',
                    items: {
                      type: 'array',
                      items: { type: 'number' },
                    },
                    description: 'Constraint coefficient matrix (A in Ax ≤/=/≥ b)',
                  },
                  bounds: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        lower: { type: ['number', 'null'] },
                        upper: { type: ['number', 'null'] },
                      },
                    },
                    description: 'Bounds for each constraint row',
                  },
                },
                required: ['matrix', 'bounds'],
              },
              variables: {
                type: 'object',
                description: 'Variable specifications',
                properties: {
                  bounds: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        lower: { type: ['number', 'null'] },
                        upper: { type: ['number', 'null'] },
                      },
                    },
                    description: 'Bounds for each variable',
                  },
                  types: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['continuous', 'integer', 'binary'],
                    },
                    description: 'Type of each variable (optional, defaults to continuous)',
                  },
                  names: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Names for each variable (optional)',
                  },
                },
                required: ['bounds'],
              },
            },
            required: ['sense', 'objective', 'constraints', 'variables'],
          },
          options: {
            type: 'object',
            description: 'Solver options',
            properties: {
              time_limit: { type: 'number', description: 'Time limit in seconds' },
              presolve: { 
                type: 'string', 
                enum: ['off', 'choose', 'on'],
                description: 'Presolve option' 
              },
              solver: {
                type: 'string',
                enum: ['simplex', 'choose', 'ipm', 'pdlp'],
                description: 'Solver method'
              },
            },
          },
        },
        required: ['problem'],
      },
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

function problemToLPFormat(problem: any): string {
  const { sense, objective, constraints, variables } = problem;
  const numVars = objective.linear.length;
  const numConstraints = constraints.matrix.length;
  
  let lpString = '';
  
  // Objective function
  lpString += sense === 'minimize' ? 'Minimize\n' : 'Maximize\n';
  lpString += ' obj: ';
  
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
  lpString += objTerms.join(' + ').replace(/\+ -/g, '-') + '\n';
  
  // Constraints
  lpString += 'Subject To\n';
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
    
    const constraintExpr = terms.join(' + ').replace(/\+ -/g, '-');
    
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
  lpString += 'Bounds\n';
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
      if (variables.types[i] === 'integer') {
        integerVars.push(varName);
      } else if (variables.types[i] === 'binary') {
        binaryVars.push(varName);
      }
    }
    
    if (integerVars.length > 0) {
      lpString += 'General\n';
      lpString += ' ' + integerVars.join(' ') + '\n';
    }
    
    if (binaryVars.length > 0) {
      lpString += 'Binary\n';
      lpString += ' ' + binaryVars.join(' ') + '\n';
    }
  }
  
  lpString += 'End\n';
  
  return lpString;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'solve_optimization') {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${request.params.name}`
    );
  }

  const { problem, options } = request.params.arguments as any;

  try {
    const highs = await getHighsInstance();
    
    // Convert problem to LP format
    const lpString = problemToLPFormat(problem);
    
    // Solve the problem
    const result = highs.solve(lpString, options || {});
    
    if (result.Status === 'Optimal') {
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
            type: 'text',
            text: JSON.stringify({
              status: 'optimal',
              objective_value: result.ObjectiveValue,
              solution: solutionValues,
              dual_solution: constraintDuals,
              variable_duals: dualValues,
            }, null, 2),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: result.Status.toLowerCase().replace(/\s+/g, '_'),
              message: `Problem status: ${result.Status}`,
              objective_value: result.ObjectiveValue,
            }, null, 2),
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
  console.error('Starting HiGHS MCP server v0.0.1...');
  
  const transport = new StdioServerTransport();
  
  console.error('Connecting to stdio transport...');
  await server.connect(transport);
  
  console.error('HiGHS MCP server running - ready to solve optimization problems');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});