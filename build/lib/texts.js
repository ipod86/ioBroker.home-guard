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
var texts_exports = {};
__export(texts_exports, {
  texts: () => texts
});
module.exports = __toCommonJS(texts_exports);
const T = {
  de: {
    mode: { off: "Aus", full: "Vollschutz", perimeter: "H\xFCllschutz", night: "Nachtschutz" },
    phase: {
      disarmed: "Unscharf",
      arming: "Wird scharf",
      armed: "Scharf",
      entry: "Eingangsverz\xF6gerung",
      alarm: "ALARM"
    },
    armed: (m, src) => `\u{1F6E1}\uFE0F Alarmanlage scharf: ${m}${src}`,
    arming: (m, sec) => `\u23F3 ${m} wird in ${sec} Sekunden scharf geschaltet`,
    disarmed: (src) => `\u{1F513} Alarmanlage unscharf${src}`,
    armingFailed: (m, list) => `\u26A0\uFE0F ${m} nicht scharf geschaltet \u2013 offen: ${list}`,
    openBypass: (m, list) => `\u26A0\uFE0F ${m} scharf \u2013 offen und ausgenommen, bis es geschlossen wird: ${list}`,
    duress: (src) => `\u{1F198} STILLER ALARM: Die Anlage wurde mit der Bedrohungs-PIN ausgeschaltet${src}`,
    walkStart: (min) => `\u{1F6B6} Gehtest gestartet (${min} min) \u2013 jetzt jede T\xFCr, jedes Fenster und jeden Bewegungsmelder ausl\xF6sen`,
    walkDone: (seen, total, missing) => missing ? `\u{1F6B6} Gehtest beendet: ${seen} von ${total} Sensoren gemeldet. Nicht gemeldet: ${missing}` : `\u{1F6B6} Gehtest beendet: alle ${total} Sensoren haben sich gemeldet`,
    openWarning: (m, list) => `\u26A0\uFE0F ${m} scharf, aber offen: ${list}`,
    entry: (name, sec) => `\u{1F6AA} ${name} ge\xF6ffnet \u2013 bitte innerhalb von ${sec} Sekunden entsch\xE4rfen`,
    alarm: (name) => `\u{1F6A8} ALARM: ${name}`,
    panic: (src) => `\u{1F6A8} PANIK-ALARM ausgel\xF6st (${src})`,
    alarmEnd: (src) => `\u2705 Alarm beendet${src}`,
    alarmAcked: (src, noPin) => `\u{1F515} Alarm quittiert${src}${noPin ? " \u2013 ohne PIN" : ""}. Die Anlage bleibt scharf: jeder weitere Sensor l\xF6st sofort wieder aus`,
    wrongPin: (n) => `\u{1F522} ${n}\xD7 falsche PIN eingegeben`,
    sabotage: (list) => `\u{1F50B} Keine Meldung mehr von: ${list}`,
    hazard: (name) => `\u26A0\uFE0F Gefahrenmelder hat ausgel\xF6st: ${name}`,
    report: (name) => `\u{1F4E3} Meldung: ${name}`,
    simStart: "\u{1F4A1} Anwesenheitssimulation gestartet",
    simStop: "\u{1F4A1} Anwesenheitssimulation beendet",
    title: "Alarmanlage",
    autoOn: "\u{1F916} Automatisch scharf/unscharf \xFCber Anwesenheit eingeschaltet",
    autoOff: "\u270B Automatisch scharf/unscharf \xFCber Anwesenheit ausgeschaltet",
    lightSwitch: {
      eveningOn: "Abends automatisch an",
      eveningOff: "Abends automatisch aus",
      morningOn: "Morgens automatisch an",
      morningOff: "Morgens automatisch aus"
    },
    switchedOn: "eingeschaltet",
    switchedOff: "ausgeschaltet",
    testPrefix: "\u{1F9EA} TEST \u2013 ",
    testTrigger: "Testausl\xF6ser",
    testEnd: "\u{1F9EA} Test beendet",
    alarmWord: "Alarm",
    by: {
      pin: "PIN",
      state: "Datenpunkt",
      presence: "Anwesenheit",
      lock: "T\xFCrschloss",
      widget: "Bedienfeld",
      night: "Nachtzeit",
      delay: "",
      panic: "Panik-Taste",
      schedule: "Zeitplan",
      message: "Befehl",
      rearm: "wieder scharf, niemand zu Hause"
    },
    via: (s) => s ? ` (${s})` : "",
    test: "\u{1F9EA} Testnachricht von Home Guard",
    onOff: ["aus", "an"]
  },
  en: {
    mode: { off: "Off", full: "Full protection", perimeter: "Perimeter protection", night: "Night protection" },
    phase: { disarmed: "Disarmed", arming: "Arming", armed: "Armed", entry: "Entry delay", alarm: "ALARM" },
    armed: (m, src) => `\u{1F6E1}\uFE0F Alarm system armed: ${m}${src}`,
    arming: (m, sec) => `\u23F3 ${m} will be armed in ${sec} seconds`,
    disarmed: (src) => `\u{1F513} Alarm system disarmed${src}`,
    armingFailed: (m, list) => `\u26A0\uFE0F ${m} not armed \u2013 open: ${list}`,
    openBypass: (m, list) => `\u26A0\uFE0F ${m} armed \u2013 open and left out until closed: ${list}`,
    duress: (src) => `\u{1F198} SILENT ALARM: the system was disarmed with the duress PIN${src}`,
    walkStart: (min) => `\u{1F6B6} Walk test started (${min} min) \u2013 now trigger every door, window and motion detector`,
    walkDone: (seen, total, missing) => missing ? `\u{1F6B6} Walk test finished: ${seen} of ${total} sensors reported. Not reported: ${missing}` : `\u{1F6B6} Walk test finished: all ${total} sensors reported`,
    openWarning: (m, list) => `\u26A0\uFE0F ${m} armed, but open: ${list}`,
    entry: (name, sec) => `\u{1F6AA} ${name} opened \u2013 please disarm within ${sec} seconds`,
    alarm: (name) => `\u{1F6A8} ALARM: ${name}`,
    panic: (src) => `\u{1F6A8} PANIC alarm triggered (${src})`,
    alarmEnd: (src) => `\u2705 Alarm ended${src}`,
    alarmAcked: (src, noPin) => `\u{1F515} Alarm acknowledged${src}${noPin ? " \u2013 without PIN" : ""}. The system stays armed: any further sensor triggers the alarm at once`,
    wrongPin: (n) => `\u{1F522} Wrong PIN entered ${n} times`,
    sabotage: (list) => `\u{1F50B} No more reports from: ${list}`,
    hazard: (name) => `\u26A0\uFE0F Danger detector triggered: ${name}`,
    report: (name) => `\u{1F4E3} Report: ${name}`,
    simStart: "\u{1F4A1} Presence simulation started",
    simStop: "\u{1F4A1} Presence simulation stopped",
    title: "Alarm system",
    autoOn: "\u{1F916} Automatic arming by presence switched on",
    autoOff: "\u270B Automatic arming by presence switched off",
    lightSwitch: {
      eveningOn: "Evening: switch on automatically",
      eveningOff: "Evening: switch off automatically",
      morningOn: "Morning: switch on automatically",
      morningOff: "Morning: switch off automatically"
    },
    switchedOn: "switched on",
    switchedOff: "switched off",
    testPrefix: "\u{1F9EA} TEST \u2013 ",
    testTrigger: "test trigger",
    testEnd: "\u{1F9EA} Test finished",
    alarmWord: "Alarm",
    by: {
      pin: "PIN",
      state: "state",
      presence: "presence",
      lock: "door lock",
      widget: "panel",
      night: "night time",
      delay: "",
      panic: "panic button",
      schedule: "schedule",
      message: "command",
      rearm: "armed again, nobody at home"
    },
    via: (s) => s ? ` (${s})` : "",
    test: "\u{1F9EA} Test message from Home Guard",
    onOff: ["off", "on"]
  }
};
function texts(lang) {
  return lang === "de" ? T.de : T.en;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  texts
});
//# sourceMappingURL=texts.js.map
