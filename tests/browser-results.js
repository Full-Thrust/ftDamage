(function () {
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

  function applyDamageToTracks(tracks, points) {
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

  function thresholdsForCategory(category) {
    if (category === "ESCORT") return [1 / 2];
    if (category === "CRUISER") return [1 / 3, 2 / 3];
    return [1 / 4, 1 / 2, 3 / 4];
  }

  function thresholdCrossingsByFraction(category, prevDamage, nextDamage, total) {
    var prevFrac = total === 0 ? 0 : prevDamage / total;
    var nextFrac = total === 0 ? 0 : nextDamage / total;
    var ts = thresholdsForCategory(category);
    var hits = [];

    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (prevFrac < t && nextFrac >= t) hits.push(i + 1);
    }

    return hits;
  }

  function cloneTracks(tracks) {
    return tracks.map(function (r) { return r.slice(); });
  }

  var tests = [
    {
      name: "counts damage points as number of 0 boxes",
      run: function () {
        var tracks = [[1, 0, 1], [0, 0, 1]];
        expectEqual(countDestroyedBoxes(tracks), 3, "damage tally");
      }
    },
    {
      name: "applyDamageToTracks clamps at total boxes",
      run: function () {
        var tracks = [[1, 1], [1, 1]];
        expectEqual(applyDamageToTracks(tracks, 3), 3, "applied first volley");
        expectEqual(countDestroyedBoxes(tracks), 3, "destroyed after first volley");
        expectEqual(applyDamageToTracks(tracks, 10), 1, "applied second volley");
      }
    },
    {
      name: "escort threshold at 1/2",
      run: function () {
        expectEqual(thresholdCrossingsByFraction("ESCORT", 3, 4, 8), [1], "escort threshold");
      }
    },
    {
      name: "cruiser can cross two thresholds in one volley",
      run: function () {
        expectEqual(thresholdCrossingsByFraction("CRUISER", 1, 9, 12), [1, 2], "cruiser thresholds");
      }
    },
    {
      name: "capital can cross three thresholds in one volley",
      run: function () {
        expectEqual(thresholdCrossingsByFraction("CAPITAL", 0, 25, 28), [1, 2, 3], "capital thresholds");
      }
    },
    {
      name: "battleship uneven rows still use fraction logic",
      run: function () {
        expectEqual(thresholdCrossingsByFraction("CAPITAL", 5, 6, 22), [1], "capital quarter threshold");
        expectEqual(thresholdCrossingsByFraction("CAPITAL", 10, 11, 22), [2], "capital half threshold");
        expectEqual(thresholdCrossingsByFraction("CAPITAL", 16, 17, 22), [3], "capital three-quarter threshold");
      }
    },
    {
      name: "row completion is not threshold source of truth",
      run: function () {
        var tracks = [[1,1,1,1,1,1,1,1],[1,1]];
        var t0 = cloneTracks(tracks);
        applyDamageToTracks(t0, 5);
        expectEqual(countDestroyedBoxes(t0), 5, "damage count");
        expectEqual(thresholdCrossingsByFraction("ESCORT", 0, 5, 10), [1], "threshold hit");
        expectEqual(t0[0].every(function (v) { return v === 0; }), false, "row not complete");
      }
    },
    {
      name: "recommended invariant uses tally from tracks",
      run: function () {
        var tracks = [[1,1,1,1],[1,1,1,1]];
        var prev = countDestroyedBoxes(tracks);
        applyDamageToTracks(tracks, 4);
        var next = countDestroyedBoxes(tracks);
        expectEqual(thresholdCrossingsByFraction("ESCORT", prev, next, 8), [1], "escort crossing");
      }
    }
  ];

  var resultsEl = document.getElementById("results");
  var summaryEl = document.getElementById("summary");

  var passCount = 0;
  for (var i = 0; i < tests.length; i++) {
    var test = tests[i];
    var div = document.createElement("div");
    div.className = "row";

    try {
      test.run();
      passCount++;
      div.className += " pass";
      div.textContent = "PASS: " + test.name;
    } catch (err) {
      div.className += " fail";
      div.innerHTML = "FAIL: " + test.name + "<br><code>" + (err && err.message ? err.message : String(err)) + "</code>";
    }

    resultsEl.appendChild(div);
  }

  var failCount = tests.length - passCount;
  summaryEl.textContent = "Passed " + passCount + " / " + tests.length + " tests" + (failCount ? " (" + failCount + " failed)" : "");
  summaryEl.className = "summary " + (failCount ? "fail" : "pass");
})();
