# Branch Protection Setup

To ensure tests are executed before merging PRs, configure the following branch protection rules for the `main` branch:

## GitHub Repository Settings

1. Go to your repository on GitHub
2. Click on **Settings** → **Branches**
3. Click **Add rule** under "Branch protection rules"
4. Enter `main` as the branch name pattern
5. Configure the following settings:

### Required Status Checks
- ✅ **Require status checks to pass before merging**
  - ✅ **Require branches to be up to date before merging**
  - Select these required status checks:
    - `test (18.x)`
    - `test (20.x)`
    - `test-macos`
    - `test-windows`

### Additional Recommended Settings
- ✅ **Require a pull request before merging**
  - ✅ **Require approvals** (set to at least 1)
  - ✅ **Dismiss stale pull request approvals when new commits are pushed**
  - ✅ **Require review from CODEOWNERS** (if you have a CODEOWNERS file)
  
- ✅ **Require conversation resolution before merging**
- ✅ **Require linear history** (optional, but helps keep history clean)
- ✅ **Include administrators** (recommended for consistency)

6. Click **Create** to save the branch protection rule

## What This Achieves

With these settings:
- All PRs must pass the CI tests on multiple Node.js versions and operating systems
- The branch must be up to date with `main` before merging
- Code review is required (if enabled)
- All PR conversations must be resolved
- Tests run automatically on every push to the PR

## CI Workflow Overview

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs:
- **Linting** - Ensures code style and quality
- **Building** - Compiles TypeScript and copies required files
- **Testing** - Runs the full test suite

Tests run on:
- Ubuntu (Node.js 18.x and 20.x)
- macOS (Node.js 20.x)
- Windows (Node.js 20.x)

This ensures cross-platform compatibility and catches platform-specific issues early.