// Empire Reborn — Input Manager

export interface ClickEvent {
  x: number;
  y: number;
  shiftKey: boolean;
}

export interface InputState {
  readonly mouseX: number;
  readonly mouseY: number;
  readonly wheelDelta: number;
  readonly isMouseDown: boolean;
  isKeyDown(key: string): boolean;
  consumeWheel(): void;

  // Event queues (one-shot, consumed each frame)
  consumeClicks(): ClickEvent[];
  consumeRightClicks(): ClickEvent[];
  consumeKeyPresses(): string[];
}

/**
 * Create an input manager that tracks keyboard, mouse, and wheel state.
 * Includes both polling (isKeyDown, isMouseDown) and event queues (clicks, key presses).
 */
export function createInput(canvas: HTMLCanvasElement): InputState {
  const keys = new Set<string>();
  let mouseX = 0;
  let mouseY = 0;
  let wheelDelta = 0;
  let isMouseDown = false;

  // Event queues
  let clicks: ClickEvent[] = [];
  let rightClicks: ClickEvent[] = [];
  let keyPresses: string[] = [];

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (!keys.has(key)) {
      keyPresses.push(key);
    }
    keys.add(key);
  });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
  });

  // Lose all keys on blur (tab switch, etc.)
  window.addEventListener("blur", () => {
    keys.clear();
  });

  canvas.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) isMouseDown = true;
  });

  canvas.addEventListener("mouseup", (e) => {
    if (e.button === 0) {
      isMouseDown = false;
      clicks.push({ x: e.clientX, y: e.clientY, shiftKey: e.shiftKey });
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    wheelDelta += e.deltaY > 0 ? 1 : -1;
  }, { passive: false });

  // Right click
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    rightClicks.push({ x: e.clientX, y: e.clientY, shiftKey: e.shiftKey });
  });

  return {
    get mouseX() { return mouseX; },
    get mouseY() { return mouseY; },
    get wheelDelta() { return wheelDelta; },
    get isMouseDown() { return isMouseDown; },

    isKeyDown(key: string): boolean {
      return keys.has(key.toLowerCase());
    },

    consumeWheel(): void {
      wheelDelta = 0;
    },

    consumeClicks(): ClickEvent[] {
      const result = clicks;
      clicks = [];
      return result;
    },

    consumeRightClicks(): ClickEvent[] {
      const result = rightClicks;
      rightClicks = [];
      return result;
    },

    consumeKeyPresses(): string[] {
      const result = keyPresses;
      keyPresses = [];
      return result;
    },
  };
}
