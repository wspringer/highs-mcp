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
5. Implement the necessary changes to fix the issue
6. Write and run tests to verify the fix
7. Ensure code passes linting and type checking
8. Check if the README is still correct, given the changes. Correct when needed.
9. Determine if this should be considered a patch, a minor or a major change,
   and ask me for confirmation.
10. Document the change in a changeset, following knope's convention. Check the
    `CLAUDE.md` file for details. Note that we need the changeset to document
    the _effect_ of the change. It should be information to _users_ of this
    project, not to _maintainers_ of this project. For small changes, keep it
    brief. For major changes, include details on how this change is breaking
    what we had before.
