# Project Overview

This is an MCP server offering HiGHS optimization tools to LLMs.

## Knope

In this project, we're keeping track of changes using Knope. Claude itself is
not capable of using the `knope` tool, so whenever we want Claude to define a
changeset, it needs to build it by hand. Here are some of the rules to take into
account:

- Changeset files live in the `.changeset` directory.
- Changeset files must have a unique name.
- Typically the name of the file is snake-cased, lower characters, with a `.md`
  suffix.
- Knope typically generates a file that is based on the first readable line in
  the body description of the changeset, abbreviating it, lowercasing it all and
  snake-casing it. It wouldn't hurt to maintain that convention.
- The body of the markdown file typically starts with a one line summary of the change, formatted as a title.

  ```markdown
  # Add support for version 3.0 of jquery
  ```

- The frontmatter should look like this:

  ```
  ---
  default: major|minor|patch
  ---
  ```

- The specific type: 'major', 'minor', or 'patch' should be based on an
  assesment of the character of the changes that are documented in that changeset.
  - Breaking changes: 'major'
  - Feature enhancements: 'minor'
  - Bug fixes and alike: 'patch'

### Feature example

```markdown
---
default: minor
---

# Add sparse matrix support

Implemented COO format sparse matrix handling for improved memory efficiency
with large optimization problems.
```

### Breaking change example

```markdown
---
default: major
---

# Restructure MCP server API endpoints

Renamed optimization endpoints and changed request/response format
for better consistency with MCP standards.
```
