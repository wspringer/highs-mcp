---
default: major
---

Add sparse matrix support for constraint matrices

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
