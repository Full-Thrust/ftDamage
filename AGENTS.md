# AGENTS.md

## Project Scope

- Repository purpose: Full Thrust ship and fleet data instances used for scenario setup and damage-state modeling.
- Primary working directory: `instance/`
- Main schema: `instance/full-thrust-ship-instance.schema.json` (Draft-07)
- Key artifact types:
- `*.instance.json`: full per-ship state including damage, drive, firecons, weapons.
- `*_fleet*.json` and `*_fleet_full_instances.json`: fleet/group payloads used for scenario composition.
- all definitions are from `docs/FullThrustFirstEdition.md`

## Reference Docs

- `docs/FullThrustFirstEdition.md`: project rules and canonical domain notes.
- `docs/FullThrustFirstEdition.md`: is known as `1E`.
- `full-thrust-digital-engine-spec.md` abstracted specification known as `spec`

## Reference Usage Rules

- When a task involves ship stats, validation rules, or scenario setup, read `docs/FullThrustFirstEdition.md` before editing.
- If the reference conflicts with this AGENTS.md, FullThrustFirstEdition.md wins.
- Load only relevant sections; do not paste large blocks into responses.

## Working Rules

- Prefer minimal, targeted edits to existing JSON files.
- Keep JSON valid at all times (UTF-8, no comments, no trailing commas).
- Preserve existing key order and formatting style in touched files.
- Do not rename or relocate files unless explicitly requested.
- Do not modify `full-thrust-validated-instances.zip` unless the user asks for regenerated artifacts.

## Data Conventions

- Generic ship definitions `generic/*shipclass.json`
- For ship instance files (`*.instance.json`), keep required top-level keys:
- `classKey`, `name`, `position`, `heading`, `speed`, `status`, `damage`, `drive`, `firecons`, `weapons`
- `heading` is 1-12.
- `status` uses `0=destroyed`, `1=ok/undamaged`, `2=damaged/impaired` depending on field context.
- Weapon `class` is `A | B | C`.
- Weapon arcs are only `F | P | S | A`.
- Damage tracks are arrays of `0 | 1` values.

## Editing Expectations

- When adjusting a ship definition, keep internal consistency:
- `damage.total` should match the intended damage-capacity represented by tracks.
- Number of `firecons` entries should match the intended platform capability.
- Weapons list should reflect the class and arcs expected for that hull.
- For fleet files, preserve the existing position schema already used in that file (for example `xMm/yMm` in fleet stubs vs `x/y` in full instances).

## Validation Commands (PowerShell)

- Parse all JSON files:

```powershell
Get-ChildItem instance -Filter *.json | ForEach-Object {
  Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null
}
```

- Quick check one file:

```powershell
Get-Content instance\battleship.instance.json -Raw | ConvertFrom-Json | Out-Null
```

- If Node tooling is later added, prefer schema validation in CI against `full-thrust-ship-instance.schema.json`.

## Change Delivery

- Summarize exactly which files changed and why.
- Call out any assumptions where the schema allows multiple valid interpretations.
- If no automated schema validator is available in the repo, state that clearly after changes.
