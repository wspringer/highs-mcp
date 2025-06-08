import { z } from "zod";
import { ProblemSchema } from "./schemas.js";

/**
 * Encodes an optimization problem into CPLEX LP format that can be parsed by HiGHS.
 * 
 * The LP format consists of several sections:
 * - Objective: The function to minimize or maximize
 * - Subject To: The constraints
 * - Bounds: Variable bounds (if not default)
 * - General: Integer variables
 * - Binary: Binary variables
 * 
 * @param problem - The optimization problem definition
 * @returns The problem encoded in CPLEX LP format
 */
export function encode(problem: z.infer<typeof ProblemSchema>): string {
  const { sense, objective, constraints, variables } = problem;
  const numVars = objective.linear.length;

  // Convert constraints to dense format for easier processing
  const { constraintMatrix, numConstraints } = convertConstraintsToDense(constraints);

  let lpString = "";

  // Build objective function section
  lpString += formatObjective(sense, objective, variables);

  // Build constraints section
  lpString += formatConstraints(constraintMatrix, constraints, variables);

  // Build bounds section
  lpString += formatBounds(variables);

  // Build variable types section (integer/binary)
  lpString += formatVariableTypes(variables);

  lpString += "End\n";

  return lpString;
}

/**
 * Converts constraints from either dense or sparse format to dense format.
 * Sparse format is converted by expanding the COO representation into a full matrix.
 * 
 * @param constraints - The constraints in either dense or sparse format
 * @returns The constraint matrix in dense format and the number of constraints
 */
function convertConstraintsToDense(constraints: z.infer<typeof ProblemSchema>["constraints"]): {
  constraintMatrix: number[][];
  numConstraints: number;
} {
  if ("dense" in constraints) {
    // Already in dense format
    return {
      constraintMatrix: constraints.dense,
      numConstraints: constraints.dense.length
    };
  } else if ("sparse" in constraints) {
    // Convert sparse to dense format
    const sparse = constraints.sparse;
    const [numConstraints, numCols] = sparse.shape;

    // Initialize dense matrix with zeros
    const constraintMatrix = Array(numConstraints)
      .fill(null)
      .map(() => Array(numCols).fill(0));

    // Fill in non-zero values from sparse representation
    for (let i = 0; i < sparse.values.length; i++) {
      constraintMatrix[sparse.rows[i]][sparse.cols[i]] = sparse.values[i];
    }

    return { constraintMatrix, numConstraints };
  } else {
    throw new Error("Invalid constraint format");
  }
}

/**
 * Formats a coefficient for display in LP format.
 * Handles special cases like coefficients of 1, -1, and proper sign formatting.
 * 
 * @param coeff - The coefficient value
 * @param varName - The variable name
 * @param isFirst - Whether this is the first term (affects sign handling)
 * @returns The formatted term string
 */
function formatCoefficient(coeff: number, varName: string, isFirst: boolean = false): string {
  if (coeff === 0) return "";
  
  if (coeff === 1) {
    return isFirst ? varName : `+ ${varName}`;
  } else if (coeff === -1) {
    return `- ${varName}`;
  } else if (coeff > 0) {
    return isFirst ? `${coeff} ${varName}` : `+ ${coeff} ${varName}`;
  } else {
    return `- ${Math.abs(coeff)} ${varName}`;
  }
}

/**
 * Formats the objective function section of the LP file.
 * 
 * @param sense - Whether to minimize or maximize
 * @param objective - The objective function coefficients
 * @param variables - Variable definitions (for names)
 * @returns The formatted objective section string
 */
function formatObjective(
  sense: "minimize" | "maximize",
  objective: z.infer<typeof ProblemSchema>["objective"],
  variables: z.infer<typeof ProblemSchema>["variables"]
): string {
  let result = sense === "minimize" ? "Minimize\n" : "Maximize\n";
  result += " obj: ";

  const terms: string[] = [];
  let hasTerms = false;

  for (let i = 0; i < objective.linear.length; i++) {
    const coeff = objective.linear[i];
    const varName = variables[i].name || `x${i + 1}`;
    const term = formatCoefficient(coeff, varName, !hasTerms);
    if (term) {
      terms.push(term);
      hasTerms = true;
    }
  }

  result += terms.join(" ") + "\n";
  return result;
}

/**
 * Formats the constraints section of the LP file.
 * 
 * @param constraintMatrix - The constraint coefficients in dense format
 * @param constraints - Constraint metadata (sense, rhs)
 * @param variables - Variable definitions (for names)
 * @returns The formatted constraints section string
 */
function formatConstraints(
  constraintMatrix: number[][],
  constraints: z.infer<typeof ProblemSchema>["constraints"],
  variables: z.infer<typeof ProblemSchema>["variables"]
): string {
  let result = "Subject To\n";

  for (let i = 0; i < constraintMatrix.length; i++) {
    const row = constraintMatrix[i];
    const sense = constraints.sense[i];
    const rhs = constraints.rhs[i];

    const terms: string[] = [];
    let hasTerms = false;

    for (let j = 0; j < row.length; j++) {
      const coeff = row[j];
      const varName = variables[j].name || `x${j + 1}`;
      const term = formatCoefficient(coeff, varName, !hasTerms);
      if (term) {
        terms.push(term);
        hasTerms = true;
      }
    }

    const constraintExpr = terms.join(" ");
    result += ` c${i + 1}: ${constraintExpr} ${sense} ${rhs}\n`;
  }

  return result;
}

/**
 * Formats the bounds section of the LP file.
 * Applies smart defaults based on variable type.
 * 
 * @param variables - Variable definitions including bounds and types
 * @returns The formatted bounds section string
 */
function formatBounds(
  variables: z.infer<typeof ProblemSchema>["variables"]
): string {
  let result = "Bounds\n";

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i];
    const varName = variable.name || `x${i + 1}`;

    // Apply smart defaults
    const variableType = variable.type || "cont";
    let lower = variable.lb !== undefined ? variable.lb : 0; // default to 0
    let upper = variable.ub !== undefined ? variable.ub : Infinity; // default to +∞

    // Binary variables automatically get [0, 1] bounds
    if (variableType === "bin") {
      lower = variable.lb !== undefined ? variable.lb : 0;
      upper = variable.ub !== undefined ? variable.ub : 1;
    }

    // Format the bounds based on their values
    if (lower === -Infinity && upper === Infinity) {
      result += ` ${varName} free\n`;
    } else if (lower === -Infinity) {
      result += ` -inf <= ${varName} <= ${upper}\n`;
    } else if (upper === Infinity) {
      result += ` ${lower} <= ${varName} <= +inf\n`;
    } else {
      result += ` ${lower} <= ${varName} <= ${upper}\n`;
    }
  }

  return result;
}

/**
 * Formats the variable types section of the LP file.
 * Groups variables by type (integer or binary) and creates appropriate sections.
 * 
 * @param variables - Variable definitions including types
 * @returns The formatted variable types sections string
 */
function formatVariableTypes(
  variables: z.infer<typeof ProblemSchema>["variables"]
): string {
  const integerVars: string[] = [];
  const binaryVars: string[] = [];

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i];
    const varName = variable.name || `x${i + 1}`;
    const variableType = variable.type || "cont";

    if (variableType === "int") {
      integerVars.push(varName);
    } else if (variableType === "bin") {
      binaryVars.push(varName);
    }
  }

  let result = "";

  if (integerVars.length > 0) {
    result += "General\n";
    result += " " + integerVars.join(" ") + "\n";
  }

  if (binaryVars.length > 0) {
    result += "Binary\n";
    result += " " + binaryVars.join(" ") + "\n";
  }

  return result;
}
