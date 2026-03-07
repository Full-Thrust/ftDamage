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
  var ShipClass = null;
  var damageProcessor = null;

  if (window.FTShip && typeof window.FTShip.Ship === "function" &&
      window.FTDamage && typeof window.FTDamage.Ft1eDamageProcessor === "function") {
    ShipClass = window.FTShip.Ship;
    damageProcessor = new window.FTDamage.Ft1eDamageProcessor();
  } else {
    throw new Error("Ship/damage classes not loaded. Ensure tests/ship.js and tests/damage-engine.js are included before tests/damage.js.");
  }

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
    return damageProcessor.applyHitsToTracks(tracks, points);
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

  function thresholdCrossingsByRowCompletion(prevTracks, nextTracks) {
    var prevHits = countDestroyedBoxes(prevTracks);
    var nextHits = countDestroyedBoxes(nextTracks);
    var total = countTrackBoxes(nextTracks);
    return damageProcessor.thresholdCrossingsByRowCompletion(prevHits, nextHits, total, nextTracks);
  }

  function applyPercentDamageToShip(rawShip, damagePercent) {
    var ship = new ShipClass(rawShip);
    var total = ship.getDamageTotal();
    var requestedHits = Math.round(total * (damagePercent / 100));
    var report = damageProcessor.applyHits(ship, requestedHits);
    return {
      ship: ship.toJson(),
      changed: report.appliedHits > 0 || report.thresholdReports.length > 0,
      totalCapacity: report.total,
      damagePercent: damagePercent,
      hits: report.nextHits,
      category: report.category,
      requestedDamage: report.requestedHits,
      appliedDamage: report.appliedHits,
      prevDamage: report.previousHits,
      nextDamage: report.nextHits,
      crossedThresholds: report.crossedThresholds,
      thresholdReports: report.thresholdReports,
    };
  }

  function resetShipToPristine(rawShip) {
    var ship = new ShipClass(rawShip);
    ship.resetToPristine();
    return { changed: true, ship: ship.toJson() };
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
          var updatedShip = report.ship;

          if (report.reason) {
            addRunRow("fail", fleet.fleetName + "/" + shipFile.fileName + " skipped: " + report.reason);
            stats.failures++;
            continue;
          }

          await writeJsonFile(shipFile.fileHandle, updatedShip);
          updatedShipsForAggregate.push(updatedShip);
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
                  (updatedShip.name || "Unnamed Ship") +
                  " " +
                  (updatedShip.classKey || "UNKNOWN") +
                  " | " +
                  fleet.fleetName + "/" + shipFile.fileName +
                  " | " + formatThresholdReport(tReport)
              );
            }
          } else {
            addRunRow(
              "info",
              "threshold check | " +
                (updatedShip.name || "Unnamed Ship") +
                " " +
                (updatedShip.classKey || "UNKNOWN") +
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
          var resetShip = report.ship;

          if (report.reason) {
            addRunRow("fail", fleet.fleetName + "/" + shipFile.fileName + " skipped: " + report.reason);
            stats.failures++;
            continue;
          }

          await writeJsonFile(shipFile.fileHandle, resetShip);
          updatedShipsForAggregate.push(resetShip);
          stats.shipsReset++;
          addRunRow(
            "pass",
            fleet.fleetName + "/" + shipFile.fileName +
              " reset | " + (resetShip.name || "Unnamed Ship") + " " + (resetShip.classKey || "UNKNOWN") +
              " | total=" + resetShip.damage.total + " hits=" + resetShip.damage.hits
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
          var ship = new ShipClass({
            classKey: "TEST_SHIP",
            name: "Test",
            position: { x: 0, y: 0 },
            heading: 1,
            speed: 0,
            status: 1,
            damage: { total: 2, hits: 0, tracks: [[1, 1]] },
            drive: { thrust: 6, status: 1 },
            firecons: [{ status: 1 }],
            weapons: [],
          });
          expectEqual(ship.applyDriveCriticalHit(), "halved", "drive first hit label");
          expectEqual({ thrust: ship.getDriveThrust(), status: ship.getDriveStatus() }, { thrust: 3, status: 2 }, "drive first hit state");
          expectEqual(ship.applyDriveCriticalHit(), "disabled", "drive second hit label");
          expectEqual({ thrust: ship.getDriveThrust(), status: ship.getDriveStatus() }, { thrust: 0, status: 0 }, "drive second hit state");
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
