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
var finder_exports = {};
__export(finder_exports, {
  findSensors: () => findSensors,
  sameDevices: () => sameDevices,
  sensorNote: () => sensorNote
});
module.exports = __toCommonJS(finder_exports);
var import_alarm = require("./alarm");
const ROLES = [
  [
    "24h",
    /^(sensor\.alarm\.(fire|flood|smoke|gas|water|heat|co)|sensor\.(smoke|water|leak|gas|heat|co)|indicator\.alarm\.(fire|flood))(\.|$)/
  ],
  ["interior", /^sensor\.(motion|occupancy)(\.|$)/],
  [
    "perimeter",
    /^(sensor\.(window|door|contact|open|glass|vibration|tilt)(\.|$)|value\.window$|sensor\.alarm\.secure$)/
  ]
];
const HM_TYPES = [
  [
    "perimeter",
    /^(HmIP-(SWDO(-I|-PL)?|SWDM(-B2)?|SRH|SCI|FCI[16]|STV|DSD-PCB)|HM-Sec-(SC(-2)?|SCo|RHS(-2)?|TiS|Sir))$/i
  ],
  ["interior", /^(HmIP-(SMI(55)?(-2)?|SMO(-A)?(-2)?|SPI)|HM-Sec-MDIR(-[23])?|HM-Sen-MDIR-(O(-2)?|SM|WM55))$/i],
  ["24h", /^(HmIP-(SWSD|SWD)|HM-Sec-(SD(-2)?|WDS(-2)?))$/i]
];
const HM_STATES = /^(STATE|MOTION|PRESENCE_DETECTION_STATE|SMOKE_DETECTOR_ALARM_STATUS|ALARMSTATE|WATERLEVEL_DETECTED|MOISTURE_DETECTED|WATER_DETECTED)$/;
const HM_ADAPTERS = /^(hm-rpc|hmip)$/;
const KNOWN_NAMES = [
  { adapter: /^(zigbee|zigbee2mqtt)$/, name: /^contact$/, circuit: "perimeter", invert: true },
  { adapter: /^(zigbee|zigbee2mqtt|deconz)$/, name: /^(vibration|open)$/, circuit: "perimeter" },
  {
    adapter: /^(zigbee|zigbee2mqtt|deconz|hue|hue-extended|shelly)$/,
    name: /^(occupancy|presence|motion)$/,
    circuit: "interior"
  },
  { adapter: /^(zigbee|zigbee2mqtt|deconz)$/, name: /^(smoke|water_leak|gas|fire|water)$/, circuit: "24h" }
];
const CAMERA_ADAPTERS = /^(reolink|hikvision|dahua|onvif|blink|ring|unifi-protect|unifiprotect|tapo|frigate|agent-dvr|eufy-security|motioneye|cameras|netatmo-crawler|tuya-camera)$/;
function text(n, lang) {
  if (typeof n === "string") {
    return n;
  }
  if (n && typeof n === "object") {
    const o = n;
    return String(o[lang] || o.en || o.de || Object.values(o)[0] || "");
  }
  return "";
}
function aliasTarget(o) {
  var _a, _b;
  const a = (_b = (_a = o == null ? void 0 : o.common) == null ? void 0 : _a.alias) == null ? void 0 : _b.id;
  if (typeof a === "string") {
    return [a];
  }
  return a ? [a.read, a.write].filter(Boolean) : [];
}
const parentOf = (id) => id.substring(0, id.lastIndexOf("."));
function findSensors(input) {
  var _a, _b, _c, _d, _e;
  const { objects, instances, ownAdapter, lang } = input;
  const thermostats = /* @__PURE__ */ new Set();
  const aliasOf = /* @__PURE__ */ new Map();
  for (const [id, o] of Object.entries(objects)) {
    if (o.type !== "state") {
      continue;
    }
    if (/^level\.temperature/.test(((_a = o.common) == null ? void 0 : _a.role) || "")) {
      thermostats.add(parentOf(id));
    }
    if (id.startsWith("alias.")) {
      for (const t of aliasTarget(o)) {
        aliasOf.set(t, id);
      }
    }
  }
  const rooms = /* @__PURE__ */ new Map();
  for (const [id, o] of Object.entries(objects)) {
    if (o.type === "enum" && id.startsWith("enum.rooms.")) {
      const name = text((_b = o.common) == null ? void 0 : _b.name, lang) || id.split(".").pop() || "";
      for (const m of ((_c = o.common) == null ? void 0 : _c.members) || []) {
        rooms.set(m, name);
      }
    }
  }
  const roomOf = (id) => {
    for (let p = id; p.includes("."); p = parentOf(p)) {
      const r = rooms.get(p);
      if (r) {
        return r;
      }
    }
    const target = aliasTarget(objects[id])[0];
    return target ? roomOf(target) : "";
  };
  const hmType = (id) => {
    var _a2, _b2;
    const parts = id.split(".");
    return parts.length >= 4 ? (_b2 = (_a2 = objects[parts.slice(0, 3).join(".")]) == null ? void 0 : _a2.native) == null ? void 0 : _b2.TYPE : void 0;
  };
  const noHmSensor = (id) => {
    const type = HM_ADAPTERS.test(id.split(".")[0]) ? hmType(id) : void 0;
    return !!type && !HM_TYPES.some(([, rx]) => rx.test(type));
  };
  const nameOf = (id) => {
    var _a2, _b2, _c2, _d2;
    const parent = objects[parentOf(id)];
    const ch = parent && (parent.type === "channel" || parent.type === "device") ? text((_a2 = parent.common) == null ? void 0 : _a2.name, lang).replace(/:\d+$/, "") : "";
    const folder = !ch && id.startsWith("alias.") && id.split(".").length > 3 ? text((_b2 = parent == null ? void 0 : parent.common) == null ? void 0 : _b2.name, lang) || parentOf(id).split(".").pop() || "" : "";
    const name = ch || folder || text((_d2 = (_c2 = objects[id]) == null ? void 0 : _c2.common) == null ? void 0 : _d2.name, lang) || id.split(".").pop() || id;
    const room = roomOf(id);
    return room && !name.toLowerCase().includes(room.toLowerCase()) ? `${room} \u2013 ${name}` : name;
  };
  const found = /* @__PURE__ */ new Map();
  for (const [id, o] of Object.entries(objects)) {
    if (o.type !== "state") {
      continue;
    }
    const [adapter, inst] = id.split(".");
    if (adapter === ownAdapter || adapter === "system") {
      continue;
    }
    if (!["alias", "0_userdata", "javascript"].includes(adapter) && instances[`${adapter}.${inst}`] !== true) {
      continue;
    }
    const role = ((_d = o.common) == null ? void 0 : _d.role) || "";
    const last = id.split(".").pop() || "";
    let circuit;
    let invert = false;
    const target = aliasTarget(o)[0];
    if (target && (thermostats.has(parentOf(target)) || noHmSensor(target))) {
      continue;
    }
    if (HM_ADAPTERS.test(adapter) && hmType(id)) {
      if (noHmSensor(id) || !HM_STATES.test(last)) {
        continue;
      }
      circuit = HM_TYPES.find(([, rx]) => rx.test(hmType(id)))[0];
    } else {
      circuit = (_e = ROLES.find(([, rx]) => rx.test(role))) == null ? void 0 : _e[0];
      if (!circuit) {
        const known = KNOWN_NAMES.find((k) => k.adapter.test(adapter) && k.name.test(last));
        if (known) {
          circuit = known.circuit;
          invert = !!known.invert;
        }
      }
    }
    if (!circuit || thermostats.has(parentOf(id))) {
      continue;
    }
    found.set(id, {
      id,
      circuit,
      motion: circuit === "interior",
      invert,
      camera: CAMERA_ADAPTERS.test(adapter) || /kamera|camera|\bcam\b/i.test(nameOf(id)),
      name: nameOf(id),
      target: aliasTarget(o)[0]
    });
  }
  for (const [target, alias] of aliasOf) {
    if (found.has(alias) && found.has(target)) {
      found.delete(target);
    }
  }
  const perChannel = /* @__PURE__ */ new Map();
  for (const s of [...found.values()].sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id))) {
    const key = `${parentOf(s.id)}|${s.circuit}`;
    if (!perChannel.has(key)) {
      perChannel.set(key, s);
    }
  }
  return [...perChannel.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
function sameDevices(ids, objects) {
  const out = /* @__PURE__ */ new Set();
  const aliasOf = /* @__PURE__ */ new Map();
  for (const [id, o] of Object.entries(objects)) {
    if (id.startsWith("alias.") && o.type === "state") {
      for (const t of aliasTarget(o)) {
        aliasOf.set(t, id);
      }
    }
  }
  for (const id of ids) {
    out.add(id);
    aliasTarget(objects[id]).forEach((t) => out.add(t));
    const alias = aliasOf.get(id);
    if (alias) {
      out.add(alias);
    }
  }
  return out;
}
function sensorNote(s, state, now, tr) {
  const parts = [];
  if (state && state.val !== null && state.val !== void 0) {
    const on = (0, import_alarm.isOpenValue)(state.val, s.invert);
    const word = s.circuit === "perimeter" ? tr(on ? "open" : "closed") : s.circuit === "interior" ? tr(on ? "motion" : "quiet") : on ? "ALARM" : "ok";
    parts.push(tr("now: %s", word));
  } else {
    parts.push(tr("no value yet"));
  }
  const days = (state == null ? void 0 : state.ts) ? Math.floor((now - state.ts) / 864e5) : -1;
  const stale = days >= 30;
  if (stale) {
    parts.push(tr("no report for %s days", days));
  }
  if (s.camera) {
    parts.push(tr("camera \u2013 often false alarms"));
  }
  if (s.invert) {
    parts.push(tr('reports "closed" as true \u2013 "inverted" ticked'));
  }
  return { note: parts.join(" \xB7 "), stale };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  findSensors,
  sameDevices,
  sensorNote
});
//# sourceMappingURL=finder.js.map
