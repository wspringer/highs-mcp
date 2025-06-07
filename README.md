# HiGHS MCP Server

A Model Context Protocol (MCP) server that provides linear programming (LP) and mixed-integer programming (MIP) optimization capabilities using the [HiGHS solver](https://highs.dev/).

<a href="https://buymeacoffee.com/up8kgm1" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="200" />
</a>

## Overview

This MCP server exposes the HiGHS optimization solver through a standardized interface, allowing AI assistants and other MCP clients to solve complex optimization problems including:

- Linear Programming (LP) problems
- Mixed-Integer Programming (MIP) problems
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
      linear: number[]  // Coefficients for each variable
    },
    variables: {
      bounds: Array<{
        lower?: number | null,
        upper?: number | null
      }>,
      types?: Array<'continuous' | 'integer' | 'binary'>,
      names?: string[]
    },
    constraints: {
      matrix: number[][],  // Coefficient matrix (A in Ax ≤/=/≥ b) - at least one constraint required
      sense: Array<'<=' | '>=' | '='>,  // Constraint directions
      rhs: number[]  // Right-hand side values
    }
  },
  options?: {
    time_limit?: number,  // Time limit in seconds
    presolve?: 'off' | 'choose' | 'on',
    solver?: 'simplex' | 'choose' | 'ipm' | 'pdlp'
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
    variables: {
      bounds: [
        { lower: 0 },  // Product A
        { lower: 0 }   // Product B
      ]
    },
    constraints: {
      matrix: [
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
    variables: {
      names: ['S1_W1', 'S1_W2', 'S2_W1', 'S2_W2', 'W1_C1', 'W1_C2', 'W2_C1', 'W2_C2'],
      bounds: Array(8).fill({ lower: 0 })
    },
    constraints: {
      // Supply, flow conservation, and demand constraints
      matrix: [
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
    variables: {
      names: ['Bonds', 'Stocks', 'RealEstate', 'Commodities'],
      bounds: [
        { lower: 0, upper: 0.4 },  // Max 40% in bonds
        { lower: 0, upper: 0.6 },  // Max 60% in stocks
        { lower: 0, upper: 0.3 },  // Max 30% in real estate
        { lower: 0, upper: 0.2 }   // Max 20% in commodities
      ]
    },
    constraints: {
      matrix: [
        [1, 1, 1, 1],           // Total allocation = 100%
        [0.02, 0.15, 0.08, 0.20]  // Risk constraint
      ],
      sense: ['=', '<='],
      rhs: [1, 0.10]  // Exactly 100% allocated, max 10% risk
    }
  }
}
```

### 4. Resource Allocation

Optimize resource allocation across projects with integer constraints:

```javascript
{
  problem: {
    sense: 'maximize',
    objective: {
      linear: [100, 150, 80]  // Value per project
    },
    variables: {
      types: ['binary', 'binary', 'binary'],  // Select or not
      names: ['ProjectA', 'ProjectB', 'ProjectC']
    },
    constraints: {
      matrix: [
        [5, 8, 3],   // Resource requirements
        [2, 3, 1]    // Time requirements
      ],
      sense: ['<=', '<='],
      rhs: [10, 5]  // Available resources/time
    }
  }
}
```

## Features

- **High Performance**: Built on the HiGHS solver, one of the fastest open-source optimization solvers
- **Type Safety**: Full TypeScript support with Zod validation for robust error handling
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
