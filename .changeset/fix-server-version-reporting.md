---
default: patch
---

# Fix server version reporting

Server now dynamically reads version from package.json instead of using hardcoded "0.0.1".