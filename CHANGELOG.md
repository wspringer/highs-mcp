## 0.3.2 (2025-06-17)

### Features

#### Add quadratic objective support for convex QP problems

Added support for quadratic programming (QP) problems, allowing optimization of quadratic objectives of the form `minimize c^T x + 0.5 x^T Q x`. The quadratic matrix Q can be specified in either dense or sparse format, and must be positive semidefinite for convexity. This enhancement enables solving portfolio optimization, least squares, and other convex QP problems. Note that mixed-integer quadratic programming (MIQP) is not supported - only continuous variables are allowed with quadratic objectives.

## 0.3.1 (2025-06-08)

### Fixes

- Reorganization of the codebase

## 0.3.0 (2025-06-07)

### Breaking Changes

- Replace verbose variable format with compact self-contained format. Variables now use a compact array of objects where each variable specifies its properties (name, lb, ub, type) in a single object with smart defaults, replacing the previous format with separate arrays for bounds, types, and names. This eliminates array synchronization errors and reduces verbosity while using industry-standard abbreviations (lb/ub for bounds, cont/int/bin for types).

### Features

- Enhanced solver parameter control with 40+ new HiGHS options for fine-grained performance tuning and algorithm selection. Adds comprehensive support for solver control, tolerances, simplex options, MIP options, logging, and algorithm-specific parameters while maintaining full backward compatibility.

## 0.2.0 (2025-06-07)

### Breaking Changes

#### Add sparse matrix support for constraint matrices

This release adds support for sparse matrix representation in constraint specifications, enabling efficient handling of large-scale optimization problems with mostly zero coefficients.

**New Features:**

- Sparse matrix format using COO (Coordinate) representation
- Backward compatible with existing dense matrix format
- Comprehensive validation for sparse matrix inputs
- Memory-efficient handling of large problems

**Usage:**
Use the new `sparse` format instead of `dense` for problems with many zero coefficients:

```json
{
  "constraints": {
    "sparse": {
      "rows": [0, 0, 1, 1],
      "cols": [0, 2, 1, 3],
      "values": [1, 1, 1, 1],
      "shape": [2, 4]
    },
    "sense": [">=", ">="],
    "rhs": [2, 3]
  }
}
```

Recommended for problems with > 1000 variables/constraints or < 10% non-zero coefficients.

## 0.1.0 (2025-06-07)

### Breaking Changes

- Replace constraint bounds format with intuitive sense/rhs specification. Constraints now use `sense` (array of "<=", ">=", "=") and `rhs` (array of numbers) instead of the previous `bounds` format, providing a more natural mathematical notation that directly matches standard optimization problem formulations.

### Fixes

#### Improve schema documentation to help prevent invalid data errors

Added comprehensive documentation of error conditions and validation requirements directly in the input schemas, including:
- Dimension consistency requirements for arrays
- Possible solver statuses (optimal, infeasible, unbounded, etc.)
- Input validation rules and common errors
- Valid enum values for all options

This helps AI assistants understand potential failure modes and provide better error handling when using the tool.

## 0.0.4 (2025-06-05)

### Fixes

#### Improve error reporting for inconsistent problem dimensions

Enhanced the validation error messages to provide specific details about dimension mismatches:
- Reports which constraint row has the wrong number of coefficients
- Shows the actual vs expected counts for all dimension errors
- Reports multiple dimension errors at once instead of stopping at the first one
- Provides clearer context about what each dimension should match

This makes it much easier to debug optimization problems with incorrect dimensions.

#### Add Node.js version check on startup

Added validation to ensure the MCP server runs on Node.js version 16.0.0 or higher:
- Prints the current Node.js version on startup for debugging
- Throws a clear error message if the Node version is below 16.0.0
- Helps users understand why the server might fail due to highs-js dependencies
- Added test coverage for the version check functionality

This prevents cryptic errors when running on older Node.js versions and provides clear guidance to users about the minimum requirements.

#### Fix server version reporting

Server now dynamically reads version from package.json instead of using hardcoded "0.0.1".

## 0.0.3 (2025-06-04)

### Fixes

- Add a repository link
- Update the README

## 0.0.2 (2025-06-04)

### Features

- Stronger validation of data passed to the server

### Fixes

- Add a README and set the license
- Activate knope bot for releases
- Prevent duplication between the JSON schema and the Zod structure used to validate the data getting passed
