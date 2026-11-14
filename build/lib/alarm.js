"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var alarm_exports = {};
__export(alarm_exports, {
  AlarmEngine: () => AlarmEngine,
  circuitActive: () => circuitActive,
  isOpenValue: () => isOpenValue
});
module.exports = __toCommonJS(alarm_exports);
function isOpenValue(val, invert = false) {
  let open;
  if (typeof val === "boolean") {
    open = val;
  } else if (typeof val === "number") {
    open = val > 0;
  } else if (typeof val === "string") {
    const v = val.trim().toLowerCase();
    open = ["true", "open", "opened", "on", "1", "2", "tilted", "offen", "gekippt", "auf"].includes(v);
  } else {
    open = false;
  }
  return invert ? !open : open;
}
function circuitActive(circuit, mode) {
  if (circuit === "24h") {
    return true;
  }
  if (mode === "off") {
    return false;
  }
  if (circuit === "perimeter") {
    return true;
  }
  return mode === "full";
}
class AlarmEngine {
  /**
   * Creates the engine
   *
   * @param host access to timers, states and notifications
   * @param opts delays and rules
   */
  constructor(host, opts) {
    this.host = host;
    this.opts = opts;
  }
  mode = "off";
  phase = "disarmed";
  sensors = /* @__PURE__ */ new Map();
  open = /* @__PURE__ */ new Map();
  countdownEnd = 0;
  countdownTimer = null;
  tickTimer = null;
  outputTimer = null;
  motionHits = [];
  armingMode = "off";
  lastTrigger = "";
  lastTriggerTime = 0;
  alarmActive = false;
  // ---------- sensors ----------
  /**
   * Sets the monitored sensors and their current values
   *
   * @param list the sensors
   * @param values current values by state ID
   */
  setSensors(list, values) {
    this.sensors = new Map(list.map((s) => [s.id, s]));
    this.open = new Map(list.map((s) => [s.id, isOpenValue(values[s.id], s.invert)]));
    this.publish();
  }
  /**
   * The monitored sensors
   */
  getSensors() {
    return [...this.sensors.values()];
  }
  /**
   * open contacts that matter for a mode (motion detectors never block arming)
   *
   * @param mode mode to check
   */
  openFor(mode) {
    return this.getSensors().filter(
      (s) => this.open.get(s.id) && !s.motion && s.circuit !== "24h" && circuitActive(s.circuit, mode)
    );
  }
  /**
   * a sensor value changed
   *
   * @param id state ID of the sensor
   * @param val new value
   */
  sensorChanged(id, val) {
    const s = this.sensors.get(id);
    if (!s) {
      return;
    }
    const was = this.open.get(id) || false;
    const now = isOpenValue(val, s.invert);
    this.open.set(id, now);
    if (this.phase === "arming" && id === this.opts.armEarlyId && was && !now) {
      this.finishArming();
      return;
    }
    if (!was && now) {
      this.triggered(s);
    }
    this.publish();
  }
  /**
   * A sensor changed to open: alarm, entry delay or nothing, depending on mode and rules
   *
   * @param s the sensor
   */
  triggered(s) {
    if (s.circuit === "24h") {
      this.alarm(s);
      return;
    }
    if (this.phase !== "armed" && this.phase !== "entry") {
      return;
    }
    if (!circuitActive(s.circuit, this.mode)) {
      return;
    }
    if (this.phase === "entry" && s.circuit === "interior") {
      return;
    }
    if (s.motion && this.opts.motionCount > 1) {
      const t = this.host.now();
      const windowMs = this.opts.motionWindowSec * 1e3;
      this.motionHits = this.motionHits.filter((h) => t - h.ts <= windowMs && h.id !== s.id);
      this.motionHits.push({ id: s.id, ts: t });
      if (this.motionHits.length < this.opts.motionCount) {
        return;
      }
      this.motionHits = [];
    }
    if (s.delayed && this.opts.entryDelay > 0) {
      if (this.phase === "armed") {
        this.startEntry(s);
      }
      return;
    }
    this.alarm(s);
  }
  // ---------- arming ----------
  /**
   * Arm in a mode. Returns null when done/started, otherwise the reason it was refused.
   *
   * @param mode full, perimeter or night
   * @param source who armed (pin, state, presence, widget, schedule)
   */
  arm(mode, source) {
    if (mode === "off") {
      this.disarm(source);
      return { ok: true, open: [] };
    }
    const open = this.openFor(mode);
    if (open.length && this.opts.openCheck === "refuse") {
      this.host.event("armingFailed", { mode, sensors: open, source });
      this.publish();
      return { ok: false, open };
    }
    const hadAlarm = this.alarmActive || this.phase === "alarm";
    this.clearTimers();
    this.stopOutputs();
    this.alarmActive = false;
    if (hadAlarm) {
      this.host.event("alarmEnd", { mode, source });
    }
    if (open.length && this.opts.openCheck === "warn") {
      this.host.event("openWarning", { mode, sensors: open, source });
    }
    const delay = mode === "full" ? this.opts.exitDelayFull : mode === "perimeter" ? this.opts.exitDelayPerimeter : 0;
    this.armingMode = mode;
    if (delay > 0) {
      this.mode = mode;
      this.phase = "arming";
      this.host.event("arming", { mode, source });
      this.startCountdown(delay, () => this.finishArming());
    } else {
      this.mode = mode;
      this.finishArming(source);
    }
    return { ok: true, open };
  }
  /**
   * cancel a running exit delay
   *
   * @param source who cancelled
   */
  cancelArming(source) {
    if (this.phase === "arming") {
      this.disarm(source);
    }
  }
  /**
   * The exit delay is over (or skipped): armed
   *
   * @param source who armed
   */
  finishArming(source = "delay") {
    this.clearTimers();
    this.mode = this.armingMode;
    this.phase = "armed";
    this.motionHits = [];
    const ev = this.mode === "full" ? "armedFull" : this.mode === "perimeter" ? "armedPerimeter" : "armedNight";
    this.host.event(ev, { mode: this.mode, source });
    this.publish();
  }
  /**
   * restore after a restart: armed again without exit delay and without a notification
   *
   * @param mode mode that was armed before the restart
   */
  restore(mode) {
    if (mode === "off") {
      return;
    }
    this.mode = mode;
    this.armingMode = mode;
    this.phase = "armed";
    this.publish();
  }
  /**
   * restore after a restart during an alarm: the alarm stays until it is acknowledged, without a new notification
   *
   * @param mode mode that was armed before the restart ("off" for a 24 h or panic alarm)
   * @param trigger name of the sensor that triggered
   */
  restoreAlarm(mode, trigger) {
    this.mode = mode;
    this.armingMode = mode;
    this.phase = "alarm";
    this.alarmActive = true;
    this.lastTrigger = trigger;
    this.lastTriggerTime = this.host.now();
    this.publish();
  }
  // ---------- entry delay and alarm ----------
  /**
   * Starts the entry delay (silent alarm)
   *
   * @param s the delayed sensor
   */
  startEntry(s) {
    this.phase = "entry";
    this.lastTrigger = s.name;
    this.lastTriggerTime = this.host.now();
    this.host.event("entry", { mode: this.mode, sensor: s });
    this.startCountdown(this.opts.entryDelay, () => this.alarm(s));
  }
  /**
   * trigger the alarm (also used for panic)
   *
   * @param s triggering sensor
   * @param panic true for the panic button
   */
  alarm(s, panic = false) {
    this.clearTimers();
    this.phase = "alarm";
    this.alarmActive = true;
    this.lastTrigger = s.name;
    this.lastTriggerTime = this.host.now();
    this.host.event("alarm", { mode: this.mode, sensor: s, panic });
    this.host.outputs(true);
    if (this.opts.alarmDuration > 0) {
      this.outputTimer = this.host.setTimer(() => {
        this.outputTimer = null;
        this.host.outputs(false);
      }, this.opts.alarmDuration * 1e3);
    }
    this.publish();
  }
  /**
   * Panic alarm, also when disarmed
   *
   * @param source name shown as trigger
   */
  panic(source) {
    this.alarm({ id: "panic", name: source, circuit: "24h", delayed: false, invert: false, motion: false }, true);
  }
  /**
   * acknowledge: outputs off, alarm flag off; the system stays armed
   *
   * @param source who acknowledged
   */
  ack(source) {
    if (!this.alarmActive && this.phase !== "alarm") {
      return;
    }
    this.stopOutputs();
    this.alarmActive = false;
    this.phase = this.mode === "off" ? "disarmed" : "armed";
    this.host.event("alarmEnd", { mode: this.mode, source });
    this.publish();
  }
  /**
   * Disarms and ends a running alarm
   *
   * @param source who disarmed
   */
  disarm(source) {
    const hadAlarm = this.alarmActive || this.phase === "alarm";
    const wasOff = this.mode === "off" && this.phase === "disarmed";
    this.clearTimers();
    this.stopOutputs();
    this.alarmActive = false;
    this.mode = "off";
    this.armingMode = "off";
    this.phase = "disarmed";
    this.motionHits = [];
    if (hadAlarm) {
      this.host.event("alarmEnd", { mode: "off", source });
    }
    if (!wasOff) {
      this.host.event("disarmed", { mode: "off", source });
    }
    this.publish();
  }
  // ---------- timers ----------
  /**
   * Countdown with a status update every second
   *
   * @param seconds length
   * @param done called at the end
   */
  startCountdown(seconds, done) {
    this.clearTimers();
    this.countdownEnd = this.host.now() + seconds * 1e3;
    this.countdownTimer = this.host.setTimer(() => {
      this.countdownTimer = null;
      done();
    }, seconds * 1e3);
    const tick = () => {
      this.publish();
      if (this.countdownTimer) {
        this.tickTimer = this.host.setTimer(tick, 1e3);
      }
    };
    tick();
  }
  /**
   * Stops the countdown
   */
  clearTimers() {
    if (this.countdownTimer) {
      this.host.clearTimer(this.countdownTimer);
    }
    if (this.tickTimer) {
      this.host.clearTimer(this.tickTimer);
    }
    this.countdownTimer = null;
    this.tickTimer = null;
    this.countdownEnd = 0;
  }
  /**
   * Switches lamps and sirens off
   */
  stopOutputs() {
    if (this.outputTimer) {
      this.host.clearTimer(this.outputTimer);
      this.outputTimer = null;
    }
    if (this.alarmActive || this.phase === "alarm") {
      this.host.outputs(false);
    }
  }
  /** stop everything (adapter unload) */
  destroy() {
    this.clearTimers();
    if (this.outputTimer) {
      this.host.clearTimer(this.outputTimer);
      this.outputTimer = null;
    }
  }
  // ---------- status ----------
  /**
   * Current status for the states and the panel
   */
  status() {
    const countdown = this.countdownEnd ? Math.max(0, Math.ceil((this.countdownEnd - this.host.now()) / 1e3)) : 0;
    const openAll = this.getSensors().filter((s) => this.open.get(s.id) && !s.motion);
    return {
      mode: this.mode,
      phase: this.phase,
      countdown,
      alarm: this.alarmActive,
      entry: this.phase === "entry",
      openContacts: openAll,
      readyFull: this.openFor("full").length === 0,
      readyPerimeter: this.openFor("perimeter").length === 0,
      lastTrigger: this.lastTrigger,
      lastTriggerTime: this.lastTriggerTime
    };
  }
  /**
   * Hands the status to the host
   */
  publish() {
    this.host.publish(this.status());
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AlarmEngine,
  circuitActive,
  isOpenValue
});
//# sourceMappingURL=alarm.js.map
