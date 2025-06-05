---
default: patch
---

# Improve error reporting for inconsistent problem dimensions

Enhanced the validation error messages to provide specific details about dimension mismatches:
- Reports which constraint row has the wrong number of coefficients
- Shows the actual vs expected counts for all dimension errors
- Reports multiple dimension errors at once instead of stopping at the first one
- Provides clearer context about what each dimension should match

This makes it much easier to debug optimization problems with incorrect dimensions.