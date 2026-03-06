import { describe, it, expect } from "vitest";

/**
 * damageTrackLogic.test.ts
 *
 * Canonical FT1E rule locked in:
 * - Threshold triggers are computed from TOTAL DAMAGE FRACTION ("to or past" the threshold),
 *   NOT from completing a rendered row.
 * - Damage tracks (array-of-arrays of 1/0) are the canonical UI layout and the canonical tally:
 *     damagePoints === count(0 boxes)
 *
 * Threshold points:
 * - Escort: 1/2
 * - Cruiser: 1/3, 2/3
 * - Capital: 1/4, 1/2, 3/4
 */

type Tracks = number[][];

function countDestroyedBoxes(tracks: Tracks): number {
  let n = 0;
  for (const row of tracks) for (const v of row) if (v === 0) n++;
  return n;
}

/**
 * Apply N damage points to tracks left->right, top->bottom.
 * Mutates tracks in place. Returns actual applied points (can't exceed remaining boxes).
 */
function applyDamageToTracks(tracks: Tracks, points: number): number {
  let applied = 0;
  for (let p = 0; p < points; p++) {
    let done = false;
    for (let r = 0; r < tracks.length && !done; r++) {
      for (let c = 0; c < tracks[r].length; c++) {
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

type Category = "ESCORT" | "CRUISER" | "CAPITAL";

function thresholdsForCategory(category: Category): number[] {
  switch (category) {
    case "ESCORT":
      return [1 / 2];
    case "CRUISER":
      return [1 / 3, 2 / 3];
    case "CAPITAL":
      return [1 / 4, 1 / 2, 3 / 4];
  }
}

/**
 * Canonical threshold detection:
 * If damage takes the ship "to or past" a threshold point, it triggers.
 *
 * Implementation:
 * - prevFrac = prevDamage / total
 * - nextFrac = nextDamage / total
 * Trigger threshold t if: prevFrac < t && nextFrac >= t
 *
 * Returns triggered threshold indices (1-based): [1], [1,2], [1,2,3], etc.
 */
function thresholdCrossingsByFraction(
  category: Category,
  prevDamage: number,
  nextDamage: number,
  total: number
): Array<1 | 2 | 3> {
  const prevFrac = total === 0 ? 0 : prevDamage / total;
  const nextFrac = total === 0 ? 0 : nextDamage / total;
  const ts = thresholdsForCategory(category);

  const hits: Array<1 | 2 | 3> = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (prevFrac < t && nextFrac >= t) hits.push((i + 1) as 1 | 2 | 3);
  }
  return hits;
}

function cloneTracks(tracks: Tracks): Tracks {
  return tracks.map((r) => r.slice());
}

describe("Damage tracks tally is canonical", () => {
  it("counts damage points as number of 0 boxes", () => {
    const tracks: Tracks = [
      [1, 0, 1],
      [0, 0, 1],
    ];
    expect(countDestroyedBoxes(tracks)).toBe(3);
  });

  it("applyDamageToTracks updates tally and cannot exceed total", () => {
    const tracks: Tracks = [
      [1, 1],
      [1, 1],
    ];
    const total = 4;

    expect(countDestroyedBoxes(tracks)).toBe(0);
    expect(applyDamageToTracks(tracks, 3)).toBe(3);
    expect(countDestroyedBoxes(tracks)).toBe(3);

    // Only 1 remaining, so applied points should clamp
    expect(applyDamageToTracks(tracks, 10)).toBe(1);
    expect(countDestroyedBoxes(tracks)).toBe(total);
  });
});

describe("Threshold crossings are computed from damage fraction (NOT row completion)", () => {
  it("Escort: threshold at 1/2 triggers when crossing to or past 0.5", () => {
    // Escort total 8 (e.g. destroyer). Threshold at 4 damage.
    const total = 8;
    expect(thresholdCrossingsByFraction("ESCORT", 0, 3, total)).toEqual([]);
    expect(thresholdCrossingsByFraction("ESCORT", 3, 4, total)).toEqual([1]);
    expect(thresholdCrossingsByFraction("ESCORT", 4, 8, total)).toEqual([]); // already past
  });

  it("Cruiser: thresholds at 1/3 and 2/3 trigger independently and can both trigger in one volley", () => {
    const total = 12; // light cruiser
    // 1/3 = 4, 2/3 = 8
    expect(thresholdCrossingsByFraction("CRUISER", 0, 3, total)).toEqual([]);
    expect(thresholdCrossingsByFraction("CRUISER", 3, 4, total)).toEqual([1]);
    expect(thresholdCrossingsByFraction("CRUISER", 7, 8, total)).toEqual([2]);
    // Big volley crosses both
    expect(thresholdCrossingsByFraction("CRUISER", 1, 9, total)).toEqual([1, 2]);
  });

  it("Capital: thresholds at 1/4, 1/2, 3/4 can all trigger in one volley", () => {
    const total = 28; // dreadnought
    // 1/4=7, 1/2=14, 3/4=21
    expect(thresholdCrossingsByFraction("CAPITAL", 0, 6, total)).toEqual([]);
    expect(thresholdCrossingsByFraction("CAPITAL", 6, 7, total)).toEqual([1]);
    expect(thresholdCrossingsByFraction("CAPITAL", 13, 14, total)).toEqual([2]);
    expect(thresholdCrossingsByFraction("CAPITAL", 20, 21, total)).toEqual([3]);
    // Big volley crosses all three
    expect(thresholdCrossingsByFraction("CAPITAL", 0, 25, total)).toEqual([1, 2, 3]);
  });

  it("Capital (Battleship) uneven rows: thresholds still based on fraction, not row ends", () => {
    // Battleship total 22. Threshold points: 22*(1/4)=5.5, *(1/2)=11, *(3/4)=16.5
    // With integer damage points and rule 'to or past', these trigger at:
    // 1/4 -> damage >= 6, 1/2 -> damage >= 11, 3/4 -> damage >= 17.
    const total = 22;

    expect(thresholdCrossingsByFraction("CAPITAL", 0, 5, total)).toEqual([]);
    expect(thresholdCrossingsByFraction("CAPITAL", 5, 6, total)).toEqual([1]);

    expect(thresholdCrossingsByFraction("CAPITAL", 10, 11, total)).toEqual([2]);

    expect(thresholdCrossingsByFraction("CAPITAL", 16, 17, total)).toEqual([3]);

    // Cross multiple in one volley
    expect(thresholdCrossingsByFraction("CAPITAL", 4, 18, total)).toEqual([1, 2, 3]);
  });

  it("Proof: row completion is NOT the source of truth (artificial example)", () => {
    // This track layout is intentionally weird: first row is very long.
    // Row completion would NOT line up with 1/2, but fraction logic still works.
    const tracks: Tracks = [
      [1, 1, 1, 1, 1, 1, 1, 1], // 8
      [1, 1],                   // 2
    ];
    const total = 10; // Escort category -> threshold at 5 damage

    const t0 = cloneTracks(tracks);
    applyDamageToTracks(t0, 5); // hits are in row 0 only; row 0 NOT completed
    const damage = countDestroyedBoxes(t0);
    expect(damage).toBe(5);

    // Threshold MUST trigger here because fraction crossed 1/2, regardless of row completion.
    expect(thresholdCrossingsByFraction("ESCORT", 0, damage, total)).toEqual([1]);
    // And row 0 is not complete
    expect(t0[0].every((v) => v === 0)).toBe(false);
  });
});

describe("Recommended engine invariant", () => {
  it("damagePoints derived from tracks should be the value used for threshold checks", () => {
    const tracks: Tracks = [
      [1, 1, 1, 1],
      [1, 1, 1, 1],
    ];
    const total = 8;

    const prev = countDestroyedBoxes(tracks);
    applyDamageToTracks(tracks, 4);
    const next = countDestroyedBoxes(tracks);

    // Escort threshold at 4
    expect(prev).toBe(0);
    expect(next).toBe(4);
    expect(thresholdCrossingsByFraction("ESCORT", prev, next, total)).toEqual([1]);
  });
});
