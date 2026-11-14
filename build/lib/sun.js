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
var sun_exports = {};
__export(sun_exports, {
  sunTimes: () => sunTimes
});
module.exports = __toCommonJS(sun_exports);
const rad = Math.PI / 180;
function sunTimes(date, lat, lon) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const start = new Date(day.getFullYear(), 0, 0, 12, 0, 0);
  const n = Math.round((day.getTime() - start.getTime()) / 864e5);
  const g = 2 * Math.PI / 365 * (n - 1);
  const eqTime = 229.18 * (75e-6 + 1868e-6 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 6918e-6 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 6758e-6 * Math.cos(2 * g) + 907e-6 * Math.sin(2 * g) - 2697e-6 * Math.cos(3 * g) + 148e-5 * Math.sin(3 * g);
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) {
    return null;
  }
  const ha = Math.acos(cosHa) / rad;
  const riseMin = 720 - 4 * (lon + ha) - eqTime;
  const setMin = 720 - 4 * (lon - ha) - eqTime;
  const utcMidnight = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  return { sunrise: utcMidnight + riseMin * 6e4, sunset: utcMidnight + setMin * 6e4 };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  sunTimes
});
//# sourceMappingURL=sun.js.map
