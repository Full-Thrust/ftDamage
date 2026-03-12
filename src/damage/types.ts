import { ShipCategory } from "../model/Ship";
import { TernaryStatus } from "../model/types";

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
  driveStatus: TernaryStatus;
}

export interface SystemRollReport {
  systemId: string;
  systemLabel: string;
  systemType: "weapon" | "drive" | "firecon" | "fighter";
  rolls: number[];
  thresholdPoints: number[];
  status: TernaryStatus;
}

export abstract class DamageReport {
  public readonly requestedHits: number;
  public readonly appliedHits: number;
  public readonly previousHits: number;
  public readonly nextHits: number;
  public readonly total: number;
  public readonly category: ShipCategory;
  public readonly crossedThresholds: number[];
  public readonly thresholdReports: ThresholdReport[];
  public readonly systemRolls: SystemRollReport[];

  protected constructor(input: {
    requestedHits: number;
    appliedHits: number;
    previousHits: number;
    nextHits: number;
    total: number;
    category: ShipCategory;
    crossedThresholds: number[];
    thresholdReports: ThresholdReport[];
    systemRolls: SystemRollReport[];
  }) {
    this.requestedHits = input.requestedHits;
    this.appliedHits = input.appliedHits;
    this.previousHits = input.previousHits;
    this.nextHits = input.nextHits;
    this.total = input.total;
    this.category = input.category;
    this.crossedThresholds = input.crossedThresholds;
    this.thresholdReports = input.thresholdReports;
    this.systemRolls = input.systemRolls;
  }
}

export class StandardDamageReport extends DamageReport {
  constructor(input: {
    requestedHits: number;
    appliedHits: number;
    previousHits: number;
    nextHits: number;
    total: number;
    category: ShipCategory;
    crossedThresholds: number[];
    thresholdReports: ThresholdReport[];
    systemRolls: SystemRollReport[];
  }) {
    super(input);
  }
}
