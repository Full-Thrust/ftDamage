export type BinaryStatus = 0 | 1;
export type TernaryStatus = 0 | 1 | 2;

export interface GenericWeaponDef {
  type: string;
  class: "A" | "B" | "C";
  arcs: Array<"F" | "P" | "S" | "A">;
}

export interface GenericShipClassJson {
  classKey: string;
  name: string;
  thrust: number;
  damage: {
    total: number;
    tracks: number[][];
  };
  firecons: number[];
  weapons: GenericWeaponDef[];
  fighters?: {
    capacity: number;
  };
}

export interface ShipInstanceJson {
  classKey: string;
  name: string;
  position: {
    x: number;
    y: number;
  };
  heading: number;
  speed: number;
  status: TernaryStatus;
  damage: {
    total: number;
    hits: number;
    tracks: number[][];
  };
  drive: {
    thrust: number;
    status: TernaryStatus;
  };
  firecons: Array<{ status: BinaryStatus }>;
  weapons: Array<GenericWeaponDef & { status: BinaryStatus }>;
  fighters?: Array<{ count: number; status: TernaryStatus }>;
}

export interface ShipConstructionOptions {
  name?: string;
  position?: { x: number; y: number };
  heading?: number;
  speed?: number;
  status?: TernaryStatus;
}
