---
name: shipclass-validator
description: Validate and repair Full Thrust ship class JSON files against the ship class schema. Use when editing `generic/*.shipclass.json`, reviewing schema compliance, diagnosing invalid class payloads, or bulk-checking class data before commit.
---

# Shipclass Validator

Validate `generic/*.shipclass.json` files against `generic/full-thrust-ship-class.schema.json` constraints, report exact file/field errors, and apply minimal fixes when requested.

## Workflow

1. Run the bundled validator script first for deterministic checks:
```powershell
python shipclass-validator/scripts/validate_shipclass.py generic/*.shipclass.json
```
2. If validation fails, patch only the fields required to satisfy constraints.
3. Re-run the validator and confirm zero errors.
4. Summarize fixes as `file -> field -> change`.

## Common Fixes

- Add missing required keys: `classKey`, `name`, `thrust`, `damage`, `firecons`, `weapons`.
- Remove unexpected keys (schema has `additionalProperties: false` at top level and in nested objects).
- Enforce enums:
- weapon `type` is `BEAM`.
- weapon `class` is `A`, `B`, or `C`.
- weapon arcs are `F`, `P`, `S`, `A`.
- Enforce integer track cells of `1` in ship class damage tracks.
- Keep `damage.total` aligned with sum of track cells as a consistency rule.

## Repair Policy

- Prefer the smallest valid edit over broad rewrites.
- Preserve existing ordering/formatting style in touched JSON files.
- Do not infer new weapons or firecons counts unless user asks for design changes.
- For ambiguous intent, make the schema-minimal fix and call out the assumption.

## References

- Read [references/shipclass-rules.md](references/shipclass-rules.md) for normalized field constraints and consistency checks used by this skill.
