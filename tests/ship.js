(function (global) {
  "use strict";

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeCell(value) {
    return value === 0 ? 0 : 1;
  }

  function isGeneric(raw) {
    return Boolean(
      raw &&
        typeof raw === "object" &&
        raw.classKey &&
        typeof raw.thrust === "number" &&
        raw.damage &&
        Array.isArray(raw.damage.tracks) &&
        Array.isArray(raw.firecons) &&
        Array.isArray(raw.weapons)
    );
  }

  function isInstance(raw) {
    return Boolean(
      raw &&
        typeof raw === "object" &&
        raw.classKey &&
        raw.position &&
        raw.damage &&
        Array.isArray(raw.damage.tracks) &&
        raw.drive &&
        Array.isArray(raw.firecons) &&
        Array.isArray(raw.weapons)
    );
  }

  function defaultThrustForClass(classKey, fallback) {
    var table = {
      SCOUT_COURIER: 8,
      LANCER_CORVETTE: 8,
      FRIGATE: 6,
      DESTROYER: 6,
      LIGHT_CRUISER: 6,
      ESCORT_CRUISER: 6,
      HEAVY_CRUISER: 4,
      BATTLESHIP: 4,
      DREADNOUGHT: 2,
      CARRIER: 2,
    };
    if (classKey && Object.prototype.hasOwnProperty.call(table, classKey)) {
      return table[classKey];
    }
    return Number.isFinite(fallback) ? fallback : 0;
  }

  function toFighterGroups(capacity) {
    if (!Number.isFinite(capacity) || capacity <= 0) return undefined;
    var groups = [];
    var remaining = Math.floor(capacity);
    while (remaining > 0) {
      var count = Math.min(6, remaining);
      groups.push({ count: count, status: 1 });
      remaining -= count;
    }
    return groups;
  }

  function createInstanceFromGeneric(raw, options) {
    var opts = options || {};
    var tracks = (raw.damage && Array.isArray(raw.damage.tracks) ? raw.damage.tracks : []).map(function (row) {
      return (Array.isArray(row) ? row : []).map(sanitizeCell);
    });

    var total = 0;
    var hits = 0;
    for (var r = 0; r < tracks.length; r++) {
      total += tracks[r].length;
      for (var c = 0; c < tracks[r].length; c++) {
        if (tracks[r][c] === 0) hits++;
      }
    }

    return {
      classKey: raw.classKey,
      name: opts.name || raw.name || raw.classKey,
      position: opts.position ? deepClone(opts.position) : { x: 0, y: 0 },
      heading: Number.isFinite(opts.heading) ? opts.heading : 1,
      speed: Number.isFinite(opts.speed) ? opts.speed : 0,
      status: typeof opts.status === "number" ? opts.status : 1,
      damage: {
        total: total,
        hits: hits,
        tracks: tracks,
      },
      drive: {
        thrust: Number.isFinite(raw.thrust) ? raw.thrust : 0,
        status: 1,
      },
      firecons: Array.isArray(raw.firecons) ? raw.firecons.map(function () { return { status: 1 }; }) : [],
      weapons: Array.isArray(raw.weapons)
        ? raw.weapons.map(function (weapon) {
            return {
              type: weapon.type,
              class: weapon.class,
              arcs: Array.isArray(weapon.arcs) ? deepClone(weapon.arcs) : [],
              status: 1,
            };
          })
        : [],
      fighters: toFighterGroups(raw.fighters && raw.fighters.capacity),
    };
  }

  function normalizeTernary(value) {
    if (value === 0) return 0;
    if (value === 2) return 2;
    return 1;
  }

  function Ship(rawJson, options) {
    if (isInstance(rawJson)) {
      this.data = deepClone(rawJson);
    } else if (isGeneric(rawJson)) {
      this.data = createInstanceFromGeneric(rawJson, options || {});
    } else {
      throw new Error("Ship expects a generic or instance JSON object.");
    }

    this.normalize();
  }

  Ship.prototype.normalize = function () {
    var tracks = Array.isArray(this.data.damage && this.data.damage.tracks) ? this.data.damage.tracks : [];
    this.data.damage.tracks = tracks.map(function (row) {
      return (Array.isArray(row) ? row : []).map(sanitizeCell);
    });

    this.data.damage.total = this.countTrackBoxes(this.data.damage.tracks);
    this.data.damage.hits = this.countDestroyedBoxes(this.data.damage.tracks);

    this.data.firecons = Array.isArray(this.data.firecons)
      ? this.data.firecons.map(function (entry) { return { status: entry && entry.status === 0 ? 0 : 1 }; })
      : [];

    this.data.weapons = Array.isArray(this.data.weapons)
      ? this.data.weapons.map(function (weapon) {
          return {
            type: weapon.type,
            class: weapon.class,
            arcs: Array.isArray(weapon.arcs) ? deepClone(weapon.arcs) : [],
            status: weapon && weapon.status === 0 ? 0 : 1,
          };
        })
      : [];

    if (Array.isArray(this.data.fighters)) {
      this.data.fighters = this.data.fighters.map(function (group) {
        var count = Number(group && group.count);
        return {
          count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 6,
          status: normalizeTernary(group && group.status),
        };
      });
    }

    this.data.status = normalizeTernary(this.data.status);
    this.data.drive.status = normalizeTernary(this.data.drive.status);
    this.syncStatusFromDamage();
  };

  Ship.prototype.countTrackBoxes = function (tracks) {
    var n = 0;
    for (var r = 0; r < tracks.length; r++) {
      n += tracks[r].length;
    }
    return n;
  };

  Ship.prototype.countDestroyedBoxes = function (tracks) {
    var n = 0;
    for (var r = 0; r < tracks.length; r++) {
      for (var c = 0; c < tracks[r].length; c++) {
        if (tracks[r][c] === 0) n++;
      }
    }
    return n;
  };

  Ship.prototype.toJson = function () { return deepClone(this.data); };
  Ship.prototype.getClassKey = function () { return this.data.classKey; };
  Ship.prototype.setClassKey = function (v) { this.data.classKey = v; };
  Ship.prototype.getName = function () { return this.data.name; };
  Ship.prototype.setName = function (v) { this.data.name = v; };
  Ship.prototype.getStatus = function () { return this.data.status; };
  Ship.prototype.setStatus = function (v) { this.data.status = normalizeTernary(v); };
  Ship.prototype.getPosition = function () { return deepClone(this.data.position); };
  Ship.prototype.setPosition = function (v) { this.data.position = deepClone(v); };
  Ship.prototype.getHeading = function () { return this.data.heading; };
  Ship.prototype.setHeading = function (v) { this.data.heading = v; };
  Ship.prototype.getSpeed = function () { return this.data.speed; };
  Ship.prototype.setSpeed = function (v) { this.data.speed = v; };

  Ship.prototype.getDamageTotal = function () { return this.data.damage.total; };
  Ship.prototype.setDamageTotal = function (v) { this.data.damage.total = Math.max(0, Math.floor(v)); };
  Ship.prototype.getDamageHits = function () { return this.data.damage.hits; };
  Ship.prototype.setDamageHits = function (v) { this.data.damage.hits = Math.max(0, Math.floor(v)); };
  Ship.prototype.getDamageTracks = function () { return deepClone(this.data.damage.tracks); };
  Ship.prototype.setDamageTracks = function (tracks) {
    this.data.damage.tracks = (Array.isArray(tracks) ? tracks : []).map(function (row) {
      return (Array.isArray(row) ? row : []).map(sanitizeCell);
    });
    this.data.damage.total = this.countTrackBoxes(this.data.damage.tracks);
    this.data.damage.hits = this.countDestroyedBoxes(this.data.damage.tracks);
    this.syncStatusFromDamage();
  };

  Ship.prototype.getDriveThrust = function () { return this.data.drive.thrust; };
  Ship.prototype.setDriveThrust = function (v) { this.data.drive.thrust = Number.isFinite(v) ? v : 0; };
  Ship.prototype.getDriveStatus = function () { return this.data.drive.status; };
  Ship.prototype.setDriveStatus = function (v) { this.data.drive.status = normalizeTernary(v); };
  Ship.prototype.isDriveOperational = function () { return this.data.drive.status !== 0; };
  Ship.prototype.applyDriveCriticalHit = function () {
    if (this.data.drive.status === 0) return "disabled";
    if (this.data.drive.status === 1) {
      this.data.drive.thrust = Math.floor(this.data.drive.thrust / 2);
      this.data.drive.status = this.data.drive.thrust > 0 ? 2 : 0;
      return this.data.drive.status === 2 ? "halved" : "disabled";
    }
    this.data.drive.thrust = 0;
    this.data.drive.status = 0;
    return "disabled";
  };

  Ship.prototype.getFireconCount = function () { return this.data.firecons.length; };
  Ship.prototype.getFireconStatuses = function () {
    return this.data.firecons.map(function (entry) { return entry.status === 0 ? 0 : 1; });
  };
  Ship.prototype.getFireconStatus = function (index) {
    return this.data.firecons[index] && this.data.firecons[index].status === 0 ? 0 : 1;
  };
  Ship.prototype.setFireconStatus = function (index, status) {
    if (!this.data.firecons[index]) this.data.firecons[index] = { status: 1 };
    this.data.firecons[index].status = status === 0 ? 0 : 1;
  };
  Ship.prototype.getOperationalFireconIndices = function () {
    var out = [];
    for (var i = 0; i < this.data.firecons.length; i++) {
      if (this.data.firecons[i].status === 1) out.push(i);
    }
    return out;
  };
  Ship.prototype.destroyFirecon = function (index) {
    if (this.data.firecons[index]) this.data.firecons[index].status = 0;
  };

  Ship.prototype.getWeapons = function () { return deepClone(this.data.weapons); };
  Ship.prototype.getWeaponCount = function () { return this.data.weapons.length; };
  Ship.prototype.getWeaponStatus = function (index) {
    return this.data.weapons[index] && this.data.weapons[index].status === 0 ? 0 : 1;
  };
  Ship.prototype.setWeaponStatus = function (index, status) {
    if (this.data.weapons[index]) this.data.weapons[index].status = status === 0 ? 0 : 1;
  };
  Ship.prototype.getOperationalWeaponIndices = function () {
    var out = [];
    for (var i = 0; i < this.data.weapons.length; i++) {
      if (this.data.weapons[i].status === 1) out.push(i);
    }
    return out;
  };
  Ship.prototype.destroyWeapon = function (index) {
    if (this.data.weapons[index]) this.data.weapons[index].status = 0;
  };

  Ship.prototype.getFighterGroups = function () {
    return deepClone(this.data.fighters || []);
  };
  Ship.prototype.setFighterGroups = function (groups) {
    this.data.fighters = (Array.isArray(groups) ? groups : []).map(function (group) {
      var count = Number(group && group.count);
      return {
        count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 6,
        status: normalizeTernary(group && group.status),
      };
    });
  };
  Ship.prototype.getOperationalFighterGroupIndicesForThresholdChecks = function () {
    var fighters = this.data.fighters || [];
    var out = [];
    for (var i = 0; i < fighters.length; i++) {
      if (fighters[i].status === 1) out.push(i);
    }
    return out;
  };
  Ship.prototype.destroyFighterGroup = function (index) {
    if (this.data.fighters && this.data.fighters[index]) this.data.fighters[index].status = 0;
  };

  Ship.prototype.getThresholdCategory = function () {
    var fireconCount = this.getFireconCount();
    if (fireconCount <= 1) return "ESCORT";
    if (fireconCount === 2) return "CRUISER";
    return "CAPITAL";
  };

  Ship.prototype.syncStatusFromDamage = function () {
    if (this.getDamageTotal() > 0 && this.getDamageHits() >= this.getDamageTotal()) {
      this.setStatus(0);
      return;
    }
    if (this.getDamageHits() > 1) {
      this.setStatus(2);
      return;
    }
    this.setStatus(1);
  };

  Ship.prototype.resetToPristine = function () {
    var tracks = this.getDamageTracks().map(function (row) {
      return row.map(function () { return 1; });
    });
    this.setDamageTracks(tracks);
    this.setDamageHits(0);
    this.setDamageTotal(this.countTrackBoxes(tracks));
    this.setStatus(1);

    this.setDriveThrust(defaultThrustForClass(this.getClassKey(), this.getDriveThrust()));
    this.setDriveStatus(1);

    for (var i = 0; i < this.getFireconCount(); i++) {
      this.setFireconStatus(i, 1);
    }

    for (var w = 0; w < this.getWeaponCount(); w++) {
      this.setWeaponStatus(w, 1);
    }

    var fighters = this.data.fighters || [];
    for (var f = 0; f < fighters.length; f++) {
      fighters[f].status = 1;
      if (!Number.isFinite(fighters[f].count) || fighters[f].count < 1) {
        fighters[f].count = 6;
      }
    }
  };

  Ship.prototype.toHtmlReport = function () {
    var tracks = this.getDamageTracks();
    var rows = tracks.length
      ? tracks.map(function (row) { return "<div>" + row.map(function (cell) { return cell === 0 ? "[x]" : "[ ]"; }).join(" ") + "</div>"; }).join("\n")
      : "<div>No tracks</div>";

    return [
      "<!doctype html>",
      "<html lang=\"en\">",
      "<head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>",
      "<title>Ship Report</title>",
      "<style>body{font-family:Segoe UI,Arial,sans-serif;margin:20px;background:#f4f6f8;color:#111827}.card{background:#fff;border:1px solid #d1d5db;border-radius:8px;padding:12px;margin-bottom:10px}</style>",
      "</head><body>",
      "<h1>" + this.getName() + " (" + this.getClassKey() + ")</h1>",
      "<div class=\"card\">Status=" + this.getStatus() + " Damage=" + this.getDamageHits() + "/" + this.getDamageTotal() + "</div>",
      "<div class=\"card\"><h3>Tracks</h3>" + rows + "</div>",
      "</body></html>",
    ].join("\n");
  };

  global.FTShip = {
    Ship: Ship,
  };
})(window);
