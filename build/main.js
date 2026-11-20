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
var import_wizard = require("./lib/wizard");
var import_finder = require("./lib/finder");
var import_sun = require("./lib/sun");
var import_texts = require("./lib/texts");
var import_i18n = require("./lib/i18n");
var import_node_path = require("node:path");
var import_messengers = require("./lib/messengers");
const NM_MISSING = 'The "notification-manager" adapter is not installed. Without it alarms only appear in the bell of the admin and go to no messenger. Install it under "Adapters" and set up the messengers there.';
const NM_STOPPED = 'The "notification-manager" adapter is installed but not running. Start the instance so that alarms are forwarded.';
const NM_OK = 'The "notification-manager" adapter is installed and running. Which messengers get the alarms is set in its settings.';
const MODES = ["off", "full", "perimeter", "night"];
const LIGHT_SWITCHES = ["eveningOn", "eveningOff", "morningOn", "morningOff"];
const LIGHT_CONFIG = {
  eveningOn: "eveningLightOn",
  eveningOff: "eveningLightOff",
  morningOn: "morningLightOn",
  morningOff: "morningLightOff"
};
function rowRoles(row) {
  if (row.type === "device") {
    return /* @__PURE__ */ new Set(["device"]);
  }
  if (row.type && row.type !== "lamp") {
    return /* @__PURE__ */ new Set([row.type]);
  }
  const roles = /* @__PURE__ */ new Set();
  for (const r of ["evening", "morning", "visit", "bedtime"]) {
    if (row[r]) {
      roles.add(r);
    }
  }
  return roles;
}
const ECHO_SOUNDS = {
  bell: "soundbank://soundlibrary/alarms/beeps_and_bloops/bell_02",
  siren: "soundbank://soundlibrary/scifi/amzn_sfx_scifi_alarm_04",
  horn: "soundbank://soundlibrary/alarms/air_horns/air_horn_01"
};
function deviceWindow(row) {
  var _a, _b;
  const out = {};
  if (row.window === "day" || row.window === "custom") {
    out.window = row.window;
  }
  const t = /^\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*$/.exec(String(row.times || ""));
  if (out.window === "custom" && t) {
    out.from = t[1];
    out.to = t[2];
  }
  const c = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(String((_a = row.count) != null ? _a : ""));
  if (c && Number(c[1]) >= 1) {
    out.count = Math.min(5, Number(c[1]));
    if (c[2]) {
      out.countMax = Math.min(5, Math.max(out.count, Number(c[2])));
    }
  }
  const d = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(String(row.dur || ""));
  if (d) {
    out.durMin = Math.max(5, Number(d[1]));
    out.durMax = Math.max(out.durMin, Number((_b = d[2]) != null ? _b : d[1]));
  }
  return out;
}
function hmMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}
const LEARN_IGNORE = /^system\.adapter\.(javascript|scenes|node-red|home-guard)\./;
class HomeGuard extends utils.Adapter {
  T = (0, import_texts.texts)("en");
  sysLang = "en";
  /** texts shown in the admin, in the system language */
  tr = import_i18n.trEn;
  lat = 51;
  lon = 10;
  alarm;
  sim;
  evening;
  eveningLogged = "";
  learner = new import_simulation.Learner();
  sensorIds = /* @__PURE__ */ new Set();
  /** outer-skin sensors ignored at home (perimeter/night): name, inverted, last open state - for the info log */
  homeIgnored = /* @__PURE__ */ new Map();
  presenceIds = [];
  presenceVals = /* @__PURE__ */ new Map();
  personOf = /* @__PURE__ */ new Map();
  autoArm = true;
  simLamps = [];
  simLampVals = /* @__PURE__ */ new Map();
  learnFrom = /* @__PURE__ */ new Map();
  // learn source state -> simulation lamp
  learnFromVals = /* @__PURE__ */ new Map();
  /** Echos of the simulation: lamp ID (Player.currentState) -> row */
  echoSim = /* @__PURE__ */ new Map();
  /** alarm on the Echos: repeat timer, end time, text of the alarm */
  echoAlarmTimer;
  echoAlarmUntil = 0;
  echoAlarmText = "";
  /** switches of the evening and morning light (control.eveningOn …), all on for a new instance */
  lightSw = {
    eveningOn: true,
    eveningOff: true,
    morningOn: true,
    morningOff: true
  };
  stopOff = /* @__PURE__ */ new Map();
  // simulation lamp -> switch off when the simulation ends
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
  sirenTimers = [];
  log_ = [];
  luxDuskTs = 0;
  luxBrightTs = 0;
  // it became bright this morning (lux sensor): morning lamps off
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
    this.on("stateChange", (id, state) => this.bg(this.onStateChange(id, state), "stateChange"));
    this.on("message", (obj) => this.bg(this.onMessage(obj), "message"));
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
    this.tr = (0, import_i18n.loadTr)(lang, (0, import_node_path.join)(__dirname, "..", "admin", "i18n"));
    if (await this.migrateSimLamps()) {
      return;
    }
    if (!c.wizDone && !(Number(c.wizStep) > 0) && this.looksConfigured()) {
      await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, { native: { wizDone: true } });
      return;
    }
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
        publish: (s) => this.bg(this.publishAlarm(s), "publishAlarm"),
        event: (e, info) => this.bg(this.onAlarmEvent(e, info), "onAlarmEvent"),
        outputs: (on) => this.bg(this.setOutputs(on), "setOutputs")
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
        motionWindowSec: clamp(num(c.motionWindowSec, 120), 10, 1800),
        reportWhen: c.reportWhen === "always" ? "always" : "armed"
      }
    );
    this.sim = new import_simulation.SimRunner(
      {
        now: () => Date.now(),
        setTimer: (fn, ms) => this.setTimeout(fn, ms),
        clearTimer: (h) => this.clearTimeout(h),
        isOn: (id) => this.simLampVals.get(id) || false,
        switchLamp: (id, on) => this.bg(this.switchLamp(id, on), "switchLamp"),
        publish: (active, plan, next) => this.bg(this.publishSim(active, plan, next), "publishSim"),
        // end of the simulation (e.g. coming home): devices like the TV off, lamps stay on - or as set per row
        offOnStop: (id) => {
          var _a2, _b2;
          return (_b2 = this.stopOff.get(id)) != null ? _b2 : ((_a2 = this.simLamps.find((l) => l.id === id)) == null ? void 0 : _a2.type) === "device";
        }
      },
      (now) => this.makePlan(now)
    );
    this.evening = new import_simulation.SimRunner(
      {
        now: () => Date.now(),
        setTimer: (fn, ms) => this.setTimeout(fn, ms),
        clearTimer: (h) => this.clearTimeout(h),
        isOn: (id) => this.simLampVals.get(id) || false,
        switchLamp: (id, on) => this.bg(this.switchLamp(id, on), "switchLamp"),
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
    for (const k of LIGHT_SWITCHES) {
      const st = await this.getStateAsync(`control.${k}`);
      if ((st == null ? void 0 : st.val) == null) {
        const old = c[LIGHT_CONFIG[k]];
        this.lightSw[k] = old !== false;
        await this.setStateAsync(`control.${k}`, this.lightSw[k], true);
      } else {
        this.lightSw[k] = st.val !== false;
      }
    }
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
    if (this.watchedEnums().length) {
      await this.subscribeForeignObjectsAsync("enum.functions.*");
    }
    const rep = await this.getStateAsync("control.report");
    this.alarm.reportOn = (rep == null ? void 0 : rep.val) !== false;
    if ((rep == null ? void 0 : rep.val) == null) {
      await this.setStateAsync("control.report", true, true);
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
    this.minuteTimer = this.setInterval(() => this.bg(this.everyMinute(), "everyMinute"), 6e4);
    this.started = true;
    await this.everyMinute();
    await this.updateSimulation();
    this.log.info(
      `Home Guard ready: ${this.sensorIds.size} sensors, ${this.presenceIds.length} presence states, ${this.simLamps.length} simulation lamps, ${this.lampOuts.length} alarm lamps`
    );
  }
  /**
   * Runs a promise in the background and logs a failure instead of leaving it unhandled
   *
   * @param p the promise
   * @param what name for the log line
   */
  bg(p, what) {
    p.catch((e) => this.log.warn(`${what}: ${e instanceof Error ? e.message : String(e)}`));
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
      c.autoReport && c.enumReport,
      c.presenceEnabled && c.presenceAuto && c.enumPresence,
      c.simAuto && c.enumSimLamps,
      c.simAuto && c.enumMorningLamps,
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
      this.bg(this.rescan(id), "rescan");
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
        ...this.learnFrom.keys(),
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
      const hazard = circuit === "24h" ? c.hazardDefault || "speech" : void 0;
      found.set(id, { id, name: await this.nameOf(id), circuit, delayed: false, invert: false, motion, hazard });
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
    if (c.autoReport) {
      for (const id of await this.enumStates(c.enumReport)) {
        if (!found.has(id)) {
          await add(id, "report");
        }
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
        motion: !!row.motion,
        hazard: (row.circuit || "perimeter") === "24h" ? row.hazard || c.hazardDefault || "speech" : void 0
      });
    }
    const homeIgnore = new Set(
      (c.sensors || []).filter((r) => (r == null ? void 0 : r.id) && r.enabled !== false && r.homeIgnore).map((r) => r.id)
    );
    const ignored = /* @__PURE__ */ new Set();
    for (const s of found.values()) {
      if (s.circuit === "perimeter" && homeIgnore.has(s.id)) {
        s.circuit = "interior";
        ignored.add(s.id);
      }
    }
    const list = [...found.values()];
    const values = {};
    for (const s of list) {
      values[s.id] = (_a = await this.getForeignStateAsync(s.id)) == null ? void 0 : _a.val;
      await this.subscribeForeignStatesAsync(s.id);
    }
    this.sensorIds = new Set(list.map((s) => s.id));
    this.homeIgnored = new Map(
      list.filter((s) => ignored.has(s.id)).map((s) => [s.id, { name: s.name, invert: s.invert, open: (0, import_alarm.isOpenValue)(values[s.id], s.invert) }])
    );
    this.alarm.setSensors(list, values);
    await this.setStateAsync(
      "status.sensors",
      JSON.stringify(
        list.map((s) => ({
          id: s.id,
          name: s.name,
          circuit: ignored.has(s.id) ? "perimeter" : s.circuit,
          home: ignored.has(s.id) ? false : void 0,
          delayed: s.delayed,
          motion: s.motion
        }))
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
    if (!c.presenceEnabled) {
      this.presenceIds = [];
      await this.publishPresence();
      return;
    }
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
  /** @returns the instance has settings of its own (set up before the assistant existed) */
  looksConfigured() {
    const c = this.config;
    return (c.sensors || []).length > 0 || (c.simLamps || []).length > 0 || (c.notify || []).length > 0 || !!(c.enumFull || c.enumPerimeter || c.enumFire || c.enumSimLamps || c.enumPresence || c.lockId);
  }
  /**
   * Older versions had one type per lamp row; now a lamp has roles (evening, morning, visit, bedtime)
   *
   * @returns true when the configuration was changed (the instance restarts)
   */
  async migrateSimLamps() {
    const rows = this.config.simLamps || [];
    if (!rows.some((r) => r && r.type && r.type !== "lamp" && r.type !== "device")) {
      return false;
    }
    const simLamps = rows.map((r) => {
      if (!r || !r.type || r.type === "lamp" || r.type === "device") {
        return r;
      }
      const role = r.type;
      return {
        ...r,
        type: "lamp",
        evening: role === "evening",
        morning: role === "morning",
        visit: role === "visit",
        bedtime: role === "bedtime"
      };
    });
    this.log.info("Simulation lamps: the type of each row became roles (evening, morning, visits, bedtime)");
    await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, { native: { simLamps } });
    return true;
  }
  /**
   * Collects the lamps of the presence simulation
   */
  async setupSimLamps() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const c = this.config;
    const lamps = /* @__PURE__ */ new Map();
    this.learnFrom.clear();
    this.learnFromVals.clear();
    this.stopOff.clear();
    if (c.simAuto) {
      for (const [enumId, role] of [
        [c.enumSimLamps, "evening"],
        [c.enumMorningLamps, "morning"]
      ]) {
        for (const id of await this.enumStates(enumId)) {
          const l = (_a = lamps.get(id)) != null ? _a : { name: await this.nameOf(id), roles: /* @__PURE__ */ new Set() };
          l.roles.add(role);
          lamps.set(id, l);
        }
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
      lamps.set(row.id, { name: await this.nameOf(row.id, row.name), roles: rowRoles(row), row });
      if (row.learnFrom) {
        this.learnFrom.set(String(row.learnFrom), row.id);
      }
      if (row.stopOff === "off" || row.stopOff === "keep") {
        this.stopOff.set(row.id, row.stopOff === "off");
      }
    }
    this.echoSim.clear();
    const echoWindows = /* @__PURE__ */ new Map();
    for (const row of c.echos || []) {
      if (!(row == null ? void 0 : row.device) || row.enabled === false || !row.sim) {
        continue;
      }
      const id = `${row.device}.Player.currentState`;
      if (!await this.getForeignObjectAsync(id)) {
        this.log.warn(`Echo ${row.device}: no player (only speech) - not used for the simulation`);
        continue;
      }
      this.echoSim.set(id, row);
      lamps.set(id, {
        name: row.name || await this.nameOf(row.device),
        roles: /* @__PURE__ */ new Set(["device"])
      });
      echoWindows.set(id, deviceWindow(row));
      if (row.learn) {
        this.learnFrom.set(id, id);
      }
    }
    this.simLamps = [];
    for (const [id, l] of lamps) {
      for (const type of l.roles) {
        this.simLamps.push({
          id,
          name: l.name,
          type,
          valueOn: ((_b = l.row) == null ? void 0 : _b.valueOn) ? String(l.row.valueOn) : void 0,
          valueOff: ((_c = l.row) == null ? void 0 : _c.valueOff) ? String(l.row.valueOff) : void 0,
          learn: !!((_d = l.row) == null ? void 0 : _d.learnFrom) || this.echoSim.has(id) && !!((_e = this.echoSim.get(id)) == null ? void 0 : _e.learn),
          ...type === "device" ? (_f = echoWindows.get(id)) != null ? _f : l.row ? deviceWindow(l.row) : {} : {}
        });
      }
    }
    for (const id of lamps.keys()) {
      this.simLampVals.set(id, (0, import_alarm.isOpenValue)((_g = await this.getForeignStateAsync(id)) == null ? void 0 : _g.val));
      await this.subscribeForeignStatesAsync(id);
    }
    for (const src of this.learnFrom.keys()) {
      this.learnFromVals.set(src, (0, import_alarm.isOpenValue)((_h = await this.getForeignStateAsync(src)) == null ? void 0 : _h.val));
      await this.subscribeForeignStatesAsync(src);
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
      const ign = this.homeIgnored.get(id);
      if (ign) {
        const open = (0, import_alarm.isOpenValue)(state.val, ign.invert);
        if (open && !ign.open && c.alarmEnabled && (this.alarm.mode === "perimeter" || this.alarm.mode === "night")) {
          const mode = this.alarm.mode === "night" ? "night protection" : "perimeter protection";
          this.log.info(`${ign.name} opened \u2013 ignored in ${mode} (allowed at home)`);
        }
        ign.open = open;
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
      const hasSource = [...this.learnFrom.values()].includes(id) || this.echoSim.has(id);
      if (before !== on && !hasSource && !this.sim.active && !ignored && confirmed && (!on || this.inLearnWindowFor(id, ts))) {
        if (this.learner.record(id, on, ts)) {
          this.saveLearnedSoon();
        }
      }
    }
    const target = this.learnFrom.get(id);
    if (target && confirmed) {
      const on = (0, import_alarm.isOpenValue)(state.val);
      const before = this.learnFromVals.get(id);
      this.learnFromVals.set(id, on);
      const ts = state.ts || Date.now();
      if (before !== on && !this.sim.active && (!on || this.inLearnWindowFor(target, ts))) {
        if (this.learner.record(target, on, ts, this.echoSim.has(target) ? 5 : 1)) {
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
      case "control.report":
        this.alarm.reportOn = !!val;
        await this.setStateAsync("control.report", this.alarm.reportOn, true);
        return;
      case "control.eveningOn":
      case "control.eveningOff":
      case "control.morningOn":
      case "control.morningOff": {
        const k = rel.slice("control.".length);
        const was = this.lightSw[k];
        this.lightSw[k] = !!val;
        await this.setStateAsync(rel, this.lightSw[k], true);
        if (was !== this.lightSw[k]) {
          this.addLog(
            "light",
            `\u{1F4A1} ${this.T.lightSwitch[k]}: ${this.lightSw[k] ? this.T.switchedOn : this.T.switchedOff}`
          );
          this.updateEvening(this.lightSw[k] && k.endsWith("On"));
          if (this.sim.active) {
            this.sim.replan();
          }
        }
        return;
      }
      case "control.autoArm":
        this.autoArm = !!val;
        await this.setStateAsync("control.autoArm", this.autoArm, true);
        this.addLog("autoArm", this.autoArm ? this.T.autoOn : this.T.autoOff);
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
      this.bg(this.setStateAsync("status.wrongPin", 0, true), "setStateAsync");
      if (mode === "off") {
        this.alarm.disarm(source);
      } else {
        this.alarm.arm(mode, source);
      }
      this.bg(this.updateSimulation(), "updateSimulation");
      return true;
    }
    this.wrongPin++;
    this.bg(this.setStateAsync("status.wrongPin", this.wrongPin, true), "setStateAsync");
    if (this.wrongPin >= Math.max(1, num(c.maxWrongPin, 3))) {
      const lockMin = clamp(num(c.pinLockMin, 5), 0, 120);
      if (lockMin > 0) {
        this.pinLockedUntil = Date.now() + lockMin * 6e4;
      }
      this.bg(this.onAlarmEvent("wrongPin", {}), "onAlarmEvent");
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
      case "status":
        return reply({
          ...this.alarm.status(),
          pinRequired: !!c.pin,
          pinForArm: !!(c.pin && c.pinForArm),
          // only the length, so the panel can accept a complete PIN without OK - never the PIN itself
          pinLength: c.pin ? String(c.pin).length : 0,
          autoArmAvailable: !!c.alarmEnabled && this.presenceIds.length > 0 && (!!c.presenceArm && c.presenceArm !== "off" || !!c.presenceDisarm),
          simActive: this.sim.active,
          // which light switches the panel shows: only for an evening/morning light that is set up
          eveningAvailable: !!c.eveningLight && this.simLamps.some((l) => l.type === "evening"),
          morningAvailable: !!c.morningLight && this.simLamps.some((l) => l.type === "morning"),
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
      case "nmStatus": {
        const nm = await this.getObjectViewAsync("system", "instance", {
          startkey: "system.adapter.notification-manager.",
          endkey: "system.adapter.notification-manager.\u9999"
        });
        let alive = false;
        for (const r of nm.rows) {
          if ((_a = await this.getForeignStateAsync(`${r.id}.alive`)) == null ? void 0 : _a.val) {
            alive = true;
          }
        }
        const box = (text, color, bg) => ({
          text,
          style: { color, background: bg, padding: "8px 12px", borderRadius: 4 }
        });
        if (!nm.rows.length) {
          return reply(box(this.tr(NM_MISSING), "#663c00", "#fff4e5"));
        }
        if (!alive) {
          return reply(box(this.tr(NM_STOPPED), "#663c00", "#fff4e5"));
        }
        return reply(box(this.tr(NM_OK), "#014361", "#e5f6fd"));
      }
      case "getMessengers": {
        const inst = await this.getObjectViewAsync("system", "instance", {
          startkey: "system.adapter.",
          endkey: "system.adapter.\u9999"
        });
        const list = (0, import_messengers.listMessengers)(inst.rows.map((r) => r.id));
        return reply(list);
      }
      case "test": {
        const errors = [];
        for (const row of this.config.notify || []) {
          if ((row == null ? void 0 : row.instance) && row.enabled !== false) {
            await (0, import_messengers.sendToMessenger)(this, row, { title: "Home Guard", text: this.T.test, alert: true }).catch(
              (e) => errors.push(e.message)
            );
          }
        }
        this.log.info("Test notification sent");
        return reply(errors.length ? { error: errors.join("; ") } : { result: "ok" });
      }
      // setup assistant: values of the form come as strings ("true", "undefined", …)
      case "wizardNav":
        return reply({
          native: { wizStep: (0, import_wizard.nextStep)(Number(msg.step) || 0, Number(msg.dir) || 1, str(msg.need)) }
        });
      case "wizardDefaults":
        return reply({ native: import_wizard.WIZARD_DEFAULTS[str(msg.step)] || {} });
      case "wizardScan":
        return reply({ native: await this.wizardScan(msg) });
      case "echoList":
        return reply(
          (await this.echoList()).filter((e) => !msg.player || e.player).map((e) => ({ value: e.value, label: e.label }))
        );
      case "wizardAlexa":
        return reply({ native: await this.wizardAlexa(msg) });
      default:
        return reply({ error: `unknown command ${obj.command}` });
    }
  }
  /**
   * Setup assistant: looks through the functions (and states) and suggests what fits - only for empty fields
   *
   * @param form current values of the form (strings; "undefined" when empty)
   * @returns the settings to fill in, and a text with the result
   */
  async wizardScan(form) {
    var _a, _b, _c, _d, _e, _f, _g;
    const tr = this.tr;
    const empty = (k) => {
      var _a2;
      const v = (_a2 = form[k]) != null ? _a2 : this.config[k];
      return v === void 0 || v === null || v === "" || v === "undefined" || v === "null";
    };
    const out = {};
    const lines = [];
    const enums = await this.getForeignObjectsAsync("enum.functions.*", "enum");
    const infos = [];
    for (const [id, o] of Object.entries(enums)) {
      if (id.split(".").length !== 3) {
        continue;
      }
      const n = (_a = o.common) == null ? void 0 : _a.name;
      const name = typeof n === "object" ? n[this.sysLang] || n.en : n;
      const roles = [];
      for (const sid of await this.enumStates(id)) {
        const so = await this.getForeignObjectAsync(sid);
        roles.push(String(((_b = so == null ? void 0 : so.common) == null ? void 0 : _b.role) || ""));
      }
      infos.push({ id, name: String(name || id.split(".").pop()), roles });
    }
    const kinds = [
      ["perimeter", "autoPerimeter", "enumPerimeter", "Doors and windows"],
      ["full", "autoFull", "enumFull", "Motion detectors"],
      ["fire", "autoFire", "enumFire", "Danger detectors"],
      ["report", "autoReport", "enumReport", "Report-only sensors"],
      ["lamps", "lampsAuto", "enumLamps", "Lamps on alarm"],
      ["evening", "simAuto", "enumSimLamps", "Evening light"],
      ["morning", "simAuto", "enumMorningLamps", "Morning light"],
      ["presence", "presenceAuto", "enumPresence", "Presence"]
    ];
    for (const [kind, autoKey, enumKey, labelEn] of kinds) {
      const label = tr(labelEn);
      if (!empty(enumKey)) {
        lines.push(tr("%s: already chosen", label));
        continue;
      }
      const best = (0, import_wizard.bestEnum)(kind, infos);
      if (!best) {
        lines.push(tr("%s: nothing suitable found", label));
        continue;
      }
      out[autoKey] = true;
      out[enumKey] = best.id;
      if (kind === "presence") {
        out.presenceEnabled = true;
      }
      lines.push(
        best.count === 1 ? tr('%s: "%s" (1 state)', label, best.name) : tr('%s: "%s" (%s states)', label, best.name, best.count)
      );
    }
    const view = await this.getObjectViewAsync("system", "state", { startkey: "", endkey: "\u9999" });
    const objects = {};
    for (const r of view.rows) {
      objects[r.id] = r.value;
    }
    for (const type of ["channel", "device"]) {
      for (const r of (await this.getObjectViewAsync("system", type, { startkey: "", endkey: "\u9999" })).rows) {
        objects[r.id] = r.value;
      }
    }
    for (const [id, o] of Object.entries(await this.getForeignObjectsAsync("enum.rooms.*", "enum"))) {
      objects[id] = o;
    }
    const instances = {};
    for (const r of (await this.getObjectViewAsync("system", "instance", {
      startkey: "system.adapter.",
      endkey: "system.adapter.\u9999"
    })).rows) {
      instances[r.id.replace("system.adapter.", "")] = !!((_d = (_c = r.value) == null ? void 0 : _c.common) == null ? void 0 : _d.enabled);
    }
    const found = (0, import_finder.findSensors)({ objects, instances, ownAdapter: this.name, lang: this.sysLang });
    const rows = [...this.config.sensors || []].filter((r) => r && r.id);
    const inTable = (0, import_finder.sameDevices)(
      rows.map((r) => r.id),
      objects
    );
    const areas = [
      ["perimeter", "enumPerimeter", "autoPerimeter", "Doors and windows"],
      ["interior", "enumFull", "autoFull", "Motion detectors"],
      ["24h", "enumFire", "autoFire", "Danger detectors"]
    ];
    const inEnums = /* @__PURE__ */ new Set();
    for (const [, enumKey, autoKey] of areas) {
      const v = (_f = (_e = out[enumKey]) != null ? _e : form[enumKey]) != null ? _f : this.config[enumKey];
      const enumId = typeof v === "string" && v !== "undefined" && v !== "null" ? v : "";
      const useEnum = (_g = out[autoKey]) != null ? _g : this.config[autoKey];
      if (enumId && useEnum !== false) {
        (await this.enumStates(enumId)).forEach((id) => inEnums.add(id));
      }
    }
    const known = /* @__PURE__ */ new Set([...inTable, ...(0, import_finder.sameDevices)(inEnums, objects)]);
    const now = Date.now();
    let added = 0;
    for (const [circuit, enumKey, , labelEn] of areas) {
      const extra = found.filter((s) => s.circuit === circuit && !known.has(s.id));
      if (!extra.length) {
        continue;
      }
      const states = await this.getForeignStatesAsync(extra.map((s) => s.id));
      const noted = extra.map((s) => ({ s, ...(0, import_finder.sensorNote)(s, states[s.id], now, tr) }));
      noted.sort((a, b) => Number(a.stale) - Number(b.stale));
      for (const { s, note } of noted) {
        rows.push({
          enabled: false,
          id: s.id,
          name: s.name,
          circuit,
          delayed: false,
          invert: s.invert,
          motion: s.motion,
          info: note,
          ...circuit === "24h" ? { hazard: this.config.hazardDefault || "speech" } : {}
        });
        known.add(s.id);
      }
      added += extra.length;
      const flag = {
        perimeter: "wizHasDoors",
        interior: "wizHasMotion",
        "24h": "wizHasFire",
        report: "wizHasReport"
      }[circuit];
      if (flag && extra.length) {
        out[flag] = true;
      }
      const hasEnum = !empty(enumKey) || !!out[enumKey];
      lines.push(
        hasEnum ? tr(
          "%s: %s more devices found \u2013 listed unticked in the sensor table, tick what should be watched",
          tr(labelEn),
          extra.length
        ) : tr(
          "%s: %s devices found \u2013 listed unticked in the sensor table, tick what should be watched",
          tr(labelEn),
          extra.length
        )
      );
    }
    if (added) {
      out.sensors = rows;
    }
    if (empty("lockId")) {
      const lock = view.rows.find((r) => /^nuki[^.]*\.\d+\..*lockState$/i.test(r.id)) || view.rows.find(
        (r) => {
          var _a2, _b2;
          return /^(value\.lock|switch\.lock(\.door)?|sensor\.lock)$/.test(String(((_b2 = (_a2 = r.value) == null ? void 0 : _a2.common) == null ? void 0 : _b2.role) || ""));
        }
      );
      if (lock) {
        out.lockEnabled = true;
        out.lockId = lock.id;
        out.lockValues = /lockState$/i.test(lock.id) ? "3,5,6" : "false";
        lines.push(tr("Door lock: %s", lock.id));
      }
    }
    if (!(this.config.notify || []).some((r) => r && r.instance)) {
      const inst = await this.getObjectViewAsync("system", "instance", {
        startkey: "system.adapter.",
        endkey: "system.adapter.\u9999"
      });
      const ids = inst.rows.map((r) => r.id.replace("system.adapter.", "")).filter((id) => import_messengers.MESSENGERS[(0, import_messengers.adapterOf)(id)] && !import_messengers.MESSENGERS[(0, import_messengers.adapterOf)(id)].required).sort(
        (a, b) => Number(b.startsWith("telegram.")) - Number(a.startsWith("telegram.")) || a.localeCompare(b)
      );
      if (ids.length) {
        out.notify = [{ enabled: true, instance: ids[0], user: "", chatId: "" }];
        lines.push(tr("Messenger: %s", ids[0]));
      }
    }
    const insts = (await this.getObjectViewAsync("system", "instance", {
      startkey: "system.adapter.",
      endkey: "system.adapter.\u9999"
    })).rows.map((r) => r.id.replace("system.adapter.", ""));
    if (insts.some((id) => /^alexa2\.\d+$/.test(id))) {
      const echos = await this.echoList();
      if (echos.length) {
        out.wizHasAlexa = true;
        if (!(this.config.echos || []).some((r) => r && r.device)) {
          out.echos = echos.map((e) => ({
            enabled: true,
            device: e.value,
            name: "",
            alarm: false,
            sim: false
          }));
        }
        lines.push(
          `Alexa: ${echos.length} Echo${echos.length === 1 ? "" : "s"} (${echos.map((e) => e.label).join(", ")})`
        );
      }
    }
    const speaker = insts.find((id) => /^(alexa2|sayit)\.\d+$/.test(id));
    if (speaker && empty("speechId")) {
      out.wizHasSpeaker = true;
      lines.push(tr("Speaker: %s", speaker));
    }
    const siren = view.rows.find(
      (r) => {
        var _a2, _b2, _c2, _d2;
        return !r.id.startsWith(`${this.namespace}.`) && ((_b2 = (_a2 = r.value) == null ? void 0 : _a2.common) == null ? void 0 : _b2.write) !== false && (/^(switch\.alarm|switch\.siren|level\.siren)/.test(String(((_d2 = (_c2 = r.value) == null ? void 0 : _c2.common) == null ? void 0 : _d2.role) || "")) || /^(siren|sirene|alarm_?siren)$/i.test(r.id.split(".").pop() || ""));
      }
    );
    if (siren && !(this.config.sirens || []).some((r) => r && r.id)) {
      out.wizHasSiren = true;
      lines.push(tr("Siren: %s", siren.id));
    }
    const lux = view.rows.filter(
      (r) => {
        var _a2, _b2, _c2, _d2;
        return ((_b2 = (_a2 = r.value) == null ? void 0 : _a2.common) == null ? void 0 : _b2.unit) === "lx" || ((_d2 = (_c2 = r.value) == null ? void 0 : _c2.common) == null ? void 0 : _d2.role) === "value.brightness";
      }
    );
    if (lux.length && empty("simLuxId")) {
      out.wizHasLux = true;
      lines.push(
        tr(
          'Brightness: %s state(s) with lux \u2013 whether one is outdoors, you check on the page "Light: evening"',
          lux.length
        )
      );
    }
    out.wizScanInfo = lines.join("\n");
    return out;
  }
  /**
   * Setup assistant, page "Alexa": takes the answers into the table of the Echos - the alarm settings for every
   * Echo, the radio for the chosen Echo (or the first one with a player); rows of other Echos stay as they are
   *
   * @param form answers of the page (wizAlexa*, wizEcho*) and the current table (echos)
   */
  async wizardAlexa(form) {
    var _a;
    const found = await this.echoList();
    const yes = (v) => v === true || v === "true";
    const val = (v, def) => v === void 0 || v === null || v === "" ? def : v;
    let rows = (Array.isArray(form.echos) ? form.echos : this.config.echos || []).filter(
      (r) => r == null ? void 0 : r.device
    );
    for (const e of found) {
      if (!rows.some((r) => r.device === e.value)) {
        rows.push({ enabled: true, device: e.value, name: "" });
      }
    }
    const alarm = yes(form.wizAlexaAlarm);
    const sim = yes(form.wizAlexaSim);
    const simDevice = typeof form.wizEchoSimDevice === "string" && form.wizEchoSimDevice || ((_a = found.find((e) => e.player)) == null ? void 0 : _a.value) || "";
    rows = rows.map((r) => {
      const out = { ...r, alarm };
      if (alarm) {
        out.alarmVolume = val(form.wizEchoAlarmVolume, 80);
        out.alarmSound = String(val(form.wizEchoAlarmSound, "siren"));
        out.alarmText = form.wizEchoAlarmText !== false && form.wizEchoAlarmText !== "false";
      }
      out.sim = sim && r.device === simDevice;
      if (out.sim) {
        out.stations = String(val(form.wizEchoStations, ""));
        out.simVolume = val(form.wizEchoSimVolume, 40);
        out.window = val(form.wizEchoWindow, "day");
        out.times = String(val(form.wizEchoTimes, ""));
        out.count = String(val(form.wizEchoCount, "1-3"));
        out.dur = String(val(form.wizEchoDur, "30-90"));
        out.learn = yes(form.wizEchoLearn);
      }
      return out;
    });
    return { echos: rows };
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
    var _a, _b, _c;
    const c = this.config;
    const names = (info.sensors || []).map((s) => s.name).join(", ");
    const textIn = (T) => {
      var _a2, _b2, _c2, _d, _e;
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
          return info.panic ? T.panic(((_b2 = info.sensor) == null ? void 0 : _b2.name) || "") : T.alarm(((_c2 = info.sensor) == null ? void 0 : _c2.name) || "");
        case "alarmEnd":
          return T.alarmEnd(this.src(info.source, T));
        case "wrongPin":
          return T.wrongPin(this.wrongPin);
        case "sabotage":
          return T.sabotage(names);
        case "hazard":
          return T.hazard(((_d = info.sensor) == null ? void 0 : _d.name) || "");
        case "report":
          return T.report(((_e = info.sensor) == null ? void 0 : _e.name) || "");
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
        this.echoAlarmText = text;
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
      case "report":
        notify = c.notifyReport !== false;
        break;
      case "hazard":
        notify = c.notifyHazard !== false;
        speech = ((_b = info.sensor) == null ? void 0 : _b.hazard) === "speech";
        await this.setStateAsync("status.lastTrigger", ((_c = info.sensor) == null ? void 0 : _c.name) || "", true);
        await this.setStateAsync("status.lastTriggerTime", Date.now(), true);
        if (c.notificationManager) {
          try {
            await this.registerNotification("home-guard", "alarm", text);
          } catch (err) {
            this.log.debug(`Notification manager: ${err.message}`);
          }
        }
        break;
    }
    if (e === "disarmed") {
      this.stopRepeat();
    }
    this.addLog(e, text);
    this.log.info(textIn((0, import_texts.texts)("en")));
    if (notify) {
      this.notifyAll(text, false, e === "alarm" || e === "entry" || e === "sabotage" || e === "hazard");
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
      this.bg(this.notifyOne(row, text, alert), "notifyOne");
    }
    if (test) {
      this.log.info("Test notification sent");
    }
  }
  /**
   * Sends a text to one messenger instance in its own format (lib/messengers.ts)
   *
   * @param row row of the notification table
   * @param text message
   * @param alert true for alarms (higher priority where the messenger has one)
   */
  async notifyOne(row, text, alert) {
    try {
      await (0, import_messengers.sendToMessenger)(this, row, { title: "Home Guard", text, alert });
    } catch (err) {
      this.log.warn(`Notification to ${row.instance} failed: ${err.message}`);
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
            this.bg(
              this.setForeignStateAsync(l.id, this.blinkOn ? l.on : l.off, false),
              "setForeignStateAsync"
            );
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
    var _a;
    await this.echoAlarm(on);
    for (const t of this.sirenTimers) {
      if (t) {
        this.clearTimeout(t);
      }
    }
    this.sirenTimers = [];
    const mode = ((_a = this.alarm) == null ? void 0 : _a.mode) || "off";
    for (const s of this.config.sirens || []) {
      if (!(s == null ? void 0 : s.id) || s.enabled === false) {
        continue;
      }
      const when = s.when || "all";
      const runs = !on || mode === "off" || when === "all" || (when === "full" ? mode === "full" : mode !== "full");
      if (!runs) {
        continue;
      }
      const off = this.parseValue(s.valueOff || "false");
      await this.setForeignStateAsync(s.id, on ? this.parseValue(s.valueOn || "true") : off, false);
      const sec = clamp(num(s.durationSec, 0), 0, 3600);
      if (on && sec > 0) {
        this.sirenTimers.push(
          this.setTimeout(
            () => this.bg(this.setForeignStateAsync(s.id, off, false), "setForeignStateAsync"),
            sec * 1e3
          )
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
      return { error: this.tr("A real alarm or an entry delay is running \u2013 no test possible") };
    }
    await this.endTest();
    const on = (k, d) => msg[k] === void 0 ? d : msg[k] === true || msg[k] === "true";
    const duration = Math.min(300, Math.max(5, num(msg.duration, 15)));
    const text = `${T.testPrefix}${T.alarm(T.testTrigger)}`;
    const done = [];
    const sirenCount = (c.sirens || []).filter((x) => (x == null ? void 0 : x.id) && x.enabled !== false).length + this.alarmEchos().length;
    const actionCount = (c.actions || []).filter((a) => (a == null ? void 0 : a.id) && a.enabled !== false && a.event === "alarm").length;
    const anything = on("notify", true) && (c.notify || []).some((r) => (r == null ? void 0 : r.instance) && r.enabled !== false) || on("speech", true) && !!c.speechId || on("lamps", true) && this.lampOuts.length > 0 || on("sirens", false) && sirenCount > 0 || on("actions", false) && actionCount > 0;
    if (!anything) {
      return { result: this.tr("Nothing to test \u2013 nothing is set up for the ticked parts") };
    }
    this.addLog("test", text);
    this.log.info(`Test alarm for ${duration} s`);
    if (on("notify", true) && (c.notify || []).some((r) => (r == null ? void 0 : r.instance) && r.enabled !== false)) {
      this.notifyAll(text, false, true);
      done.push(this.tr("notifications"));
    }
    if (on("speech", true) && c.speechId) {
      await this.setForeignStateAsync(c.speechId, text.replace(/[^\p{L}\p{N}\s.,:–-]/gu, "").trim());
      done.push(this.tr("speech output"));
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
              this.bg(this.setForeignStateAsync(l.id, lit ? l.on : l.off, false), "setForeignStateAsync");
            }
          },
          clamp(num(c.blinkSec, 1), 0.5, 10) * 1e3
        );
      }
      done.push(test.lamps.length === 1 ? this.tr("1 lamp") : this.tr("%s lamps", test.lamps.length));
    }
    if (on("sirens", false) && sirenCount) {
      this.echoAlarmText = text;
      await this.sirens(true);
      test.sirens = true;
      done.push(sirenCount === 1 ? this.tr("1 siren") : this.tr("%s sirens", sirenCount));
    }
    if (on("actions", false) && actionCount) {
      await this.runActions("alarm");
      test.actions = true;
      done.push(actionCount === 1 ? this.tr("1 action") : this.tr("%s actions", actionCount));
    }
    test.timer = this.setTimeout(() => this.bg(this.endTest(), "endTest"), duration * 1e3);
    this.test = test;
    return {
      result: done.length ? this.tr("Test running for %s s: %s", duration, done.join(", ")) : this.tr("Nothing to test \u2013 nothing is set up for the ticked parts")
    };
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
    this.bg(this.setStateAsync("status.log", JSON.stringify(this.log_), true), "setStateAsync");
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
    if (!this.sim || !this.started) {
      return;
    }
    const want = !!this.config.simEnabled && this.simLamps.length > 0 && this.simWanted();
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
    const lamps = this.simLamps.filter(
      (l) => !(l.type === "evening" && this.eveningOn()) && !(l.type === "morning" && this.morningOn())
    );
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
    const first = (0, import_simulation.eveningNoon)(now);
    const part = (type, on, off) => {
      const lamps = this.simLamps.filter((l) => l.type === type);
      return [
        ...this.planOne(first, now, lamps, true),
        ...this.planOne(first + 24 * 36e5, now, lamps, true)
      ].filter((st) => st.on ? on : off);
    };
    return [
      ...this.eveningOn() ? part("evening", this.lightSw.eveningOn, this.lightSw.eveningOff) : [],
      ...this.morningOn() ? part("morning", this.lightSw.morningOn, this.lightSw.morningOff) : []
    ].sort((a, b) => a.at - b.at);
  }
  /** @returns the evening light is switched on and has lamps - every evening, independent of the simulation */
  eveningOn() {
    return (this.lightSw.eveningOn || this.lightSw.eveningOff) && !!this.config.eveningLight && this.simLamps.some((l) => l.type === "evening");
  }
  /** @returns the morning light is switched on and has lamps */
  morningOn() {
    return (this.lightSw.morningOn || this.lightSw.morningOff) && !!this.config.morningLight && this.simLamps.some((l) => l.type === "morning");
  }
  /**
   * Starts, re-plans or stops the evening and morning light after the settings or the lamps changed
   *
   * @param catchUp switched on by hand: lamps that should be on now go on at once
   */
  updateEvening(catchUp = false) {
    if (this.eveningOn() || this.morningOn()) {
      const lamps = this.simLamps.filter(
        (l) => l.type === "evening" && this.eveningOn() || l.type === "morning" && this.morningOn()
      ).length;
      this.log.info(`Evening/morning light active for ${lamps} lamps`);
      if (this.evening.active) {
        this.evening.replan(catchUp);
      } else {
        this.evening.start(catchUp);
      }
    } else {
      this.evening.stop();
    }
  }
  /**
   * Is a time inside the learning window of a lamp: a device with an own time window uses that window,
   * everything else the window of the settings
   *
   * @param id state ID of the lamp or device
   * @param ts time in ms
   */
  inLearnWindowFor(id, ts) {
    const dev = this.simLamps.find((l) => l.id === id && l.type === "device" && l.window);
    if (!dev) {
      return this.inLearnWindow(ts);
    }
    const d = new Date(ts);
    const m = d.getHours() * 60 + d.getMinutes();
    const from = dev.window === "day" ? Math.max(0, hmMin(this.config.simWake) < 0 ? 390 : hmMin(this.config.simWake)) : hmMin(dev.from);
    const to = dev.window === "day" ? hmMin(this.config.simEnd) < 0 ? 1350 : hmMin(this.config.simEnd) : hmMin(dev.to);
    if (from < 0 || to < 0) {
      return true;
    }
    return from <= to ? m >= from && m < to : m >= from || m < to;
  }
  /**
   * Is a time inside the learning window of the settings (always, only when dark, or between two times)?
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
   * Plan of one evening and the following morning
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
    const next = (0, import_sun.sunTimes)(new Date(noon + 24 * 36e5), this.lat, this.lon);
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
        learnPick: c.simLearnPick === "weekday" ? "weekday" : "kind",
        deviceMin: clamp(num(c.simDeviceMin, 60), 5, 600),
        deviceMax: clamp(num(c.simDeviceMax, 180), 5, 600),
        deviceCount: clamp(num(c.simDeviceCount, 1), 1, 5),
        wake: c.simWake || "06:30",
        wakeRandom: clamp(num(c.simWakeRandom, 20), 0, 120),
        wakeWeekendLater: clamp(num(c.simWakeWeekendLater, 60), 0, 240),
        sunriseNext: next ? next.sunrise : void 0,
        morningOffOffset: clamp(num(c.simMorningOffOffset, 5), -120, 240),
        morningOffRandom: clamp(num(c.simMorningOffRandom, 25), 0, 120),
        morningOffTime: c.simMorningOffTime || "",
        morningBright: this.luxBrightTs && (0, import_simulation.eveningKey)(this.luxBrightTs) === (0, import_simulation.eveningKey)(noon) ? this.luxBrightTs : void 0,
        learnFilter: (ts, id) => this.inLearnWindowFor(id, ts)
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
    if (isNaN(lux)) {
      return;
    }
    const now = Date.now();
    const hour = new Date(now).getHours();
    const above = num(c.simMorningLuxAbove, 0);
    if (above > 0 && lux > above && hour >= 4 && hour < 12 && (!this.luxBrightTs || new Date(this.luxBrightTs).toDateString() !== new Date(now).toDateString())) {
      this.luxBrightTs = now;
      const automatic = this.morningOn() && this.lightSw.morningOff || this.sim.active;
      if (automatic) {
        for (const id of new Set(this.simLamps.filter((l) => l.type === "morning").map((l) => l.id))) {
          if (this.simLampVals.get(id)) {
            this.bg(this.switchLamp(id, false), "switchLamp");
          }
        }
      }
      this.sim.replan();
      this.evening.replan();
    }
    if (!c.simLuxBelow) {
      return;
    }
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
    const echo = this.echoSim.get(id);
    if (echo) {
      return this.echoPlay(echo, on);
    }
    const { on: vOn, off } = await this.onOffValues(id);
    const lamp = this.simLamps.find((l) => l.id === id);
    const own = on ? lamp == null ? void 0 : lamp.valueOn : lamp == null ? void 0 : lamp.valueOff;
    await this.setForeignStateAsync(id, own ? this.parseValue(own) : on ? vOn : off, false);
  }
  // ======================================================================
  // Amazon Echo (alexa2): radio in the simulation, sound and announcement on alarm
  // ======================================================================
  /**
   * Radio on an Echo on or off
   *
   * @param row the Echo row
   * @param on play (a station of the row, a random one of several) or pause
   */
  async echoPlay(row, on) {
    const dev = row.device;
    try {
      if (!on) {
        await this.setForeignStateAsync(`${dev}.Player.controlPause`, true, false);
        return;
      }
      const vol = Number(row.simVolume);
      if (row.simVolume !== "" && row.simVolume != null && vol >= 0 && vol <= 100) {
        await this.setForeignStateAsync(`${dev}.Player.volume`, Math.round(vol), false);
      }
      const list = String(row.stations || "").split(",").map((x) => x.trim()).filter(Boolean);
      const station = list.length ? list[Math.floor(Math.random() * list.length)] : "";
      if (!station) {
        await this.setForeignStateAsync(`${dev}.Player.controlPlay`, true, false);
      } else if (/^[sp]\d+$/i.test(station)) {
        await this.setForeignStateAsync(`${dev}.Player.TuneIn-Station`, station, false);
      } else {
        const say = this.sysLang === "de" ? `spiele ${station}` : `play ${station}`;
        await this.setForeignStateAsync(`${dev}.Commands.textCommand`, say, false);
      }
    } catch (e) {
      this.log.warn(`Echo ${dev}: ${e.message}`);
    }
  }
  /** Echos used on alarm */
  alarmEchos() {
    return (this.config.echos || []).filter((r) => (r == null ? void 0 : r.device) && r.enabled !== false && r.alarm);
  }
  /**
   * Alarm on the Echos: volume, sound and (optionally) the alarm text, repeated while the alarm runs
   *
   * @param on alarm starts or ends
   */
  async echoAlarm(on) {
    if (this.echoAlarmTimer) {
      this.clearInterval(this.echoAlarmTimer);
      this.echoAlarmTimer = void 0;
    }
    const echos = this.alarmEchos();
    if (!echos.length) {
      return;
    }
    if (!on) {
      if (this.echoAlarmUntil) {
        this.echoAlarmUntil = 0;
        for (const r of echos) {
          await this.setForeignStateAsync(`${r.device}.Commands.deviceStop`, true, false).catch(() => {
          });
        }
      }
      return;
    }
    const secs = clamp(num(this.config.alarmDuration, 180), 0, 3600);
    this.echoAlarmUntil = secs > 0 ? Date.now() + Math.max(20, secs) * 1e3 : Number.MAX_SAFE_INTEGER;
    const once = async () => {
      var _a;
      if (Date.now() > this.echoAlarmUntil) {
        if (this.echoAlarmTimer) {
          this.clearInterval(this.echoAlarmTimer);
          this.echoAlarmTimer = void 0;
        }
        return;
      }
      const words = (this.echoAlarmText || this.T.phase.alarm || "Alarm").replace(/[^\p{L}\p{N}\s.,:–-]/gu, "").trim().replace(/[<>&]/g, " ");
      for (const r of echos) {
        try {
          const vol = Number(r.alarmVolume);
          await this.setForeignStateAsync(
            `${r.device}.Commands.speak-volume`,
            r.alarmVolume !== "" && r.alarmVolume != null && vol >= 0 && vol <= 100 ? Math.round(vol) : 80,
            false
          );
          const sound = ECHO_SOUNDS[(_a = r.alarmSound) != null ? _a : "siren"] || "";
          const ssml = `<speak>${sound ? `<audio src="${sound}"/>` : ""}${r.alarmText !== false ? ` ${words}` : ""}</speak>`;
          await this.setForeignStateAsync(`${r.device}.Commands.ssml`, ssml, false);
        } catch (e) {
          this.log.warn(`Echo ${r.device}: ${e.message}`);
        }
      }
    };
    await once();
    this.echoAlarmTimer = this.setInterval(() => this.bg(once(), "echoAlarm"), 2e4);
  }
  /**
   * The Echos of all alexa2 instances, for the selection in the settings
   *
   * @returns value = device object, label = name (with a note when it can only speak)
   */
  async echoList() {
    var _a, _b;
    const out = [];
    const devs = await this.getObjectViewAsync("system", "device", {
      startkey: "alexa2.",
      endkey: "alexa2.\u9999"
    });
    for (const r of devs.rows) {
      if (!/^alexa2\.\d+\.Echo-Devices\.[^.]+$/.test(r.id)) {
        continue;
      }
      const speak = await this.getForeignObjectAsync(`${r.id}.Commands.ssml`);
      if (!speak) {
        continue;
      }
      const kind = await this.getForeignStateAsync(`${r.id}.Info.deviceTypeString`);
      if (String((kind == null ? void 0 : kind.val) || "") === "Apps") {
        continue;
      }
      const player = !!await this.getForeignObjectAsync(`${r.id}.Player.currentState`);
      const n = (_b = (_a = r.value) == null ? void 0 : _a.common) == null ? void 0 : _b.name;
      const name = String(
        (typeof n === "object" ? n[this.sysLang] || n.en : n) || r.id
      );
      out.push({ value: r.id, label: player ? name : this.tr("%s (speech only)", name), player });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
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
      this.bg(this.setStateAsync("simulation.learned", JSON.stringify(this.learner.data), true), "setStateAsync");
      this.bg(
        this.setStateAsync("simulation.learnedDays", Object.keys(this.learner.data.days).length, true),
        "setStateAsync"
      );
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
