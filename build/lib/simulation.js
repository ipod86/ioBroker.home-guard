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
var simulation_exports = {};
__export(simulation_exports, {
  Learner: () => Learner,
  SimRunner: () => SimRunner,
  eveningKey: () => eveningKey,
  eveningNoon: () => eveningNoon,
  isWeekendEvening: () => isWeekendEvening,
  planEvening: () => planEvening
});
module.exports = __toCommonJS(simulation_exports);
const MIN_SAME_WEEKDAY = 3;
const MIN = 6e4;
function eveningKey(ts) {
  const d = new Date(ts - 12 * 36e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function eveningNoon(ts) {
  const d = new Date(ts - 12 * 36e5);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime();
}
function isWeekendEvening(ts) {
  const day = new Date(eveningNoon(ts)).getDay();
  return day === 5 || day === 6;
}
function parseHm(hm, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}
class Learner {
  /**
   * Creates the learner
   *
   * @param data learned days of the last run
   */
  constructor(data = { days: {} }) {
    this.data = data;
  }
  onSince = /* @__PURE__ */ new Map();
  /**
   * a lamp was switched by somebody else than the adapter
   *
   * @param id lamp state ID
   * @param on switched on (true) or off
   * @param ts time of the switching in ms
   */
  record(id, on, ts) {
    if (on) {
      if (!this.onSince.has(id)) {
        this.onSince.set(id, ts);
      }
      return false;
    }
    const since = this.onSince.get(id);
    this.onSince.delete(id);
    if (since === void 0) {
      return false;
    }
    const dur = Math.round((ts - since) / MIN);
    if (dur < 1 || dur > 16 * 60) {
      return false;
    }
    const key = eveningKey(since);
    const day = this.data.days[key] = this.data.days[key] || { weekend: isWeekendEvening(since), sessions: [] };
    day.sessions.push({ id, start: Math.round((since - eveningNoon(since)) / MIN), dur });
    return true;
  }
  /**
   * drop days older than the learning window
   *
   * @param now current time in ms
   * @param days number of days to keep
   */
  prune(now, days) {
    const oldest = eveningKey(now - days * 864e5);
    for (const k of Object.keys(this.data.days)) {
      if (k < oldest) {
        delete this.data.days[k];
      }
    }
  }
  /** forget the running "on" times (e.g. when the simulation starts) */
  reset() {
    this.onSince.clear();
  }
  /**
   * learned days with sessions of the given lamps: with "weekday" the same weekday (a Tuesday for a Tuesday) when
   * at least three of them are learned, otherwise - and always with "kind" - the same kind (weekday/weekend),
   * then any
   *
   * @param weekend Friday/Saturday evening
   * @param ids lamps that are wanted
   * @param today key of the current evening (not used)
   * @param pick "kind" (weekday/weekend) or "weekday" (same day of the week first)
   */
  candidates(weekend, ids, today, pick = "kind") {
    const usable = Object.entries(this.data.days).filter(
      ([k, d]) => k !== today && d.sessions.some((s) => ids.has(s.id))
    );
    if (pick === "weekday") {
      const dayOf = (key) => {
        const [y, m, d] = key.split("-").map(Number);
        return new Date(y, m - 1, d, 12).getDay();
      };
      const [ty, tm, td] = today.split("-").map(Number);
      const todayDay = new Date(ty, tm - 1, td, 12).getDay();
      const sameDay = usable.filter(([k]) => dayOf(k) === todayDay);
      if (sameDay.length >= MIN_SAME_WEEKDAY) {
        return sameDay.map(([, d]) => d);
      }
    }
    const sameKind = usable.filter(([, d]) => d.weekend === weekend);
    return (sameKind.length ? sameKind : usable).map(([, d]) => d);
  }
}
function planEvening(noon, sunset, lamps, o, learner, rand = Math.random) {
  var _a, _b, _c, _d, _e;
  const r = (a, b) => a + rand() * (b - a);
  const steps = [];
  const weekend = isWeekendEvening(noon);
  const today = eveningKey(noon);
  const byType = (t) => lamps.filter((l) => l.type === t);
  let learned = null;
  const learnedIds = /* @__PURE__ */ new Set();
  if (o.mode !== "dusk") {
    const ids = new Set(
      (o.mode === "learned" ? lamps : lamps.filter((l) => l.type !== "evening")).filter((l) => l.type !== "device" || l.learn).map((l) => l.id)
    );
    const cands = learner.candidates(weekend, ids, today, o.learnPick);
    if (cands.length) {
      learned = cands[Math.floor(rand() * cands.length)];
      for (const s of learned.sessions) {
        if (!ids.has(s.id)) {
          continue;
        }
        if (o.learnFilter && !o.learnFilter(noon + s.start * MIN)) {
          continue;
        }
        learnedIds.add(s.id);
        const at = noon + (s.start + r(-o.jitter, o.jitter)) * MIN;
        const dur = Math.max(1, s.dur * r(0.8, 1.2));
        steps.push({ at, id: s.id, on: true, why: "learned" });
        steps.push({ at: at + dur * MIN, id: s.id, on: false, why: "learned" });
      }
    }
  }
  const duskNeeded = o.mode === "dusk" || o.mode === "combined" || !learned;
  if (duskNeeded) {
    const start = sunset + (o.startOffset + r(0, o.startRandom)) * MIN;
    let endMin = parseHm(o.end, 22 * 60 + 30) + r(0, o.endRandom) + (weekend ? o.weekendLater : 0);
    if (endMin < 12 * 60) {
      endMin += 24 * 60;
    }
    const end = Math.max(start + 30 * MIN, noon + (endMin - 12 * 60) * MIN);
    for (const l of byType("evening")) {
      steps.push({ at: start + r(0, 15) * MIN, id: l.id, on: true, why: "dusk" });
      steps.push({ at: end + r(0, 20) * MIN, id: l.id, on: false, why: "dusk" });
    }
    if (!learned || o.mode === "dusk") {
      const visitLamps = byType("visit");
      if (visitLamps.length && end - start > 40 * MIN) {
        for (let i = 0; i < o.visits; i++) {
          const lamp = visitLamps[Math.floor(rand() * visitLamps.length)];
          const at = r(start + 20 * MIN, end - 15 * MIN);
          const dur = r(o.visitMin, Math.max(o.visitMin, o.visitMax));
          steps.push({ at, id: lamp.id, on: true, why: "visit" });
          steps.push({ at: at + dur * MIN, id: lamp.id, on: false, why: "visit" });
        }
      }
      for (const l of byType("bedtime")) {
        const at = end + r(1, 10) * MIN;
        steps.push({ at, id: l.id, on: true, why: "bedtime" });
        steps.push({ at: at + r(3, 12) * MIN, id: l.id, on: false, why: "bedtime" });
      }
    }
  }
  const devices = byType("device").filter((d) => !learnedIds.has(d.id));
  if (devices.length) {
    const start = sunset + (o.startOffset + r(0, o.startRandom)) * MIN;
    let endMin = parseHm(o.end, 22 * 60 + 30) + (weekend ? o.weekendLater : 0);
    if (endMin < 12 * 60) {
      endMin += 24 * 60;
    }
    const end = Math.max(start + 30 * MIN, noon + (endMin - 12 * 60) * MIN);
    const dMin = Math.max(5, (_a = o.deviceMin) != null ? _a : 60);
    const dMax = Math.max(dMin, (_b = o.deviceMax) != null ? _b : 180);
    const n = Math.max(1, Math.min(5, Math.round((_c = o.deviceCount) != null ? _c : 1)));
    const slot = (end - start) / n;
    for (const d of devices) {
      for (let i = 0; i < n; i++) {
        const from = start + i * slot;
        const dur = Math.min(r(dMin, dMax), slot / MIN * (n > 1 ? 0.8 : 1));
        const on = r(from, Math.max(from, from + slot - dur * MIN));
        steps.push({ at: on, id: d.id, on: true, why: "device" });
        steps.push({ at: on + dur * MIN, id: d.id, on: false, why: "device" });
      }
    }
  }
  const mornings = byType("morning").filter((m) => !learnedIds.has(m.id));
  if (mornings.length && o.sunriseNext) {
    const nextDay = new Date(noon + 24 * 36e5).getDay();
    const later = nextDay === 0 || nextDay === 6 ? (_d = o.wakeWeekendLater) != null ? _d : 60 : 0;
    const wakeMin = parseHm(o.wake || "", 6 * 60 + 30) + later;
    const wake = noon + (wakeMin + 12 * 60) * MIN + r(0, (_e = o.wakeRandom) != null ? _e : 20) * MIN;
    for (const m of mornings) {
      const on = wake + r(0, 10) * MIN;
      const off = o.sunriseNext + r(5, 30) * MIN;
      if (off - on >= 10 * MIN) {
        steps.push({ at: on, id: m.id, on: true, why: "morning" });
        steps.push({ at: off, id: m.id, on: false, why: "morning" });
      }
    }
  }
  return steps.sort((a, b) => a.at - b.at);
}
class SimRunner {
  // lamps the simulation switched on
  /**
   * Creates the runner
   *
   * @param host timers and lamps
   * @param makePlan builds the plan of the current evening
   * @param opts force switching, catch up on due steps
   */
  constructor(host, makePlan, opts = { force: false, catchUp: true }) {
    this.host = host;
    this.makePlan = makePlan;
    this.opts = opts;
  }
  active = false;
  timer = null;
  plan = [];
  ours = /* @__PURE__ */ new Set();
  /**
   * Starts the simulation
   */
  start() {
    if (this.active) {
      return;
    }
    this.active = true;
    this.replan();
  }
  /**
   * Stops the simulation and switches off the lamps it switched on
   */
  stop() {
    if (!this.active) {
      return;
    }
    this.active = false;
    if (this.timer) {
      this.host.clearTimer(this.timer);
      this.timer = null;
    }
    if (!this.opts.force) {
      for (const id of this.ours) {
        if (!this.host.offOnStop || this.host.offOnStop(id)) {
          this.host.switchLamp(id, false);
        }
      }
    }
    this.ours.clear();
    this.plan = [];
    this.host.publish(false, [], null);
  }
  /** new plan for the current evening; steps already due set the lamps as they should be now */
  replan() {
    if (!this.active) {
      return;
    }
    const now = this.host.now();
    const plan = this.makePlan(now);
    if (this.opts.catchUp !== false) {
      const due = /* @__PURE__ */ new Map();
      for (const s of plan) {
        if (s.at <= now) {
          due.set(s.id, s.on);
        }
      }
      for (const [id, on] of due) {
        this.apply(id, on);
      }
    }
    this.plan = plan.filter((s) => s.at > now);
    this.schedule();
  }
  /**
   * Was the lamp switched on by the simulation?
   *
   * @param id lamp state ID
   */
  isOurs(id) {
    return this.ours.has(id);
  }
  /**
   * Switches a lamp - only lamps the simulation switched on are switched off again
   *
   * @param id lamp state ID
   * @param on on or off
   */
  apply(id, on) {
    if (this.opts.force) {
      if (this.host.isOn(id) !== on) {
        this.host.switchLamp(id, on);
      }
      return;
    }
    if (on) {
      if (!this.host.isOn(id)) {
        this.ours.add(id);
        this.host.switchLamp(id, true);
      }
    } else if (this.ours.has(id)) {
      this.ours.delete(id);
      this.host.switchLamp(id, false);
    }
  }
  /**
   * Waits for the next step of the plan
   */
  schedule() {
    if (this.timer) {
      this.host.clearTimer(this.timer);
      this.timer = null;
    }
    const next = this.plan[0] || null;
    this.host.publish(this.active, this.plan, next);
    if (!next) {
      return;
    }
    const delayMs = Math.max(0, Math.min(next.at - this.host.now(), 2 ** 31 - 1));
    this.timer = this.host.setTimer(() => {
      this.timer = null;
      const now = this.host.now();
      while (this.plan.length && this.plan[0].at <= now) {
        const s = this.plan.shift();
        this.apply(s.id, s.on);
      }
      this.schedule();
    }, delayMs);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Learner,
  SimRunner,
  eveningKey,
  eveningNoon,
  isWeekendEvening,
  planEvening
});
//# sourceMappingURL=simulation.js.map
