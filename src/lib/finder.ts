// Setup assistant: finds sensors without functions - by role, by the device type of Homematic and by the state
// names of known adapters. Pure functions, the adapter only collects the objects and states.

import type { Tr } from './i18n';
import { isOpenValue } from './alarm';

/** area of a found sensor */
export type FoundCircuit = 'perimeter' | 'interior' | '24h';

/** an object as the search needs it */
export interface FinderObject {
	type: string;
	common?: {
		role?: string;
		name?: unknown;
		members?: string[];
		alias?: { id?: string | { read?: string; write?: string } };
	};
	native?: { TYPE?: string };
}

/** what the search gets from the adapter */
export interface FinderInput {
	/** states, channels, devices and the room enums */
	objects: Record<string, FinderObject>;
	/** adapter instances (e.g. "hm-rpc.0") and whether they are enabled */
	instances: Record<string, boolean>;
	/** own adapter name: states of all its instances are left out */
	ownAdapter: string;
	/** language for names */
	lang: string;
}

/** a found sensor */
export interface FoundSensor {
	id: string;
	circuit: FoundCircuit;
	motion: boolean;
	/** reports "closed" as true (Zigbee contact) */
	invert: boolean;
	/** motion of a camera: often false alarms */
	camera: boolean;
	/** room and name, e.g. "Küche – Fenster 1" */
	name: string;
	/** the alias it points to, or the alias pointing to it */
	target?: string;
}

/** roles of real sensors per area (official roles plus the usual ones of the adapters) */
const ROLES: [FoundCircuit, RegExp][] = [
	[
		'24h',
		/^(sensor\.alarm\.(fire|flood|smoke|gas|water|heat|co)|sensor\.(smoke|water|leak|gas|heat|co)|indicator\.alarm\.(fire|flood))(\.|$)/,
	],
	['interior', /^sensor\.(motion|occupancy)(\.|$)/],
	[
		'perimeter',
		/^(sensor\.(window|door|contact|open|glass|vibration|tilt)(\.|$)|value\.window$|sensor\.alarm\.secure$)/,
	],
];

/** Homematic device types (native.TYPE of the device): the type decides, not the role */
const HM_TYPES: [FoundCircuit, RegExp][] = [
	[
		'perimeter',
		/^(HmIP-(SWDO(-I|-PL)?|SWDM(-B2)?|SRH|SCI|FCI[16]|STV|DSD-PCB)|HM-Sec-(SC(-2)?|SCo|RHS(-2)?|TiS|Sir))$/i,
	],
	['interior', /^(HmIP-(SMI(55)?(-2)?|SMO(-A)?(-2)?|SPI)|HM-Sec-MDIR(-[23])?|HM-Sen-MDIR-(O(-2)?|SM|WM55))$/i],
	['24h', /^(HmIP-(SWSD|SWD)|HM-Sec-(SD(-2)?|WDS(-2)?))$/i],
];
/** state names of these Homematic devices that carry the sensor value */
const HM_STATES =
	/^(STATE|MOTION|PRESENCE_DETECTION_STATE|SMOKE_DETECTOR_ALARM_STATUS|ALARMSTATE|WATERLEVEL_DETECTED|MOISTURE_DETECTED|WATER_DETECTED)$/;
const HM_ADAPTERS = /^(hm-rpc|hmip)$/;

/** state names of adapters whose roles are not good enough */
const KNOWN_NAMES: { adapter: RegExp; name: RegExp; circuit: FoundCircuit; invert?: boolean }[] = [
	{ adapter: /^(zigbee|zigbee2mqtt)$/, name: /^contact$/, circuit: 'perimeter', invert: true },
	{ adapter: /^(zigbee|zigbee2mqtt|deconz)$/, name: /^(vibration|open)$/, circuit: 'perimeter' },
	{
		adapter: /^(zigbee|zigbee2mqtt|deconz|hue|hue-extended|shelly)$/,
		name: /^(occupancy|presence|motion)$/,
		circuit: 'interior',
	},
	{ adapter: /^(zigbee|zigbee2mqtt|deconz)$/, name: /^(smoke|water_leak|gas|fire|water)$/, circuit: '24h' },
];

/** adapters of cameras: their motion is often wind, rain or insects */
const CAMERA_ADAPTERS =
	/^(reolink|hikvision|dahua|onvif|blink|ring|unifi-protect|unifiprotect|tapo|frigate|agent-dvr|eufy-security|motioneye|cameras|netatmo-crawler|tuya-camera)$/;

/**
 * Text of a name in the wanted language
 *
 * @param n common.name
 * @param lang language
 */
function text(n: unknown, lang: string): string {
	if (typeof n === 'string') {
		return n;
	}
	if (n && typeof n === 'object') {
		const o = n as Record<string, string>;
		return String(o[lang] || o.en || o.de || Object.values(o)[0] || '');
	}
	return '';
}

/**
 * The target of an alias state
 *
 * @param o alias object
 */
function aliasTarget(o: FinderObject | undefined): string[] {
	const a = o?.common?.alias?.id;
	if (typeof a === 'string') {
		return [a];
	}
	return a ? ([a.read, a.write].filter(Boolean) as string[]) : [];
}

const parentOf = (id: string): string => id.substring(0, id.lastIndexOf('.'));

/**
 * Finds the sensors of the installation
 *
 * @param input objects, instances, own adapter, language
 */
export function findSensors(input: FinderInput): FoundSensor[] {
	const { objects, instances, ownAdapter, lang } = input;
	// thermostats: a temperature set point in the same channel (their WINDOW_STATE is no contact)
	const thermostats = new Set<string>();
	// targets of aliases and the alias pointing to them
	const aliasOf = new Map<string, string>();
	for (const [id, o] of Object.entries(objects)) {
		if (o.type !== 'state') {
			continue;
		}
		if (/^level\.temperature/.test(o.common?.role || '')) {
			thermostats.add(parentOf(id));
		}
		if (id.startsWith('alias.')) {
			for (const t of aliasTarget(o)) {
				aliasOf.set(t, id);
			}
		}
	}
	// rooms: a room holds a state, its channel or its device
	const rooms = new Map<string, string>();
	for (const [id, o] of Object.entries(objects)) {
		if (o.type === 'enum' && id.startsWith('enum.rooms.')) {
			const name = text(o.common?.name, lang) || id.split('.').pop() || '';
			for (const m of o.common?.members || []) {
				rooms.set(m, name);
			}
		}
	}
	const roomOf = (id: string): string => {
		for (let p = id; p.includes('.'); p = parentOf(p)) {
			const r = rooms.get(p);
			if (r) {
				return r;
			}
		}
		const target = aliasTarget(objects[id])[0];
		return target ? roomOf(target) : '';
	};
	// device of a Homematic state: hm-rpc.0.SERIAL.1.STATE -> hm-rpc.0.SERIAL
	const hmType = (id: string): string | undefined => {
		const parts = id.split('.');
		return parts.length >= 4 ? objects[parts.slice(0, 3).join('.')]?.native?.TYPE : undefined;
	};
	// a Homematic state of a known device that is no sensor (thermostat, switch actuator, ...)
	const noHmSensor = (id: string): boolean => {
		const type = HM_ADAPTERS.test(id.split('.')[0]) ? hmType(id) : undefined;
		return !!type && !HM_TYPES.some(([, rx]) => rx.test(type));
	};
	// a readable name: the channel or device it belongs to (without the ":1" of Homematic), else the state itself
	const nameOf = (id: string): string => {
		const parent = objects[parentOf(id)];
		const ch =
			parent && (parent.type === 'channel' || parent.type === 'device')
				? text(parent.common?.name, lang).replace(/:\d+$/, '')
				: '';
		// an alias in a folder: the folder says what it is (alias.0.Flur.BWM_Treppe.Ausgeloest -> BWM_Treppe)
		const folder =
			!ch && id.startsWith('alias.') && id.split('.').length > 3
				? text(parent?.common?.name, lang) || parentOf(id).split('.').pop() || ''
				: '';
		const name = ch || folder || text(objects[id]?.common?.name, lang) || id.split('.').pop() || id;
		const room = roomOf(id);
		return room && !name.toLowerCase().includes(room.toLowerCase()) ? `${room} – ${name}` : name;
	};

	const found = new Map<string, FoundSensor>();
	for (const [id, o] of Object.entries(objects)) {
		if (o.type !== 'state') {
			continue;
		}
		const [adapter, inst] = id.split('.');
		if (adapter === ownAdapter || adapter === 'system') {
			continue;
		}
		// dead: adapter deleted or switched off (aliases and own states have no instance)
		if (!['alias', '0_userdata', 'javascript'].includes(adapter) && instances[`${adapter}.${inst}`] !== true) {
			continue;
		}
		const role = o.common?.role || '';
		const last = id.split('.').pop() || '';
		let circuit: FoundCircuit | undefined;
		let invert = false;
		// an alias is judged by what it points to as well: an alias of a thermostat window or a switch actuator
		const target = aliasTarget(o)[0];
		if (target && (thermostats.has(parentOf(target)) || noHmSensor(target))) {
			continue;
		}
		if (HM_ADAPTERS.test(adapter) && hmType(id)) {
			// Homematic: the device type decides (a switch actuator with the role sensor.window is no window)
			if (noHmSensor(id) || !HM_STATES.test(last)) {
				continue;
			}
			circuit = HM_TYPES.find(([, rx]) => rx.test(hmType(id)!))![0];
		} else {
			circuit = ROLES.find(([, rx]) => rx.test(role))?.[0];
			if (!circuit) {
				const known = KNOWN_NAMES.find(k => k.adapter.test(adapter) && k.name.test(last));
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
			motion: circuit === 'interior',
			invert,
			camera: CAMERA_ADAPTERS.test(adapter) || /kamera|camera|\bcam\b/i.test(nameOf(id)),
			name: nameOf(id),
			target: aliasTarget(o)[0],
		});
	}
	// aliases win over their targets - but only if the alias itself was found (a wrong role at the alias would
	// otherwise hide the device completely)
	for (const [target, alias] of aliasOf) {
		if (found.has(alias) && found.has(target)) {
			found.delete(target);
		}
	}
	// one per channel and area: WINDOW_STATE and WINDOW_STATE_2 are the same contact
	const perChannel = new Map<string, FoundSensor>();
	for (const s of [...found.values()].sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id))) {
		const key = `${parentOf(s.id)}|${s.circuit}`;
		if (!perChannel.has(key)) {
			perChannel.set(key, s);
		}
	}
	return [...perChannel.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Ids that stand for the same device: the id itself, the target of an alias and an alias pointing to it
 *
 * @param ids ids (e.g. the states of a function)
 * @param objects all objects
 */
export function sameDevices(ids: Iterable<string>, objects: Record<string, FinderObject>): Set<string> {
	const out = new Set<string>();
	const aliasOf = new Map<string, string>();
	for (const [id, o] of Object.entries(objects)) {
		if (id.startsWith('alias.') && o.type === 'state') {
			for (const t of aliasTarget(o)) {
				aliasOf.set(t, id);
			}
		}
	}
	for (const id of ids) {
		out.add(id);
		aliasTarget(objects[id]).forEach(t => out.add(t));
		const alias = aliasOf.get(id);
		if (alias) {
			out.add(alias);
		}
	}
	return out;
}

/**
 * Note for the table: value at the time of the search, camera, last report
 *
 * @param s found sensor
 * @param state its state (value and time of the last report)
 * @param now current time
 * @param tr translation function
 */
export function sensorNote(
	s: FoundSensor,
	state: { val: unknown; ts?: number; lc?: number } | null | undefined,
	now: number,
	tr: Tr,
): { note: string; stale: boolean } {
	const parts: string[] = [];
	if (state && state.val !== null && state.val !== undefined) {
		const on = isOpenValue(state.val, s.invert);
		const word =
			s.circuit === 'perimeter'
				? tr(on ? 'open' : 'closed')
				: s.circuit === 'interior'
					? tr(on ? 'motion' : 'quiet')
					: on
						? 'ALARM'
						: 'ok';
		parts.push(tr('now: %s', word));
	} else {
		parts.push(tr('no value yet'));
	}
	const days = state?.ts ? Math.floor((now - state.ts) / 86_400_000) : -1;
	const stale = days >= 30;
	if (stale) {
		parts.push(tr('no report for %s days', days));
	}
	if (s.camera) {
		parts.push(tr('camera – often false alarms'));
	}
	if (s.invert) {
		parts.push(tr('reports "closed" as true – "inverted" ticked'));
	}
	return { note: parts.join(' · '), stale };
}
