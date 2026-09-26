/*
 * MEATER Cook Card 1.0.0 — standalone Home Assistant dashboard card.
 * Install: /config/www/meater-cook-card.js
 * Resource: /local/meater-cook-card.js?v=1 (JavaScript module)
 * Type: custom:meater-cook-card
 * Required: internal_entity, target_entity, ambient_entity.
 * Optional: time_remaining_entity, cook_state_entity, name, min (0), max (300),
 * temperature_unit (C/F; otherwise taken from internal sensor), time_unit.
 * All markers use the same linear temperature scale. Unknown readings are
 * shown as a dash and their marker is hidden. Duration units come from the
 * sensor; time_unit can override a missing/incorrect duration unit.
 * No external libraries, network requests, services or card-mod dependency.
 */
(() => {
  const tag = "meater-cook-card";
  if (customElements.get(tag)) return;
  const channels = [
    { key: "internal", label: "Internal", color: "#d000d9", x: 68, width: 12, base: 185 },
    { key: "target", label: "Target", color: "#00a9eb", x: 200, width: 14, base: 190 },
    { key: "ambient", label: "Ambient", color: "#00ce36", x: 332, width: 16, base: 195 },
  ];
  const center = { x: 200, y: 380 }, radius = 146, startAngle = -122, sweep = 244;
  const point = (angle, r = radius) => {
    const a = angle * Math.PI / 180;
    return { x: center.x + r * Math.sin(a), y: center.y - r * Math.cos(a) };
  };
  const arc = (from, to) => {
    const a = point(from), b = point(to);
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  };
  const stops = [
    [0, [72, 74, 150]], [0.28, [132, 39, 112]], [0.52, [228, 24, 49]],
    [0.75, [255, 102, 17]], [1, [255, 205, 8]],
  ];
  const colorAt = (t) => {
    let i = 1;
    while (i < stops.length - 1 && t > stops[i][0]) i++;
    const [a, c] = stops[i - 1], [b, d] = stops[i];
    const p = (t - a) / (b - a);
    return `rgb(${c.map((v, n) => Math.round(v + (d[n] - v) * p)).join(",")})`;
  };
  const temperatureUnit = (value) => {
    const unit = String(value || "").replace("°", "").toUpperCase();
    return unit === "C" || unit === "F" ? unit : null;
  };
  const unavailable = (value) => value == null || ["", "unknown", "unavailable", "none"].includes(String(value).toLowerCase());
  const numeric = (state) => {
    if (!state || unavailable(state.state)) return null;
    const value = Number(state.state);
    return Number.isFinite(value) ? value : null;
  };
  const formatDuration = (seconds) => {
    const minutes = Math.max(0, Math.ceil(seconds / 60));
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  };

  class MeaterCookCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._states = {};
      this._onStates = (states, unsubscribe) => {
        this._unsubscribe = unsubscribe;
        this._states = states || {};
        this._render();
      };
      this.shadowRoot.addEventListener("click", (event) => this._moreInfo(event));
      this.shadowRoot.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") this._moreInfo(event);
      });
    }
    setConfig(config) {
      for (const { key } of channels) {
        if (typeof config[`${key}_entity`] !== "string" || !config[`${key}_entity`].trim()) {
          throw new Error(`MEATER Cook Card: ${key}_entity is required.`);
        }
      }
      const min = Number(config.min ?? 0), max = Number(config.max ?? 300);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        throw new Error("MEATER Cook Card: max must be greater than min.");
      }
      if (config.temperature_unit != null && !temperatureUnit(config.temperature_unit)) {
        throw new Error("MEATER Cook Card: temperature_unit must be C or F.");
      }
      this._config = { name: "MEATER PRO COOK", ...config, min, max };
      this._build();
      this._render();
    }
    set hass(value) {
      this._states = value?.states || {};
      this._render();
    }
    connectedCallback() {
      // Modern HA state context; hass also supports older HA versions.
      const event = new CustomEvent("context-request", { bubbles: true, composed: true, cancelable: true });
      event.context = "states";
      event.subscribe = true;
      event.callback = this._onStates;
      this.dispatchEvent(event);
      clearInterval(this._timer);
      this._timer = setInterval(() => {
        const state = this._states[this._config?.time_remaining_entity];
        if (state?.attributes?.device_class === "timestamp") this._render();
      }, 30000);
      this._render();
    }
    disconnectedCallback() {
      clearInterval(this._timer);
      this._unsubscribe?.();
      this._unsubscribe = undefined;
    }
    getCardSize() { return 11; }
    getGridOptions() { return { columns: 12 }; }

    _build() {
      const segments = Array.from({ length: 160 }, (_, i) => {
        const a = startAngle + i * sweep / 160;
        const b = startAngle + Math.min(sweep, (i + 1) * sweep / 160 + 0.6);
        return `<path d="${arc(a, b)}" stroke="${colorAt((i + 0.5) / 160)}"/>`;
      }).join("");
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
          ha-card { display: block; background: #000; color: #f5f5f5;
            border: 1px solid #222; border-radius: 18px; overflow: hidden;
            padding: 16px 6px 6px; box-sizing: border-box; }
          svg { display: block; width: 100%; height: auto; overflow: visible;
            font-family: var(--primary-font-family, Roboto, "Helvetica Neue", Arial, sans-serif); }
          text { fill: #f5f5f5; text-anchor: middle; font-weight: 300; }
          .reading { cursor: pointer; outline: none; }
          .reading:focus-visible circle { stroke: white; stroke-width: 2; }
          .value { font-size: 46px; letter-spacing: -2px; }
          .fraction { font-size: 29px; letter-spacing: -1px; }
          .degree { font-size: 27px; letter-spacing: 0; }
          .label { font-size: 20px; fill: #d5d5d5; }
          .arc { fill: none; stroke-width: 28; }
          .marker { stroke: black; stroke-width: 3; stroke-linejoin: round; }
          .time { font-size: 56px; letter-spacing: -2px; cursor: pointer; }
          .remaining { font-size: 27px; }
          .scale { font-size: 11px; fill: #787878; }
          .name { font-size: 30px; }
          .phase { font-size: 14px; fill: #a0a0a0; }
        </style>
        <ha-card>
          <svg viewBox="0 0 400 590" role="group" aria-label="Cook temperatures and remaining time">
            ${channels.map((c) => `
              <g id="reading-${c.key}" class="reading" role="button" tabindex="0">
                <title>${c.label}</title>
                <circle cx="${c.x}" cy="68" r="53" fill="${c.color}"/>
                <text x="${c.x}" y="84" class="value"><tspan id="value-${c.key}">—</tspan><tspan id="fraction-${c.key}" class="fraction"></tspan><tspan class="degree" dy="-18">°</tspan></text>
                <text x="${c.x}" y="150" class="label">${c.label}</text>
              </g>`).join("")}
            <g class="arc" aria-hidden="true">${segments}</g>
            <g class="markers">
              ${[...channels].reverse().map((c) => `
                <g id="marker-${c.key}" class="marker" fill="${c.color}" visibility="hidden">
                  <title id="marker-title-${c.key}">${c.label}</title>
                  <path d="M ${-c.width} ${-c.base} L ${c.width} ${-c.base} L 0 -155 Z"/>
                </g>`).join("")}
            </g>
            <text id="time" x="200" y="383" class="time" role="button" tabindex="0">—</text>
            <text id="remaining" x="200" y="426" class="remaining">remaining</text>
            <text id="scale-min" x="66" y="498" class="scale"></text>
            <text id="scale-max" x="334" y="498" class="scale"></text>
            <text id="name" x="200" y="545" class="name"></text>
            <text id="phase" x="200" y="576" class="phase"></text>
          </svg>
        </ha-card>`;
      this._nodes = {};
      for (const node of this.shadowRoot.querySelectorAll("[id]")) this._nodes[node.id] = node;
      this._text("name", String(this._config.name));
      this._nodes.name.style.fontSize = `${Math.min(30, 600 / Math.max(1, String(this._config.name).length))}px`;
      for (const { key } of channels) this._nodes[`reading-${key}`].dataset.entity = this._config[`${key}_entity`];
      if (this._config.time_remaining_entity) this._nodes.time.dataset.entity = this._config.time_remaining_entity;
    }
    _text(id, value) {
      const node = this._nodes?.[id];
      if (node && node.textContent !== value) node.textContent = value;
    }
    _remaining() {
      const state = this._states[this._config.time_remaining_entity];
      if (!state || unavailable(state.state)) return null;
      const raw = String(state.state).trim();
      if (state.attributes?.device_class === "timestamp") {
        const end = Date.parse(raw);
        return Number.isFinite(end) ? formatDuration((end - Date.now()) / 1000) : null;
      }
      const unit = String(this._config.time_unit ?? state.attributes?.unit_of_measurement ?? "").toLowerCase();
      const factors = { s: 1, sec: 1, second: 1, seconds: 1, min: 60, m: 60, minute: 60, minutes: 60,
        h: 3600, hr: 3600, hour: 3600, hours: 3600, d: 86400, day: 86400, days: 86400, ms: 0.001 };
      const number = numeric(state);
      if (number !== null && factors[unit]) return formatDuration(number * factors[unit]);
      const clock = raw.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
      if (clock && Number(clock[2]) < 60 && Number(clock[3] || 0) < 60) {
        return formatDuration(Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] || 0));
      }
      // Preserve unrecognised formatted durations instead of guessing units.
      return `${raw}${unit ? ` ${unit}` : ""}`;
    }
    _render() {
      if (!this._config || !this._nodes) return;
      const cfg = this._config;
      const unit = temperatureUnit(cfg.temperature_unit)
        || temperatureUnit(this._states[cfg.internal_entity]?.attributes?.unit_of_measurement) || "C";
      for (const channel of channels) {
        const { key, label } = channel;
        const state = this._states[cfg[`${key}_entity`]];
        let value = numeric(state);
        const sourceUnit = temperatureUnit(state?.attributes?.unit_of_measurement);
        if (value !== null && sourceUnit && sourceUnit !== unit) {
          value = unit === "C" ? (value - 32) * 5 / 9 : value * 9 / 5 + 32;
        }
        const display = value === null ? "—" : String(Math.round(value * 10) / 10);
        const [whole, fraction] = display.split(".");
        this._text(`value-${key}`, whole);
        this._text(`fraction-${key}`, fraction ? `.${fraction}` : "");
        this._nodes[`reading-${key}`].setAttribute("aria-label", value === null ? `${label}: unavailable` : `${label}: ${display} degrees ${unit}`);
        const marker = this._nodes[`marker-${key}`];
        marker.setAttribute("visibility", value === null ? "hidden" : "visible");
        if (value !== null) {
          const clamped = Math.max(cfg.min, Math.min(cfg.max, value));
          const angle = startAngle + sweep * (clamped - cfg.min) / (cfg.max - cfg.min);
          marker.setAttribute("transform", `translate(${center.x} ${center.y}) rotate(${angle})`);
          this._text(`marker-title-${key}`, `${label}: ${display}°${unit}`);
        }
      }
      const remaining = this._remaining();
      this._text("time", remaining ?? "—");
      this._nodes.time.style.fontSize = `${Math.min(56, 470 / Math.max(1, (remaining || "").length))}px`;
      this._text("remaining", remaining === null ? "time unavailable" : "remaining");
      this._text("scale-min", `${cfg.min}°${unit}`);
      this._text("scale-max", `${cfg.max}°${unit}`);
      const phase = this._states[cfg.cook_state_entity]?.state;
      this._text("phase", unavailable(phase) ? "" : String(phase));
    }
    _moreInfo(event) {
      const target = event.target.closest?.("[data-entity]");
      if (!target) return;
      event.preventDefault();
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: target.dataset.entity }, bubbles: true, composed: true,
      }));
    }
  }
  customElements.define(tag, MeaterCookCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: tag, name: "MEATER Cook Card", preview: false,
    description: "Three coloured temperature chevrons on a single gradient dial, with remaining time." });
})();
