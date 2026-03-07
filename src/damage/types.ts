import { ShipCategory } from "../model/Ship";

export interface ThresholdReport {
  thresholdIndex: number;
  minRoll: number;
  rolled: number;
  lost: number;
  weaponsLost: number;
  fireconsLost: number;
  fightersLost: number;
  driveLost: number;
  weaponsDestroyed: number;
  fireconsDestroyed: number;
  fightersDestroyed: number;
  driveResult: string;
}

export interface DamageReport {
  requestedHits: number;
  appliedHits: number;
  previousHits: number;
  nextHits: number;
  total: number;
  category: ShipCategory;
  crossedThresholds: number[];
  thresholdReports: ThresholdReport[];
}
