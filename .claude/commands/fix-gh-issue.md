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
10. Document the change in a changeset, following knope's convention of having
    changesets. The change should not cover changes to the codebase itself. It
    should just cover the _effect_ of the change. Keep the description concise
    and compact. Feel free to elaborate a bit more in case of significant
    changes. Don't use `knope document-change` since that doesn't work, calling
    it from Claude.

Bear in mind that in this project, for a knope changeset the format of the
frontmatter needs to be something like this:

```
---
default: major|minor|patch
---
```

That is to say: use the key `default` instead of the project name.


