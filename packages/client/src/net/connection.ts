// Empire Reborn — WebSocket Client Connection
// Auto-reconnect with exponential backoff, typed message send/receive.

import type { ClientMessage, ServerMessage } from "@empire/shared";

// ─── Connection State ────────────────────────────────────────────────────────

export type ConnectionState = "disconnected" | "connecting" | "connected";

export interface ConnectionEvents {
  onStateChange: (state: ConnectionState) => void;
  onMessage: (msg: ServerMessage) => void;
}

// ─── Connection ──────────────────────────────────────────────────────────────

export interface Connection {
  readonly state: ConnectionState;
  /** Send a message to the server. Returns false if not connected. */
  send(msg: ClientMessage): boolean;
  /** Connect (or reconnect) to the server. */
  connect(): void;
  /** Disconnect and stop auto-reconnect. */
  disconnect(): void;
}

// ─── Backoff Config ──────────────────────────────────────────────────────────

const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 15000;
const BACKOFF_MULTIPLIER = 2;

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createConnection(url: string, events: ConnectionEvents): Connection {
  let ws: WebSocket | null = null;
  let state: ConnectionState = "disconnected";
  let reconnectDelay = INITIAL_DELAY_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let shouldReconnect = false;

  function setState(newState: ConnectionState): void {
    if (state === newState) return;
    state = newState;
    events.onStateChange(newState);
  }

  function scheduleReconnect(): void {
    if (!shouldReconnect) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      doConnect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * BACKOFF_MULTIPLIER, MAX_DELAY_MS);
  }

  function doConnect(): void {
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    setState("connecting");
    ws = new WebSocket(url);

    ws.onopen = () => {
      setState("connected");
      reconnectDelay = INITIAL_DELAY_MS;
    };

    ws.binaryType = "arraybuffer";
    ws.onmessage = async (event) => {
      try {
        let json: string;
        if (event.data instanceof ArrayBuffer) {
          // Binary message — gzip compressed, decompress via DecompressionStream
          json = await decompressGzip(event.data);
        } else {
          json = event.data as string;
        }
        const msg = JSON.parse(json) as ServerMessage;
        events.onMessage(msg);
      } catch {
        console.warn("Failed to parse server message:", event.data);
      }
    };

    ws.onclose = () => {
      ws = null;
      setState("disconnected");
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  return {
    get state() { return state; },

    send(msg: ClientMessage): boolean {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    },

    connect(): void {
      shouldReconnect = true;
      reconnectDelay = INITIAL_DELAY_MS;
      doConnect();
    },

    disconnect(): void {
      shouldReconnect = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.onclose = null; // prevent auto-reconnect
        ws.close();
        ws = null;
      }
      setState("disconnected");
    },
  };
}

/** Decompress gzip data using the browser's DecompressionStream API. */
async function decompressGzip(data: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(data));
  writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const decoder = new TextDecoder();
  return chunks.map(c => decoder.decode(c, { stream: true })).join("") + decoder.decode();
}

/** Build the WebSocket URL from the current page location or a custom host. */
export function getWebSocketUrl(host?: string): string {
  if (host) {
    const protocol = host.startsWith("https") ? "wss" : "ws";
    const cleanHost = host.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `${protocol}://${cleanHost}/ws`;
  }
  // Auto-detect from page location
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}
