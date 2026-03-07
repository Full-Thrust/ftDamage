import { Ship, ShipCategory } from "../model/Ship";
import { DamageReport, ThresholdReport } from "./types";

export abstract class AbstractDamageEngine {
  public applyHits(ship: Ship, hits: number): DamageReport {
    const tracks = ship.getDamageTracks();
    const total = ship.getDamageTotal();
    const previousHits = ship.getDamageHits();
    const boundedHits = Math.max(0, Math.floor(hits));

    const appliedHits = this.applyHitsToTracks(tracks, boundedHits);
    ship.setDamageTracks(tracks);

    const nextHits = ship.getDamageHits();
    const category = ship.getThresholdCategory();
    const crossedThresholds = this.thresholdCrossingsByRowCompletion(previousHits, nextHits, total, ship.getDamageTracks());
    const thresholdReports = this.applyThresholdChecks(ship, category, crossedThresholds);

    ship.syncStatusFromDamage();

    return {
      requestedHits: boundedHits,
      appliedHits,
      previousHits,
      nextHits,
      total,
      category,
      crossedThresholds,
      thresholdReports,
    };
  }

  protected abstract thresholdLossRollMin(category: ShipCategory, thresholdIndex: number): number;
  protected abstract rollD6(): number;

  protected thresholdCrossingsByRowCompletion(
    previousHits: number,
    nextHits: number,
    _total: number,
    tracks: number[][]
  ): number[] {
    const previousRows = this.completedRowsFromDestroyedHits(previousHits, tracks);
    const nextRows = this.completedRowsFromDestroyedHits(nextHits, tracks);
    const crossed: number[] = [];

    for (let i = previousRows + 1; i <= nextRows; i += 1) {
      crossed.push(i);
    }

    return crossed;
  }

  private applyHitsToTracks(tracks: number[][], hits: number): number {
    let applied = 0;

    for (let h = 0; h < hits; h += 1) {
      let done = false;
      for (let row = 0; row < tracks.length && !done; row += 1) {
        for (let col = 0; col < tracks[row].length; col += 1) {
          if (tracks[row][col] === 1) {
            tracks[row][col] = 0;
            applied += 1;
            done = true;
            break;
          }
        }
      }
      if (!done) break;
    }

    return applied;
  }

  private applyThresholdChecks(ship: Ship, category: ShipCategory, crossedThresholds: number[]): ThresholdReport[] {
    const reports: ThresholdReport[] = [];

    for (const thresholdIndex of crossedThresholds) {
      const minRoll = this.thresholdLossRollMin(category, thresholdIndex);
      let rolled = 0;
      let lost = 0;
      let weaponsLost = 0;
      let fireconsLost = 0;
      let fightersLost = 0;
      let driveLost = 0;
      let driveResult = "not-rolled";

      for (const index of ship.getOperationalWeaponIndices()) {
        rolled += 1;
        if (this.rollD6() >= minRoll) {
          ship.destroyWeapon(index);
          lost += 1;
          weaponsLost += 1;
        }
      }

      if (ship.isDriveOperational()) {
        rolled += 1;
        if (this.rollD6() >= minRoll) {
          driveResult = ship.applyDriveCriticalHit();
          if (driveResult !== "none") {
            lost += 1;
            driveLost = 1;
          }
        } else {
          driveResult = "survived";
        }
      }

      for (const index of ship.getOperationalFireconIndices()) {
        rolled += 1;
        if (this.rollD6() >= minRoll) {
          ship.destroyFirecon(index);
          lost += 1;
          fireconsLost += 1;
        }
      }

      for (const index of ship.getOperationalFighterGroupIndicesForThresholdChecks()) {
        rolled += 1;
        if (this.rollD6() >= minRoll) {
          ship.destroyFighterGroup(index);
          lost += 1;
          fightersLost += 1;
        }
      }

      reports.push({
        thresholdIndex,
        minRoll,
        rolled,
        lost,
        weaponsLost,
        fireconsLost,
        fightersLost,
        driveLost,
        weaponsDestroyed: ship.getWeapons().filter((weapon) => weapon.status === 0).length,
        fireconsDestroyed: ship.getFireconStatuses().filter((status) => status === 0).length,
        fightersDestroyed: ship.getFighterGroups().filter((group) => group.status === 0).length,
        driveResult,
      });
    }

    return reports;
  }

  private completedRowsFromDestroyedHits(hits: number, tracks: number[][]): number {
    let remaining = Math.max(0, hits);
    let rows = 0;

    for (const row of tracks) {
      if (!row.length) continue;
      if (remaining >= row.length) {
        rows += 1;
        remaining -= row.length;
      } else {
        break;
      }
    }

    return rows;
  }
}
