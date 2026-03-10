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

  /** Consume accumulated drag delta (pixels) since last call. */
  consumeDragDelta(): { dx: number; dy: number };

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

  // Drag tracking
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragDeltaX = 0;
  let dragDeltaY = 0;
  const DRAG_THRESHOLD = 4; // pixels before a mousedown becomes a drag

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
    const prevX = mouseX;
    const prevY = mouseY;
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (isMouseDown) {
      if (!isDragging) {
        const dist = Math.abs(mouseX - dragStartX) + Math.abs(mouseY - dragStartY);
        if (dist >= DRAG_THRESHOLD) {
          isDragging = true;
        }
      }
      if (isDragging) {
        dragDeltaX += mouseX - prevX;
        dragDeltaY += mouseY - prevY;
      }
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      isMouseDown = true;
      isDragging = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
  });

  canvas.addEventListener("mouseup", (e) => {
    if (e.button === 0) {
      isMouseDown = false;
      // Only emit a click if we didn't drag
      if (!isDragging) {
        clicks.push({ x: e.clientX, y: e.clientY, shiftKey: e.shiftKey });
      }
      isDragging = false;
      canvas.style.cursor = "";
    }
  });

  // Update cursor during drag
  canvas.addEventListener("mousemove", () => {
    if (isDragging) {
      canvas.style.cursor = "grabbing";
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

    consumeDragDelta(): { dx: number; dy: number } {
      const dx = dragDeltaX;
      const dy = dragDeltaY;
      dragDeltaX = 0;
      dragDeltaY = 0;
      return { dx, dy };
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
