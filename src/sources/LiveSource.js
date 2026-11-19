/**
 * Real-time WebSocket data source matching ReplaySource's contract.
 * Connects to /ws, receives initial buffered state (stream:init),
 * and streams 25 Hz normalized frames and events with auto-reconnect.
 */
export class LiveSource {
  constructor(config = {}) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = config.url || `${proto}//${window.location.host}/ws`;
    this.ws = null;
    this.active = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = 0;
    this.seenEvents = new Set();
    this.callbacks = { onFrame: null, onEvent: null, onStatus: null, onReinit: null };
  }

  _eventKey(ev) {
    return `${ev.t}_${ev.type}_${ev.team}_${ev.playerId}`;
  }

  /**
   * Open WebSocket and resolve once initial stream:init payload arrives.
   * @param {(status: string) => void} [onStatus]
   */
  load(onStatus) {
    this.disconnect();
    this.active = true;
    this.callbacks.onStatus = onStatus || null;
    onStatus?.('Connecting to live WebSocket...');

    return new Promise((resolve, reject) => {
      let settled = false;
      this._connectSocket(
        (initData) => {
          if (!settled) {
            settled = true;
            resolve(initData);
          } else {
            this.callbacks.onReinit?.(initData);
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        }
      );
    });
  }

  _connectSocket(onInit, onFirstError) {
    if (!this.active) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.callbacks.onStatus?.('Live WebSocket · 25 Hz');
    });

    ws.addEventListener('message', (msg) => {
      let payload;
      try {
        payload = JSON.parse(msg.data);
      } catch {
        return;
      }

      if (payload.type === 'stream:init') {
        const frames = payload.frames || [];
        const events = [];
        this.seenEvents.clear();
        for (const ev of payload.events || []) {
          const key = this._eventKey(ev);
          if (!this.seenEvents.has(key)) {
            this.seenEvents.add(key);
            events.push(ev);
          }
        }
        const startTime = frames.length ? frames[0].t : payload.startTime || 0;
        const endTime = frames.length ? frames[frames.length - 1].t : startTime;
        onInit({
          frames,
          events,
          startTime,
          endTime,
          duration: Math.max(0, endTime - startTime),
        });
      } else if (payload.type === 'stream:frame' && payload.frame) {
        this.callbacks.onFrame?.(payload.frame);
      } else if (payload.type === 'stream:event' && payload.event) {
        const key = this._eventKey(payload.event);
        if (!this.seenEvents.has(key)) {
          this.seenEvents.add(key);
          this.callbacks.onEvent?.(payload.event);
        }
      }
    });

    ws.addEventListener('close', () => {
      if (!this.active) return;
      const delay = Math.min(5000, 600 * Math.pow(1.6, this.reconnectAttempts++));
      this.callbacks.onStatus?.(`Reconnecting (${Math.round(delay / 100) / 10}s)...`);
      this.reconnectTimer = window.setTimeout(() => this._connectSocket(onInit, onFirstError), delay);
    });

    ws.addEventListener('error', () => {
      if (this.reconnectAttempts === 0) {
        onFirstError?.(new Error('WebSocket connection failed'));
      }
    });
  }

  subscribe(onFrame, onEvent, onStatus, onReinit) {
    this.callbacks.onFrame = onFrame;
    this.callbacks.onEvent = onEvent;
    if (onStatus) this.callbacks.onStatus = onStatus;
    if (onReinit) this.callbacks.onReinit = onReinit;
  }

  disconnect() {
    this.active = false;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.callbacks = { onFrame: null, onEvent: null, onStatus: null, onReinit: null };
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
