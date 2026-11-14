"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_alarm = require("./lib/alarm");
var import_simulation = require("./lib/simulation");
var import_sun = require("./lib/sun");
var import_texts = require("./lib/texts");
const MODES = ["off", "full", "perimeter", "night"];
const SEND_FORMAT = {
  telegram: (text) => ({ text }),
  pushover: (text) => ({ message: text, title: "Home Guard" }),
  email: (text) => ({ text, subject: `Home Guard: ${text.substring(0, 60)}` }),
  "whatsapp-cmb": (text) => ({ text }),
  "signal-cmb": (text) => ({ text }),
  pushsafer: (text) => ({ message: text, title: "Home Guard" })
};
const LEARN_IGNORE = /^system\.adapter\.(javascript|scenes|node-red|home-guard)\./;
class HomeGuard extends utils.Adapter {
  T = (0, import_texts.texts)("en");
  sysLang = "en";
  lat = 51;
  lon = 10;
  alarm;
  sim;
  evening;
  eveningLogged = "";
  learner = new import_simulation.Learner();
  sensorIds = /* @__PURE__ */ new Set();
  presenceIds = [];
  presenceVals = /* @__PURE__ */ new Map();
  personOf = /* @__PURE__ */ new Map();
  autoArm = true;
  simLamps = [];
  simLampVals = /* @__PURE__ */ new Map();
  lampOuts = [];
  blinkTimer;
  blinkOn = false;
  repeatTimer;
  test = null;
  minuteTimer;
  rescanTimer;
  wrongPin = 0;
  pinLockedUntil = 0;
  pinError = "wrong pin";
  outputsOn = false;
  log_ = [];
  luxDuskTs = 0;
  lastSimActive = false;
  simRestoring = true;
  started = false;
  lastMinute = "";
  sabotageKnown = /* @__PURE__ */ new Set();
  learnSaveTimer;
  lastStatusJson = "";
  /**
   * Creates the adapter
   *
   * @param options adapter options
   */
  constructor(options = {}) {
    super({ ...options, name: "home-guard" });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("objectChange", this.onObjectChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  // ======================================================================
  // start
  // ======================================================================
  /**
   * Start: settings, sensors, presence, lamps, subscriptions, timers
   */
  async onReady() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const c = this.config;
    const sys = await this.getForeignObjectAsync("system.config");
    const lang = ((_a = sys == null ? void 0 : sys.common) == null ? void 0 : _a.language) || "en";
    this.sysLang = lang;
    this.T = (0, import_texts.texts)(lang);
    const lastMode = (_b = await this.getStateAsync("status.mode")) == null ? void 0 : _b.val;
    const lastAlarm = ((_c = await this.getStateAsync("status.alarm")) == null ? void 0 : _c.val) === true;
    const trigger = String(((_d = await this.getStateAsync("status.lastTrigger")) == null ? void 0 : _d.val) || "");
    this.lat = Number((_e = sys == null ? void 0 : sys.common) == null ? void 0 : _e.latitude) || 51;
    this.lon = Number((_f = sys == null ? void 0 : sys.common) == null ? void 0 : _f.longitude) || 10;
    this.log_ = this.parseJson((_g = await this.getStateAsync("status.log")) == null ? void 0 : _g.val, []);
    const learned = this.parseJson((_h = await this.getStateAsync("simulation.learned")) == null ? void 0 : _h.val, { days: {} });
    this.learner = new import_simulation.Learner(learned && learned.days ? learned : { days: {} });
    this.alarm = new import_alarm.AlarmEngine(
      {
        now: () => Date.now(),
        setTimer: (fn, ms) => this.setTimeout(fn, ms),
        clearTimer: (h) => this.clearTimeout(h),
        publish: (s) => void this.publishAlarm(s),
        event: (e, info) => void this.onAlarmEvent(e, info),
        outputs: (on) => void this.setOutputs(on)
      },
      {
        // limits as in the settings, also in code: a timer above 2^31 ms would fire at once
        exitDelayFull: clamp(num(c.exitDelayFull, 60), 0, 600),
        exitDelayPerimeter: clamp(num(c.exitDelayPerimeter, 0), 0, 600),
        armEarlyId: c.armEarlyId || "",
        entryDelay: clamp(num(c.entryDelay, 30), 0, 600),
        openCheck: c.openCheck || "warn",
        alarmDuration: clamp(num(c.alarmDuration, 180), 0, 3600),
        motionCount: clamp(num(c.motionCount, 2), 1, 10),
        motionWindowSec: clamp(num(c.motionWindowSec, 120), 10, 1800)
      }
    );
    this.sim = new import_simulation.SimRunner(
      {
        now: () => Date.now(),
        setTimer: (fn, ms) => this.setTimeout(fn, ms),
        clearTimer: (h) => this.clearTimeout(h),
        isOn: (id) => this.simLampVals.get(id) || false,
        switchLamp: (id, on) => void this.switchLamp(id, on),
        publish: (active, plan, next) => void this.publishSim(active, plan, next)
      },
      (now) => this.makePlan(now)
    );
    this.evening = new import_simulation.SimRunner(
      {
        now: () => Date.now(),
        setTimer: (fn, ms) => this.setTimeout(fn, ms),
        clearTimer: (h) => this.clearTimeout(h),
        isOn: (id) => this.simLampVals.get(id) || false,
        switchLamp: (id, on) => void this.switchLamp(id, on),
        publish: (active, plan, next) => {
          const text = active && next ? `${new Date(next.at).toLocaleString()} ${next.on ? "on" : "off"}` : "";
          if (text && text !== this.eveningLogged) {
            this.eveningLogged = text;
            this.log.debug(`Evening light: next step ${text} (${plan.length} steps planned)`);
          }
        }
      },
      (now) => this.makeEveningPlan(now),
      { force: true, catchUp: false }
    );
    await this.setupSensors();
    await this.setupPresence();
    await this.setupSimLamps();
    await this.setupLamps();
    this.updateEvening();
    if (c.lockEnabled && c.lockId) {
      await this.subscribeForeignStatesAsync(c.lockId);
    }
    if (c.armEarlyId && !this.sensorIds.has(c.armEarlyId)) {
      await this.subscribeForeignStatesAsync(c.armEarlyId);
    }
    if (c.simLuxId) {
      await this.subscribeForeignStatesAsync(c.simLuxId);
    }
    await this.subscribeStatesAsync("control.*");
    await this.subscribeStatesAsync("simulation.enabled");
    if (this.watchedEnums().length) {
      await this.subscribeForeignObjectsAsync("enum.functions.*");
    }
    const auto = await this.getStateAsync("control.autoArm");
    this.autoArm = (auto == null ? void 0 : auto.val) !== false;
    if ((auto == null ? void 0 : auto.val) == null) {
      await this.setStateAsync("control.autoArm", true, true);
    }
    if (lastAlarm && MODES.includes(lastMode)) {
      this.alarm.restore(lastMode);
      this.alarm.restoreAlarm(lastMode, trigger);
      await this.sirens(false);
      this.log.warn(`Restarted during an alarm (${trigger}) \u2013 please acknowledge`);
    } else if (c.alarmEnabled && MODES.includes(lastMode) && lastMode !== "off") {
      this.alarm.restore(lastMode);
      this.log.info(`Restored mode ${lastMode}`);
    } else {
      await this.publishAlarm(this.alarm.status());
    }
    this.wrongPin = num((_i = await this.getStateAsync("status.wrongPin")) == null ? void 0 : _i.val, 0);
    this.minuteTimer = this.setInterval(() => void this.everyMinute(), 6e4);
    this.started = true;
    await this.everyMinute();
    await this.updateSimulation();
    this.log.info(
      `Home Guard ready: ${this.sensorIds.size} sensors, ${this.presenceIds.length} presence states, ${this.simLamps.length} simulation lamps, ${this.lampOuts.length} alarm lamps`
    );
  }
  /**
   * Stop: all timers off
   *
   * @param callback to call when done
   */
  onUnload(callback) {
    var _a;
    try {
      (_a = this.alarm) == null ? void 0 : _a.destroy();
      if (this.blinkTimer) {
        this.clearInterval(this.blinkTimer);
      }
      if (this.repeatTimer) {
        this.clearInterval(this.repeatTimer);
      }
      if (this.minuteTimer) {
        this.clearInterval(this.minuteTimer);
      }
      if (this.learnSaveTimer) {
        this.clearTimeout(this.learnSaveTimer);
      }
      if (this.rescanTimer) {
        this.clearTimeout(this.rescanTimer);
      }
      callback();
    } catch {
      callback();
    }
  }
  // ======================================================================
  // configuration: sensors, presence, lamps
  // ======================================================================
  /**
   * state IDs of an enum (states directly, channels/devices with their sensor states)
   *
   * @param enumId ID of the enum, e.g. enum.functions.alarm
   */
  async enumStates(enumId) {
    var _a, _b;
    if (!enumId) {
      return [];
    }
    const obj = await this.getForeignObjectAsync(enumId);
    const members = ((_a = obj == null ? void 0 : obj.common) == null ? void 0 : _a.members) || [];
    const out = [];
    for (const m of members) {
      const o = await this.getForeignObjectAsync(m);
      if (!o) {
        continue;
      }
      if (o.type === "state") {
        out.push(m);
      } else {
        const children = await this.getForeignObjectsAsync(`${m}.*`, "state");
        for (const [id, child] of Object.entries(children)) {
          const role = String(((_b = child.common) == null ? void 0 : _b.role) || "");
          if (/sensor|state|window|door|motion|switch|level|light/i.test(role)) {
            out.push(id);
          }
        }
      }
    }
    return out;
  }
  /**
   * Name of a state: given name, description or name of the object
   *
   * @param id state ID
   * @param given name from the settings
   */
  async nameOf(id, given) {
    var _a;
    if (given) {
      return given;
    }
    const o = await this.getForeignObjectAsync(id);
    const desc = (o == null ? void 0 : o.common) && typeof o.common.desc === "string" ? o.common.desc : "";
    if (desc && !/^(manuell erzeugt|manually created)$/i.test(desc.trim())) {
      return desc;
    }
    const name = (_a = o == null ? void 0 : o.common) == null ? void 0 : _a.name;
    if (name && typeof name === "object") {
      return name[this.T === (0, import_texts.texts)("de") ? "de" : "en"] || name.en || id;
    }
    return name || id;
  }
  /**
   * The functions (enums) the settings use for automatic discovery
   */
  watchedEnums() {
    const c = this.config;
    return [
      c.autoFull && c.enumFull,
      c.autoPerimeter && c.enumPerimeter,
      c.autoFire && c.enumFire,
      c.presenceAuto && c.enumPresence,
      c.simAuto && c.enumSimLamps,
      c.lampsAuto && c.enumLamps
    ].filter((e) => typeof e === "string" && e.length > 0);
  }
  /**
   * A function (enum) changed: collect sensors, persons and lamps again a few seconds later
   *
   * @param id object ID
   */
  onObjectChange(id) {
    if (!this.watchedEnums().includes(id)) {
      return;
    }
    if (this.rescanTimer) {
      this.clearTimeout(this.rescanTimer);
    }
    this.rescanTimer = this.setTimeout(() => {
      this.rescanTimer = void 0;
      void this.rescan(id);
    }, 3e3);
  }
  /**
   * all foreign states the adapter listens to
   */
  foreignIds() {
    const c = this.config;
    return new Set(
      [
        ...this.sensorIds,
        ...this.presenceIds,
        ...this.simLamps.map((l) => l.id),
        c.lockEnabled ? c.lockId : "",
        c.armEarlyId,
        c.simLuxId
      ].filter(Boolean)
    );
  }
  /**
   * Collects sensors, persons and lamps again after a function changed
   *
   * @param enumId the changed function
   */
  async rescan(enumId) {
    try {
      const before = this.foreignIds();
      const wasHome = this.someoneHome();
      await this.setupSensors();
      this.presenceVals.clear();
      await this.setupPresence();
      this.simLampVals.clear();
      await this.setupSimLamps();
      this.updateEvening();
      if (this.alarm.status().phase !== "alarm") {
        await this.setupLamps();
      }
      const after = this.foreignIds();
      for (const id of before) {
        if (!after.has(id)) {
          await this.unsubscribeForeignStatesAsync(id);
        }
      }
      this.log.info(
        `${enumId} changed: ${this.sensorIds.size} sensors, ${this.presenceIds.length} presence states, ${this.simLamps.length} simulation lamps, ${this.lampOuts.length} alarm lamps`
      );
      await this.onPresence(wasHome, this.someoneHome());
    } catch (e) {
      this.log.warn(`Rescan after ${enumId} failed: ${e.message}`);
    }
  }
  /**
   * Collects the sensors from functions and the table
   */
  async setupSensors() {
    var _a;
    const c = this.config;
    const found = /* @__PURE__ */ new Map();
    const add = async (id, circuit) => {
      var _a2;
      const prev = found.get(id);
      if (prev && (prev.circuit === "perimeter" || prev.circuit === "24h")) {
        return;
      }
      const o = await this.getForeignObjectAsync(id);
      const role = String(((_a2 = o == null ? void 0 : o.common) == null ? void 0 : _a2.role) || "");
      const motion = /motion|presence/i.test(role) || /BWM|Bewegung|motion/i.test(id);
      found.set(id, { id, name: await this.nameOf(id), circuit, delayed: false, invert: false, motion });
    };
    if (c.autoFull) {
      for (const id of await this.enumStates(c.enumFull)) {
        await add(id, "interior");
      }
    }
    if (c.autoPerimeter) {
      for (const id of await this.enumStates(c.enumPerimeter)) {
        await add(id, "perimeter");
      }
    }
    if (c.autoFire) {
      for (const id of await this.enumStates(c.enumFire)) {
        found.delete(id);
        await add(id, "24h");
      }
    }
    for (const row of c.sensors || []) {
      if (!row || !row.id) {
        continue;
      }
      if (row.enabled === false) {
        found.delete(row.id);
        continue;
      }
      found.set(row.id, {
        id: row.id,
        name: await this.nameOf(row.id, row.name),
        circuit: row.circuit || "perimeter",
        delayed: !!row.delayed,
        invert: !!row.invert,
        motion: !!row.motion
      });
    }
    const list = [...found.values()];
    const values = {};
    for (const s of list) {
      values[s.id] = (_a = await this.getForeignStateAsync(s.id)) == null ? void 0 : _a.val;
      await this.subscribeForeignStatesAsync(s.id);
    }
    this.sensorIds = new Set(list.map((s) => s.id));
    this.alarm.setSensors(list, values);
    await this.setStateAsync(
      "status.sensors",
      JSON.stringify(
        list.map((s) => ({ id: s.id, name: s.name, circuit: s.circuit, delayed: s.delayed, motion: s.motion }))
      ),
      true
    );
  }
  /**
   * Collects the presence states
   */
  async setupPresence() {
    var _a;
    const c = this.config;
    const ids = /* @__PURE__ */ new Set();
    this.personOf.clear();
    if (c.presenceAuto) {
      (await this.enumStates(c.enumPresence)).forEach((id) => ids.add(id));
    }
    for (const row of c.presence || []) {
      if (!(row == null ? void 0 : row.id)) {
        continue;
      }
      if (row.enabled === false) {
        ids.delete(row.id);
        continue;
      }
      ids.add(row.id);
      if (row.name) {
        this.personOf.set(row.id, String(row.name).trim());
      }
    }
    this.presenceIds = [...ids];
    for (const id of this.presenceIds) {
      if (!this.personOf.has(id)) {
        this.personOf.set(id, await this.personName(id));
      }
      this.presenceVals.set(id, (0, import_alarm.isOpenValue)((_a = await this.getForeignStateAsync(id)) == null ? void 0 : _a.val));
      await this.subscribeForeignStatesAsync(id);
    }
    await this.publishPresence();
  }
  /**
   * Name of the person of a presence state when the table gives none: the object name (or the last part of the
   * ID) without endings like _GPS, _Ping or _WLAN - "David_GPS" and "David_Ping" both become "David"
   *
   * @param id state ID
   */
  async personName(id) {
    var _a;
    const o = await this.getForeignObjectAsync(id);
    const n = (_a = o == null ? void 0 : o.common) == null ? void 0 : _a.name;
    let name = typeof n === "object" && n ? n[this.T === (0, import_texts.texts)("de") ? "de" : "en"] || n.en : n || "";
    if (!name || name.includes(".") || /^(state|value|presence|present|on|val)$/i.test(name)) {
      name = id.split(".").pop() || id;
    }
    const stripped = name.replace(
      /[\s_.-]*(gps|ping|wlan|wifi|lan|bt|ble|bluetooth|phone|handy|smartphone|presence|present|anwesend|anwesenheit|status|state|home|zuhause)$/i,
      ""
    ).trim();
    return stripped || name;
  }
  /**
   * Collects the lamps of the presence simulation
   */
  async setupSimLamps() {
    var _a;
    const c = this.config;
    const lamps = /* @__PURE__ */ new Map();
    if (c.simAuto) {
      for (const id of await this.enumStates(c.enumSimLamps)) {
        lamps.set(id, { id, name: await this.nameOf(id), type: "evening" });
      }
    }
    for (const row of c.simLamps || []) {
      if (!(row == null ? void 0 : row.id)) {
        continue;
      }
      if (row.enabled === false) {
        lamps.delete(row.id);
        continue;
      }
      lamps.set(row.id, { id: row.id, name: await this.nameOf(row.id, row.name), type: row.type || "evening" });
    }
    this.simLamps = [...lamps.values()];
    for (const l of this.simLamps) {
      this.simLampVals.set(l.id, (0, import_alarm.isOpenValue)((_a = await this.getForeignStateAsync(l.id)) == null ? void 0 : _a.val));
      await this.subscribeForeignStatesAsync(l.id);
    }
  }
  /**
   * Collects the lamps switched on alarm
   */
  async setupLamps() {
    const c = this.config;
    const ids = /* @__PURE__ */ new Set();
    if (c.lampsAuto) {
      (await this.enumStates(c.enumLamps)).forEach((id) => ids.add(id));
    }
    for (const row of c.lamps || []) {
      if ((row == null ? void 0 : row.id) && row.enabled !== false) {
        ids.add(row.id);
      }
    }
    this.lampOuts = [];
    for (const id of ids) {
      const { on, off } = await this.onOffValues(id);
      this.lampOuts.push({ id, prev: off, on, off });
    }
  }
  /**
   * what "on" and "off" are for a state: true/false or max/0 for numbers
   *
   * @param id state ID
   */
  async onOffValues(id) {
    var _a;
    const o = await this.getForeignObjectAsync(id);
    if (((_a = o == null ? void 0 : o.common) == null ? void 0 : _a.type) === "number") {
      const max = o.common.max;
      return { on: typeof max === "number" ? max : 100, off: 0 };
    }
    return { on: true, off: false };
  }
  // ======================================================================
  // state changes
  // ======================================================================
  /**
   * A subscribed state changed
   *
   * @param id state ID
   * @param state new state
   */
  async onStateChange(id, state) {
    if (!state) {
      return;
    }
    const c = this.config;
    const own = id.startsWith(`${this.namespace}.`);
    if (own) {
      if (!state.ack) {
        await this.onControl(id.substring(this.namespace.length + 1), state);
      }
      return;
    }
    const confirmed = state.ack === true || id.startsWith("0_userdata.");
    if ((this.sensorIds.has(id) || id === c.armEarlyId) && confirmed) {
      if (c.alarmEnabled) {
        this.alarm.sensorChanged(id, state.val);
      }
    }
    if (c.lockEnabled && id === c.lockId && confirmed) {
      const values = String(c.lockValues || "").split(/[,;\s]+/).filter(Boolean);
      if (values.includes(String(state.val)) && this.alarm.mode !== "off") {
        this.alarm.disarm("lock");
      }
    }
    if (this.presenceVals.has(id) && confirmed) {
      const was = this.someoneHome();
      this.presenceVals.set(id, (0, import_alarm.isOpenValue)(state.val));
      await this.publishPresence();
      await this.onPresence(was, this.someoneHome());
    }
    if (this.simLampVals.has(id)) {
      const on = (0, import_alarm.isOpenValue)(state.val);
      const before = this.simLampVals.get(id);
      this.simLampVals.set(id, on);
      const from = state.from || "";
      const ignored = c.simLearnDevicesOnly !== false ? LEARN_IGNORE.test(from) : from.startsWith(`system.adapter.${this.namespace}`);
      const ts = state.ts || Date.now();
      if (before !== on && !this.sim.active && !ignored && confirmed && (!on || this.inLearnWindow(ts))) {
        if (this.learner.record(id, on, ts)) {
          this.saveLearnedSoon();
        }
      }
    }
    if (c.simLuxId && id === c.simLuxId && confirmed) {
      this.onLux(Number(state.val));
    }
  }
  /**
   * Own control states written by the user
   *
   * @param rel ID without the namespace
   * @param state new state
   */
  async onControl(rel, state) {
    const c = this.config;
    const val = state.val;
    const reset = async (v) => {
      await this.setStateAsync(rel, v, true);
    };
    switch (rel) {
      case "control.mode": {
        const mode = String(val);
        if (!MODES.includes(mode)) {
          this.log.warn(`Unknown mode "${mode}" \u2013 use off, full, perimeter or night`);
          await this.setStateAsync("control.mode", this.alarm.mode, true);
          return;
        }
        await this.setModeChecked(mode, "state");
        return;
      }
      case "control.full":
      case "control.perimeter":
      case "control.night":
      case "control.off":
        if (val) {
          await this.setModeChecked(rel.split(".")[1], "state");
        }
        await reset(false);
        return;
      case "control.cancel":
        if (val) {
          this.alarm.cancelArming("state");
        }
        await reset(false);
        return;
      case "control.ack":
        if (val) {
          await this.endTest();
          this.alarm.ack("state");
        }
        await reset(false);
        return;
      case "control.panic":
        if (val) {
          this.alarm.panic(this.T.by.panic);
        }
        await reset(false);
        return;
      case "control.pin": {
        await reset("");
        if (val !== "" && val !== null) {
          this.checkPin(String(val), "off", "pin");
        }
        return;
      }
      case "control.autoArm":
        this.autoArm = !!val;
        await this.setStateAsync("control.autoArm", this.autoArm, true);
        this.addLog("autoArm", this.autoArm ? this.T.autoOn : this.T.autoOff);
        return;
      case "simulation.enabled":
        await this.setStateAsync("simulation.enabled", !!val, true);
        await this.updateSimulation();
        return;
      default:
        if (c.alarmEnabled === false) {
          this.log.debug(`Ignored ${rel}`);
        }
    }
  }
  /**
   * mode change from a state: disarming may need the PIN
   *
   * @param mode wanted mode
   * @param source who changed the mode
   */
  async setModeChecked(mode, source) {
    const c = this.config;
    const refuse = async (why) => {
      var _a;
      this.log.warn(why);
      await this.setStateAsync("control.mode", ((_a = this.alarm) == null ? void 0 : _a.mode) || "off", true);
    };
    if (!c.alarmEnabled) {
      return refuse("The alarm system is switched off in the settings");
    }
    if (mode === "off" && c.pin && c.pinForDisarmState) {
      return refuse("Disarming by state is only possible with the PIN (control.pin) \u2013 see settings");
    }
    if (mode !== "off" && c.pin && c.pinForArm) {
      return refuse('Arming needs the PIN (message "arm" with pin) \u2013 see settings');
    }
    this.alarm.arm(mode, source);
    await this.updateSimulation();
  }
  /**
   * checks a PIN; correct: switch to the mode, wrong: count
   *
   * @param pin entered PIN
   * @param mode mode to switch to when the PIN is right
   * @param source who entered the PIN
   */
  checkPin(pin, mode, source) {
    const c = this.config;
    if (c.pin && Date.now() < this.pinLockedUntil) {
      this.pinError = "pin locked";
      this.log.warn("PIN entry is locked after too many wrong entries");
      return false;
    }
    this.pinError = "wrong pin";
    if (!c.pin || pin === String(c.pin)) {
      this.wrongPin = 0;
      void this.setStateAsync("status.wrongPin", 0, true);
      if (mode === "off") {
        this.alarm.disarm(source);
      } else {
        this.alarm.arm(mode, source);
      }
      void this.updateSimulation();
      return true;
    }
    this.wrongPin++;
    void this.setStateAsync("status.wrongPin", this.wrongPin, true);
    if (this.wrongPin >= Math.max(1, num(c.maxWrongPin, 3))) {
      const lockMin = clamp(num(c.pinLockMin, 5), 0, 120);
      if (lockMin > 0) {
        this.pinLockedUntil = Date.now() + lockMin * 6e4;
      }
      void this.onAlarmEvent("wrongPin", {});
    }
    return false;
  }
  /**
   * Is at least one person at home?
   */
  someoneHome() {
    return [...this.presenceVals.values()].some(Boolean);
  }
  /**
   * Presence changed: arm or disarm automatically
   *
   * @param wasHome somebody was at home before
   * @param isHome somebody is at home now
   */
  async onPresence(wasHome, isHome) {
    const c = this.config;
    if (!this.presenceIds.length || wasHome === isHome) {
      await this.updateSimulation();
      return;
    }
    if (!this.autoArm) {
      await this.updateSimulation();
      return;
    }
    if (c.alarmEnabled && !isHome && c.presenceArm && c.presenceArm !== "off" && this.alarm.mode === "off") {
      this.alarm.arm(c.presenceArm, "presence");
    }
    if (c.alarmEnabled && isHome && c.presenceDisarm && this.alarm.mode === "full") {
      this.alarm.disarm("presence");
    }
    await this.updateSimulation();
  }
  // ======================================================================
  // messages (web component, scripts, admin)
  // ======================================================================
  /**
   * Messages from the panel, scripts and the settings
   *
   * @param obj the message
   */
  async onMessage(obj) {
    var _a;
    if (!obj || !obj.command) {
      return;
    }
    const msg = typeof obj.message === "object" && obj.message ? obj.message : {};
    const str = (v, d = "") => typeof v === "string" || typeof v === "number" ? String(v) : d;
    const reply = (data) => {
      if (obj.callback) {
        this.sendTo(obj.from, obj.command, data, obj.callback);
      }
    };
    const c = this.config;
    switch (obj.command) {
      case "arm": {
        const mode = str(msg.mode, "full");
        if (!MODES.includes(mode) || mode === "off") {
          return reply({ ok: false, error: "unknown mode" });
        }
        if (!c.alarmEnabled) {
          return reply({ ok: false, error: "alarm system disabled" });
        }
        if (c.pin && c.pinForArm) {
          const ok = this.checkPin(str(msg.pin), mode, "pin");
          return reply({ ok, error: ok ? void 0 : this.pinError });
        }
        const r = this.alarm.arm(mode, str(msg.source, "message"));
        await this.updateSimulation();
        return reply({ ok: r.ok, open: r.open.map((s) => s.name) });
      }
      case "disarm": {
        if (c.pin) {
          const ok = this.checkPin(str(msg.pin), "off", "pin");
          return reply({ ok, error: ok ? void 0 : this.pinError });
        }
        this.alarm.disarm(str(msg.source, "message"));
        await this.updateSimulation();
        return reply({ ok: true });
      }
      case "cancel":
        this.alarm.cancelArming("message");
        return reply({ ok: true });
      case "ack":
        await this.endTest();
        this.alarm.ack("message");
        return reply({ ok: true });
      case "testAlarm":
        return reply(await this.startTest(msg));
      case "panic":
        this.alarm.panic(this.T.by.panic);
        return reply({ ok: true });
      case "simulation":
        await this.setStateAsync("simulation.enabled", !!msg.enabled, true);
        await this.updateSimulation();
        return reply({ ok: true, active: this.sim.active });
      case "status":
        return reply({
          ...this.alarm.status(),
          pinRequired: !!c.pin,
          pinForArm: !!(c.pin && c.pinForArm),
          // only the length, so the panel can accept a complete PIN without OK - never the PIN itself
          pinLength: c.pin ? String(c.pin).length : 0,
          autoArmAvailable: !!c.alarmEnabled && this.presenceIds.length > 0 && (!!c.presenceArm && c.presenceArm !== "off" || !!c.presenceDisarm),
          simActive: this.sim.active,
          simEnabled: !!((_a = await this.getStateAsync("simulation.enabled")) == null ? void 0 : _a.val),
          texts: { mode: this.T.mode, phase: this.T.phase },
          log: this.log_.slice(0, 20)
        });
      case "getEnums": {
        const enums = await this.getForeignObjectsAsync("enum.functions.*", "enum");
        const list = Object.entries(enums).filter(([id]) => id.split(".").length === 3).map(([id, o]) => {
          var _a2;
          const n = (_a2 = o.common) == null ? void 0 : _a2.name;
          const name = typeof n === "object" ? n[this.sysLang] || n.en : n;
          return { value: id, label: `${name || id} (${id})` };
        });
        return reply([{ value: "", label: "\u2013" }, ...list]);
      }
      case "getMessengers": {
        const inst = await this.getObjectViewAsync("system", "instance", {
          startkey: "system.adapter.",
          endkey: "system.adapter.\u9999"
        });
        const list = inst.rows.filter(
          (r) => {
            var _a2, _b, _c;
            return !!((_c = (_b = (_a2 = r.value) == null ? void 0 : _a2.common) == null ? void 0 : _b.supportedMessages) == null ? void 0 : _c.notifications) || r.id.replace("system.adapter.", "").replace(/\.\d+$/, "") in SEND_FORMAT;
          }
        ).map((r) => r.id.replace("system.adapter.", "")).filter((id) => id !== this.namespace).map((id) => ({ value: id, label: id }));
        return reply(list);
      }
      case "test":
        this.notifyAll(this.T.test, true);
        return reply({ result: "ok" });
      default:
        return reply({ error: `unknown command ${obj.command}` });
    }
  }
  // ======================================================================
  // alarm events: notifications, actions, logbook
  // ======================================================================
  /**
   * Name of a mode in the system language
   *
   * @param m mode
   * @param T texts (system language by default)
   */
  modeName(m, T = this.T) {
    return T.mode[m || "off"] || String(m);
  }
  /**
   * " (by …)" for texts
   *
   * @param s source
   * @param T texts (system language by default)
   */
  src(s, T = this.T) {
    var _a;
    return T.via(s ? (_a = T.by[s]) != null ? _a : s : "");
  }
  /**
   * An event of the alarm: notifications, speech, actions, logbook
   *
   * @param e event
   * @param info details
   */
  async onAlarmEvent(e, info) {
    var _a;
    const c = this.config;
    const names = (info.sensors || []).map((s) => s.name).join(", ");
    const textIn = (T) => {
      var _a2, _b, _c;
      switch (e) {
        case "armedFull":
        case "armedPerimeter":
        case "armedNight":
          return T.armed(this.modeName(info.mode, T), this.src(info.source, T));
        case "arming":
          return T.arming(
            this.modeName(info.mode, T),
            info.mode === "full" ? num(c.exitDelayFull, 60) : num(c.exitDelayPerimeter, 0)
          );
        case "disarmed":
          return T.disarmed(this.src(info.source, T));
        case "armingFailed":
          return T.armingFailed(this.modeName(info.mode, T), names);
        case "openWarning":
          return T.openWarning(this.modeName(info.mode, T), names);
        case "entry":
          return T.entry(((_a2 = info.sensor) == null ? void 0 : _a2.name) || "", num(c.entryDelay, 30));
        case "alarm":
          return info.panic ? T.panic(((_b = info.sensor) == null ? void 0 : _b.name) || "") : T.alarm(((_c = info.sensor) == null ? void 0 : _c.name) || "");
        case "alarmEnd":
          return T.alarmEnd(this.src(info.source, T));
        case "wrongPin":
          return T.wrongPin(this.wrongPin);
        case "sabotage":
          return T.sabotage(names);
      }
      return "";
    };
    const text = textIn(this.T);
    let notify = false;
    let speech = false;
    switch (e) {
      case "armedFull":
      case "armedPerimeter":
      case "armedNight":
        notify = c.notifyArmed;
        break;
      case "arming":
        speech = c.speechArming;
        break;
      case "disarmed":
        notify = c.notifyDisarmed;
        break;
      case "armingFailed":
        notify = c.notifyArmingFailed;
        speech = c.speechArming;
        break;
      case "openWarning":
        notify = c.notifyOpenWarning;
        speech = c.speechArming;
        break;
      case "entry":
        notify = c.notifyEntry;
        speech = c.speechEntry;
        break;
      case "alarm":
        notify = c.notifyAlarm;
        speech = c.speechAlarm;
        await this.setStateAsync("status.lastTrigger", ((_a = info.sensor) == null ? void 0 : _a.name) || "", true);
        await this.setStateAsync("status.lastTriggerTime", Date.now(), true);
        this.startRepeat(text);
        if (c.notificationManager) {
          try {
            await this.registerNotification("home-guard", "alarm", text);
          } catch (err) {
            this.log.debug(`Notification manager: ${err.message}`);
          }
        }
        break;
      case "alarmEnd":
        notify = c.notifyAlarmEnd;
        this.stopRepeat();
        break;
      case "wrongPin":
        notify = c.notifyWrongPin;
        break;
      case "sabotage":
        notify = c.notifySabotage;
        break;
    }
    if (e === "disarmed") {
      this.stopRepeat();
    }
    this.addLog(e, text);
    this.log.info(textIn((0, import_texts.texts)("en")));
    if (notify) {
      this.notifyAll(text, false, e === "alarm" || e === "entry" || e === "sabotage");
    }
    if (speech && c.speechId) {
      await this.setForeignStateAsync(c.speechId, text.replace(/[^\p{L}\p{N}\s.,:–-]/gu, "").trim());
    }
    await this.runActions(e);
  }
  /**
   * Repeats the alarm message until it is acknowledged
   *
   * @param text message
   */
  startRepeat(text) {
    this.stopRepeat();
    const min = clamp(num(this.config.alarmRepeatMin, 0), 0, 120);
    if (min > 0 && this.config.notifyAlarm) {
      this.repeatTimer = this.setInterval(() => this.notifyAll(text, false, true), min * 6e4);
    }
  }
  /**
   * Stops repeating the alarm message
   */
  stopRepeat() {
    if (this.repeatTimer) {
      this.clearInterval(this.repeatTimer);
      this.repeatTimer = void 0;
    }
  }
  /**
   * sends a text to every configured messenger instance
   *
   * @param text message text
   * @param test true for the test message of the settings
   * @param alert true for alarms: severity "alert" for messengers that get the notification format
   */
  notifyAll(text, test = false, alert = false) {
    for (const row of this.config.notify || []) {
      if (!(row == null ? void 0 : row.instance) || row.enabled === false) {
        continue;
      }
      void this.notifyOne(row, text, alert);
    }
    if (test) {
      this.log.info("Test notification sent");
    }
  }
  /**
   * Sends a text to one messenger instance: known ones with "send", the others like the notification manager
   *
   * @param row row of the notification table
   * @param row.instance messenger instance
   * @param row.user optional user
   * @param row.chatId optional chat ID
   * @param text message
   * @param alert true for alarms (severity "alert")
   */
  async notifyOne(row, text, alert) {
    var _a, _b;
    const inst = row.instance;
    const format = SEND_FORMAT[inst.replace(/\.\d+$/, "")];
    try {
      if (format) {
        const payload = format(text);
        if (row.user) {
          payload.user = row.user;
        }
        if (row.chatId) {
          payload.chatId = row.chatId;
        }
        this.sendTo(inst, "send", payload);
        return;
      }
      const obj = await this.getForeignObjectAsync(`system.adapter.${inst}`);
      const supports = (_b = (_a = obj == null ? void 0 : obj.common) == null ? void 0 : _a.supportedMessages) == null ? void 0 : _b.notifications;
      if (!supports) {
        this.sendTo(inst, "send", { text, message: text, title: "Home Guard" });
        return;
      }
      const res = await this.sendToAsync(
        inst,
        "sendNotification",
        {
          host: `system.host.${this.host}`,
          scope: { name: "Home Guard", description: this.T.title },
          category: {
            name: alert ? this.T.alarmWord : this.T.title,
            description: "",
            severity: alert ? "alert" : "notify",
            instances: { [this.namespace]: { messages: [{ message: text, ts: Date.now() }] } }
          }
        },
        { timeout: 1e4 }
      );
      if (!res || res.sent !== true) {
        this.log.warn(`${inst} did not confirm the notification`);
      }
    } catch (err) {
      this.log.warn(`Notification to ${inst} failed: ${err.message}`);
    }
  }
  /**
   * Value from the settings: true, false, number or text
   *
   * @param v text
   */
  parseValue(v) {
    const s = String(v != null ? v : "").trim();
    if (s === "true") {
      return true;
    }
    if (s === "false") {
      return false;
    }
    if (s !== "" && !isNaN(Number(s))) {
      return Number(s);
    }
    return s;
  }
  /**
   * states written on an event (table "actions")
   *
   * @param e the event
   */
  async runActions(e) {
    for (const a of this.config.actions || []) {
      if (!(a == null ? void 0 : a.id) || a.enabled === false) {
        continue;
      }
      const match = a.event === e || a.event === "armed" && (e === "armedFull" || e === "armedPerimeter" || e === "armedNight");
      if (match) {
        await this.setForeignStateAsync(a.id, this.parseValue(a.value), false);
      }
    }
  }
  // ======================================================================
  // alarm outputs: lamps (on/blink) and sirens
  // ======================================================================
  /**
   * Lamps and sirens on (or blink) and off again
   *
   * @param on on or off
   */
  async setOutputs(on) {
    var _a, _b;
    const c = this.config;
    if (on === this.outputsOn) {
      return;
    }
    this.outputsOn = on;
    if (on) {
      for (const l of this.lampOuts) {
        l.prev = (_b = (_a = await this.getForeignStateAsync(l.id)) == null ? void 0 : _a.val) != null ? _b : l.off;
        await this.setForeignStateAsync(l.id, l.on, false);
      }
      if (c.lampMode === "blink" && this.lampOuts.length) {
        this.blinkOn = true;
        const ms = clamp(num(c.blinkSec, 1), 0.5, 10) * 1e3;
        this.blinkTimer = this.setInterval(() => {
          this.blinkOn = !this.blinkOn;
          for (const l of this.lampOuts) {
            void this.setForeignStateAsync(l.id, this.blinkOn ? l.on : l.off, false);
          }
        }, ms);
      }
      await this.sirens(true);
      return;
    }
    if (this.blinkTimer) {
      this.clearInterval(this.blinkTimer);
      this.blinkTimer = void 0;
    }
    await this.sirens(false);
    for (const l of this.lampOuts) {
      await this.setForeignStateAsync(l.id, c.lampsRestore !== false ? l.prev : l.on, false);
    }
  }
  /**
   * Sirens on or off
   *
   * @param on on or off
   */
  async sirens(on) {
    for (const s of this.config.sirens || []) {
      if ((s == null ? void 0 : s.id) && s.enabled !== false) {
        await this.setForeignStateAsync(
          s.id,
          this.parseValue((on ? s.valueOn : s.valueOff) || String(on)),
          false
        );
      }
    }
  }
  // ======================================================================
  // test alarm: the chosen parts for a short time, marked as a test, without a real alarm
  // ======================================================================
  /**
   * Starts a test alarm
   *
   * @param msg parts to test: notify, speech, lamps, sirens, actions (booleans) and duration (s)
   */
  async startTest(msg) {
    var _a, _b;
    const c = this.config;
    const T = this.T;
    const phase = this.alarm.status().phase;
    if (phase === "alarm" || phase === "entry" || this.outputsOn) {
      return { error: T.testBusy };
    }
    await this.endTest();
    const on = (k, d) => msg[k] === void 0 ? d : msg[k] === true || msg[k] === "true";
    const duration = Math.min(300, Math.max(5, num(msg.duration, 15)));
    const text = `${T.testPrefix}${T.alarm(T.testTrigger)}`;
    const done = [];
    const sirenCount = (c.sirens || []).filter((x) => (x == null ? void 0 : x.id) && x.enabled !== false).length;
    const actionCount = (c.actions || []).filter((a) => (a == null ? void 0 : a.id) && a.enabled !== false && a.event === "alarm").length;
    const anything = on("notify", true) && (c.notify || []).some((r) => (r == null ? void 0 : r.instance) && r.enabled !== false) || on("speech", true) && !!c.speechId || on("lamps", true) && this.lampOuts.length > 0 || on("sirens", false) && sirenCount > 0 || on("actions", false) && actionCount > 0;
    if (!anything) {
      return { result: T.testNothing };
    }
    this.addLog("test", text);
    this.log.info(`Test alarm for ${duration} s`);
    if (on("notify", true) && (c.notify || []).some((r) => (r == null ? void 0 : r.instance) && r.enabled !== false)) {
      this.notifyAll(text, false, true);
      done.push(T.testParts.notify);
    }
    if (on("speech", true) && c.speechId) {
      await this.setForeignStateAsync(c.speechId, text.replace(/[^\p{L}\p{N}\s.,:–-]/gu, "").trim());
      done.push(T.testParts.speech);
    }
    const test = { timer: void 0, lamps: [], sirens: false, actions: false };
    if (on("lamps", true) && this.lampOuts.length) {
      for (const l of this.lampOuts) {
        const prev = (_b = (_a = await this.getForeignStateAsync(l.id)) == null ? void 0 : _a.val) != null ? _b : l.off;
        test.lamps.push({ ...l, prev });
        await this.setForeignStateAsync(l.id, l.on, false);
      }
      if (c.lampMode === "blink") {
        let lit = true;
        test.blink = this.setInterval(
          () => {
            lit = !lit;
            for (const l of test.lamps) {
              void this.setForeignStateAsync(l.id, lit ? l.on : l.off, false);
            }
          },
          clamp(num(c.blinkSec, 1), 0.5, 10) * 1e3
        );
      }
      done.push(T.testParts.lamps(test.lamps.length));
    }
    if (on("sirens", false) && sirenCount) {
      await this.sirens(true);
      test.sirens = true;
      done.push(T.testParts.sirens(sirenCount));
    }
    if (on("actions", false) && actionCount) {
      await this.runActions("alarm");
      test.actions = true;
      done.push(T.testParts.actions(actionCount));
    }
    test.timer = this.setTimeout(() => void this.endTest(), duration * 1e3);
    this.test = test;
    return { result: done.length ? T.testRunning(duration, done.join(", ")) : T.testNothing };
  }
  /**
   * Ends a running test alarm: lamps as before, sirens off, actions of "alarm ended"
   */
  async endTest() {
    const test = this.test;
    if (!test) {
      return;
    }
    this.test = null;
    if (test.timer) {
      this.clearTimeout(test.timer);
    }
    if (test.blink) {
      this.clearInterval(test.blink);
    }
    for (const l of test.lamps) {
      await this.setForeignStateAsync(l.id, l.prev, false);
    }
    if (test.sirens) {
      await this.sirens(false);
    }
    if (test.actions) {
      await this.runActions("alarmEnd");
    }
    this.addLog("test", this.T.testEnd);
  }
  // ======================================================================
  // status states
  // ======================================================================
  /**
   * Writes the status states
   *
   * @param s status
   */
  async publishAlarm(s) {
    const json = JSON.stringify(s);
    const countdownOnly = this.lastStatusJson && json.replace(/"countdown":\d+/, "") === this.lastStatusJson.replace(/"countdown":\d+/, "");
    this.lastStatusJson = json;
    await this.setStateChangedAsync("status.countdown", s.countdown, true);
    if (countdownOnly) {
      return;
    }
    await this.setStateChangedAsync("status.mode", s.mode, true);
    await this.setStateChangedAsync("control.mode", s.mode, true);
    await this.setStateChangedAsync("status.phase", s.phase, true);
    await this.setStateChangedAsync(
      "status.armed",
      s.phase === "armed" || s.phase === "entry" || s.phase === "alarm",
      true
    );
    await this.setStateChangedAsync("status.alarm", s.alarm, true);
    await this.setStateChangedAsync("status.entry", s.entry, true);
    const text = s.phase === "disarmed" ? this.T.phase.disarmed : `${this.T.phase[s.phase]} \u2013 ${this.modeName(s.mode)}`;
    await this.setStateChangedAsync("status.text", text, true);
    await this.setStateChangedAsync("status.openContacts", JSON.stringify(s.openContacts.map((o) => o.name)), true);
    await this.setStateChangedAsync("status.openCount", s.openContacts.length, true);
    await this.setStateChangedAsync("status.readyFull", s.readyFull, true);
    await this.setStateChangedAsync("status.readyPerimeter", s.readyPerimeter, true);
    await this.updateSimulation();
  }
  /**
   * Writes the presence states
   */
  async publishPresence() {
    const persons = /* @__PURE__ */ new Map();
    for (const id of this.presenceIds) {
      const name = this.personOf.get(id) || id;
      persons.set(name, persons.get(name) || false || !!this.presenceVals.get(id));
    }
    const list = [...persons.entries()].map(([name, home2]) => ({ name, home: home2 })).sort((a, b) => a.name.localeCompare(b.name));
    const home = list.filter((p) => p.home).length;
    await this.setStateChangedAsync("status.presentCount", home, true);
    await this.setStateChangedAsync("status.present", JSON.stringify(list), true);
    await this.setStateChangedAsync("status.someoneHome", home > 0 || !this.presenceIds.length, true);
  }
  /**
   * Adds an entry to the logbook
   *
   * @param type event
   * @param text text
   */
  addLog(type, text) {
    this.log_.unshift({ ts: Date.now(), type, text });
    this.log_ = this.log_.slice(0, Math.max(10, num(this.config.logSize, 100)));
    void this.setStateAsync("status.log", JSON.stringify(this.log_), true);
  }
  // ======================================================================
  // presence simulation
  // ======================================================================
  /** should the simulation run now? */
  simWanted() {
    var _a;
    const c = this.config;
    if (!c.simEnabled || !this.simLamps.length) {
      return false;
    }
    const st = (_a = this.alarm) == null ? void 0 : _a.status();
    const armedFull = !!st && st.mode === "full" && st.phase !== "disarmed";
    const away = this.presenceIds.length > 0 && !this.someoneHome();
    switch (c.simCoupling) {
      case "alarm":
        return armedFull;
      case "away":
        return away;
      case "alarmOrAway":
        return armedFull || away;
      default:
        return false;
    }
  }
  /**
   * Starts or stops the simulation as wanted
   */
  async updateSimulation() {
    var _a;
    if (!this.sim || !this.started) {
      return;
    }
    const manual = !!((_a = await this.getStateAsync("simulation.enabled")) == null ? void 0 : _a.val);
    const want = !!this.config.simEnabled && this.simLamps.length > 0 && (manual || this.simWanted());
    const quiet = this.simRestoring;
    this.simRestoring = false;
    if (want === this.lastSimActive) {
      return;
    }
    this.lastSimActive = want;
    if (want) {
      this.learner.reset();
      this.sim.start();
      if (quiet) {
        return;
      }
      if (this.config.notifySim) {
        this.notifyAll(this.T.simStart);
      }
      this.addLog("simStart", this.T.simStart);
      await this.runActions("simStart");
    } else {
      this.sim.stop();
      if (this.config.notifySim) {
        this.notifyAll(this.T.simStop);
      }
      this.addLog("simStop", this.T.simStop);
      await this.runActions("simStop");
    }
  }
  /**
   * Plan of the current evening
   *
   * @param now current time
   */
  makePlan(now) {
    const lamps = this.eveningOn() ? this.simLamps.filter((l) => l.type !== "evening") : this.simLamps;
    const first = (0, import_simulation.eveningNoon)(now);
    return [...this.planOne(first, now, lamps), ...this.planOne(first + 24 * 36e5, now, lamps)].sort(
      (a, b) => a.at - b.at
    );
  }
  /**
   * Plan of the evening light: only the evening lamps, at dusk on and at "lights out" off
   *
   * @param now current time
   */
  makeEveningPlan(now) {
    const lamps = this.simLamps.filter((l) => l.type === "evening");
    const first = (0, import_simulation.eveningNoon)(now);
    return [...this.planOne(first, now, lamps, true), ...this.planOne(first + 24 * 36e5, now, lamps, true)].sort(
      (a, b) => a.at - b.at
    );
  }
  /** @returns the evening light is switched on and has lamps */
  eveningOn() {
    return !!this.config.simEnabled && !!this.config.eveningLight && this.simLamps.some((l) => l.type === "evening");
  }
  /** Starts, re-plans or stops the evening light after the settings or the lamps changed */
  updateEvening() {
    if (this.eveningOn()) {
      const lamps = this.simLamps.filter((l) => l.type === "evening").length;
      this.log.info(`Evening light active for ${lamps} lamps`);
      if (this.evening.active) {
        this.evening.replan();
      } else {
        this.evening.start();
      }
    } else {
      this.evening.stop();
    }
  }
  /**
   * Is a time inside the learning window (always, only when dark, or between two times)?
   *
   * @param ts time in ms
   */
  inLearnWindow(ts) {
    const c = this.config;
    const d = new Date(ts);
    if (c.simLearnWindow === "times") {
      const m = d.getHours() * 60 + d.getMinutes();
      const hm = (v, f) => {
        const x = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
        return x ? Number(x[1]) * 60 + Number(x[2]) : f;
      };
      const from = hm(c.simLearnFrom, 15 * 60);
      const to = hm(c.simLearnTo, 2 * 60);
      return from <= to ? m >= from && m < to : m >= from || m < to;
    }
    if (c.simLearnWindow === "dark") {
      const sun = (0, import_sun.sunTimes)(d, this.lat, this.lon);
      if (!sun) {
        return true;
      }
      return ts >= sun.sunset - num(c.simLearnDarkOffset, 30) * 6e4 || ts < sun.sunrise;
    }
    return true;
  }
  /**
   * Plan of one evening
   *
   * @param noon 12:00 of the evening day
   * @param now current time
   * @param lamps lamps of this plan
   * @param eveningLight true: plan of the evening light (dusk only, no visits)
   */
  planOne(noon, now, lamps, eveningLight = false) {
    const c = this.config;
    const sun = (0, import_sun.sunTimes)(new Date(noon), this.lat, this.lon);
    let sunset = sun ? sun.sunset : noon + 6 * 36e5;
    if (this.luxDuskTs && (0, import_simulation.eveningKey)(this.luxDuskTs) === (0, import_simulation.eveningKey)(noon) && (0, import_simulation.eveningKey)(noon) === (0, import_simulation.eveningKey)(now)) {
      sunset = Math.min(sunset, this.luxDuskTs - num(c.simStartOffset, -30) * 6e4);
    }
    return (0, import_simulation.planEvening)(
      noon,
      sunset,
      lamps,
      {
        mode: eveningLight ? "dusk" : c.simMode || "dusk",
        startOffset: num(c.simStartOffset, -30),
        startRandom: num(c.simStartRandom, 20),
        end: c.simEnd || "22:30",
        endRandom: num(c.simEndRandom, 60),
        weekendLater: num(c.simWeekendLater, 45),
        visits: eveningLight ? 0 : num(c.simVisits, 4),
        visitMin: num(c.simVisitMin, 2),
        visitMax: num(c.simVisitMax, 15),
        learnDays: num(c.simLearnDays, 28),
        jitter: num(c.simJitter, 15),
        learnFilter: (ts) => this.inLearnWindow(ts)
      },
      this.learner
    );
  }
  /**
   * Brightness changed: the evening may start earlier
   *
   * @param lux brightness
   */
  onLux(lux) {
    const c = this.config;
    if (isNaN(lux) || !c.simLuxBelow) {
      return;
    }
    const now = Date.now();
    const hour = new Date(now).getHours();
    if (lux < c.simLuxBelow && hour >= 14 && (!this.luxDuskTs || (0, import_simulation.eveningKey)(this.luxDuskTs) !== (0, import_simulation.eveningKey)(now))) {
      this.luxDuskTs = now;
      this.sim.replan();
      this.evening.replan();
    }
  }
  /**
   * Switches a simulation lamp
   *
   * @param id state ID
   * @param on on or off
   */
  async switchLamp(id, on) {
    const { on: vOn, off } = await this.onOffValues(id);
    await this.setForeignStateAsync(id, on ? vOn : off, false);
  }
  /**
   * Writes the simulation states
   *
   * @param active running
   * @param plan remaining steps
   * @param next next step
   */
  async publishSim(active, plan, next) {
    const name = (id) => {
      var _a;
      return ((_a = this.simLamps.find((l) => l.id === id)) == null ? void 0 : _a.name) || id;
    };
    const fmt = (ts) => new Date(ts).toLocaleTimeString(this.T === (0, import_texts.texts)("de") ? "de-DE" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit"
    });
    await this.setStateChangedAsync("simulation.active", active, true);
    await this.setStateChangedAsync(
      "simulation.next",
      next ? `${fmt(next.at)} ${name(next.id)} ${this.T.onOff[next.on ? 1 : 0]}` : "",
      true
    );
    await this.setStateChangedAsync(
      "simulation.plan",
      JSON.stringify(plan.map((s) => ({ at: s.at, time: fmt(s.at), lamp: name(s.id), on: s.on, why: s.why }))),
      true
    );
  }
  /**
   * Saves the learned days a few seconds later
   */
  saveLearnedSoon() {
    if (this.learnSaveTimer) {
      this.clearTimeout(this.learnSaveTimer);
    }
    this.learnSaveTimer = this.setTimeout(() => {
      this.learnSaveTimer = void 0;
      this.learner.prune(Date.now(), num(this.config.simLearnDays, 28));
      void this.setStateAsync("simulation.learned", JSON.stringify(this.learner.data), true);
      void this.setStateAsync("simulation.learnedDays", Object.keys(this.learner.data.days).length, true);
    }, 5e3);
  }
  // ======================================================================
  // every minute: night mode, sabotage, daily simulation plan
  // ======================================================================
  /**
   * Every minute: night mode, sabotage, new plan at noon
   */
  async everyMinute() {
    const c = this.config;
    const now = /* @__PURE__ */ new Date();
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (hm === this.lastMinute) {
      return;
    }
    this.lastMinute = hm;
    if (c.alarmEnabled && c.nightEnabled) {
      if (hm === c.nightStart && this.alarm.mode === "off") {
        this.alarm.arm("night", "night");
      }
      if (hm === c.nightEnd && this.alarm.mode === "night") {
        this.alarm.disarm("night");
      }
    }
    if (hm === "12:05") {
      this.learner.prune(Date.now(), num(c.simLearnDays, 28));
      this.sim.replan();
      this.evening.replan();
    }
    if (now.getMinutes() === 7 || this.sabotageKnown.size === 0) {
      await this.checkSabotage();
    }
    await this.updateSimulation();
  }
  /**
   * Reports sensors that did not report for too long
   */
  async checkSabotage() {
    const hours = clamp(num(this.config.sabotageHours, 0), 0, 720);
    if (hours <= 0) {
      return;
    }
    const limit = Date.now() - hours * 36e5;
    const stale = [];
    for (const s of this.alarm.getSensors()) {
      const st = await this.getForeignStateAsync(s.id);
      if (!st || st.ts < limit) {
        stale.push(s);
      }
    }
    await this.setStateChangedAsync("status.sabotage", JSON.stringify(stale.map((s) => s.name)), true);
    const fresh = stale.filter((s) => !this.sabotageKnown.has(s.id));
    this.sabotageKnown = new Set(stale.map((s) => s.id));
    this.sabotageKnown.add("#checked");
    if (fresh.length) {
      await this.onAlarmEvent("sabotage", { sensors: fresh });
    }
  }
  /**
   * JSON of a state or the fallback
   *
   * @param v state value
   * @param fallback used on errors
   */
  parseJson(v, fallback) {
    try {
      return typeof v === "string" && v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function num(v, fallback) {
  const n = Number(v);
  return v === "" || v === null || v === void 0 || isNaN(n) ? fallback : n;
}
if (require.main !== module) {
  module.exports = (options) => new HomeGuard(options);
} else {
  (() => new HomeGuard())();
}
//# sourceMappingURL=main.js.map
