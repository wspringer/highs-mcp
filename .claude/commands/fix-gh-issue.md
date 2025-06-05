# Fix a GitHub issue

Please analyze and fix the GitHub issue: $ARGUMENTS.

Follow these steps:

1. Use gh issue view to get the issue details
2. Understand the problem described in the issue
3. Search the codebase for relevant files
4. Start developing the issue by creating a branch using `gh issue develop -c
{issue number} --name {branch name}`, taking the issue number from the
   arguments, using a sensible branch name. Include the issue number in the
   branch name, at the end.
1. Implement the necessary changes to fix the issue
2. Write and run tests to verify the fix
3. Ensure code passes linting and type checking
4. Check if the README is still correct, given the changes. Correct when needed.
5. Determine if this should be considered a patch, a minor or a major change,
   and ask me for confirmation.
6.  Document the change in a changeset, following knope's convention of having
   changesets.
