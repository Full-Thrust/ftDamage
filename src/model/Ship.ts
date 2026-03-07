import {
  BinaryStatus,
  GenericShipClassJson,
  ShipConstructionOptions,
  ShipInstanceJson,
  TernaryStatus,
} from "./types";

export type ShipCategory = "ESCORT" | "CRUISER" | "CAPITAL";

function deepClone<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

function sanitizeTrackCell(value: number): BinaryStatus {
  return value === 0 ? 0 : 1;
}

function isGenericShipClassJson(raw: unknown): raw is GenericShipClassJson {
  if (!raw || typeof raw !== "object") return false;
  const value = raw as Partial<GenericShipClassJson>;
  return Boolean(
    value.classKey &&
      typeof value.thrust === "number" &&
      value.damage &&
      Array.isArray(value.damage.tracks) &&
      Array.isArray(value.firecons) &&
      Array.isArray(value.weapons)
  );
}

function isShipInstanceJson(raw: unknown): raw is ShipInstanceJson {
  if (!raw || typeof raw !== "object") return false;
  const value = raw as Partial<ShipInstanceJson>;
  return Boolean(
    value.classKey &&
      value.position &&
      value.damage &&
      Array.isArray(value.damage.tracks) &&
      value.drive &&
      Array.isArray(value.firecons) &&
      Array.isArray(value.weapons)
  );
}

export class Ship {
  private data: ShipInstanceJson;

  constructor(rawJson: GenericShipClassJson | ShipInstanceJson, options?: ShipConstructionOptions) {
    if (isShipInstanceJson(rawJson)) {
      this.data = deepClone(rawJson);
      this.normalizeInstance();
      return;
    }

    if (isGenericShipClassJson(rawJson)) {
      this.data = Ship.createInstanceFromGeneric(rawJson, options);
      this.normalizeInstance();
      return;
    }

    throw new Error("Ship constructor expects a generic ship-class JSON or a ship-instance JSON object.");
  }

  static fromGenericJson(rawJson: GenericShipClassJson, options?: ShipConstructionOptions): Ship {
    return new Ship(rawJson, options);
  }

  static fromInstanceJson(rawJson: ShipInstanceJson): Ship {
    return new Ship(rawJson);
  }

  toJson(): ShipInstanceJson {
    return deepClone(this.data);
  }

  toJsonString(): string {
    return `${JSON.stringify(this.toJson(), null, 2)}\n`;
  }

  toHtmlReport(): string {
    const tracks = this.getDamageTracks();
    const trackRows = tracks.length
      ? tracks
          .map((row) => `<div>${row.map((cell) => (cell === 0 ? "[x]" : "[ ]")).join(" ")}</div>`)
          .join("\n")
      : "<div>No tracks</div>";

    const firecons = this.getFireconStatuses().length
      ? this.getFireconStatuses()
          .map((status) => {
            const label = status === 0 ? "Destroyed" : "Undamaged";
            return `<div>${status === 0 ? "(x)" : "(●)"} ${this.renderStatusBadge(label, this.getBinaryStatusClass(status))}</div>`;
          })
          .join("\n")
      : "<div>None</div>";

    const fighters = this.getFighterGroups();
    const fighterRows = fighters.length
      ? fighters
          .map((group) => {
            if (group.status === 0) {
              return `<div>(x) ${this.renderStatusBadge("Destroyed", this.getTernaryStatusClass(0))}</div>`;
            }
            if (group.status === 2) {
              return `<div>( ) ${this.renderStatusBadge("Launched", this.getTernaryStatusClass(2))}</div>`;
            }
            return `<div>(^) ${group.count} ${this.renderStatusBadge("Undamaged", this.getTernaryStatusClass(1))}</div>`;
          })
          .join("\n")
      : "<div>None</div>";

    const weapons = this.getWeapons();
    const weaponRows = weapons.length
      ? weapons
          .map((weapon, index) => {
            const status = weapon.status === 0 ? "Destroyed" : "Undamaged";
            const statusClass = this.getBinaryStatusClass(weapon.status);
            return `<tr><td>${index + 1}</td><td>${weapon.type}</td><td>${weapon.class}</td><td>${weapon.arcs.join(", ")}</td><td>${this.renderStatusBadge(status, statusClass)}</td></tr>`;
          })
          .join("\n")
      : '<tr><td colspan="5">No weapons</td></tr>';

    return [
      "<!doctype html>",
      "<html lang=\"en\">",
      "<head>",
      "  <meta charset=\"utf-8\" />",
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
      `  <title>${this.getName()} ${this.getClassKey()} Report</title>`,
      "  <style>",
      "    body { font-family: Segoe UI, Arial, sans-serif; margin: 20px; background:#f4f6f8; color:#111827; }",
      "    .badge { padding:2px 8px; border-radius:999px; font-weight:700; font-size:12px; }",
      "    .ok { background:#dcfce7; color:#166534; }",
      "    .damaged { background:#fef9c3; color:#854d0e; }",
      "    .dead { background:#fee2e2; color:#991b1b; }",
      "    .card { background:#fff; border:1px solid #d1d5db; border-radius:8px; padding:12px; margin-bottom:12px; }",
      "    table { width:100%; border-collapse:collapse; }",
      "    th,td { border:1px solid #d1d5db; padding:6px 8px; text-align:left; }",
      "  </style>",
      "</head>",
      "<body>",
      `  <h1>${this.getName()} (${this.getClassKey()})</h1>`,
      `  <div class=\"card\">Ship Status: <span class=\"badge ${this.getStatusClass()}\">${this.getStatusLabel()}</span></div>`,
      "  <div class=\"card\">",
      `    <div>Position: x=${this.getPosition().x}, y=${this.getPosition().y}</div>`,
      `    <div>Heading: ${this.getHeading()}</div>`,
      `    <div>Speed: ${this.getSpeed()}</div>`,
      `    <div>Drive: thrust=${this.getDriveThrust()} ${this.renderStatusBadge(this.getDriveStatusLabel(), this.getTernaryStatusClass(this.getDriveStatus()))}</div>`,
      `    <div>Damage: ${this.getDamageHits()}/${this.getDamageTotal()}</div>`,
      "  </div>",
      "  <div class=\"card\"><h3>Damage Tracks</h3>",
      trackRows,
      "  </div>",
      "  <div class=\"card\"><h3>Firecon</h3>",
      firecons,
      "  </div>",
      "  <div class=\"card\"><h3>Fighter Groups</h3>",
      fighterRows,
      "  </div>",
      "  <div class=\"card\"><h3>Weapons</h3>",
      "    <table><thead><tr><th>#</th><th>Type</th><th>Class</th><th>Arcs</th><th>Status</th></tr></thead>",
      `    <tbody>${weaponRows}</tbody></table>`,
      "  </div>",
      "</body>",
      "</html>",
    ].join("\n");
  }

  getClassKey(): string {
    return this.data.classKey;
  }

  setClassKey(value: string): void {
    this.data.classKey = value;
  }

  getName(): string {
    return this.data.name;
  }

  setName(value: string): void {
    this.data.name = value;
  }

  getPosition(): { x: number; y: number } {
    return deepClone(this.data.position);
  }

  setPosition(position: { x: number; y: number }): void {
    this.data.position = deepClone(position);
  }

  getHeading(): number {
    return this.data.heading;
  }

  setHeading(value: number): void {
    this.data.heading = value;
  }

  getSpeed(): number {
    return this.data.speed;
  }

  setSpeed(value: number): void {
    this.data.speed = value;
  }

  getStatus(): TernaryStatus {
    return this.data.status;
  }

  setStatus(value: TernaryStatus): void {
    this.data.status = value;
  }

  getDamageTotal(): number {
    return this.data.damage.total;
  }

  setDamageTotal(value: number): void {
    this.data.damage.total = value;
  }

  getDamageHits(): number {
    return this.data.damage.hits;
  }

  setDamageHits(value: number): void {
    this.data.damage.hits = value;
  }

  getDamageTracks(): number[][] {
    return deepClone(this.data.damage.tracks);
  }

  setDamageTracks(tracks: number[][]): void {
    this.data.damage.tracks = tracks.map((row) => row.map((cell) => sanitizeTrackCell(cell)));
    this.data.damage.total = this.countTrackBoxes(this.data.damage.tracks);
    this.data.damage.hits = this.countDestroyedBoxes(this.data.damage.tracks);
    this.syncStatusFromDamage();
  }

  getTrackCell(rowIndex: number, colIndex: number): BinaryStatus {
    const row = this.data.damage.tracks[rowIndex] ?? [];
    return sanitizeTrackCell(row[colIndex] ?? 1);
  }

  setTrackCell(rowIndex: number, colIndex: number, value: BinaryStatus): void {
    if (!this.data.damage.tracks[rowIndex]) {
      this.data.damage.tracks[rowIndex] = [];
    }
    this.data.damage.tracks[rowIndex][colIndex] = sanitizeTrackCell(value);
    this.data.damage.hits = this.countDestroyedBoxes(this.data.damage.tracks);
    this.syncStatusFromDamage();
  }

  getDriveThrust(): number {
    return this.data.drive.thrust;
  }

  setDriveThrust(value: number): void {
    this.data.drive.thrust = value;
  }

  getDriveStatus(): TernaryStatus {
    return this.data.drive.status;
  }

  setDriveStatus(value: TernaryStatus): void {
    this.data.drive.status = value;
  }

  isDriveOperational(): boolean {
    return this.data.drive.status !== 0;
  }

  applyDriveCriticalHit(): string {
    if (this.data.drive.status === 0) return "disabled";

    if (this.data.drive.status === 1) {
      this.data.drive.thrust = Math.floor(this.data.drive.thrust / 2);
      this.data.drive.status = this.data.drive.thrust > 0 ? 2 : 0;
      return this.data.drive.status === 2 ? "halved" : "disabled";
    }

    this.data.drive.thrust = 0;
    this.data.drive.status = 0;
    return "disabled";
  }

  getFireconCount(): number {
    return this.data.firecons.length;
  }

  getFireconStatuses(): BinaryStatus[] {
    return this.data.firecons.map((entry) => (entry.status === 0 ? 0 : 1));
  }

  getFireconStatus(index: number): BinaryStatus {
    return this.data.firecons[index]?.status === 0 ? 0 : 1;
  }

  setFireconStatus(index: number, value: BinaryStatus): void {
    if (!this.data.firecons[index]) {
      this.data.firecons[index] = { status: 1 };
    }
    this.data.firecons[index].status = value;
  }

  getOperationalFireconIndices(): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.data.firecons.length; i += 1) {
      if (this.data.firecons[i].status === 1) indices.push(i);
    }
    return indices;
  }

  destroyFirecon(index: number): void {
    if (this.data.firecons[index]) {
      this.data.firecons[index].status = 0;
    }
  }

  getWeapons(): Array<ShipInstanceJson["weapons"][number]> {
    return deepClone(this.data.weapons);
  }

  getWeaponCount(): number {
    return this.data.weapons.length;
  }

  getWeaponStatus(index: number): BinaryStatus {
    return this.data.weapons[index]?.status === 0 ? 0 : 1;
  }

  setWeaponStatus(index: number, value: BinaryStatus): void {
    if (this.data.weapons[index]) {
      this.data.weapons[index].status = value;
    }
  }

  getOperationalWeaponIndices(): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.data.weapons.length; i += 1) {
      if (this.data.weapons[i].status === 1) indices.push(i);
    }
    return indices;
  }

  destroyWeapon(index: number): void {
    if (this.data.weapons[index]) {
      this.data.weapons[index].status = 0;
    }
  }

  getFighterGroups(): Array<{ count: number; status: TernaryStatus }> {
    return deepClone(this.data.fighters ?? []);
  }

  setFighterGroups(groups: Array<{ count: number; status: TernaryStatus }>): void {
    this.data.fighters = groups.map((group) => ({
      count: Number.isFinite(group.count) && group.count > 0 ? Math.floor(group.count) : 6,
      status: this.normalizeTernaryStatus(group.status),
    }));
  }

  getOperationalFighterGroupIndicesForThresholdChecks(): number[] {
    const fighters = this.data.fighters ?? [];
    const indices: number[] = [];
    for (let i = 0; i < fighters.length; i += 1) {
      if (fighters[i].status === 1) indices.push(i);
    }
    return indices;
  }

  destroyFighterGroup(index: number): void {
    if (this.data.fighters && this.data.fighters[index]) {
      this.data.fighters[index].status = 0;
    }
  }

  getThresholdCategory(): ShipCategory {
    const fireconCount = this.getFireconCount();
    if (fireconCount <= 1) return "ESCORT";
    if (fireconCount === 2) return "CRUISER";
    return "CAPITAL";
  }

  resetToPristine(): void {
    const tracks = this.getDamageTracks().map((row) => row.map(() => 1));
    this.setDamageTracks(tracks);
    this.setDamageHits(0);
    this.setDamageTotal(this.countTrackBoxes(tracks));
    this.setStatus(1);

    this.setDriveThrust(this.defaultThrustForClass(this.getClassKey(), this.getDriveThrust()));
    this.setDriveStatus(1);

    for (let i = 0; i < this.getFireconCount(); i += 1) {
      this.setFireconStatus(i, 1);
    }

    for (let i = 0; i < this.getWeaponCount(); i += 1) {
      this.setWeaponStatus(i, 1);
    }

    if (this.data.fighters) {
      for (let i = 0; i < this.data.fighters.length; i += 1) {
        this.data.fighters[i].status = 1;
        if (!Number.isFinite(this.data.fighters[i].count) || this.data.fighters[i].count < 1) {
          this.data.fighters[i].count = 6;
        }
      }
    }
  }

  syncStatusFromDamage(): void {
    if (this.getDamageTotal() <= 0) {
      this.setStatus(1);
      return;
    }
    if (this.getDamageHits() >= this.getDamageTotal()) {
      this.setStatus(0);
      return;
    }
    if (this.getDamageHits() > 1) {
      this.setStatus(2);
      return;
    }
    this.setStatus(1);
  }

  private normalizeInstance(): void {
    const tracks = Array.isArray(this.data.damage?.tracks) ? this.data.damage.tracks : [];
    this.data.damage.tracks = tracks.map((row) => (Array.isArray(row) ? row.map((cell) => sanitizeTrackCell(cell)) : []));

    this.data.damage.total = this.countTrackBoxes(this.data.damage.tracks);
    this.data.damage.hits = this.countDestroyedBoxes(this.data.damage.tracks);

    this.data.firecons = Array.isArray(this.data.firecons)
      ? this.data.firecons.map((entry) => ({ status: entry && entry.status === 0 ? 0 : 1 }))
      : [];

    this.data.weapons = Array.isArray(this.data.weapons)
      ? this.data.weapons.map((weapon) => ({
          type: weapon.type,
          class: weapon.class,
          arcs: Array.isArray(weapon.arcs) ? deepClone(weapon.arcs) : [],
          status: weapon.status === 0 ? 0 : 1,
        }))
      : [];

    if (Array.isArray(this.data.fighters)) {
      this.data.fighters = this.data.fighters.map((group) => ({
        count: Number.isFinite(group.count) && group.count > 0 ? Math.floor(group.count) : 6,
        status: this.normalizeTernaryStatus(group.status),
      }));
    }

    this.data.status = this.normalizeTernaryStatus(this.data.status);
    this.data.drive.status = this.normalizeTernaryStatus(this.data.drive.status);

    this.syncStatusFromDamage();
  }

  private normalizeTernaryStatus(value: number): TernaryStatus {
    if (value === 0) return 0;
    if (value === 2) return 2;
    return 1;
  }

  private countDestroyedBoxes(tracks: number[][]): number {
    let count = 0;
    for (const row of tracks) {
      for (const cell of row) {
        if (cell === 0) count += 1;
      }
    }
    return count;
  }

  private countTrackBoxes(tracks: number[][]): number {
    return tracks.reduce((total, row) => total + row.length, 0);
  }

  private getStatusLabel(): string {
    if (this.data.status === 0) return "Destroyed";
    if (this.data.status === 2) return "Damaged";
    return "Undamaged";
  }

  private getStatusClass(): string {
    if (this.data.status === 0) return "dead";
    if (this.data.status === 2) return "damaged";
    return "ok";
  }

  private getTernaryStatusClass(status: TernaryStatus): string {
    if (status === 0) return "dead";
    if (status === 2) return "damaged";
    return "ok";
  }

  private getBinaryStatusClass(status: BinaryStatus): string {
    return status === 0 ? "dead" : "ok";
  }

  private getDriveStatusLabel(): string {
    if (this.data.drive.status === 0) return "Destroyed";
    if (this.data.drive.status === 2) return "Damaged";
    return "Undamaged";
  }

  private renderStatusBadge(label: string, className: string): string {
    return `<span class="badge ${className}">${label}</span>`;
  }

  private defaultThrustForClass(classKey: string, fallback: number): number {
    const table: Record<string, number> = {
      SCOUT_COURIER: 8,
      LANCER_CORVETTE: 8,
      FRIGATE: 6,
      DESTROYER: 6,
      LIGHT_CRUISER: 6,
      ESCORT_CRUISER: 6,
      HEAVY_CRUISER: 4,
      BATTLESHIP: 4,
      DREADNOUGHT: 2,
      CARRIER: 2,
    };

    if (Object.prototype.hasOwnProperty.call(table, classKey)) {
      return table[classKey];
    }

    return Number.isFinite(fallback) ? fallback : 0;
  }

  private static createInstanceFromGeneric(
    generic: GenericShipClassJson,
    options?: ShipConstructionOptions
  ): ShipInstanceJson {
    const tracks = (generic.damage?.tracks ?? []).map((row) => row.map((cell) => sanitizeTrackCell(cell)));
    const damageTotal = tracks.reduce((sum, row) => sum + row.length, 0);
    const damageHits = tracks.reduce((sum, row) => sum + row.filter((cell) => cell === 0).length, 0);

    const fighters = Ship.toFighterGroups(generic.fighters?.capacity);

    return {
      classKey: generic.classKey,
      name: options?.name ?? generic.name ?? generic.classKey,
      position: options?.position ? deepClone(options.position) : { x: 0, y: 0 },
      heading: options?.heading ?? 1,
      speed: options?.speed ?? 0,
      status: options?.status ?? 1,
      damage: {
        total: damageTotal,
        hits: damageHits,
        tracks,
      },
      drive: {
        thrust: Number.isFinite(generic.thrust) ? generic.thrust : 0,
        status: 1,
      },
      firecons: Array.isArray(generic.firecons) ? generic.firecons.map(() => ({ status: 1 })) : [],
      weapons: Array.isArray(generic.weapons)
        ? generic.weapons.map((weapon) => ({
            type: weapon.type,
            class: weapon.class,
            arcs: deepClone(weapon.arcs ?? []),
            status: 1,
          }))
        : [],
      fighters,
    };
  }

  private static toFighterGroups(capacity?: number): Array<{ count: number; status: TernaryStatus }> | undefined {
    if (!Number.isFinite(capacity) || (capacity ?? 0) <= 0) {
      return undefined;
    }

    const groups: Array<{ count: number; status: TernaryStatus }> = [];
    let remaining = Math.floor(capacity as number);

    while (remaining > 0) {
      const count = Math.min(6, remaining);
      groups.push({ count, status: 1 });
      remaining -= count;
    }

    return groups;
  }
}
