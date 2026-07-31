const FIXED_DT = 1 / 60;
const MAX_FRAME_TIME = 0.25; // never simulate more than a quarter second of catch-up

/**
 * Fixed-timestep game loop. The simulation always advances in 1/60s steps regardless of
 * display refresh rate, which keeps a seeded run reproducible across devices.
 */
export class Loop {
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const now = performance.now() / 1000;
    let frameTime = now - this.lastTime;
    this.lastTime = now;
    if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

    this.accumulator += frameTime;
    while (this.accumulator >= FIXED_DT) {
      this.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.render();
  };
}

export { FIXED_DT };
