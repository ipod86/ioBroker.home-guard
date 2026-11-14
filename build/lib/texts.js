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
    openWarning: (m, list) => `\u26A0\uFE0F ${m} scharf, aber offen: ${list}`,
    entry: (name, sec) => `\u{1F6AA} ${name} ge\xF6ffnet \u2013 bitte innerhalb von ${sec} Sekunden entsch\xE4rfen`,
    alarm: (name) => `\u{1F6A8} ALARM: ${name}`,
    panic: (src) => `\u{1F6A8} PANIK-ALARM ausgel\xF6st (${src})`,
    alarmEnd: (src) => `\u2705 Alarm beendet${src}`,
    wrongPin: (n) => `\u{1F522} ${n}\xD7 falsche PIN eingegeben`,
    sabotage: (list) => `\u{1F50B} Keine Meldung mehr von: ${list}`,
    simStart: "\u{1F4A1} Anwesenheitssimulation gestartet",
    simStop: "\u{1F4A1} Anwesenheitssimulation beendet",
    title: "Alarmanlage",
    testPrefix: "\u{1F9EA} TEST \u2013 ",
    testTrigger: "Testausl\xF6ser",
    testEnd: "\u{1F9EA} Test beendet",
    testBusy: "Gerade l\xE4uft ein echter Alarm oder eine Eingangsverz\xF6gerung \u2013 kein Test m\xF6glich",
    testNothing: "Nichts zu testen \u2013 f\xFCr die angehakten Teile ist nichts eingerichtet",
    testRunning: (s, list) => `Test l\xE4uft ${s} s: ${list}`,
    testParts: {
      notify: "Benachrichtigungen",
      speech: "Sprachausgabe",
      lamps: (n) => `${n} Lampe${n === 1 ? "" : "n"}`,
      sirens: (n) => `${n} Sirene${n === 1 ? "" : "n"}`,
      actions: (n) => `${n} Aktion${n === 1 ? "" : "en"}`
    },
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
      message: "Befehl"
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
    openWarning: (m, list) => `\u26A0\uFE0F ${m} armed, but open: ${list}`,
    entry: (name, sec) => `\u{1F6AA} ${name} opened \u2013 please disarm within ${sec} seconds`,
    alarm: (name) => `\u{1F6A8} ALARM: ${name}`,
    panic: (src) => `\u{1F6A8} PANIC alarm triggered (${src})`,
    alarmEnd: (src) => `\u2705 Alarm ended${src}`,
    wrongPin: (n) => `\u{1F522} Wrong PIN entered ${n} times`,
    sabotage: (list) => `\u{1F50B} No more reports from: ${list}`,
    simStart: "\u{1F4A1} Presence simulation started",
    simStop: "\u{1F4A1} Presence simulation stopped",
    title: "Alarm system",
    testPrefix: "\u{1F9EA} TEST \u2013 ",
    testTrigger: "test trigger",
    testEnd: "\u{1F9EA} Test finished",
    testBusy: "A real alarm or entry delay is running \u2013 no test possible",
    testNothing: "Nothing to test \u2013 nothing is set up for the ticked parts",
    testRunning: (s, list) => `Test running for ${s} s: ${list}`,
    testParts: {
      notify: "notifications",
      speech: "speech output",
      lamps: (n) => `${n} lamp${n === 1 ? "" : "s"}`,
      sirens: (n) => `${n} siren${n === 1 ? "" : "s"}`,
      actions: (n) => `${n} action${n === 1 ? "" : "s"}`
    },
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
      message: "command"
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
