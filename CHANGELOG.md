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
