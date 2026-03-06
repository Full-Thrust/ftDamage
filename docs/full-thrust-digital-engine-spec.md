# FULL THRUST 1E -- CANONICAL DIGITAL ENGINE SPEC

Version: FT1E-TS-CORE-1.0\
Scope: Basic Game + Specific Damage + Fighters + Armour + Ramming\
Excludes: Sensors, Morale, Pulse Torpedoes, Needle Beams, Advanced
Turning

------------------------------------------------------------------------

## 1. CORE DATA MODEL

### 1.1 ShipClass (Immutable)

``` ts
interface ShipClass {
  classKey: string;
  name: string;
  thrust: number;
  damage: {
    total: number;
    tracks: number[][]; // 1 = intact
  };
  firecons: number[];
  weapons: WeaponDef[];
  fighters?: {
    capacity: number;
  };
}
```

### 1.2 Weapon Definition

``` ts
interface WeaponDef {
  type: "BEAM";
  class: "A" | "B" | "C";
  arcs: ("F" | "P" | "S" | "A")[];
}
```

### 1.3 ShipInstance (Mutable)

``` ts
interface ShipInstance extends ShipClass {
  name: string;
  position: { xMm: number; yMm: number; };
  heading: 1|2|3|4|5|6|7|8|9|10|11|12;
  speed: number;
  status: 1 | 2 | 0; // OK / DAMAGED / DESTROYED
  damage: { total: number; tracks: number[][]; };
  systems: {
    drives: { status: 1 | 2 | 0; };
    firecons: { status: 1 | 0; }[];
    weapons: { status: 1 | 0; }[];
    fighters?: FighterGroup[];
  };
}
```

### 1.4 FighterGroup

``` ts
interface FighterGroup {
  count: number;
  position: { xMm: number; yMm: number; };
  status: 1 | 0;
}
```

------------------------------------------------------------------------

## 2. DAMAGE SYSTEM

-   Damage applied left → right, top → bottom.
-   1 = intact
-   0 = destroyed
-   Ship status derived from tracks only.

### Threshold Rules

  Category   Threshold Points
  ---------- ------------------
  Escort     1/2 damage
  Cruiser    1/3 and 2/3
  Capital    1/4, 1/2, 3/4

### Threshold Severity

-   Escorts: destroy on 4--6\
-   Cruisers: 6 at first, 4--6 at second\
-   Capital: 6, then 5--6, then 4--6

Drives: first hit = half thrust, second = destroyed.

------------------------------------------------------------------------

## 3. WEAPON SYSTEM (BASIC GAME)

### Beam Classes

  Class   Range   Dice
  ------- ------- -----------
  A       36"     3 / 2 / 1
  B       24"     2 / 1
  C       12"     1

### Damage Per Die

-   1--3 = No effect\
-   4--5 = 1 damage\
-   6 = 2 damage

------------------------------------------------------------------------

## 4. MOVEMENT

-   1--12 clock heading system\
-   Starboard = +1, Port = -1\
-   Max half thrust for turning\
-   No maximum speed

------------------------------------------------------------------------

## 5. FIGHTERS

-   Carrier: 18 max\
-   Dreadnought: 6 max\
-   Groups of 1--6\
-   Move 18" per turn\
-   AF dice = number of Firecons

------------------------------------------------------------------------

## 6. OPTIONAL RULES

### Armour

-   Capital ships: only 6 inflicts 1 damage

### Ramming

-   Roll D6 + thrust\
-   Damage = 2D6 × Firecon rating

------------------------------------------------------------------------

## 7. ENGINE INVARIANTS

1.  Damage count equals destroyed boxes\
2.  Threshold only when full row destroyed\
3.  Systems never heal\
4.  Drive thrust derived from class thrust\
5.  Ship status derived from tracks

------------------------------------------------------------------------

## 8. CLASS TABLE

  CLASS               THRUST   DAMAGE   FIRECON
  ------------------- -------- -------- ---------
  SCOUT / COURIER     8        2        1
  LANCER / CORVETTE   8        4        1
  FRIGATE             6        6        1
  DESTROYER           6        8        1
  LIGHT CRUISER       6        12       2
  ESCORT CRUISER      6        14       2
  HEAVY CRUISER       4        18       2
  BATTLESHIP          4        22       3
  DREADNOUGHT         2        28       3
  CARRIER             2        24       3

------------------------------------------------------------------------

END SPEC
