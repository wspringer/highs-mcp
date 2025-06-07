---
default: major
---

Replace constraint bounds format with intuitive sense/rhs specification. Constraints now use `sense` (array of "<=", ">=", "=") and `rhs` (array of numbers) instead of the previous `bounds` format, providing a more natural mathematical notation that directly matches standard optimization problem formulations.
