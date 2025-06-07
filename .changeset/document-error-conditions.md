---
default: patch
---

Improve schema documentation to help prevent invalid data errors

Added comprehensive documentation of error conditions and validation requirements directly in the input schemas, including:
- Dimension consistency requirements for arrays
- Possible solver statuses (optimal, infeasible, unbounded, etc.)
- Input validation rules and common errors
- Valid enum values for all options

This helps AI assistants understand potential failure modes and provide better error handling when using the tool.
