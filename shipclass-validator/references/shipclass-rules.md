# Ship Class Rules

Use these constraints when validating or fixing `generic/*.shipclass.json`.

## Required Top-Level Fields

- `classKey`: string
- `name`: string
- `thrust`: number, `>= 0`
- `damage`: object
- `firecons`: array of integer `1`
- `weapons`: array of weapon objects

Optional top-level field:
- `fighters`: object with `capacity` integer `>= 1`

Top-level `additionalProperties` are not allowed.

## Damage

- `damage.total`: integer, `>= 1`
- `damage.tracks`: array, at least one row
- Each row in `tracks`: array, at least one cell
- Each cell value: integer `1`
- No extra keys under `damage`

Consistency rule used by this skill:
- Keep `damage.total` equal to the total number of cells in `damage.tracks`.

## Weapons

Each weapon requires:
- `type`: string, must be `BEAM`, `NEEDLE`, or `PULSE`
- `class`: string, must be `A`, `B`, or `C`
- `arcs`: non-empty array of `F`, `P`, `S`, `A`

No additional weapon properties are allowed.

Type-specific arc rules:
- `NEEDLE`: exactly one arc.
- `PULSE`: exactly one arc and it must be `F`.

## Fixing Policy

- Apply minimal edits needed to satisfy schema.
- Preserve current file structure and style.
- Avoid changing game-design intent unless explicitly requested.
