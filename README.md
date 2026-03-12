# ftDamage

Full Thrust fleet/ship instance generation and browser test harnesses.

## Quick Start

```bash
./scripts/bootstrap.sh
```

The bootstrap script will:

1. Install npm dependencies
2. Build TypeScript
3. Regenerate `generated/` fleets from `game/scenario.json`

## Common Commands

```bash
npm run generate:fleets
npm run test:unit
```

Open browser tools directly:

- `tests/damage.html` (damage runner with write-back support)
- `tests/fleet.html` (fleet/ship viewer from local `generated/` selection)

## Tests

Run terminal unit tests:

```bash
npm run test:unit
```

Run reproducibility verification (unit tests twice + simulation twice with output hash check):

```bash
npm run test:verify-repro
```

Run ship damage simulation test (generates per-round JSON/HTML output):

```bash
npm run test:ship-sim
```

Simulation output index:

- `test-output/ship-damage-sim/index.html`

Browser test pages:

- `tests/damage.html`
- `tests/fleet.html`

## Markdown Preview (VS Code)

- Open preview: `Cmd+Shift+V` (`markdown.showPreview`)
- Open preview to side: `Cmd+K`, then `V` (`markdown.showPreviewToSide`)

## Cross-Machine Sync

Use Git as the source of truth:

```bash
git checkout main
git pull
./scripts/bootstrap.sh
```

## References

[Rules for Full Thrust First Edition: FTE1: E1](/docs/FullThrustFirstEdition.md)
