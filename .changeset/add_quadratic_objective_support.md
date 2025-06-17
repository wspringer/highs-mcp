---
default: minor
---

# Add quadratic objective support for convex QP problems

Added support for quadratic programming (QP) problems, allowing optimization of quadratic objectives of the form `minimize c^T x + 0.5 x^T Q x`. The quadratic matrix Q can be specified in either dense or sparse format, and must be positive semidefinite for convexity. This enhancement enables solving portfolio optimization, least squares, and other convex QP problems. Note that mixed-integer quadratic programming (MIQP) is not supported - only continuous variables are allowed with quadratic objectives.