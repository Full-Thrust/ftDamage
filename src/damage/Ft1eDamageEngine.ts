import { ShipCategory } from "../model/Ship";
import { AbstractDamageEngine } from "./AbstractDamageEngine";

export class Ft1eDamageEngine extends AbstractDamageEngine {
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
    return Math.floor(Math.random() * 6) + 1;
  }
}
