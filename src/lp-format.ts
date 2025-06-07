import { z } from "zod";
import { ProblemSchema } from "./schemas.js";

export function problemToLPFormat(problem: z.infer<typeof ProblemSchema>): string {
  const { sense, objective, constraints, variables } = problem;
  const numVars = objective.linear.length;

  // Determine number of constraints and convert sparse to dense if needed
  let constraintMatrix: number[][];
  let numConstraints: number;

  if ("dense" in constraints) {
    // Already in dense format
    constraintMatrix = constraints.dense;
    numConstraints = constraintMatrix.length;
  } else if ("sparse" in constraints) {
    // Convert sparse to dense format
    const sparse = constraints.sparse;
    [numConstraints] = sparse.shape;
    const numCols = sparse.shape[1];

    // Initialize dense matrix with zeros
    constraintMatrix = Array(numConstraints)
      .fill(null)
      .map(() => Array(numCols).fill(0));

    // Fill in non-zero values
    for (let i = 0; i < sparse.values.length; i++) {
      constraintMatrix[sparse.rows[i]][sparse.cols[i]] = sparse.values[i];
    }
  } else {
    throw new Error("Invalid constraint format");
  }

  let lpString = "";

  // Objective function
  lpString += sense === "minimize" ? "Minimize\n" : "Maximize\n";
  lpString += " obj: ";

  const objTerms = [];
  for (let i = 0; i < numVars; i++) {
    const coeff = objective.linear[i];
    const varName = variables[i].name || `x${i + 1}`;
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
    const row = constraintMatrix[i];
    const sense = constraints.sense[i];
    const rhs = constraints.rhs[i];

    const terms = [];
    for (let j = 0; j < numVars; j++) {
      const coeff = row[j];
      const variable = variables[j];
      const varName = variable.name || `x${j + 1}`;
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
    lpString += ` c${i + 1}: ${constraintExpr} ${sense} ${rhs}\n`;
  }

  // Variable bounds
  lpString += "Bounds\n";
  for (let i = 0; i < numVars; i++) {
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
  const integerVars = [];
  const binaryVars = [];

  for (let i = 0; i < numVars; i++) {
    const variable = variables[i];
    const varName = variable.name || `x${i + 1}`;
    const variableType = variable.type || "cont";

    if (variableType === "int") {
      integerVars.push(varName);
    } else if (variableType === "bin") {
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

  lpString += "End\n";

  return lpString;
}
