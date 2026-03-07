import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { Ship } from "../src/model/Ship";
import { GenericShipClassJson } from "../src/model/types";
import { Ft1eDamageEngine } from "../src/damage/Ft1eDamageEngine";

async function readGenericShipClasses(): Promise<GenericShipClassJson[]> {
  const dir = path.join(process.cwd(), "generic");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".shipclass.json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const result: GenericShipClassJson[] = [];
  for (const fileName of files) {
    const fullPath = path.join(dir, fileName);
    const content = await fs.readFile(fullPath, "utf-8");
    result.push(JSON.parse(content.replace(/^\uFEFF/, "")) as GenericShipClassJson);
  }
  return result;
}

describe("Ship model", () => {
  it("constructs every ship from generic class files", async () => {
    const classes = await readGenericShipClasses();
    expect(classes.length).toBeGreaterThan(0);

    for (const generic of classes) {
      const ship = new Ship(generic);
      expect(ship.getClassKey()).toBe(generic.classKey);
      expect(ship.getDamageTotal()).toBeGreaterThan(0);
      expect(ship.getDamageHits()).toBeGreaterThanOrEqual(0);
      expect(ship.getDamageHits()).toBeLessThanOrEqual(ship.getDamageTotal());
    }
  });

  it("reaches destroyed state under repeated random 10% damage increments", async () => {
    const classes = await readGenericShipClasses();
    const engine = new Ft1eDamageEngine();

    for (const generic of classes) {
      const ship = new Ship(generic);

      let rounds = 0;
      while (ship.getStatus() !== 0 && rounds < 50) {
        rounds += 1;
        const pct = (Math.floor(Math.random() * 10) + 1) * 10;
        const hits = Math.max(1, Math.round(ship.getDamageTotal() * (pct / 100)));
        engine.applyHits(ship, hits);
      }

      expect(ship.getStatus(), `${generic.classKey} should be destroyed`).toBe(0);
      expect(ship.getDamageHits()).toBeLessThanOrEqual(ship.getDamageTotal());
    }
  });
});
