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
  WIZARD_STEPS: () => WIZARD_STEPS,
  bestEnum: () => bestEnum,
  nextStep: () => nextStep,
  stepNeeded: () => stepNeeded
});
module.exports = __toCommonJS(wizard_exports);
const WIZARD_STEPS = 10;
function stepNeeded(step, c) {
  const light = c.sim || c.evening || c.morning;
  switch (step) {
    case 2:
    // sensors
    case 3:
    // times
    case 5:
    // notifications
    case 6:
      return c.alarm;
    case 4:
      return c.alarm || c.sim;
    case 7:
    // evening, morning & simulation
    case 8:
      return light;
    default:
      return true;
  }
}
function nextStep(step, dir, c) {
  let s = Math.max(0, Math.min(WIZARD_STEPS - 1, Math.round(step) || 0));
  const d = dir < 0 ? -1 : 1;
  do {
    s += d;
  } while (s > 0 && s < WIZARD_STEPS - 1 && !stepNeeded(s, c));
  return Math.max(0, Math.min(WIZARD_STEPS - 1, s));
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
  perimeter: {
    role: /^(sensor\.(window|door|contact)|value\.window|sensor\.open)/,
    name: /fenster|t(ü|ue)r|window|door|kontakt|contact|au(ß|ss)en|perimeter|h(ü|ue)ll/i
  },
  full: { role: /^sensor\.motion/, name: /bewegung|motion|innen|inside|interior|pir|voll/i },
  fire: {
    role: /^sensor\.alarm\.(fire|flood|smoke|gas|water)|^sensor\.(smoke|water|leak|gas)/,
    name: /rauch|smoke|wasser|water|leck|leak|gas|brand|fire|gefahr|hazard/i
  },
  report: {
    name: /melde|briefkast|mailbox|letter|gartentor|garden.?gate|schuppen|shed|nur.?melden|report/i,
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
      best = { id: e.id, name: e.name, count: rule.role ? count : e.roles.length, score };
    }
  }
  return best ? { id: best.id, name: best.name, count: best.count } : null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WIZARD_DEFAULTS,
  WIZARD_STEPS,
  bestEnum,
  nextStep,
  stepNeeded
});
//# sourceMappingURL=wizard.js.map
