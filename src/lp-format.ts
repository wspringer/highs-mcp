import { z } from "zod";
import { ProblemSchema } from "./schemas.js";

export function problemToLPFormat(problem: z.infer<typeof ProblemSchema>): string {
  const { sense, objective, constraints, variables } = problem;
  const numVars = objective.linear.length;
  const numConstraints = constraints.matrix.length;

  let lpString = "";

  // Objective function
  lpString += sense === "minimize" ? "Minimize\n" : "Maximize\n";
  lpString += " obj: ";

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
  lpString += objTerms.join(" + ").replace(/\+ -/g, "-") + "\n";

  // Constraints
  lpString += "Subject To\n";
  for (let i = 0; i < numConstraints; i++) {
    const row = constraints.matrix[i];
    const sense = constraints.sense[i];
    const rhs = constraints.rhs[i];

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

    const constraintExpr = terms.join(" + ").replace(/\+ -/g, "-");
    lpString += ` c${i + 1}: ${constraintExpr} ${sense} ${rhs}\n`;
  }

  // Variable bounds
  lpString += "Bounds\n";
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
      if (variables.types[i] === "integer") {
        integerVars.push(varName);
      } else if (variables.types[i] === "binary") {
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
  }

  lpString += "End\n";

  return lpString;
}
