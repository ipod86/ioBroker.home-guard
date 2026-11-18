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
var messengers_exports = {};
__export(messengers_exports, {
  MESSENGERS: () => MESSENGERS,
  adapterOf: () => adapterOf,
  listMessengers: () => listMessengers,
  sendToMessenger: () => sendToMessenger
});
module.exports = __toCommonJS(messengers_exports);
const s = (v) => typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const titled = (m) => m.text.startsWith(m.title) ? m.text : `${m.title}: ${m.text}`;
const MESSENGERS = {
  telegram: {
    name: "Telegram",
    fields: ["user", "chatId"],
    send: (host, inst, row, m) => {
      const p = { text: m.text };
      if (s(row.user)) {
        p.user = s(row.user);
      }
      if (s(row.chatId)) {
        p.chatId = s(row.chatId);
      }
      host.sendTo(inst, "send", p);
    }
  },
  email: {
    name: "E-Mail",
    fields: ["to"],
    send: (host, inst, row, m) => {
      const p = {
        subject: `${m.title}: ${m.text.split("\n")[0].substring(0, 70)}`,
        text: m.text
      };
      if (s(row.to)) {
        p.to = s(row.to);
      }
      host.sendTo(inst, "send", p);
    }
  },
  pushover: {
    name: "Pushover",
    fields: ["device"],
    send: (host, inst, row, m) => {
      const p = { message: m.text, title: m.title, priority: m.alert ? 1 : 0 };
      if (s(row.device)) {
        p.device = s(row.device);
      }
      host.sendTo(inst, "send", p);
    }
  },
  pushsafer: {
    name: "Pushsafer",
    fields: ["device"],
    send: (host, inst, row, m) => {
      const p = { message: m.text, title: m.title, priority: m.alert ? "2" : "0" };
      if (s(row.device)) {
        p.device = s(row.device);
      }
      host.sendTo(inst, "send", p);
    }
  },
  gotify: {
    name: "Gotify",
    fields: [],
    send: (host, inst, _row, m) => {
      host.sendTo(inst, "send", { title: m.title, message: m.text, priority: m.alert ? 8 : 5 });
    }
  },
  "whatsapp-cmb": {
    name: "WhatsApp (CallMeBot)",
    fields: ["phone"],
    send: (host, inst, row, m) => {
      const p = { text: titled(m) };
      if (s(row.phone)) {
        p.phone = s(row.phone);
      }
      host.sendTo(inst, "send", p);
    }
  },
  "signal-cmb": {
    name: "Signal (CallMeBot)",
    fields: ["phone"],
    send: (host, inst, row, m) => {
      const p = { text: titled(m) };
      if (s(row.phone)) {
        p.phone = s(row.phone);
      }
      host.sendTo(inst, "send", p);
    }
  },
  gsmsms: {
    name: "SMS (GSM-Modem)",
    fields: ["phone"],
    required: ["phone"],
    send: (host, inst, row, m) => {
      host.sendTo(inst, "send", { text: titled(m), recipient: s(row.phone), alert: false });
    }
  },
  discord: {
    name: "Discord",
    fields: ["user", "channel"],
    required: ["user|channel"],
    send: (host, inst, row, m) => {
      const p = { content: `**${m.title}**
${m.text}` };
      const user = s(row.user);
      const channel = s(row.channel);
      if (channel) {
        const [serverId, channelId] = channel.split(/[/\s]+/);
        p.serverId = serverId;
        p.channelId = channelId;
      } else if (/^\d+$/.test(user)) {
        p.userId = user;
      } else if (user.includes("#")) {
        p.userTag = user;
      } else {
        p.userName = user;
      }
      host.sendTo(inst, "sendMessage", p);
    }
  },
  max: {
    name: "MAX",
    fields: ["user"],
    send: (host, inst, row, m) => {
      const text = titled(m);
      host.sendTo(inst, "send", s(row.user) ? { userId: s(row.user), text } : text);
    }
  },
  iot: {
    name: "ioBroker Visu App (iot)",
    fields: ["device"],
    send: async (host, inst, row, m) => {
      const p = {
        message: m.text,
        title: m.title,
        priority: m.alert ? "high" : "normal"
      };
      const devices = s(row.device).split(",").map((d) => d.trim()).filter(Boolean);
      if (devices.length) {
        p.devices = JSON.stringify(devices);
      }
      await host.setForeignStateAsync(`${inst}.app.message`, JSON.stringify(p), false);
    }
  },
  synochat: {
    name: "Synology Chat",
    fields: ["channel"],
    required: ["channel"],
    send: async (host, inst, row, m) => {
      await host.setForeignStateAsync(`${inst}.${s(row.channel)}.message`, titled(m), false);
    }
  }
};
function adapterOf(inst) {
  return s(inst).replace(/^system\.adapter\./, "").replace(/\.\d+$/, "");
}
async function sendToMessenger(host, row, m) {
  const inst = s(row.instance);
  const def = MESSENGERS[adapterOf(inst)];
  if (!def) {
    throw new Error(`${inst} is not supported - use the ioBroker notification system for it`);
  }
  for (const req of def.required || []) {
    if (!req.split("|").some((f) => s(row[f]))) {
      throw new Error(`${inst}: please fill in ${req.replace("|", " or ")}`);
    }
  }
  await def.send(host, inst, row, m);
}
function listMessengers(instanceIds) {
  return instanceIds.map((id) => id.replace("system.adapter.", "")).filter((id) => MESSENGERS[adapterOf(id)]).sort((a, b) => a.localeCompare(b)).map((id) => ({ value: id, label: `${MESSENGERS[adapterOf(id)].name} (${id})` }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MESSENGERS,
  adapterOf,
  listMessengers,
  sendToMessenger
});
//# sourceMappingURL=messengers.js.map
