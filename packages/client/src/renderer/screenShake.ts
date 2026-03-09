// Empire Reborn — Screen Shake Effect
// Applies camera jitter on combat events, decays over time.

import { SCREEN_SHAKE_INTENSITY, SCREEN_SHAKE_DECAY } from "../constants.js";

export interface ScreenShake {
  /** Current offset to apply to the world container. */
  offsetX: number;
  offsetY: number;

  /** Trigger a shake with given intensity (0–1 scale, default 1). */
  trigger(intensity?: number): void;

  /** Update shake state. Call once per frame with dt in seconds. */
  update(dt: number): void;
}

export function createScreenShake(): ScreenShake {
  let magnitude = 0;

  return {
    offsetX: 0,
    offsetY: 0,

    trigger(intensity = 1): void {
      magnitude = Math.max(magnitude, SCREEN_SHAKE_INTENSITY * intensity);
    },

    update(dt: number): void {
      if (magnitude < 0.1) {
        magnitude = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        return;
      }

      this.offsetX = (Math.random() * 2 - 1) * magnitude;
      this.offsetY = (Math.random() * 2 - 1) * magnitude;
      magnitude *= Math.max(0, 1 - SCREEN_SHAKE_DECAY * dt);
    },
  };
}
