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
var i18n_exports = {};
__export(i18n_exports, {
  fill: () => fill,
  loadTr: () => loadTr,
  trEn: () => trEn
});
module.exports = __toCommonJS(i18n_exports);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
function fill(text, args) {
  let i = 0;
  return text.replace(/%s/g, () => {
    var _a;
    return String((_a = args[i++]) != null ? _a : "");
  });
}
const trEn = (en, ...args) => fill(en, args);
function loadTr(lang, dir) {
  let dict = {};
  try {
    dict = JSON.parse((0, import_node_fs.readFileSync)((0, import_node_path.join)(dir, `${lang}.json`), "utf8"));
  } catch {
    dict = {};
  }
  return (en, ...args) => fill(dict[en] || en, args);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  fill,
  loadTr,
  trEn
});
//# sourceMappingURL=i18n.js.map
