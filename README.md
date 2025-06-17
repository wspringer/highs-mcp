# HiGHS MCP Server

A Model Context Protocol (MCP) server that provides linear programming (LP) and mixed-integer programming (MIP) optimization capabilities using the [HiGHS solver](https://highs.dev/).

<a href="https://buymeacoffee.com/up8kgm1" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="200" />
</a>

## Overview

This MCP server exposes the HiGHS optimization solver through a standardized interface, allowing AI assistants and other MCP clients to solve complex optimization problems including:

- Linear Programming (LP) problems
- Mixed-Integer Programming (MIP) problems
- Quadratic Programming (QP) problems for convex objectives
- Binary and integer variable constraints
- Multi-objective optimization

## Requirements

- Node.js >= 16.0.0

## Installation

```bash
npm install highs-mcp
```

Or clone and build from source:

```bash
git clone https://github.com/wspringer/highs-mcp.git
cd highs-mcp
npm install
npm run build
```

## Usage

### As an MCP Server

The server can be run directly:

```bash
npx highs-mcp
```

Or if built from source:

```bash
npm start
```

### Integration with Claude

To use this tool with Claude, add it to your Claude configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "highs": {
      "command": "npx",
      "args": ["highs-mcp"]
    }
  }
}
```

After adding the configuration, restart Claude to load the HiGHS optimization tool.

### Integration with Other MCP Clients

The HiGHS MCP server is compatible with any MCP client. Some popular options include:

- **[Claude Desktop](https://claude.ai/desktop)**: Anthropic's AI assistant with native MCP support
- **[MCP CLI](https://github.com/modelcontextprotocol/cli)**: Command-line interface for testing MCP servers
- **[MCP Inspector](https://github.com/modelcontextprotocol/inspector)**: Web-based tool for debugging MCP servers
- **Custom Applications**: Any application using the [MCP SDK](https://github.com/modelcontextprotocol/sdk)

## Tool API

The server provides a single tool: `optimize-mip-lp-tool`

### Input Schema

```typescript
{
  problem: {
    sense: 'minimize' | 'maximize',
    objective: {
      linear?: number[],  // Linear coefficients (optional if quadratic is provided)
      quadratic?: {       // Quadratic terms for convex QP (optional)
        // Dense format:
        dense?: number[][]  // Symmetric positive semidefinite matrix Q
        
        // OR Sparse format:
        sparse?: {
          rows: number[],     // Row indices (0-indexed)
          cols: number[],     // Column indices (0-indexed)
          values: number[],   // Values of Q matrix
          shape: [number, number]  // [num_variables, num_variables]
        }
      }
    },
    variables: Array<{
      name?: string,        // Variable name (optional, defaults to x1, x2, etc.)
      lb?: number,          // Lower bound (optional, defaults to 0)
      ub?: number,          // Upper bound (optional, defaults to +∞, except binary gets 1)
      type?: 'cont' | 'int' | 'bin'  // Variable type (optional, defaults to 'cont')
    }>,
    constraints: {
      // Dense format (for small problems):
      dense?: number[][],  // 2D array where each row is a constraint
      
      // OR Sparse format (for large problems with many zeros):
      sparse?: {
        rows: number[],    // Row indices of non-zero coefficients (0-indexed)
        cols: number[],    // Column indices of non-zero coefficients (0-indexed)
        values: number[],  // Non-zero coefficient values
        shape: [number, number]  // [num_constraints, num_variables]
      },
      
      sense: Array<'<=' | '>=' | '='>,  // Constraint directions
      rhs: number[]  // Right-hand side values
    }
  },
  options?: {
    // Solver Control
    time_limit?: number,              // Time limit in seconds
    presolve?: 'off' | 'choose' | 'on',
    solver?: 'simplex' | 'choose' | 'ipm' | 'pdlp',
    parallel?: 'off' | 'choose' | 'on',
    threads?: number,                 // Number of threads (0=automatic)
    random_seed?: number,             // Random seed for reproducibility
    
    // Tolerances
    primal_feasibility_tolerance?: number,  // Default: 1e-7
    dual_feasibility_tolerance?: number,    // Default: 1e-7
    ipm_optimality_tolerance?: number,      // Default: 1e-8
    infinite_cost?: number,                 // Default: 1e20
    infinite_bound?: number,                // Default: 1e20
    
    // Simplex Options
    simplex_strategy?: number,              // 0-4: algorithm strategy
    simplex_scale_strategy?: number,        // 0-5: scaling strategy
    simplex_dual_edge_weight_strategy?: number,  // -1 to 2: pricing
    simplex_iteration_limit?: number,       // Max iterations
    
    // MIP Options
    mip_detect_symmetry?: boolean,          // Detect symmetry
    mip_max_nodes?: number,                 // Max branch-and-bound nodes
    mip_rel_gap?: number,                   // Relative gap tolerance
    mip_abs_gap?: number,                   // Absolute gap tolerance
    mip_feasibility_tolerance?: number,     // MIP feasibility tolerance
    
    // Logging
    output_flag?: boolean,                  // Enable solver output
    log_to_console?: boolean,               // Console logging
    highs_debug_level?: number,             // 0-4: debug verbosity
    
    // Algorithm-specific
    ipm_iteration_limit?: number,           // IPM max iterations
    pdlp_scaling?: boolean,                 // PDLP scaling
    pdlp_iteration_limit?: number,          // PDLP max iterations
    
    // File I/O
    write_solution_to_file?: boolean,       // Write solution to file
    solution_file?: string,                 // Solution file path
    write_solution_style?: number           // Solution format style
  }
}
```

### Output Schema

```typescript
{
  status: 'optimal' | 'infeasible' | 'unbounded' | string,
  objective_value: number,
  solution: number[],         // Solution values for each variable
  dual_solution: number[],    // Dual values for constraints
  variable_duals: number[]    // Reduced costs for variables
}
```

### Notes on Quadratic Programming (QP)

- **Convex QP only**: The quadratic matrix Q must be positive semidefinite
- **Continuous variables only**: Integer/binary variables are not supported with quadratic objectives (no MIQP)
- **Format**: Objective function is: minimize c^T x + 0.5 x^T Q x
- **Matrix specification**: When specifying Q, values should be doubled to account for the 0.5 factor

## Use Cases

### 1. Production Planning

Optimize production schedules to maximize profit while respecting resource constraints:

```javascript
{
  problem: {
    sense: 'maximize',
    objective: {
      linear: [25, 40]  // Profit per unit
    },
    variables: [
      { name: 'ProductA' },  // Product A (defaults: cont, [0, +∞))
      { name: 'ProductB' }   // Product B (defaults: cont, [0, +∞))
    ],
    constraints: {
      dense: [
        [2, 3],  // Machine hours per unit
        [1, 2]   // Labor hours per unit
      ],
      sense: ['<=', '<='],
      rhs: [100, 80]  // Available machine/labor hours
    }
  }
}
```

### 2. Transportation/Logistics

Minimize transportation costs across a supply chain network:

```javascript
{
  problem: {
    sense: 'minimize',
    objective: {
      linear: [12.5, 14.2, 13.8, 11.9, 8.4, 9.1, 10.5, 6.2]
    },
    variables: [
      { name: 'S1_W1' }, { name: 'S1_W2' }, { name: 'S2_W1' }, { name: 'S2_W2' },
      { name: 'W1_C1' }, { name: 'W1_C2' }, { name: 'W2_C1' }, { name: 'W2_C2' }
      // All default to: cont, [0, +∞)
    ],
    constraints: {
      // Supply, flow conservation, and demand constraints (dense format)
      dense: [
        [1, 1, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 1, 0, 0, 0, 0],
        [1, 0, 1, 0, -1, -1, 0, 0],
        [0, 1, 0, 1, 0, 0, -1, -1],
        [0, 0, 0, 0, 1, 0, 1, 0],
        [0, 0, 0, 0, 0, 1, 0, 1]
      ],
      sense: ['<=', '<=', '=', '=', '>=', '>='],
      rhs: [50, 40, 0, 0, 30, 25]  // Supply, conservation, demand
    }
  }
}
```

### 3. Portfolio Optimization

Optimize investment allocation with risk constraints:

```javascript
{
  problem: {
    sense: 'maximize',
    objective: {
      linear: [0.08, 0.12, 0.10, 0.15]  // Expected returns
    },
    variables: [
      { name: 'Bonds', ub: 0.4 },         // Max 40% in bonds
      { name: 'Stocks', ub: 0.6 },        // Max 60% in stocks
      { name: 'RealEstate', ub: 0.3 },    // Max 30% in real estate
      { name: 'Commodities', ub: 0.2 }    // Max 20% in commodities
      // All default to: cont, lb=0
    ],
    constraints: {
      dense: [
        [1, 1, 1, 1],           // Total allocation = 100%
        [0.02, 0.15, 0.08, 0.20]  // Risk constraint
      ],
      sense: ['=', '<='],
      rhs: [1, 0.10]  // Exactly 100% allocated, max 10% risk
    }
  }
}
```

### 4. Portfolio Optimization with Risk (Quadratic Programming)

Minimize portfolio risk (variance) while achieving target return:

```javascript
{
  problem: {
    sense: 'minimize',
    objective: {
      // Quadratic: minimize portfolio variance (risk)
      quadratic: {
        dense: [  // Covariance matrix (×2 for 0.5 factor)
          [0.2, 0.04, 0.02],
          [0.04, 0.1, 0.04], 
          [0.02, 0.04, 0.16]
        ]
      }
    },
    variables: [
      { name: 'Stock_A', lb: 0 },
      { name: 'Stock_B', lb: 0 },
      { name: 'Stock_C', lb: 0 }
    ],
    constraints: {
      dense: [
        [1, 1, 1],              // Sum of weights = 1
        [0.1, 0.12, 0.08]       // Expected return >= target
      ],
      sense: ['=', '>='],
      rhs: [1, 0.1]  // 100% allocation, min 10% return
    }
  }
}
```

### 5. Resource Allocation

Optimize resource allocation across projects with integer constraints:

```javascript
{
  problem: {
    sense: 'maximize',
    objective: {
      linear: [100, 150, 80]  // Value per project
    },
    variables: [
      { name: 'ProjectA', type: 'bin' },  // Binary: select or not
      { name: 'ProjectB', type: 'bin' },  // Binary: select or not
      { name: 'ProjectC', type: 'bin' }   // Binary: select or not
      // Binary defaults to [0, 1] bounds
    ],
    constraints: {
      dense: [
        [5, 8, 3],   // Resource requirements
        [2, 3, 1]    // Time requirements
      ],
      sense: ['<=', '<='],
      rhs: [10, 5]  // Available resources/time
    }
  }
}
```

### 5. Large Sparse Problems

For large optimization problems with mostly zero coefficients, use the sparse format for better memory efficiency:

```javascript
{
  problem: {
    sense: 'minimize',
    objective: {
      linear: [1, 2, 3, 4]  // Minimize x1 + 2x2 + 3x3 + 4x4
    },
    variables: [
      {}, {}, {}, {}  // All default to: cont, [0, +∞)
    ],
    constraints: {
      // Sparse format: only specify non-zero coefficients
      sparse: {
        rows: [0, 0, 1, 1],    // Row indices
        cols: [0, 2, 1, 3],    // Column indices  
        values: [1, 1, 1, 1],  // Non-zero values
        shape: [2, 4]          // 2 constraints, 4 variables
      },
      // Represents: x1 + x3 >= 2, x2 + x4 >= 3
      sense: ['>=', '>='],
      rhs: [2, 3]
    }
  }
}
```

Use sparse format when:
- Problem has > 1000 variables or constraints
- Matrix has < 10% non-zero coefficients
- Memory efficiency is important

### 6. Enhanced Solver Options

Fine-tune solver behavior with comprehensive HiGHS options:

```javascript
{
  problem: {
    sense: 'minimize',
    objective: { linear: [1, 1] },
    variables: [{}, {}],
    constraints: {
      dense: [[1, 1]],
      sense: ['>='],
      rhs: [1]
    }
  },
  options: {
    // Algorithm Control
    solver: 'simplex',
    simplex_strategy: 1,                    // Dual simplex
    simplex_dual_edge_weight_strategy: 1,   // Devex pricing
    simplex_scale_strategy: 2,              // Equilibration scaling
    
    // Performance Tuning
    parallel: 'on',
    threads: 4,
    simplex_iteration_limit: 10000,
    
    // Tolerances
    primal_feasibility_tolerance: 1e-8,
    dual_feasibility_tolerance: 1e-8,
    
    // Debugging
    output_flag: true,
    log_to_console: true,
    highs_debug_level: 1,
    
    // MIP Control (for integer problems)
    mip_detect_symmetry: true,
    mip_max_nodes: 5000,
    mip_rel_gap: 0.001
  }
}
```

**Key Option Categories:**

- **Solver Control**: Algorithm selection, parallelization, time limits
- **Tolerances**: Precision control for feasibility and optimality
- **Simplex Options**: Strategy, scaling, pricing, iteration limits
- **MIP Options**: Symmetry detection, node limits, gap tolerances
- **Logging**: Output control, debugging levels, file output
- **Algorithm-specific**: IPM and PDLP specialized options

## Features

- **High Performance**: Built on the HiGHS solver, one of the fastest open-source optimization solvers
- **Sparse Matrix Support**: Efficient handling of large-scale problems with sparse constraint matrices
- **Type Safety**: Full TypeScript support with Zod validation for robust error handling
- **Compact Variable Format**: Self-contained variable specifications with smart defaults
- **Flexible Problem Types**: Supports continuous, integer, and binary variables
- **Multiple Solver Methods**: Choose between simplex, interior point, and other algorithms
- **Comprehensive Output**: Returns primal solution, dual values, and reduced costs

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test        # Run tests once
npm run test:watch  # Run tests in watch mode
npm run test:ui     # Run tests with UI
```

### Type Checking

```bash
npx tsc --noEmit
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - Copyright (c) 2024 Wilfred Springer

## Related Projects

- [HiGHS](https://highs.dev/) - The underlying optimization solver
- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol specification
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - SDK for building MCP servers
