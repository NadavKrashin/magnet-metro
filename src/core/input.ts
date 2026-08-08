export interface InputState {
  /** Horizontal pointer movement in CSS pixels since the previous frame. */
  dragDx: number;
  /** Keyboard steering axis, -1..1. Desktop only; zero on touch devices. */
  axis: number;
  /** Edge-triggered: a quick press-and-release happened since the previous frame. */
  tapped: boolean;
  /** True while the pointer or action key is down. */
  held: boolean;
  /** Seconds the current press has been held. Zero when not held. */
  holdTime: number;
}

const TAP_MAX_DURATION = 0.25; // seconds
const TAP_MAX_MOVEMENT = 14; // CSS pixels

/**
 * One-thumb input. A press that is short and still counts as a tap; anything longer
 * is a hold. Horizontal movement always steers, so a player can steer and tap at once.
 */
export class Input {
  private el: HTMLElement | null = null;
  private dragAccum = 0;
  private tapPending = false;
  private pressActive = false;
  private pressStart = 0;
  private pressMovement = 0;
  private lastX = 0;
  private activePointer: number | null = null;
  private keys = new Set<string>();
  private keyActionHeld = false;
  private keyPressStart = 0;

  attach(el: HTMLElement): void {
    this.el = el;

    /**
     * iOS decides a long press means "select something" and raises a magnifying loupe and a
     * Copy / Look Up bar over the game. Steering is a press held for the length of a run, so
     * it triggers constantly — and once it appears it has the thumb, not the drone.
     *
     * The CSS (`-webkit-user-select`, `-webkit-touch-callout`) removes most of it, but not
     * reliably enough on every iOS version, so the events are refused outright as well. The
     * course-code field is exempted: it is the one place a long press should still work,
     * because pasting a friend's code is the entire point of it.
     */
    const allowSelection = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement && !!target.closest("input, textarea");

    document.addEventListener("contextmenu", (e) => {
      if (!allowSelection(e.target)) e.preventDefault();
    });
    document.addEventListener("selectstart", (e) => {
      if (!allowSelection(e.target)) e.preventDefault();
    });

    el.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach(): void {
    const el = this.el;
    if (el) el.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.el = null;
  }

  /** Read the accumulated input and clear per-frame edges. Call once per frame. */
  snapshot(nowSeconds: number): InputState {
    const held = this.pressActive || this.keyActionHeld;
    let holdTime = 0;
    if (this.pressActive) holdTime = nowSeconds - this.pressStart;
    else if (this.keyActionHeld) holdTime = nowSeconds - this.keyPressStart;

    let axis = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) axis -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) axis += 1;

    const state: InputState = {
      dragDx: this.dragAccum,
      axis,
      tapped: this.tapPending,
      held,
      holdTime,
    };
    this.dragAccum = 0;
    this.tapPending = false;
    return state;
  }

  /** Drop any in-flight press. Used when a run ends so input does not leak across states. */
  reset(): void {
    this.dragAccum = 0;
    this.tapPending = false;
    this.pressActive = false;
    this.pressMovement = 0;
    this.activePointer = null;
    this.keyActionHeld = false;
    this.keys.clear();
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.activePointer !== null) return; // ignore extra fingers
    this.activePointer = e.pointerId;
    this.pressActive = true;
    this.pressStart = performance.now() / 1000;
    this.pressMovement = 0;
    this.lastX = e.clientX;
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.dragAccum += dx;
    this.pressMovement += Math.abs(dx);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    const duration = performance.now() / 1000 - this.pressStart;
    if (duration <= TAP_MAX_DURATION && this.pressMovement <= TAP_MAX_MOVEMENT) {
      this.tapPending = true;
    }
    this.pressActive = false;
    this.activePointer = null;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      if (e.code === "Space") e.preventDefault();
      return;
    }
    this.keys.add(e.code);
    if (e.code === "Space") {
      this.keyActionHeld = true;
      this.keyPressStart = performance.now() / 1000;
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === "Space") {
      const duration = performance.now() / 1000 - this.keyPressStart;
      if (duration <= TAP_MAX_DURATION) this.tapPending = true;
      this.keyActionHeld = false;
    }
  };

  private onBlur = (): void => {
    this.reset();
  };
}
