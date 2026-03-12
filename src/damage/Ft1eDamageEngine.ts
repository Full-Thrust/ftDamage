import { ShipCategory } from "../model/Ship";
import { AbstractDamageEngine } from "./AbstractDamageEngine";
import { D6, TimeSeededD6 } from "../dice/D6";

export class Ft1eDamageEngine extends AbstractDamageEngine {
  private readonly die: D6;

  constructor(die?: D6) {
    super();
    this.die = die ?? new TimeSeededD6();
  }

  protected thresholdLossRollMin(category: ShipCategory, thresholdIndex: number): number {
    if (category === "ESCORT") return 4;

    if (category === "CRUISER") {
      if (thresholdIndex === 1) return 6;
      return 4;
    }

    if (thresholdIndex === 1) return 6;
    if (thresholdIndex === 2) return 5;
    return 4;
  }

  protected rollD6(): number {
    return this.die.roll();
  }
}
