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
var wizard_exports = {};
__export(wizard_exports, {
  WIZARD_DEFAULTS: () => WIZARD_DEFAULTS,
  bestEnum: () => bestEnum,
  nextStep: () => nextStep,
  roleSensors: () => roleSensors
});
module.exports = __toCommonJS(wizard_exports);
function nextStep(step, dir, need) {
  const d = dir < 0 ? -1 : 1;
  if (!/^[01]+$/.test(need)) {
    return Math.max(0, (Math.round(step) || 0) + d);
  }
  const pages = need;
  const last = pages.length - 1;
  let s = Math.max(0, Math.min(last, Math.round(step) || 0));
  do {
    s += d;
  } while (s > 0 && s < last && pages[s] === "0");
  return Math.max(0, Math.min(last, s));
}
const WIZARD_DEFAULTS = {
  times: {
    exitDelayFull: 60,
    exitDelayPerimeter: 0,
    entryDelay: 30,
    alarmDuration: 180,
    openCheck: "warn",
    nightStart: "23:00",
    nightEnd: "06:00"
  },
  light: {
    simStartOffset: -30,
    simStartRandom: 20,
    simEnd: "22:30",
    simEndRandom: 45,
    simWeekendLater: 45,
    simWake: "06:30",
    simWakeRandom: 20,
    simWakeWeekendLater: 60,
    simMorningOffOffset: 5,
    simMorningOffRandom: 25
  }
};
const RULES = {
  // anything that reports a break-in from outside: contacts, handles, glass break, vibration
  perimeter: {
    role: /^(sensor\.(window|door|contact|open|glass|vibration|tilt)(\.|$)|value\.window$|sensor\.alarm(\.secure)?$)/,
    name: /fenster|t(ü|ue)r|window|door|kontakt|contact|au(ß|ss)en|perimeter|h(ü|ue)ll|glas|glass|ersch(ü|ue)tter|vibration|einbruch|intrusion/i
  },
  full: {
    role: /^sensor\.(motion|occupancy)(\.|$)/,
    name: /bewegung|motion|innen|inside|interior|pir|voll|lichtschranke/i
  },
  // always active: danger and emergency
  fire: {
    role: /^(sensor\.alarm\.(fire|flood|smoke|gas|water|heat|co)|sensor\.(smoke|water|leak|gas|heat|co)|indicator\.alarm\.(fire|flood))(\.|$)/,
    name: /rauch|smoke|wasser|water|leck|leak|gas|brand|fire|hitze|heat(?!ing)|kohlenmonoxid|\bco\b|gefahr|hazard|panik|panic|notruf|sos/i
  },
  report: {
    name: /melde|briefkast|mailbox|letter|gartentor|garden.?gate|schuppen|shed|klingel|doorbell|nur.?melden|report/i,
    nameRequired: true
  },
  lamps: {
    role: /^(switch\.light|level\.dimmer|light|switch\.lamp)/,
    name: /licht|light|lamp|beleucht/i
  },
  evening: { name: /abend|evening|dusk|d(ä|ae)mmerung/i, nameRequired: true },
  morning: { name: /morgen|morning|wake|aufsteh/i, nameRequired: true },
  presence: { name: /anwesen|presence|zuhause|at.?home/i, nameRequired: true }
};
function bestEnum(kind, enums) {
  const rule = RULES[kind];
  let best = null;
  for (const e of enums) {
    if (!e.roles.length) {
      continue;
    }
    const nameFit = rule.name.test(e.name) || rule.name.test(e.id.split(".").pop() || "");
    if (rule.nameRequired && !nameFit) {
      continue;
    }
    const count = rule.role ? e.roles.filter((r) => rule.role.test(r)).length : e.roles.length;
    if (!nameFit && count === 0) {
      continue;
    }
    const share = e.roles.length ? count / e.roles.length : 0;
    const score = (nameFit ? 3 : 0) + count + share * 5;
    if (!best || score > best.score) {
      best = { id: e.id, name: e.name, count: rule.role && count ? count : e.roles.length, score };
    }
  }
  return best ? { id: best.id, name: best.name, count: best.count } : null;
}
const SENSOR_ROLES = [
  ["24h", RULES.fire.role],
  ["interior", /^sensor\.(motion|occupancy)(\.|$)/],
  [
    "perimeter",
    /^(sensor\.(window|door|contact|open|glass|vibration|tilt)(\.|$)|value\.window$|sensor\.alarm\.secure$)/
  ]
];
function roleSensors(states, aliasTargets, ownAdapter) {
  const parent = (id) => id.substring(0, id.lastIndexOf("."));
  const thermostats = /* @__PURE__ */ new Set();
  for (const s of states) {
    if (/^level\.temperature/.test(s.role)) {
      thermostats.add(parent(s.id));
    }
  }
  const out = [];
  for (const s of states) {
    if (s.id.startsWith(`${ownAdapter}.`) || s.id.startsWith("system.") || aliasTargets.has(s.id)) {
      continue;
    }
    const hit = SENSOR_ROLES.find(([, rx]) => rx.test(s.role));
    if (!hit || thermostats.has(parent(s.id))) {
      continue;
    }
    out.push({ id: s.id, name: s.name, circuit: hit[0], motion: hit[0] === "interior" });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WIZARD_DEFAULTS,
  bestEnum,
  nextStep,
  roleSensors
});
//# sourceMappingURL=wizard.js.map
