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

## Cross-Machine Sync

Use Git as the source of truth:

```bash
git checkout main
git pull
./scripts/bootstrap.sh
```
