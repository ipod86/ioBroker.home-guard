/**
 * The messengers this adapter sends to directly, each in its own format. Only these are offered in the settings
 * (and only when an instance is installed); everything else is reached via the ioBroker notification system.
 *
 * Fields of a row: user, chatId, phone, to, device, channel - which one a messenger uses is listed in `fields`.
 * Keep identical to openmeteo-notify lib/messengers.js.
 */

/** row of the notification table */
export interface MessengerRow {
	instance: string;
	enabled?: boolean;
	user?: string;
	chatId?: string;
	phone?: string;
	to?: string;
	device?: string;
	channel?: string;
}
/** fields a messenger can use */
export type MessengerField = 'user' | 'chatId' | 'phone' | 'to' | 'device' | 'channel';
/** one message */
export interface MessengerMessage {
	title: string;
	text: string;
	alert: boolean;
}
/** what the module needs from the adapter */
export interface MessengerHost {
	sendTo(instance: string, command: string, message: unknown): void;
	setForeignStateAsync(id: string, value: string, ack: boolean): Promise<unknown>;
}

interface MessengerDef {
	name: string;
	fields: MessengerField[];
	/** fields that must be filled; "a|b" = one of both */
	required?: string[];
	send: (host: MessengerHost, inst: string, row: MessengerRow, m: MessengerMessage) => Promise<void> | void;
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
/**
 * text with the sender in front, for messengers without a title of their own
 *
 * @param m message
 */
const titled = (m: MessengerMessage): string => (m.text.startsWith(m.title) ? m.text : `${m.title}: ${m.text}`);

/** supported messengers by adapter name */
export const MESSENGERS: Record<string, MessengerDef> = {
	telegram: {
		name: 'Telegram',
		fields: ['user', 'chatId'],
		send: (host, inst, row, m) => {
			const p: Record<string, unknown> = { text: m.text };
			if (s(row.user)) {
				p.user = s(row.user);
			}
			if (s(row.chatId)) {
				p.chatId = s(row.chatId);
			}
			host.sendTo(inst, 'send', p);
		},
	},
	email: {
		name: 'E-Mail',
		fields: ['to'],
		send: (host, inst, row, m) => {
			const p: Record<string, unknown> = {
				subject: `${m.title}: ${m.text.split('\n')[0].substring(0, 70)}`,
				text: m.text,
			};
			if (s(row.to)) {
				p.to = s(row.to);
			}
			host.sendTo(inst, 'send', p);
		},
	},
	pushover: {
		name: 'Pushover',
		fields: ['device'],
		send: (host, inst, row, m) => {
			const p: Record<string, unknown> = { message: m.text, title: m.title, priority: m.alert ? 1 : 0 };
			if (s(row.device)) {
				p.device = s(row.device);
			}
			host.sendTo(inst, 'send', p);
		},
	},
	pushsafer: {
		name: 'Pushsafer',
		fields: ['device'],
		send: (host, inst, row, m) => {
			const p: Record<string, unknown> = { message: m.text, title: m.title, priority: m.alert ? '2' : '0' };
			if (s(row.device)) {
				p.device = s(row.device);
			}
			host.sendTo(inst, 'send', p);
		},
	},
	gotify: {
		name: 'Gotify',
		fields: [],
		send: (host, inst, _row, m) => {
			host.sendTo(inst, 'send', { title: m.title, message: m.text, priority: m.alert ? 8 : 5 });
		},
	},
	'whatsapp-cmb': {
		name: 'WhatsApp (CallMeBot)',
		fields: ['phone'],
		send: (host, inst, row, m) => {
			const p: Record<string, unknown> = { text: titled(m) };
			if (s(row.phone)) {
				p.phone = s(row.phone);
			}
			host.sendTo(inst, 'send', p);
		},
	},
	'signal-cmb': {
		name: 'Signal (CallMeBot)',
		fields: ['phone'],
		send: (host, inst, row, m) => {
			const p: Record<string, unknown> = { text: titled(m) };
			if (s(row.phone)) {
				p.phone = s(row.phone);
			}
			host.sendTo(inst, 'send', p);
		},
	},
	gsmsms: {
		name: 'SMS (GSM-Modem)',
		fields: ['phone'],
		required: ['phone'],
		send: (host, inst, row, m) => {
			host.sendTo(inst, 'send', { text: titled(m), recipient: s(row.phone), alert: false });
		},
	},
	discord: {
		name: 'Discord',
		fields: ['user', 'channel'],
		required: ['user|channel'],
		send: (host, inst, row, m) => {
			const p: Record<string, unknown> = { content: `**${m.title}**\n${m.text}` };
			const user = s(row.user);
			const channel = s(row.channel);
			if (channel) {
				// "serverId/channelId"
				const [serverId, channelId] = channel.split(/[/\s]+/);
				p.serverId = serverId;
				p.channelId = channelId;
			} else if (/^\d+$/.test(user)) {
				p.userId = user;
			} else if (user.includes('#')) {
				p.userTag = user;
			} else {
				p.userName = user;
			}
			host.sendTo(inst, 'sendMessage', p);
		},
	},
	max: {
		name: 'MAX',
		fields: ['user'],
		send: (host, inst, row, m) => {
			const text = titled(m);
			host.sendTo(inst, 'send', s(row.user) ? { userId: s(row.user), text } : text);
		},
	},
	iot: {
		name: 'ioBroker Visu App (iot)',
		fields: ['device'],
		send: async (host, inst, row, m) => {
			const p: Record<string, unknown> = {
				message: m.text,
				title: m.title,
				priority: m.alert ? 'high' : 'normal',
			};
			const devices = s(row.device)
				.split(',')
				.map(d => d.trim())
				.filter(Boolean);
			if (devices.length) {
				p.devices = JSON.stringify(devices);
			}
			await host.setForeignStateAsync(`${inst}.app.message`, JSON.stringify(p), false);
		},
	},
	synochat: {
		name: 'Synology Chat',
		fields: ['channel'],
		required: ['channel'],
		send: async (host, inst, row, m) => {
			await host.setForeignStateAsync(`${inst}.${s(row.channel)}.message`, titled(m), false);
		},
	},
};

/**
 * The adapter name of an instance, e.g. "telegram" for "telegram.0"
 *
 * @param inst instance id
 */
export function adapterOf(inst: string): string {
	return s(inst)
		.replace(/^system\.adapter\./, '')
		.replace(/\.\d+$/, '');
}

/**
 * Sends one message to one row of the messenger table; rejects with a readable reason
 * (unsupported messenger, missing field)
 *
 * @param host the adapter
 * @param row table row
 * @param m message
 */
export async function sendToMessenger(host: MessengerHost, row: MessengerRow, m: MessengerMessage): Promise<void> {
	const inst = s(row.instance);
	const def = MESSENGERS[adapterOf(inst)];
	if (!def) {
		throw new Error(`${inst} is not supported - use the ioBroker notification system for it`);
	}
	for (const req of def.required || []) {
		if (!req.split('|').some(f => s(row[f as MessengerField]))) {
			throw new Error(`${inst}: please fill in ${req.replace('|', ' or ')}`);
		}
	}
	await def.send(host, inst, row, m);
}

/**
 * Installed instances of the supported messengers, for the selection in the settings
 *
 * @param instanceIds ids of all instances (with or without "system.adapter.")
 */
export function listMessengers(instanceIds: string[]): { value: string; label: string }[] {
	return instanceIds
		.map(id => id.replace('system.adapter.', ''))
		.filter(id => MESSENGERS[adapterOf(id)])
		.sort((a, b) => a.localeCompare(b))
		.map(id => ({ value: id, label: `${MESSENGERS[adapterOf(id)].name} (${id})` }));
}
