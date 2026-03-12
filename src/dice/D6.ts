export abstract class D6 {
  protected readonly seed: number;

  protected constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  public getSeed(): number {
    return this.seed;
  }

  public abstract roll(): 1 | 2 | 3 | 4 | 5 | 6;
}

export class SeededD6 extends D6 {
  private state: number;

  constructor(seed: number) {
    super(seed);
    this.state = this.seed;
  }

  public roll(): 1 | 2 | 3 | 4 | 5 | 6 {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return (Math.floor((this.state / 4294967296) * 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  }
}

export class TimeSeededD6 extends SeededD6 {
  constructor() {
    super(Date.now());
  }
}
