---
default: major
---

Replace verbose variable format with compact self-contained format. Variables now use a compact array of objects where each variable specifies its properties (name, lb, ub, type) in a single object with smart defaults, replacing the previous format with separate arrays for bounds, types, and names. This eliminates array synchronization errors and reduces verbosity while using industry-standard abbreviations (lb/ub for bounds, cont/int/bin for types).