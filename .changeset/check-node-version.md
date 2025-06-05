---
default: patch
---

# Add Node.js version check on startup

Added validation to ensure the MCP server runs on Node.js version 16.0.0 or higher:
- Prints the current Node.js version on startup for debugging
- Throws a clear error message if the Node version is below 16.0.0
- Helps users understand why the server might fail due to highs-js dependencies
- Added test coverage for the version check functionality

This prevents cryptic errors when running on older Node.js versions and provides clear guidance to users about the minimum requirements.