# Fix a GitHub issue

Please analyze and fix the GitHub issue: $ARGUMENTS.

Follow these steps:

1. Use gh issue view to get the issue details
2. Understand the problem described in the issue
3. Search the codebase for relevant files
4. Start developing the issue by creating a branch using `gh issue develop -c
{issue number} --name {branch name}`, taking the issue number from the
   arguments, using a sensible branch name.
5. Implement the necessary changes to fix the issue
6. Write and run tests to verify the fix
7. Ensure code passes linting and type checking
8. Use `knope document-change` to document the change.
