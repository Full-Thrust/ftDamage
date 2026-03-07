(function (global) {
  "use strict";

  function AbstractDamageProcessor() {}

  AbstractDamageProcessor.prototype.rollD6 = function () {
    throw new Error("rollD6 must be implemented");
  };

  AbstractDamageProcessor.prototype.thresholdLossRollMin = function (_category, _thresholdIndex) {
    throw new Error("thresholdLossRollMin must be implemented");
  };

  AbstractDamageProcessor.prototype.applyHits = function (ship, hits) {
    var tracks = ship.getDamageTracks();
    var total = ship.getDamageTotal();
    var previousHits = ship.getDamageHits();
    var boundedHits = Math.max(0, Math.floor(Number(hits) || 0));

    var appliedHits = this.applyHitsToTracks(tracks, boundedHits);
    ship.setDamageTracks(tracks);

    var nextHits = ship.getDamageHits();
    var category = ship.getThresholdCategory();
    var crossedThresholds = this.thresholdCrossingsByRowCompletion(previousHits, nextHits, total, ship.getDamageTracks());
    var thresholdReports = this.applyThresholdChecks(ship, category, crossedThresholds);

    ship.syncStatusFromDamage();

    return {
      requestedHits: boundedHits,
      appliedHits: appliedHits,
      previousHits: previousHits,
      nextHits: nextHits,
      total: total,
      category: category,
      crossedThresholds: crossedThresholds,
      thresholdReports: thresholdReports,
    };
  };

  AbstractDamageProcessor.prototype.applyHitsToTracks = function (tracks, hits) {
    var applied = 0;

    for (var h = 0; h < hits; h++) {
      var done = false;

      for (var r = 0; r < tracks.length && !done; r++) {
        for (var c = 0; c < tracks[r].length; c++) {
          if (tracks[r][c] === 1) {
            tracks[r][c] = 0;
            applied++;
            done = true;
            break;
          }
        }
      }

      if (!done) break;
    }

    return applied;
  };

  AbstractDamageProcessor.prototype.thresholdCrossingsByRowCompletion = function (previousHits, nextHits, _total, tracks) {
    var previousRows = this.completedRowsFromDestroyedHits(previousHits, tracks);
    var nextRows = this.completedRowsFromDestroyedHits(nextHits, tracks);
    var crossed = [];

    for (var i = previousRows + 1; i <= nextRows; i++) {
      crossed.push(i);
    }

    return crossed;
  };

  AbstractDamageProcessor.prototype.applyThresholdChecks = function (ship, category, crossedThresholds) {
    var reports = [];

    for (var i = 0; i < crossedThresholds.length; i++) {
      var thresholdIndex = crossedThresholds[i];
      var minRoll = this.thresholdLossRollMin(category, thresholdIndex);
      var rolled = 0;
      var lost = 0;
      var weaponsLost = 0;
      var fireconsLost = 0;
      var fightersLost = 0;
      var driveLost = 0;
      var driveResult = "not-rolled";

      var weaponIndices = ship.getOperationalWeaponIndices();
      for (var w = 0; w < weaponIndices.length; w++) {
        rolled++;
        if (this.rollD6() >= minRoll) {
          ship.destroyWeapon(weaponIndices[w]);
          lost++;
          weaponsLost++;
        }
      }

      if (ship.isDriveOperational()) {
        rolled++;
        if (this.rollD6() >= minRoll) {
          driveResult = ship.applyDriveCriticalHit();
          if (driveResult !== "none") {
            lost++;
            driveLost = 1;
          }
        } else {
          driveResult = "survived";
        }
      }

      var fireconIndices = ship.getOperationalFireconIndices();
      for (var f = 0; f < fireconIndices.length; f++) {
        rolled++;
        if (this.rollD6() >= minRoll) {
          ship.destroyFirecon(fireconIndices[f]);
          lost++;
          fireconsLost++;
        }
      }

      var fighterIndices = ship.getOperationalFighterGroupIndicesForThresholdChecks();
      for (var g = 0; g < fighterIndices.length; g++) {
        rolled++;
        if (this.rollD6() >= minRoll) {
          ship.destroyFighterGroup(fighterIndices[g]);
          lost++;
          fightersLost++;
        }
      }

      reports.push({
        thresholdIndex: thresholdIndex,
        minRoll: minRoll,
        rolled: rolled,
        lost: lost,
        weaponsLost: weaponsLost,
        fireconsLost: fireconsLost,
        fightersLost: fightersLost,
        driveLost: driveLost,
        weaponsDestroyed: ship.getWeapons().filter(function (weapon) { return weapon.status === 0; }).length,
        fireconsDestroyed: ship.getFireconStatuses().filter(function (status) { return status === 0; }).length,
        fightersDestroyed: ship.getFighterGroups().filter(function (group) { return group.status === 0; }).length,
        driveResult: driveResult,
      });
    }

    return reports;
  };

  AbstractDamageProcessor.prototype.completedRowsFromDestroyedHits = function (hits, tracks) {
    var remaining = Math.max(0, hits);
    var rows = 0;

    for (var r = 0; r < tracks.length; r++) {
      var rowLength = Array.isArray(tracks[r]) ? tracks[r].length : 0;
      if (rowLength === 0) continue;

      if (remaining >= rowLength) {
        rows++;
        remaining -= rowLength;
      } else {
        break;
      }
    }

    return rows;
  };

  function Ft1eDamageProcessor() {
    AbstractDamageProcessor.call(this);
  }

  Ft1eDamageProcessor.prototype = Object.create(AbstractDamageProcessor.prototype);
  Ft1eDamageProcessor.prototype.constructor = Ft1eDamageProcessor;

  Ft1eDamageProcessor.prototype.thresholdLossRollMin = function (category, thresholdIndex) {
    if (category === "ESCORT") return 4;

    if (category === "CRUISER") {
      if (thresholdIndex === 1) return 6;
      return 4;
    }

    if (thresholdIndex === 1) return 6;
    if (thresholdIndex === 2) return 5;
    return 4;
  };

  Ft1eDamageProcessor.prototype.rollD6 = function () {
    return Math.floor(Math.random() * 6) + 1;
  };

  global.FTDamage = {
    AbstractDamageProcessor: AbstractDamageProcessor,
    Ft1eDamageProcessor: Ft1eDamageProcessor,
  };
})(window);
