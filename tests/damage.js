(function () {
  var folderBtn = document.getElementById("pick-folder");
  var applyBtn = document.getElementById("apply-damage");
  var damagePercentInput = document.getElementById("damage-percent");
  var resetBtn = document.getElementById("reset-fleet");
  var rerunTestsBtn = document.getElementById("rerun-tests");

  var folderSummaryEl = document.getElementById("folder-summary");
  var testSummaryEl = document.getElementById("test-summary");
  var testResultsEl = document.getElementById("test-results");
  var runSummaryEl = document.getElementById("run-summary");
  var runResultsEl = document.getElementById("run-results");

  var generatedDirHandle = null;
  var lastPickedHandle = null;
  var DB_NAME = "ftdamage-folder-memory";
  var STORE_NAME = "handles";
  var HANDLE_KEY = "last-generated-folder";

  function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function expectEqual(actual, expected, label) {
    if (!deepEqual(actual, expected)) {
      throw new Error(label + " expected " + JSON.stringify(expected) + " but got " + JSON.stringify(actual));
    }
  }

  function countDestroyedBoxes(tracks) {
    var n = 0;
    for (var r = 0; r < tracks.length; r++) {
      for (var c = 0; c < tracks[r].length; c++) {
        if (tracks[r][c] === 0) n++;
      }
    }
    return n;
  }

  function countTrackBoxes(tracks) {
    var n = 0;
    for (var r = 0; r < tracks.length; r++) {
      n += Array.isArray(tracks[r]) ? tracks[r].length : 0;
    }
    return n;
  }

  function applyDamageToTracksInOrder(tracks, points) {
    var applied = 0;

    for (var p = 0; p < points; p++) {
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
  }

  function baseThrustForClass(classKey, fallback) {
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
      CARRIER: 2
    };

    if (classKey && Object.prototype.hasOwnProperty.call(table, classKey)) {
      return table[classKey];
    }

    return Number.isFinite(fallback) ? fallback : 0;
  }

  function clampPercent(value) {
    if (!Number.isFinite(value)) return 30;
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
  }

  function readDamagePercent() {
    var parsed = Number(damagePercentInput && damagePercentInput.value);
    var clamped = clampPercent(parsed);
    if (damagePercentInput) {
      damagePercentInput.value = String(clamped);
    }
    return clamped;
  }

  function countCompletedRows(tracks) {
    var rows = 0;
    for (var r = 0; r < tracks.length; r++) {
      if (!Array.isArray(tracks[r]) || tracks[r].length === 0) continue;
      var allDestroyed = true;
      for (var c = 0; c < tracks[r].length; c++) {
        if (tracks[r][c] !== 0) {
          allDestroyed = false;
          break;
        }
      }
      if (allDestroyed) rows++;
    }
    return rows;
  }

  function thresholdCrossingsByRowCompletion(prevTracks, nextTracks) {
    var prevRows = countCompletedRows(prevTracks);
    var nextRows = countCompletedRows(nextTracks);
    var hits = [];
    for (var i = prevRows + 1; i <= nextRows; i++) {
      hits.push(i);
    }
    return hits;
  }

  function cloneTracks(tracks) {
    return tracks.map(function (row) { return row.slice(); });
  }

  function categoryFromShip(ship) {
    var firecons = Array.isArray(ship.firecons) ? ship.firecons.length : 0;

    if (firecons <= 1) return "ESCORT";
    if (firecons === 2) return "CRUISER";
    return "CAPITAL";
  }

  function thresholdLossRollMin(category, thresholdIndex) {
    if (category === "ESCORT") return 4;

    if (category === "CRUISER") {
      if (thresholdIndex === 1) return 6;
      return 4;
    }

    if (thresholdIndex === 1) return 6;
    if (thresholdIndex === 2) return 5;
    return 4;
  }

  function rollD6() {
    return Math.floor(Math.random() * 6) + 1;
  }

  function applyDriveHit(drive) {
    if (!drive || typeof drive !== "object") return "none";

    var status = drive.status;

    if (status === 0) return "disabled";

    if (status === 1) {
      var currentThrust = Number.isFinite(drive.thrust) ? drive.thrust : 0;
      drive.thrust = Math.floor(currentThrust / 2);
      drive.status = drive.thrust > 0 ? 2 : 0;
      return drive.status === 2 ? "halved" : "disabled";
    }

    if (status === 2) {
      drive.thrust = 0;
      drive.status = 0;
      return "disabled";
    }

    return "none";
  }

  function applyThresholdChecks(ship, category, crossedThresholds) {
    var weapons = Array.isArray(ship.weapons) ? ship.weapons : [];
    var firecons = Array.isArray(ship.firecons) ? ship.firecons : [];
    var fighters = Array.isArray(ship.fighters) ? ship.fighters : [];
    var drive = ship.drive || {};

    var reports = [];

    for (var i = 0; i < crossedThresholds.length; i++) {
      var thresholdIndex = crossedThresholds[i];
      var minRoll = thresholdLossRollMin(category, thresholdIndex);
      var rolled = 0;
      var lost = 0;
      var weaponsLost = 0;
      var fireconsLost = 0;
      var fightersLost = 0;
      var driveLost = 0;
      var driveResult = "not-rolled";

      for (var w = 0; w < weapons.length; w++) {
        if (weapons[w] && weapons[w].status === 1) {
          rolled++;
          if (rollD6() >= minRoll) {
            weapons[w].status = 0;
            lost++;
            weaponsLost++;
          }
        }
      }

      if (drive && drive.status !== 0) {
        rolled++;
        if (rollD6() >= minRoll) {
          driveResult = applyDriveHit(drive);
          if (driveResult !== "none") {
            lost++;
            driveLost = 1;
          }
        } else {
          driveResult = "survived";
        }
      }

      for (var f = 0; f < firecons.length; f++) {
        if (firecons[f] && firecons[f].status === 1) {
          rolled++;
          if (rollD6() >= minRoll) {
            firecons[f].status = 0;
            lost++;
            fireconsLost++;
          }
        }
      }

      for (var g = 0; g < fighters.length; g++) {
        if (fighters[g] && fighters[g].status === 1) {
          rolled++;
          if (rollD6() >= minRoll) {
            // In this model 1=landed, 0=not landed; mark lost landed group as non-landed.
            fighters[g].status = 0;
            lost++;
            fightersLost++;
          }
        }
      }

      var weaponsDestroyed = weapons.filter(function (w) { return w && w.status === 0; }).length;
      var fireconsDestroyed = firecons.filter(function (fc) { return fc && fc.status === 0; }).length;
      var fightersDestroyed = fighters.filter(function (fg) { return fg && fg.status === 0; }).length;

      reports.push({
        thresholdIndex: thresholdIndex,
        minRoll: minRoll,
        rolled: rolled,
        lost: lost,
        weaponsLost: weaponsLost,
        fireconsLost: fireconsLost,
        fightersLost: fightersLost,
        driveLost: driveLost,
        weaponsDestroyed: weaponsDestroyed,
        fireconsDestroyed: fireconsDestroyed,
        fightersDestroyed: fightersDestroyed,
        driveResult: driveResult,
      });
    }

    return reports;
  }

  function normalizeTracks(tracks) {
    if (!Array.isArray(tracks)) return [];
    var out = [];

    for (var i = 0; i < tracks.length; i++) {
      if (!Array.isArray(tracks[i])) continue;
      out.push(tracks[i].map(function (v) { return v === 0 ? 0 : 1; }));
    }

    return out;
  }

  function applyPercentDamageToShip(ship, damagePercent) {
    if (!ship || typeof ship !== "object" || !ship.damage) {
      return { changed: false, reason: "no-damage-structure" };
    }

    var tracks = normalizeTracks(ship.damage.tracks);
    var totalCapacity = 0;
    for (var r = 0; r < tracks.length; r++) totalCapacity += tracks[r].length;

    if (!tracks.length || totalCapacity <= 0) {
      return { changed: false, reason: "invalid-tracks-or-total" };
    }

    ship.damage.tracks = tracks;

    var prevTracks = cloneTracks(tracks);
    var prevDamage = countDestroyedBoxes(prevTracks);
    var requested = Math.round(totalCapacity * (damagePercent / 100));
    var applied = applyDamageToTracksInOrder(tracks, requested);
    var nextDamage = countDestroyedBoxes(tracks);
    ship.damage.total = totalCapacity;
    ship.damage.hits = nextDamage;
    if (ship.damage.hits >= ship.damage.total) {
      ship.status = 0;
    } else if (ship.damage.hits > 1) {
      ship.status = 2;
    } else {
      ship.status = 1;
    }

    var category = categoryFromShip(ship);
    var crossed = thresholdCrossingsByRowCompletion(prevTracks, tracks);
    var thresholdReports = applyThresholdChecks(ship, category, crossed);

    return {
      changed: applied > 0 || thresholdReports.length > 0,
      totalCapacity: totalCapacity,
      damagePercent: damagePercent,
      hits: nextDamage,
      category: category,
      requestedDamage: requested,
      appliedDamage: applied,
      prevDamage: prevDamage,
      nextDamage: nextDamage,
      crossedThresholds: crossed,
      thresholdReports: thresholdReports,
    };
  }

  function resetShipToPristine(ship) {
    if (!ship || typeof ship !== "object" || !ship.damage) {
      return { changed: false, reason: "no-damage-structure" };
    }

    var tracks = normalizeTracks(ship.damage.tracks);
    if (!tracks.length) {
      return { changed: false, reason: "invalid-tracks" };
    }

    for (var r = 0; r < tracks.length; r++) {
      for (var c = 0; c < tracks[r].length; c++) {
        tracks[r][c] = 1;
      }
    }

    ship.damage.tracks = tracks;
    ship.damage.total = countTrackBoxes(tracks);
    ship.damage.hits = 0;
    ship.status = 1;

    if (!ship.drive || typeof ship.drive !== "object") {
      ship.drive = { thrust: 0, status: 1 };
    }
    ship.drive.thrust = baseThrustForClass(ship.classKey, ship.drive.thrust);
    ship.drive.status = 1;

    if (Array.isArray(ship.firecons)) {
      for (var f = 0; f < ship.firecons.length; f++) {
        if (!ship.firecons[f] || typeof ship.firecons[f] !== "object") {
          ship.firecons[f] = { status: 1 };
        } else {
          ship.firecons[f].status = 1;
        }
      }
    }

    if (Array.isArray(ship.weapons)) {
      for (var w = 0; w < ship.weapons.length; w++) {
        if (ship.weapons[w] && typeof ship.weapons[w] === "object") {
          ship.weapons[w].status = 1;
        }
      }
    }

    if (Array.isArray(ship.fighters)) {
      for (var g = 0; g < ship.fighters.length; g++) {
        if (!ship.fighters[g] || typeof ship.fighters[g] !== "object") continue;
        ship.fighters[g].status = 1; // landed
        if (!Number.isFinite(ship.fighters[g].count) || ship.fighters[g].count < 1) {
          ship.fighters[g].count = 6;
        }
      }
    }

    return { changed: true };
  }

  function prettyJson(obj) {
    return JSON.stringify(obj, null, 2) + "\n";
  }

  async function writeJsonFile(fileHandle, obj) {
    var writable = await fileHandle.createWritable();
    await writable.write(prettyJson(obj));
    await writable.close();
  }

  async function readJsonFile(fileHandle) {
    var file = await fileHandle.getFile();
    var text = await file.text();
    return JSON.parse(text);
  }

  async function resolveGeneratedDir(pickedHandle) {
    if (!pickedHandle || pickedHandle.kind !== "directory") return null;

    if (pickedHandle.name === "generated") return pickedHandle;

    try {
      var child = await pickedHandle.getDirectoryHandle("generated", { create: false });
      return child;
    } catch (err) {
      return null;
    }
  }

  function openHandleDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  async function saveLastPickedHandle(handle) {
    try {
      var db = await openHandleDb();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
      db.close();
    } catch (err) {
      // Non-fatal: persistence may be unavailable in some browser contexts.
    }
  }

  async function loadLastPickedHandle() {
    try {
      var db = await openHandleDb();
      var handle = await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
      db.close();
      return handle;
    } catch (err) {
      return null;
    }
  }

  async function hasReadWritePermission(handle) {
    if (!handle || typeof handle.queryPermission !== "function") return false;
    try {
      var read = await handle.queryPermission({ mode: "read" });
      if (read !== "granted") return false;
      var rw = await handle.queryPermission({ mode: "readwrite" });
      return rw === "granted";
    } catch (err) {
      return false;
    }
  }

  async function activateResolvedHandle(resolved) {
    generatedDirHandle = resolved;
    applyBtn.disabled = false;
    resetBtn.disabled = false;
    setFolderSummary("Using folder: " + generatedDirHandle.name + " (read/write)", true);
  }

  function addRunRow(kind, text) {
    var div = document.createElement("div");
    div.className = "row " + kind;
    div.textContent = text;
    runResultsEl.appendChild(div);
  }

  function formatThresholdReport(report) {
    return [
      "lossOn=" + report.minRoll + "+",
      "systemsRolled=" + report.rolled,
      "systemsLost=" + report.lost,
      "lost(w/f/ftr/d)=" + report.weaponsLost + "/" + report.fireconsLost + "/" + report.fightersLost + "/" + report.driveLost,
      "destroyedNow(w/f/ftr)=" + report.weaponsDestroyed + "/" + report.fireconsDestroyed + "/" + report.fightersDestroyed,
      "drive=" + report.driveResult
    ].join(", ");
  }

  function setRunSummary(kind, text) {
    runSummaryEl.className = "summary " + kind;
    runSummaryEl.textContent = text;
  }

  function setFolderSummary(text, ok) {
    folderSummaryEl.className = "summary " + (ok ? "pass" : "fail");
    folderSummaryEl.textContent = text;
  }

  async function chooseGeneratedFolder() {
    if (!window.showDirectoryPicker) {
      setFolderSummary("This browser does not support read/write directory access (File System Access API). Use current Chrome/Edge.", false);
      return;
    }

    try {
      var pickerOptions = { mode: "readwrite" };
      if (generatedDirHandle) {
        pickerOptions.startIn = generatedDirHandle;
      } else if (lastPickedHandle) {
        pickerOptions.startIn = lastPickedHandle;
      }

      var picked = await window.showDirectoryPicker(pickerOptions);
      lastPickedHandle = picked;
      var resolved = await resolveGeneratedDir(picked);

      if (!resolved) {
        generatedDirHandle = null;
        applyBtn.disabled = true;
        resetBtn.disabled = true;
        setFolderSummary("Selected folder does not contain generated/ and is not generated/.", false);
        return;
      }

      await activateResolvedHandle(resolved);
      await saveLastPickedHandle(picked);
    } catch (err) {
      var msg = err && err.message ? err.message : String(err);
      setFolderSummary("Folder selection cancelled or failed: " + msg, false);
    }
  }

  async function collectFleetShipFileHandles(generatedHandle) {
    var fleets = [];

    for await (var entry of generatedHandle.entries()) {
      var fleetName = entry[0];
      var handle = entry[1];
      if (handle.kind !== "directory") continue;

      var shipFiles = [];

      for await (var childEntry of handle.entries()) {
        var fileName = childEntry[0];
        var childHandle = childEntry[1];
        if (childHandle.kind !== "file") continue;
        if (!fileName.toLowerCase().endsWith(".json")) continue;
        shipFiles.push({ fileName: fileName, fileHandle: childHandle });
      }

      shipFiles.sort(function (a, b) { return a.fileName.localeCompare(b.fileName); });
      fleets.push({ fleetName: fleetName, dirHandle: handle, shipFiles: shipFiles });
    }

    fleets.sort(function (a, b) { return a.fleetName.localeCompare(b.fleetName); });
    return fleets;
  }

  async function tryUpdateAggregateFile(generatedHandle, fleetName, updatedShips, fleetStats) {
    var aggregateFile = fleetName + ".json";

    try {
      var aggregateHandle = await generatedHandle.getFileHandle(aggregateFile, { create: false });
      var aggregateJson = await readJsonFile(aggregateHandle);

      if (!aggregateJson || !Array.isArray(aggregateJson.ships)) {
        addRunRow("info", "Skipped aggregate update for " + aggregateFile + " (no ships[] array).");
        return;
      }

      aggregateJson.ships = updatedShips;
      await writeJsonFile(aggregateHandle, aggregateJson);
      fleetStats.aggregatesUpdated++;
      addRunRow("info", "Updated aggregate file " + aggregateFile + " with " + updatedShips.length + " ships.");
    } catch (err) {
      addRunRow("info", "No aggregate file update for " + aggregateFile + " (file not found or unreadable).");
    }
  }

  async function runDamagePass() {
    runResultsEl.innerHTML = "";

    if (!generatedDirHandle) {
      setRunSummary("fail", "Choose a generated folder first.");
      return;
    }

    var damagePercent = readDamagePercent();
    setRunSummary("info", "Applying " + damagePercent + "% FT1E damage... please wait.");

    var fleetHandles;
    try {
      fleetHandles = await collectFleetShipFileHandles(generatedDirHandle);
    } catch (err) {
      var collectMsg = err && err.message ? err.message : String(err);
      setRunSummary("fail", "Failed to scan generated folder: " + collectMsg);
      return;
    }

    if (!fleetHandles.length) {
      setRunSummary("fail", "No fleet folders found under generated/.");
      return;
    }

    var stats = {
      fleets: 0,
      shipsSeen: 0,
      shipsUpdated: 0,
      aggregatesUpdated: 0,
      failures: 0,
    };

    for (var i = 0; i < fleetHandles.length; i++) {
      var fleet = fleetHandles[i];
      if (!fleet.shipFiles.length) continue;

      stats.fleets++;
      var updatedShipsForAggregate = [];
      addRunRow("info", "Processing fleet folder: " + fleet.fleetName + " (" + fleet.shipFiles.length + " files)");

      for (var j = 0; j < fleet.shipFiles.length; j++) {
        var shipFile = fleet.shipFiles[j];
        stats.shipsSeen++;

        try {
          var ship = await readJsonFile(shipFile.fileHandle);
          var report = applyPercentDamageToShip(ship, damagePercent);

          if (report.reason) {
            addRunRow("fail", fleet.fleetName + "/" + shipFile.fileName + " skipped: " + report.reason);
            stats.failures++;
            continue;
          }

          await writeJsonFile(shipFile.fileHandle, ship);
          updatedShipsForAggregate.push(ship);
          stats.shipsUpdated++;

          var damageLine = [
            fleet.fleetName + "/" + shipFile.fileName,
            "damage " + report.prevDamage + "->" + report.nextDamage + " (applied " + report.appliedDamage + " of requested " + report.requestedDamage + " @ " + report.damagePercent + "%)",
            "capacity=" + report.totalCapacity,
            "hits=" + report.hits,
            "category=" + report.category,
            "thresholds=" + (report.crossedThresholds.length ? report.crossedThresholds.join(",") : "none")
          ].join(" | ");

          addRunRow("pass", damageLine);

          if (report.thresholdReports && report.thresholdReports.length) {
            for (var tr = 0; tr < report.thresholdReports.length; tr++) {
              var tReport = report.thresholdReports[tr];
              addRunRow(
                "info",
                "T" + tReport.thresholdIndex + " | " +
                  (ship.name || "Unnamed Ship") +
                  " " +
                  (ship.classKey || "UNKNOWN") +
                  " | " +
                  fleet.fleetName + "/" + shipFile.fileName +
                  " | " + formatThresholdReport(tReport)
              );
            }
          } else {
            addRunRow(
              "info",
              "threshold check | " +
                (ship.name || "Unnamed Ship") +
                " " +
                (ship.classKey || "UNKNOWN") +
                " | " +
                fleet.fleetName + "/" + shipFile.fileName +
                " | none crossed"
            );
          }
        } catch (err) {
          var msg = err && err.message ? err.message : String(err);
          addRunRow("fail", fleet.fleetName + "/" + shipFile.fileName + " failed: " + msg);
          stats.failures++;
        }
      }

      await tryUpdateAggregateFile(generatedDirHandle, fleet.fleetName, updatedShipsForAggregate, stats);
    }

    var summary = "Updated " + stats.shipsUpdated + " ship files across " + stats.fleets + " fleets" +
      (stats.aggregatesUpdated ? "; aggregate files updated: " + stats.aggregatesUpdated : "") +
      "; failures: " + stats.failures + ".";

    setRunSummary(stats.failures ? "fail" : "pass", summary);
  }

  async function runResetPass() {
    runResultsEl.innerHTML = "";

    if (!generatedDirHandle) {
      setRunSummary("fail", "Choose a generated folder first.");
      return;
    }

    setRunSummary("info", "Resetting fleets to pristine state... please wait.");

    var fleetHandles;
    try {
      fleetHandles = await collectFleetShipFileHandles(generatedDirHandle);
    } catch (err) {
      var collectMsg = err && err.message ? err.message : String(err);
      setRunSummary("fail", "Failed to scan generated folder: " + collectMsg);
      return;
    }

    if (!fleetHandles.length) {
      setRunSummary("fail", "No fleet folders found under generated/.");
      return;
    }

    var stats = {
      fleets: 0,
      shipsSeen: 0,
      shipsReset: 0,
      aggregatesUpdated: 0,
      failures: 0,
    };

    for (var i = 0; i < fleetHandles.length; i++) {
      var fleet = fleetHandles[i];
      if (!fleet.shipFiles.length) continue;

      stats.fleets++;
      var updatedShipsForAggregate = [];
      addRunRow("info", "Resetting fleet folder: " + fleet.fleetName + " (" + fleet.shipFiles.length + " files)");

      for (var j = 0; j < fleet.shipFiles.length; j++) {
        var shipFile = fleet.shipFiles[j];
        stats.shipsSeen++;

        try {
          var ship = await readJsonFile(shipFile.fileHandle);
          var report = resetShipToPristine(ship);

          if (report.reason) {
            addRunRow("fail", fleet.fleetName + "/" + shipFile.fileName + " skipped: " + report.reason);
            stats.failures++;
            continue;
          }

          await writeJsonFile(shipFile.fileHandle, ship);
          updatedShipsForAggregate.push(ship);
          stats.shipsReset++;
          addRunRow(
            "pass",
            fleet.fleetName + "/" + shipFile.fileName +
              " reset | " + (ship.name || "Unnamed Ship") + " " + (ship.classKey || "UNKNOWN") +
              " | total=" + ship.damage.total + " hits=" + ship.damage.hits
          );
        } catch (err) {
          var msg = err && err.message ? err.message : String(err);
          addRunRow("fail", fleet.fleetName + "/" + shipFile.fileName + " failed: " + msg);
          stats.failures++;
        }
      }

      await tryUpdateAggregateFile(generatedDirHandle, fleet.fleetName, updatedShipsForAggregate, stats);
    }

    var summary = "Reset " + stats.shipsReset + " ship files across " + stats.fleets + " fleets" +
      (stats.aggregatesUpdated ? "; aggregate files updated: " + stats.aggregatesUpdated : "") +
      "; failures: " + stats.failures + ".";

    setRunSummary(stats.failures ? "fail" : "pass", summary);
  }

  function runSelfTests() {
    testResultsEl.innerHTML = "";

    var tests = [
      {
        name: "threshold crossings by row completion for battleship-style rows",
        run: function () {
          var prev = [[0,0,0,0,0,0],[1,1,1,1,1,1],[1,1,1,1,1,1],[1,1,1,1]];
          var next = [[0,0,0,0,0,0],[0,0,0,0,0,1],[1,1,1,1,1,1],[1,1,1,1]];
          expectEqual(thresholdCrossingsByRowCompletion(prev, next), [], "no new completed row");
        }
      },
      {
        name: "row completion crossing triggers threshold index",
        run: function () {
          var prev = [[0,0,0,0,0,1],[1,1,1,1,1,1]];
          var next = [[0,0,0,0,0,0],[1,1,1,1,1,1]];
          expectEqual(thresholdCrossingsByRowCompletion(prev, next), [1], "first row complete");
        }
      },
      {
        name: "drive hit transitions 1 -> 2 -> 0",
        run: function () {
          var d = { thrust: 6, status: 1 };
          expectEqual(applyDriveHit(d), "halved", "drive first hit label");
          expectEqual(d, { thrust: 3, status: 2 }, "drive first hit state");
          expectEqual(applyDriveHit(d), "disabled", "drive second hit label");
          expectEqual(d, { thrust: 0, status: 0 }, "drive second hit state");
        }
      },
      {
        name: "ordered track damage applies from tracks[0][0] onward",
        run: function () {
          var tracks = [[1, 1], [1, 0]];
          var applied = applyDamageToTracksInOrder(tracks, 2);
          expectEqual(applied, 2, "applied count");
          expectEqual(countDestroyedBoxes(tracks), 3, "destroyed tally");
        }
      }
    ];

    var passCount = 0;

    for (var i = 0; i < tests.length; i++) {
      var t = tests[i];
      var row = document.createElement("div");
      row.className = "row";

      try {
        t.run();
        passCount++;
        row.className += " pass";
        row.textContent = "PASS: " + t.name;
      } catch (err) {
        row.className += " fail";
        row.textContent = "FAIL: " + t.name + " | " + (err && err.message ? err.message : String(err));
      }

      testResultsEl.appendChild(row);
    }

    var failCount = tests.length - passCount;
    testSummaryEl.className = "summary " + (failCount ? "fail" : "pass");
    testSummaryEl.textContent = "Passed " + passCount + " / " + tests.length + " tests" + (failCount ? " (" + failCount + " failed)" : "");
  }

  folderBtn.addEventListener("click", function () {
    chooseGeneratedFolder();
  });

  applyBtn.addEventListener("click", function () {
    runDamagePass();
  });

  resetBtn.addEventListener("click", function () {
    runResetPass();
  });

  rerunTestsBtn.addEventListener("click", function () {
    runSelfTests();
  });

  (async function restoreLastFolderIfAvailable() {
    if (!window.showDirectoryPicker || !window.indexedDB) return;
    var saved = await loadLastPickedHandle();
    if (!saved) return;
    lastPickedHandle = saved;
    var granted = await hasReadWritePermission(saved);
    if (!granted) return;
    var resolved = await resolveGeneratedDir(saved);
    if (!resolved) return;
    await activateResolvedHandle(resolved);
  })();

  testSummaryEl.className = "summary info";
  testSummaryEl.textContent = "Logic tests are idle. Click Re-run Logic Tests to run them.";
})();
