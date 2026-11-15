/*
 * Home Guard – alarm system & presence simulation for ioBroker
 */
import * as utils from '@iobroker/adapter-core';
import {
	AlarmEngine,
	isOpenValue,
	type AlarmEvent,
	type AlarmStatus,
	type EventInfo,
	type Mode,
	type SensorDef,
} from './lib/alarm';
import {
	Learner,
	SimRunner,
	eveningKey,
	eveningNoon,
	planEvening,
	type Learned,
	type LampType,
	type PlanStep,
	type SimLamp,
} from './lib/simulation';
import type { SimLampRow } from './lib/adapter-config';
import { WIZARD_DEFAULTS, bestEnum, nextStep, type EnumInfo, type ScanKind } from './lib/wizard';
import { sunTimes } from './lib/sun';
import { texts, type Texts } from './lib/texts';

const MODES: Mode[] = ['off', 'full', 'perimeter', 'night'];
/**
 * Messengers whose "send" command is known: they get the short text in their own format. Every other instance whose
 * adapter declares common.supportedMessages.notifications gets the standard "sendNotification" of the notification
 * manager and formats it itself (gotify, discord, iot, gsmsms, ...).
 */
const SEND_FORMAT: Record<string, (text: string) => Record<string, unknown>> = {
	telegram: text => ({ text }),
	pushover: text => ({ message: text, title: 'Home Guard' }),
	email: text => ({ text, subject: `Home Guard: ${text.substring(0, 60)}` }),
	'whatsapp-cmb': text => ({ text }),
	'signal-cmb': text => ({ text }),
	pushsafer: text => ({ message: text, title: 'Home Guard' }),
};
type LightSwitch = 'eveningOn' | 'eveningOff' | 'morningOn' | 'morningOff';
const LIGHT_SWITCHES: LightSwitch[] = ['eveningOn', 'eveningOff', 'morningOn', 'morningOff'];
/** former settings of the instance configuration, taken over once by a new instance */
const LIGHT_CONFIG: Record<LightSwitch, string> = {
	eveningOn: 'eveningLightOn',
	eveningOff: 'eveningLightOff',
	morningOn: 'morningLightOn',
	morningOff: 'morningLightOff',
};
/**
 * roles of a row of the lamp table
 *
 * @param row table row
 */
function rowRoles(row: SimLampRow): Set<LampType> {
	if (row.type === 'device') {
		return new Set<LampType>(['device']);
	}
	if (row.type && row.type !== 'lamp') {
		return new Set<LampType>([row.type]); // not migrated yet
	}
	const roles = new Set<LampType>();
	for (const r of ['evening', 'morning', 'visit', 'bedtime'] as const) {
		if (row[r]) {
			roles.add(r);
		}
	}
	return roles;
}

const LEARN_IGNORE = /^system\.adapter\.(javascript|scenes|node-red|home-guard)\./;

interface LampOut {
	id: string;
	prev: ioBroker.StateValue;
	on: ioBroker.StateValue;
	off: ioBroker.StateValue;
}

/**
 * Home Guard adapter
 */
class HomeGuard extends utils.Adapter {
	private T: Texts = texts('en');
	private sysLang = 'en';
	private lat = 51;
	private lon = 10;
	private alarm!: AlarmEngine;
	private sim!: SimRunner;
	private evening!: SimRunner;
	private eveningLogged = '';
	private learner = new Learner();
	private sensorIds = new Set<string>();
	private presenceIds: string[] = [];
	private presenceVals = new Map<string, boolean>();
	private personOf = new Map<string, string>();
	private autoArm = true;
	private simLamps: SimLamp[] = [];
	private simLampVals = new Map<string, boolean>();
	private learnFrom = new Map<string, string>(); // learn source state -> simulation lamp
	private learnFromVals = new Map<string, boolean>();
	/** switches of the evening and morning light (control.eveningOn …), all on for a new instance */
	private lightSw: Record<LightSwitch, boolean> = {
		eveningOn: true,
		eveningOff: true,
		morningOn: true,
		morningOff: true,
	};
	private stopOff = new Map<string, boolean>(); // simulation lamp -> switch off when the simulation ends
	private lampOuts: LampOut[] = [];
	private blinkTimer: ioBroker.Interval | undefined;
	private blinkOn = false;
	private repeatTimer: ioBroker.Interval | undefined;
	private test: {
		timer: ioBroker.Timeout | undefined;
		lamps: LampOut[];
		sirens: boolean;
		actions: boolean;
		blink?: ioBroker.Interval;
	} | null = null;
	private minuteTimer: ioBroker.Interval | undefined;
	private rescanTimer: ioBroker.Timeout | undefined;
	private wrongPin = 0;
	private pinLockedUntil = 0;
	private pinError = 'wrong pin';
	private outputsOn = false;
	private sirenTimers: (ioBroker.Timeout | undefined)[] = [];
	private log_: { ts: number; type: string; text: string }[] = [];
	private luxDuskTs = 0;
	private luxBrightTs = 0; // it became bright this morning (lux sensor): morning lamps off
	private lastSimActive = false;
	private simRestoring = true;
	private started = false;
	private lastMinute = '';
	private sabotageKnown = new Set<string>();
	private learnSaveTimer: ioBroker.Timeout | undefined;
	private lastStatusJson = '';

	/**
	 * Creates the adapter
	 *
	 * @param options adapter options
	 */
	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({ ...options, name: 'home-guard' });
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('objectChange', this.onObjectChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	// ======================================================================
	// start
	// ======================================================================

	/**
	 * Start: settings, sensors, presence, lamps, subscriptions, timers
	 */
	private async onReady(): Promise<void> {
		const c = this.config;
		const sys = await this.getForeignObjectAsync('system.config');
		const lang = sys?.common?.language || 'en';
		this.sysLang = lang;
		this.T = texts(lang);
		// lamp table of an older version (one type per row): turned into roles, the instance restarts with it
		if (await this.migrateSimLamps()) {
			return;
		}
		// an instance that was set up before the assistant existed shows all tabs at once
		if (!c.wizDone && !(Number(c.wizStep) > 0) && this.looksConfigured()) {
			await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, { native: { wizDone: true } });
			return;
		}

		// state of the last run - read first: setting up the sensors already writes the status (still "off")
		const lastMode = (await this.getStateAsync('status.mode'))?.val as Mode;
		const lastAlarm = (await this.getStateAsync('status.alarm'))?.val === true;
		const trigger = String((await this.getStateAsync('status.lastTrigger'))?.val || '');
		this.lat = Number(sys?.common?.latitude) || 51;
		this.lon = Number(sys?.common?.longitude) || 10;

		// logbook and learned days from the last run
		this.log_ = this.parseJson((await this.getStateAsync('status.log'))?.val, []);
		const learned = this.parseJson<Learned>((await this.getStateAsync('simulation.learned'))?.val, { days: {} });
		this.learner = new Learner(learned && learned.days ? learned : { days: {} });

		this.alarm = new AlarmEngine(
			{
				now: () => Date.now(),
				setTimer: (fn, ms) => this.setTimeout(fn, ms),
				clearTimer: h => this.clearTimeout(h as ioBroker.Timeout),
				publish: s => void this.publishAlarm(s),
				event: (e, info) => void this.onAlarmEvent(e, info),
				outputs: on => void this.setOutputs(on),
			},
			{
				// limits as in the settings, also in code: a timer above 2^31 ms would fire at once
				exitDelayFull: clamp(num(c.exitDelayFull, 60), 0, 600),
				exitDelayPerimeter: clamp(num(c.exitDelayPerimeter, 0), 0, 600),
				armEarlyId: c.armEarlyId || '',
				entryDelay: clamp(num(c.entryDelay, 30), 0, 600),
				openCheck: c.openCheck || 'warn',
				alarmDuration: clamp(num(c.alarmDuration, 180), 0, 3600),
				motionCount: clamp(num(c.motionCount, 2), 1, 10),
				motionWindowSec: clamp(num(c.motionWindowSec, 120), 10, 1800),
				reportWhen: c.reportWhen === 'always' ? 'always' : 'armed',
			},
		);

		this.sim = new SimRunner(
			{
				now: () => Date.now(),
				setTimer: (fn, ms) => this.setTimeout(fn, ms),
				clearTimer: h => this.clearTimeout(h as ioBroker.Timeout),
				isOn: id => this.simLampVals.get(id) || false,
				switchLamp: (id, on) => void this.switchLamp(id, on),
				publish: (active, plan, next) => void this.publishSim(active, plan, next),
				// end of the simulation (e.g. coming home): devices like the TV off, lamps stay on - or as set per row
				offOnStop: id => this.stopOff.get(id) ?? this.simLamps.find(l => l.id === id)?.type === 'device',
			},
			now => this.makePlan(now),
		);
		// evening light: the evening lamps every evening, also when somebody is at home - forced, no catching up
		// after a restart (a lamp switched off by hand this evening must not come on again)
		this.evening = new SimRunner(
			{
				now: () => Date.now(),
				setTimer: (fn, ms) => this.setTimeout(fn, ms),
				clearTimer: h => this.clearTimeout(h as ioBroker.Timeout),
				isOn: id => this.simLampVals.get(id) || false,
				switchLamp: (id, on) => void this.switchLamp(id, on),
				publish: (active, plan, next) => {
					const text =
						active && next ? `${new Date(next.at).toLocaleString()} ${next.on ? 'on' : 'off'}` : '';
					if (text && text !== this.eveningLogged) {
						this.eveningLogged = text;
						this.log.debug(`Evening light: next step ${text} (${plan.length} steps planned)`);
					}
				},
			},
			now => this.makeEveningPlan(now),
			{ force: true, catchUp: false },
		);

		await this.setupSensors();
		await this.setupPresence();
		await this.setupSimLamps();
		await this.setupLamps();
		// switches of the evening and morning light (e.g. from the panel): as in the last run; a new instance takes
		// the former settings of the instance configuration, otherwise on
		for (const k of LIGHT_SWITCHES) {
			const st = await this.getStateAsync(`control.${k}`);
			if (st?.val == null) {
				const old = (c as unknown as Record<string, unknown>)[LIGHT_CONFIG[k]];
				this.lightSw[k] = old !== false;
				await this.setStateAsync(`control.${k}`, this.lightSw[k], true);
			} else {
				this.lightSw[k] = st.val !== false;
			}
		}
		this.updateEvening();

		if (c.lockEnabled && c.lockId) {
			await this.subscribeForeignStatesAsync(c.lockId);
		}
		if (c.armEarlyId && !this.sensorIds.has(c.armEarlyId)) {
			await this.subscribeForeignStatesAsync(c.armEarlyId);
		}
		if (c.simLuxId) {
			await this.subscribeForeignStatesAsync(c.simLuxId);
		}
		await this.subscribeStatesAsync('control.*');
		// new or removed members of the functions are picked up without a restart
		if (this.watchedEnums().length) {
			await this.subscribeForeignObjectsAsync('enum.functions.*');
		}

		// automatic arming by presence: switch of the last run, on for a new instance
		// report-only sensors: switch of the last run, on for a new instance
		const rep = await this.getStateAsync('control.report');
		this.alarm.reportOn = rep?.val !== false;
		if (rep?.val == null) {
			await this.setStateAsync('control.report', true, true);
		}
		const auto = await this.getStateAsync('control.autoArm');
		this.autoArm = auto?.val !== false;
		if (auto?.val == null) {
			await this.setStateAsync('control.autoArm', true, true);
		}

		// back to the mode of the last run (no exit delay, no notification)
		if (lastAlarm && MODES.includes(lastMode)) {
			// restarted during an alarm: it stays until acknowledged; sirens off, they would never stop otherwise
			this.alarm.restore(lastMode);
			this.alarm.restoreAlarm(lastMode, trigger);
			await this.sirens(false);
			this.log.warn(`Restarted during an alarm (${trigger}) – please acknowledge`);
		} else if (c.alarmEnabled && MODES.includes(lastMode) && lastMode !== 'off') {
			this.alarm.restore(lastMode);
			this.log.info(`Restored mode ${lastMode}`);
		} else {
			await this.publishAlarm(this.alarm.status());
		}
		this.wrongPin = num((await this.getStateAsync('status.wrongPin'))?.val, 0);

		// every minute: night mode, sabotage (hourly), daily new simulation plan, learned days cleanup
		this.minuteTimer = this.setInterval(() => void this.everyMinute(), 60000);
		this.started = true;
		await this.everyMinute();
		await this.updateSimulation();
		this.log.info(
			`Home Guard ready: ${this.sensorIds.size} sensors, ${this.presenceIds.length} presence states, ${this.simLamps.length} simulation lamps, ${this.lampOuts.length} alarm lamps`,
		);
	}

	/**
	 * Stop: all timers off
	 *
	 * @param callback to call when done
	 */
	private onUnload(callback: () => void): void {
		try {
			this.alarm?.destroy();
			if (this.blinkTimer) {
				this.clearInterval(this.blinkTimer);
			}
			if (this.repeatTimer) {
				this.clearInterval(this.repeatTimer);
			}
			if (this.minuteTimer) {
				this.clearInterval(this.minuteTimer);
			}
			if (this.learnSaveTimer) {
				this.clearTimeout(this.learnSaveTimer);
			}
			if (this.rescanTimer) {
				this.clearTimeout(this.rescanTimer);
			}
			callback();
		} catch {
			callback();
		}
	}

	// ======================================================================
	// configuration: sensors, presence, lamps
	// ======================================================================

	/**
	 * state IDs of an enum (states directly, channels/devices with their sensor states)
	 *
	 * @param enumId ID of the enum, e.g. enum.functions.alarm
	 */
	private async enumStates(enumId: string): Promise<string[]> {
		if (!enumId) {
			return [];
		}
		const obj = await this.getForeignObjectAsync(enumId);
		const members = (obj?.common as ioBroker.EnumCommon | undefined)?.members || [];
		const out: string[] = [];
		for (const m of members) {
			const o = await this.getForeignObjectAsync(m);
			if (!o) {
				continue;
			}
			if (o.type === 'state') {
				out.push(m);
			} else {
				const children = await this.getForeignObjectsAsync(`${m}.*`, 'state');
				for (const [id, child] of Object.entries(children)) {
					const role = String(child.common?.role || '');
					if (/sensor|state|window|door|motion|switch|level|light/i.test(role)) {
						out.push(id);
					}
				}
			}
		}
		return out;
	}

	/**
	 * Name of a state: given name, description or name of the object
	 *
	 * @param id state ID
	 * @param given name from the settings
	 */
	private async nameOf(id: string, given?: string): Promise<string> {
		if (given) {
			return given;
		}
		const o = await this.getForeignObjectAsync(id);
		const desc =
			o?.common && typeof (o.common as { desc?: unknown }).desc === 'string'
				? (o.common as { desc: string }).desc
				: '';
		// "Manuell erzeugt" / "Manually created" is what ioBroker writes into states created by hand - no name
		if (desc && !/^(manuell erzeugt|manually created)$/i.test(desc.trim())) {
			return desc;
		}
		const name = o?.common?.name;
		if (name && typeof name === 'object') {
			return (
				(name as Record<string, string>)[this.T === texts('de') ? 'de' : 'en'] ||
				(name as Record<string, string>).en ||
				id
			);
		}
		return (name as string) || id;
	}

	/**
	 * The functions (enums) the settings use for automatic discovery
	 */
	private watchedEnums(): string[] {
		const c = this.config;
		return [
			c.autoFull && c.enumFull,
			c.autoPerimeter && c.enumPerimeter,
			c.autoFire && c.enumFire,
			c.autoReport && c.enumReport,
			c.presenceEnabled && c.presenceAuto && c.enumPresence,
			c.simAuto && c.enumSimLamps,
			c.simAuto && c.enumMorningLamps,
			c.lampsAuto && c.enumLamps,
		].filter((e): e is string => typeof e === 'string' && e.length > 0);
	}

	/**
	 * A function (enum) changed: collect sensors, persons and lamps again a few seconds later
	 *
	 * @param id object ID
	 */
	private onObjectChange(id: string): void {
		if (!this.watchedEnums().includes(id)) {
			return;
		}
		if (this.rescanTimer) {
			this.clearTimeout(this.rescanTimer);
		}
		this.rescanTimer = this.setTimeout(() => {
			this.rescanTimer = undefined;
			void this.rescan(id);
		}, 3000);
	}

	/**
	 * all foreign states the adapter listens to
	 */
	private foreignIds(): Set<string> {
		const c = this.config;
		return new Set(
			[
				...this.sensorIds,
				...this.presenceIds,
				...this.simLamps.map(l => l.id),
				...this.learnFrom.keys(),
				c.lockEnabled ? c.lockId : '',
				c.armEarlyId,
				c.simLuxId,
			].filter(Boolean),
		);
	}

	/**
	 * Collects sensors, persons and lamps again after a function changed
	 *
	 * @param enumId the changed function
	 */
	private async rescan(enumId: string): Promise<void> {
		try {
			const before = this.foreignIds();
			const wasHome = this.someoneHome();
			await this.setupSensors();
			this.presenceVals.clear();
			await this.setupPresence();
			this.simLampVals.clear();
			await this.setupSimLamps();
			this.updateEvening();
			if (this.alarm.status().phase !== 'alarm') {
				await this.setupLamps();
			}
			const after = this.foreignIds();
			for (const id of before) {
				if (!after.has(id)) {
					await this.unsubscribeForeignStatesAsync(id);
				}
			}
			this.log.info(
				`${enumId} changed: ${this.sensorIds.size} sensors, ${this.presenceIds.length} presence states, ${this.simLamps.length} simulation lamps, ${this.lampOuts.length} alarm lamps`,
			);
			await this.onPresence(wasHome, this.someoneHome());
		} catch (e) {
			this.log.warn(`Rescan after ${enumId} failed: ${(e as Error).message}`);
		}
	}

	/**
	 * Collects the sensors from functions and the table
	 */
	private async setupSensors(): Promise<void> {
		const c = this.config;
		const found = new Map<string, SensorDef>();
		const add = async (id: string, circuit: SensorDef['circuit']): Promise<void> => {
			const prev = found.get(id);
			if (prev && (prev.circuit === 'perimeter' || prev.circuit === '24h')) {
				return; // perimeter wins over interior, 24h stays 24h
			}
			const o = await this.getForeignObjectAsync(id);
			const role = String(o?.common?.role || '');
			const motion = /motion|presence/i.test(role) || /BWM|Bewegung|motion/i.test(id);
			const hazard = circuit === '24h' ? c.hazardDefault || 'speech' : undefined;
			found.set(id, { id, name: await this.nameOf(id), circuit, delayed: false, invert: false, motion, hazard });
		};
		if (c.autoFull) {
			for (const id of await this.enumStates(c.enumFull)) {
				await add(id, 'interior');
			}
		}
		if (c.autoPerimeter) {
			for (const id of await this.enumStates(c.enumPerimeter)) {
				await add(id, 'perimeter');
			}
		}
		if (c.autoFire) {
			for (const id of await this.enumStates(c.enumFire)) {
				found.delete(id);
				await add(id, '24h');
			}
		}
		if (c.autoReport) {
			// report-only sensors (garden gate, letter box, shed); a sensor of another area keeps that area
			for (const id of await this.enumStates(c.enumReport)) {
				if (!found.has(id)) {
					await add(id, 'report');
				}
			}
		}
		// rows of the table add sensors or override the automatically found ones
		for (const row of c.sensors || []) {
			if (!row || !row.id) {
				continue;
			}
			if (row.enabled === false) {
				found.delete(row.id);
				continue;
			}
			found.set(row.id, {
				id: row.id,
				name: await this.nameOf(row.id, row.name),
				circuit: row.circuit || 'perimeter',
				delayed: !!row.delayed,
				invert: !!row.invert,
				motion: !!row.motion,
				hazard: (row.circuit || 'perimeter') === '24h' ? row.hazard || c.hazardDefault || 'speech' : undefined,
			});
		}
		const list = [...found.values()];
		const values: Record<string, unknown> = {};
		for (const s of list) {
			values[s.id] = (await this.getForeignStateAsync(s.id))?.val;
			await this.subscribeForeignStatesAsync(s.id);
		}
		this.sensorIds = new Set(list.map(s => s.id));
		this.alarm.setSensors(list, values);
		await this.setStateAsync(
			'status.sensors',
			JSON.stringify(
				list.map(s => ({ id: s.id, name: s.name, circuit: s.circuit, delayed: s.delayed, motion: s.motion })),
			),
			true,
		);
	}

	/**
	 * Collects the presence states
	 */
	private async setupPresence(): Promise<void> {
		const c = this.config;
		const ids = new Set<string>();
		this.personOf.clear();
		if (!c.presenceEnabled) {
			this.presenceIds = [];
			await this.publishPresence();
			return;
		}
		if (c.presenceAuto) {
			(await this.enumStates(c.enumPresence)).forEach(id => ids.add(id));
		}
		// rows of the table add states, give states of the function a person, or leave them out
		for (const row of c.presence || []) {
			if (!row?.id) {
				continue;
			}
			if (row.enabled === false) {
				ids.delete(row.id);
				continue;
			}
			ids.add(row.id);
			if (row.name) {
				this.personOf.set(row.id, String(row.name).trim());
			}
		}
		this.presenceIds = [...ids];
		for (const id of this.presenceIds) {
			if (!this.personOf.has(id)) {
				this.personOf.set(id, await this.personName(id));
			}
			this.presenceVals.set(id, isOpenValue((await this.getForeignStateAsync(id))?.val));
			await this.subscribeForeignStatesAsync(id);
		}
		await this.publishPresence();
	}

	/**
	 * Name of the person of a presence state when the table gives none: the object name (or the last part of the
	 * ID) without endings like _GPS, _Ping or _WLAN - "David_GPS" and "David_Ping" both become "David"
	 *
	 * @param id state ID
	 */
	private async personName(id: string): Promise<string> {
		const o = await this.getForeignObjectAsync(id);
		const n = o?.common?.name;
		let name =
			typeof n === 'object' && n
				? (n as Record<string, string>)[this.T === texts('de') ? 'de' : 'en'] ||
					(n as Record<string, string>).en
				: (n as string) || '';
		// names like "state", "ON" or the whole ID say nothing about the person: take the last part of the ID
		if (!name || name.includes('.') || /^(state|value|presence|present|on|val)$/i.test(name)) {
			name = id.split('.').pop() || id;
		}
		const stripped = name
			.replace(
				/[\s_.-]*(gps|ping|wlan|wifi|lan|bt|ble|bluetooth|phone|handy|smartphone|presence|present|anwesend|anwesenheit|status|state|home|zuhause)$/i,
				'',
			)
			.trim();
		return stripped || name;
	}

	/** @returns the instance has settings of its own (set up before the assistant existed) */
	private looksConfigured(): boolean {
		const c = this.config;
		return (
			(c.sensors || []).length > 0 ||
			(c.simLamps || []).length > 0 ||
			(c.notify || []).length > 0 ||
			!!(c.enumFull || c.enumPerimeter || c.enumFire || c.enumSimLamps || c.enumPresence || c.lockId)
		);
	}

	/**
	 * Older versions had one type per lamp row; now a lamp has roles (evening, morning, visit, bedtime)
	 *
	 * @returns true when the configuration was changed (the instance restarts)
	 */
	private async migrateSimLamps(): Promise<boolean> {
		const rows = this.config.simLamps || [];
		if (!rows.some(r => r && r.type && r.type !== 'lamp' && r.type !== 'device')) {
			return false;
		}
		const simLamps = rows.map(r => {
			if (!r || !r.type || r.type === 'lamp' || r.type === 'device') {
				return r;
			}
			const role = r.type;
			return {
				...r,
				type: 'lamp' as const,
				evening: role === 'evening',
				morning: role === 'morning',
				visit: role === 'visit',
				bedtime: role === 'bedtime',
			};
		});
		this.log.info('Simulation lamps: the type of each row became roles (evening, morning, visits, bedtime)');
		await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, { native: { simLamps } });
		return true;
	}

	/**
	 * Collects the lamps of the presence simulation
	 */
	private async setupSimLamps(): Promise<void> {
		const c = this.config;
		// per state: its roles (a lamp can be evening and morning lamp) and the settings of its table row
		const lamps = new Map<string, { name: string; roles: Set<LampType>; row?: SimLampRow }>();
		this.learnFrom.clear();
		this.learnFromVals.clear();
		this.stopOff.clear();
		if (c.simAuto) {
			for (const [enumId, role] of [
				[c.enumSimLamps, 'evening'],
				[c.enumMorningLamps, 'morning'],
			] as [string, LampType][]) {
				for (const id of await this.enumStates(enumId)) {
					const l = lamps.get(id) ?? { name: await this.nameOf(id), roles: new Set<LampType>() };
					l.roles.add(role);
					lamps.set(id, l);
				}
			}
		}
		// a table row replaces what the functions found for the same state
		for (const row of c.simLamps || []) {
			if (!row?.id) {
				continue;
			}
			if (row.enabled === false) {
				lamps.delete(row.id);
				continue;
			}
			lamps.set(row.id, { name: await this.nameOf(row.id, row.name), roles: rowRoles(row), row });
			if (row.learnFrom) {
				this.learnFrom.set(String(row.learnFrom), row.id);
			}
			if (row.stopOff === 'off' || row.stopOff === 'keep') {
				this.stopOff.set(row.id, row.stopOff === 'off');
			}
		}
		// one entry per role - the plans work per type
		this.simLamps = [];
		for (const [id, l] of lamps) {
			for (const type of l.roles) {
				this.simLamps.push({
					id,
					name: l.name,
					type,
					valueOn: l.row?.valueOn ? String(l.row.valueOn) : undefined,
					valueOff: l.row?.valueOff ? String(l.row.valueOff) : undefined,
					learn: !!l.row?.learnFrom,
				});
			}
		}
		for (const id of lamps.keys()) {
			this.simLampVals.set(id, isOpenValue((await this.getForeignStateAsync(id))?.val));
			await this.subscribeForeignStatesAsync(id);
		}
		for (const src of this.learnFrom.keys()) {
			this.learnFromVals.set(src, isOpenValue((await this.getForeignStateAsync(src))?.val));
			await this.subscribeForeignStatesAsync(src);
		}
	}

	/**
	 * Collects the lamps switched on alarm
	 */
	private async setupLamps(): Promise<void> {
		const c = this.config;
		const ids = new Set<string>();
		if (c.lampsAuto) {
			(await this.enumStates(c.enumLamps)).forEach(id => ids.add(id));
		}
		for (const row of c.lamps || []) {
			if (row?.id && row.enabled !== false) {
				ids.add(row.id);
			}
		}
		this.lampOuts = [];
		for (const id of ids) {
			const { on, off } = await this.onOffValues(id);
			this.lampOuts.push({ id, prev: off, on, off });
		}
	}

	/**
	 * what "on" and "off" are for a state: true/false or max/0 for numbers
	 *
	 * @param id state ID
	 */
	private async onOffValues(id: string): Promise<{ on: ioBroker.StateValue; off: ioBroker.StateValue }> {
		const o = await this.getForeignObjectAsync(id);
		if (o?.common?.type === 'number') {
			const max = (o.common as ioBroker.StateCommon).max;
			return { on: typeof max === 'number' ? max : 100, off: 0 };
		}
		return { on: true, off: false };
	}

	// ======================================================================
	// state changes
	// ======================================================================

	/**
	 * A subscribed state changed
	 *
	 * @param id state ID
	 * @param state new state
	 */
	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		if (!state) {
			return;
		}
		const c = this.config;
		const own = id.startsWith(`${this.namespace}.`);
		if (own) {
			if (!state.ack) {
				await this.onControl(id.substring(this.namespace.length + 1), state);
			}
			return;
		}
		// a command (ack=false) is not a reading: only confirmed values count - except own states under 0_userdata,
		// which no adapter confirms (virtual sensors, test buttons)
		const confirmed = state.ack === true || id.startsWith('0_userdata.');
		if ((this.sensorIds.has(id) || id === c.armEarlyId) && confirmed) {
			if (c.alarmEnabled) {
				this.alarm.sensorChanged(id, state.val);
			}
		}
		if (c.lockEnabled && id === c.lockId && confirmed) {
			const values = String(c.lockValues || '')
				.split(/[,;\s]+/)
				.filter(Boolean);
			if (values.includes(String(state.val)) && this.alarm.mode !== 'off') {
				this.alarm.disarm('lock');
			}
		}
		if (this.presenceVals.has(id) && confirmed) {
			const was = this.someoneHome();
			this.presenceVals.set(id, isOpenValue(state.val));
			await this.publishPresence();
			await this.onPresence(was, this.someoneHome());
		}
		if (this.simLampVals.has(id)) {
			const on = isOpenValue(state.val);
			const before = this.simLampVals.get(id);
			this.simLampVals.set(id, on);
			// learn: only switching that did not come from the adapter, not while simulating
			const from = state.from || '';
			const ignored =
				c.simLearnDevicesOnly !== false
					? LEARN_IGNORE.test(from)
					: from.startsWith(`system.adapter.${this.namespace}`);
			const ts = state.ts || Date.now();
			// a lamp with its own learn source is learned from there, not from the state that is switched
			const hasSource = [...this.learnFrom.values()].includes(id);
			// switching on outside the learning window is not learned (switching off ends only what was learned)
			if (
				before !== on &&
				!hasSource &&
				!this.sim.active &&
				!ignored &&
				confirmed &&
				(!on || this.inLearnWindow(ts))
			) {
				if (this.learner.record(id, on, ts)) {
					this.saveLearnedSoon();
				}
			}
		}
		// learn source of a device (e.g. the real power state of the TV): learned under the device
		const target = this.learnFrom.get(id);
		if (target && confirmed) {
			const on = isOpenValue(state.val);
			const before = this.learnFromVals.get(id);
			this.learnFromVals.set(id, on);
			const ts = state.ts || Date.now();
			if (before !== on && !this.sim.active && (!on || this.inLearnWindow(ts))) {
				if (this.learner.record(target, on, ts)) {
					this.saveLearnedSoon();
				}
			}
		}
		if (c.simLuxId && id === c.simLuxId && confirmed) {
			this.onLux(Number(state.val));
		}
	}

	/**
	 * Own control states written by the user
	 *
	 * @param rel ID without the namespace
	 * @param state new state
	 */
	private async onControl(rel: string, state: ioBroker.State): Promise<void> {
		const c = this.config;
		const val = state.val;
		const reset = async (v: ioBroker.StateValue): Promise<void> => {
			await this.setStateAsync(rel, v, true);
		};
		switch (rel) {
			case 'control.mode': {
				const mode = String(val) as Mode;
				if (!MODES.includes(mode)) {
					this.log.warn(`Unknown mode "${mode}" – use off, full, perimeter or night`);
					await this.setStateAsync('control.mode', this.alarm.mode, true);
					return;
				}
				await this.setModeChecked(mode, 'state');
				return;
			}
			case 'control.full':
			case 'control.perimeter':
			case 'control.night':
			case 'control.off':
				if (val) {
					await this.setModeChecked(rel.split('.')[1] as Mode, 'state');
				}
				await reset(false);
				return;
			case 'control.cancel':
				if (val) {
					this.alarm.cancelArming('state');
				}
				await reset(false);
				return;
			case 'control.ack':
				if (val) {
					await this.endTest();
					this.alarm.ack('state');
				}
				await reset(false);
				return;
			case 'control.panic':
				if (val) {
					this.alarm.panic(this.T.by.panic);
				}
				await reset(false);
				return;
			case 'control.pin': {
				await reset('');
				if (val !== '' && val !== null) {
					this.checkPin(String(val), 'off', 'pin');
				}
				return;
			}
			case 'control.report':
				this.alarm.reportOn = !!val;
				await this.setStateAsync('control.report', this.alarm.reportOn, true);
				return;
			case 'control.eveningOn':
			case 'control.eveningOff':
			case 'control.morningOn':
			case 'control.morningOff': {
				const k = rel.slice('control.'.length) as LightSwitch;
				const was = this.lightSw[k];
				this.lightSw[k] = !!val;
				await this.setStateAsync(rel, this.lightSw[k], true);
				if (was !== this.lightSw[k]) {
					this.addLog(
						'light',
						`💡 ${this.T.lightSwitch[k]}: ${this.lightSw[k] ? this.T.switchedOn : this.T.switchedOff}`,
					);
					// "on" switched on by hand: lamps that should be on now go on at once
					this.updateEvening(this.lightSw[k] && k.endsWith('On'));
					// lamps without evening/morning light belong to the simulation again (or no longer)
					if (this.sim.active) {
						this.sim.replan();
					}
				}
				return;
			}
			case 'control.autoArm':
				this.autoArm = !!val;
				await this.setStateAsync('control.autoArm', this.autoArm, true);
				this.addLog('autoArm', this.autoArm ? this.T.autoOn : this.T.autoOff);
				return;
			default:
				if (c.alarmEnabled === false) {
					this.log.debug(`Ignored ${rel}`);
				}
		}
	}

	/**
	 * mode change from a state: disarming may need the PIN
	 *
	 * @param mode wanted mode
	 * @param source who changed the mode
	 */
	private async setModeChecked(mode: Mode, source: string): Promise<void> {
		const c = this.config;
		// a refused change: control.mode shows the real mode again (acknowledged)
		const refuse = async (why: string): Promise<void> => {
			this.log.warn(why);
			await this.setStateAsync('control.mode', this.alarm?.mode || 'off', true);
		};
		if (!c.alarmEnabled) {
			return refuse('The alarm system is switched off in the settings');
		}
		if (mode === 'off' && c.pin && c.pinForDisarmState) {
			return refuse('Disarming by state is only possible with the PIN (control.pin) – see settings');
		}
		if (mode !== 'off' && c.pin && c.pinForArm) {
			return refuse('Arming needs the PIN (message "arm" with pin) – see settings');
		}
		this.alarm.arm(mode, source);
		await this.updateSimulation();
	}

	/**
	 * checks a PIN; correct: switch to the mode, wrong: count
	 *
	 * @param pin entered PIN
	 * @param mode mode to switch to when the PIN is right
	 * @param source who entered the PIN
	 */
	private checkPin(pin: string, mode: Mode, source: string): boolean {
		const c = this.config;
		if (c.pin && Date.now() < this.pinLockedUntil) {
			// too many wrong entries: no PIN is checked until the lock time is over (against trying out)
			this.pinError = 'pin locked';
			this.log.warn('PIN entry is locked after too many wrong entries');
			return false;
		}
		this.pinError = 'wrong pin';
		if (!c.pin || pin === String(c.pin)) {
			this.wrongPin = 0;
			void this.setStateAsync('status.wrongPin', 0, true);
			if (mode === 'off') {
				this.alarm.disarm(source);
			} else {
				this.alarm.arm(mode, source);
			}
			void this.updateSimulation();
			return true;
		}
		this.wrongPin++;
		void this.setStateAsync('status.wrongPin', this.wrongPin, true);
		if (this.wrongPin >= Math.max(1, num(c.maxWrongPin, 3))) {
			const lockMin = clamp(num(c.pinLockMin, 5), 0, 120);
			if (lockMin > 0) {
				this.pinLockedUntil = Date.now() + lockMin * 60000;
			}
			void this.onAlarmEvent('wrongPin', {});
		}
		return false;
	}

	/**
	 * Is at least one person at home?
	 */
	private someoneHome(): boolean {
		return [...this.presenceVals.values()].some(Boolean);
	}

	/**
	 * Presence changed: arm or disarm automatically
	 *
	 * @param wasHome somebody was at home before
	 * @param isHome somebody is at home now
	 */
	private async onPresence(wasHome: boolean, isHome: boolean): Promise<void> {
		const c = this.config;
		if (!this.presenceIds.length || wasHome === isHome) {
			await this.updateSimulation();
			return;
		}
		if (!this.autoArm) {
			await this.updateSimulation();
			return;
		}
		if (c.alarmEnabled && !isHome && c.presenceArm && c.presenceArm !== 'off' && this.alarm.mode === 'off') {
			this.alarm.arm(c.presenceArm, 'presence');
		}
		if (c.alarmEnabled && isHome && c.presenceDisarm && this.alarm.mode === 'full') {
			this.alarm.disarm('presence');
		}
		await this.updateSimulation();
	}

	// ======================================================================
	// messages (web component, scripts, admin)
	// ======================================================================

	/**
	 * Messages from the panel, scripts and the settings
	 *
	 * @param obj the message
	 */
	private async onMessage(obj: ioBroker.Message): Promise<void> {
		if (!obj || !obj.command) {
			return;
		}
		const msg = (typeof obj.message === 'object' && obj.message ? obj.message : {}) as Record<string, unknown>;
		const str = (v: unknown, d = ''): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : d);
		const reply = (data: unknown): void => {
			if (obj.callback) {
				this.sendTo(obj.from, obj.command, data, obj.callback);
			}
		};
		const c = this.config;
		switch (obj.command) {
			case 'arm': {
				const mode = str(msg.mode, 'full') as Mode;
				if (!MODES.includes(mode) || mode === 'off') {
					return reply({ ok: false, error: 'unknown mode' });
				}
				if (!c.alarmEnabled) {
					return reply({ ok: false, error: 'alarm system disabled' });
				}
				if (c.pin && c.pinForArm) {
					const ok = this.checkPin(str(msg.pin), mode, 'pin');
					return reply({ ok, error: ok ? undefined : this.pinError });
				}
				const r = this.alarm.arm(mode, str(msg.source, 'message'));
				await this.updateSimulation();
				return reply({ ok: r.ok, open: r.open.map(s => s.name) });
			}
			case 'disarm': {
				if (c.pin) {
					const ok = this.checkPin(str(msg.pin), 'off', 'pin');
					return reply({ ok, error: ok ? undefined : this.pinError });
				}
				this.alarm.disarm(str(msg.source, 'message'));
				await this.updateSimulation();
				return reply({ ok: true });
			}
			case 'cancel':
				this.alarm.cancelArming('message');
				return reply({ ok: true });
			case 'ack':
				await this.endTest();
				this.alarm.ack('message');
				return reply({ ok: true });
			case 'testAlarm':
				return reply(await this.startTest(msg));
			case 'panic':
				this.alarm.panic(this.T.by.panic);
				return reply({ ok: true });
			case 'status':
				return reply({
					...this.alarm.status(),
					pinRequired: !!c.pin,
					pinForArm: !!(c.pin && c.pinForArm),
					// only the length, so the panel can accept a complete PIN without OK - never the PIN itself
					pinLength: c.pin ? String(c.pin).length : 0,
					autoArmAvailable:
						!!c.alarmEnabled &&
						this.presenceIds.length > 0 &&
						((!!c.presenceArm && c.presenceArm !== 'off') || !!c.presenceDisarm),
					simActive: this.sim.active,
					// which light switches the panel shows: only for an evening/morning light that is set up
					eveningAvailable: !!c.eveningLight && this.simLamps.some(l => l.type === 'evening'),
					morningAvailable: !!c.morningLight && this.simLamps.some(l => l.type === 'morning'),
					texts: { mode: this.T.mode, phase: this.T.phase },
					log: this.log_.slice(0, 20),
				});
			case 'getEnums': {
				const enums = await this.getForeignObjectsAsync('enum.functions.*', 'enum');
				const list = Object.entries(enums)
					.filter(([id]) => id.split('.').length === 3)
					.map(([id, o]) => {
						const n = o.common?.name;
						const name =
							typeof n === 'object'
								? (n as Record<string, string>)[this.sysLang] || (n as Record<string, string>).en
								: n;
						return { value: id, label: `${name || id} (${id})` };
					});
				return reply([{ value: '', label: '–' }, ...list]);
			}
			case 'getMessengers': {
				const inst = await this.getObjectViewAsync('system', 'instance', {
					startkey: 'system.adapter.',
					endkey: 'system.adapter.香',
				});
				// like the notification manager: every adapter that can receive notifications, plus the known ones
				const list = inst.rows
					.filter(
						r =>
							!!(r.value?.common as { supportedMessages?: { notifications?: boolean } } | undefined)
								?.supportedMessages?.notifications ||
							r.id.replace('system.adapter.', '').replace(/\.\d+$/, '') in SEND_FORMAT,
					)
					.map(r => r.id.replace('system.adapter.', ''))
					.filter(id => id !== this.namespace)
					.map(id => ({ value: id, label: id }));
				return reply(list);
			}
			case 'test':
				this.notifyAll(this.T.test, true);
				return reply({ result: 'ok' });
			// setup assistant: values of the form come as strings ("true", "undefined", …)
			case 'wizardNav':
				return reply({
					native: { wizStep: nextStep(Number(msg.step) || 0, Number(msg.dir) || 1, str(msg.need)) },
				});
			case 'wizardDefaults':
				return reply({ native: WIZARD_DEFAULTS[str(msg.step)] || {} });
			case 'wizardScan':
				return reply({ native: await this.wizardScan(msg) });
			default:
				return reply({ error: `unknown command ${obj.command}` });
		}
	}

	/**
	 * Setup assistant: looks through the functions (and states) and suggests what fits - only for empty fields
	 *
	 * @param form current values of the form (strings; "undefined" when empty)
	 * @returns the settings to fill in, and a text with the result
	 */
	private async wizardScan(form: Record<string, unknown>): Promise<Record<string, unknown>> {
		const de = this.sysLang === 'de';
		const empty = (k: string): boolean => {
			const v = form[k] ?? (this.config as unknown as Record<string, unknown>)[k];
			return v === undefined || v === null || v === '' || v === 'undefined' || v === 'null';
		};
		const out: Record<string, unknown> = {};
		const lines: string[] = [];
		// the functions with the roles of their states
		const enums = await this.getForeignObjectsAsync('enum.functions.*', 'enum');
		const infos: EnumInfo[] = [];
		for (const [id, o] of Object.entries(enums)) {
			if (id.split('.').length !== 3) {
				continue;
			}
			const n = o.common?.name;
			const name =
				typeof n === 'object'
					? (n as Record<string, string>)[this.sysLang] || (n as Record<string, string>).en
					: n;
			const roles: string[] = [];
			for (const sid of await this.enumStates(id)) {
				const so = await this.getForeignObjectAsync(sid);
				roles.push(String(so?.common?.role || ''));
			}
			infos.push({ id, name: String(name || id.split('.').pop()), roles });
		}
		const kinds: [ScanKind, string, string, string, string][] = [
			['perimeter', 'autoPerimeter', 'enumPerimeter', 'Türen und Fenster', 'Doors and windows'],
			['full', 'autoFull', 'enumFull', 'Bewegungsmelder', 'Motion detectors'],
			['fire', 'autoFire', 'enumFire', 'Gefahrenmelder', 'Danger detectors'],
			['report', 'autoReport', 'enumReport', 'Melde-Sensoren', 'Report-only sensors'],
			['lamps', 'lampsAuto', 'enumLamps', 'Lampen bei Alarm', 'Lamps on alarm'],
			['evening', 'simAuto', 'enumSimLamps', 'Abendlicht', 'Evening light'],
			['morning', 'simAuto', 'enumMorningLamps', 'Morgenlicht', 'Morning light'],
			['presence', 'presenceAuto', 'enumPresence', 'Anwesenheit', 'Presence'],
		];
		for (const [kind, autoKey, enumKey, labelDe, labelEn] of kinds) {
			const label = de ? labelDe : labelEn;
			if (!empty(enumKey)) {
				lines.push(`${label}: ${de ? 'schon gewählt' : 'already chosen'}`);
				continue;
			}
			const best = bestEnum(kind, infos);
			if (!best) {
				lines.push(`${label}: ${de ? 'nichts Passendes gefunden' : 'nothing suitable found'}`);
				continue;
			}
			out[autoKey] = true;
			out[enumKey] = best.id;
			if (kind === 'presence') {
				out.presenceEnabled = true;
			}
			lines.push(
				`${label}: „${best.name}“ (${best.count} ${de ? (best.count === 1 ? 'Datenpunkt' : 'Datenpunkte') : best.count === 1 ? 'state' : 'states'})`,
			);
		}
		const view = await this.getObjectViewAsync('system', 'state', { startkey: '', endkey: '\u9999' });
		// door lock: Nuki or a state with a lock role
		if (empty('lockId')) {
			const lock =
				view.rows.find(r => /^nuki[^.]*\.\d+\..*lockState$/i.test(r.id)) ||
				view.rows.find(r => /^(value|switch)\.lock$/.test(String(r.value?.common?.role || '')));
			if (lock) {
				out.lockEnabled = true;
				out.lockId = lock.id;
				out.lockValues = /lockState$/i.test(lock.id) ? '3,5,6' : 'false';
				lines.push(`${de ? 'Türschloss' : 'Door lock'}: ${lock.id}`);
			}
		}
		// messenger: the first instance that can send messages, Telegram first
		if (!(this.config.notify || []).some(r => r && r.instance)) {
			const inst = await this.getObjectViewAsync('system', 'instance', {
				startkey: 'system.adapter.',
				endkey: 'system.adapter.\u9999',
			});
			const ids = inst.rows
				.map(r => r.id.replace('system.adapter.', ''))
				.filter(id => id.replace(/\.\d+$/, '') in SEND_FORMAT)
				.sort((a, b) => (a.startsWith('telegram') ? -1 : b.startsWith('telegram') ? 1 : a.localeCompare(b)));
			if (ids.length) {
				out.notify = [{ enabled: true, instance: ids[0], user: '', chatId: '' }];
				lines.push(`${de ? 'Messenger' : 'Messenger'}: ${ids[0]}`);
			}
		}
		// only ticks on the page "What do you have?" - the state itself is chosen later on its page
		const insts = (
			await this.getObjectViewAsync('system', 'instance', {
				startkey: 'system.adapter.',
				endkey: 'system.adapter.\u9999',
			})
		).rows.map(r => r.id.replace('system.adapter.', ''));
		const speaker = insts.find(id => /^(alexa2|sayit)\.\d+$/.test(id));
		if (speaker && empty('speechId')) {
			out.wizHasSpeaker = true;
			lines.push(`${de ? 'Lautsprecher' : 'Speaker'}: ${speaker}`);
		}
		// a real siren: role of a siren/alarm switch, or a writable state that is called "siren" itself
		// (not settings of other devices such as the acoustic alarm of a water detector)
		const siren = view.rows.find(
			r =>
				!r.id.startsWith(`${this.namespace}.`) &&
				r.value?.common?.write !== false &&
				(/^(switch\.alarm|switch\.siren|level\.siren)/.test(String(r.value?.common?.role || '')) ||
					/^(siren|sirene|alarm_?siren)$/i.test(r.id.split('.').pop() || '')),
		);
		if (siren && !(this.config.sirens || []).some(r => r && r.id)) {
			out.wizHasSiren = true;
			lines.push(`${de ? 'Sirene' : 'Siren'}: ${siren.id}`);
		}
		const lux = view.rows.filter(
			r => r.value?.common?.unit === 'lx' || r.value?.common?.role === 'value.brightness',
		);
		if (lux.length && empty('simLuxId')) {
			out.wizHasLux = true;
			lines.push(
				de
					? `Helligkeit: ${lux.length} Datenpunkt(e) mit Lux – ob einer draußen ist, prüfst du auf der Seite „Licht: abends“`
					: `Brightness: ${lux.length} state(s) with lux – whether one is outdoors, you check on the page "Light: evening"`,
			);
		}
		out.wizScanInfo = lines.join('\n');
		return out;
	}

	// ======================================================================
	// alarm events: notifications, actions, logbook
	// ======================================================================

	/**
	 * Name of a mode in the system language
	 *
	 * @param m mode
	 * @param T texts (system language by default)
	 */
	private modeName(m?: Mode, T: Texts = this.T): string {
		return T.mode[m || 'off'] || String(m);
	}

	/**
	 * " (by …)" for texts
	 *
	 * @param s source
	 * @param T texts (system language by default)
	 */
	private src(s?: string, T: Texts = this.T): string {
		return T.via(s ? (T.by[s] ?? s) : '');
	}

	/**
	 * An event of the alarm: notifications, speech, actions, logbook
	 *
	 * @param e event
	 * @param info details
	 */
	private async onAlarmEvent(e: AlarmEvent, info: EventInfo): Promise<void> {
		const c = this.config;
		const names = (info.sensors || []).map(s => s.name).join(', ');
		// the text in a language: system language for messages, logbook and speech, English for the ioBroker log
		const textIn = (T: Texts): string => {
			switch (e) {
				case 'armedFull':
				case 'armedPerimeter':
				case 'armedNight':
					return T.armed(this.modeName(info.mode, T), this.src(info.source, T));
				case 'arming':
					return T.arming(
						this.modeName(info.mode, T),
						info.mode === 'full' ? num(c.exitDelayFull, 60) : num(c.exitDelayPerimeter, 0),
					);
				case 'disarmed':
					return T.disarmed(this.src(info.source, T));
				case 'armingFailed':
					return T.armingFailed(this.modeName(info.mode, T), names);
				case 'openWarning':
					return T.openWarning(this.modeName(info.mode, T), names);
				case 'entry':
					return T.entry(info.sensor?.name || '', num(c.entryDelay, 30));
				case 'alarm':
					return info.panic ? T.panic(info.sensor?.name || '') : T.alarm(info.sensor?.name || '');
				case 'alarmEnd':
					return T.alarmEnd(this.src(info.source, T));
				case 'wrongPin':
					return T.wrongPin(this.wrongPin);
				case 'sabotage':
					return T.sabotage(names);
				case 'hazard':
					return T.hazard(info.sensor?.name || '');
				case 'report':
					return T.report(info.sensor?.name || '');
			}
			return '';
		};
		const text = textIn(this.T);
		let notify = false;
		let speech = false;
		switch (e) {
			case 'armedFull':
			case 'armedPerimeter':
			case 'armedNight':
				notify = c.notifyArmed;
				break;
			case 'arming':
				speech = c.speechArming;
				break;
			case 'disarmed':
				notify = c.notifyDisarmed;
				break;
			case 'armingFailed':
				notify = c.notifyArmingFailed;
				speech = c.speechArming;
				break;
			case 'openWarning':
				notify = c.notifyOpenWarning;
				speech = c.speechArming;
				break;
			case 'entry':
				notify = c.notifyEntry;
				speech = c.speechEntry;
				break;
			case 'alarm':
				notify = c.notifyAlarm;
				speech = c.speechAlarm;
				await this.setStateAsync('status.lastTrigger', info.sensor?.name || '', true);
				await this.setStateAsync('status.lastTriggerTime', Date.now(), true);
				this.startRepeat(text);
				if (c.notificationManager) {
					try {
						await this.registerNotification('home-guard', 'alarm', text);
					} catch (err) {
						this.log.debug(`Notification manager: ${(err as Error).message}`);
					}
				}
				break;
			case 'alarmEnd':
				notify = c.notifyAlarmEnd;
				this.stopRepeat();
				break;
			case 'wrongPin':
				notify = c.notifyWrongPin;
				break;
			case 'sabotage':
				notify = c.notifySabotage;
				break;
			case 'report':
				notify = c.notifyReport !== false;
				break;
			case 'hazard':
				// danger detectors: message (and speech) per sensor, no sirens - those only with "full alarm"
				notify = c.notifyHazard !== false;
				speech = info.sensor?.hazard === 'speech';
				await this.setStateAsync('status.lastTrigger', info.sensor?.name || '', true);
				await this.setStateAsync('status.lastTriggerTime', Date.now(), true);
				if (c.notificationManager) {
					try {
						await this.registerNotification('home-guard', 'alarm', text);
					} catch (err) {
						this.log.debug(`Notification manager: ${(err as Error).message}`);
					}
				}
				break;
		}
		if (e === 'disarmed') {
			this.stopRepeat();
		}
		this.addLog(e, text);
		this.log.info(textIn(texts('en')));
		if (notify) {
			this.notifyAll(text, false, e === 'alarm' || e === 'entry' || e === 'sabotage' || e === 'hazard');
		}
		if (speech && c.speechId) {
			await this.setForeignStateAsync(c.speechId, text.replace(/[^\p{L}\p{N}\s.,:–-]/gu, '').trim());
		}
		await this.runActions(e);
	}

	/**
	 * Repeats the alarm message until it is acknowledged
	 *
	 * @param text message
	 */
	private startRepeat(text: string): void {
		this.stopRepeat();
		const min = clamp(num(this.config.alarmRepeatMin, 0), 0, 120);
		if (min > 0 && this.config.notifyAlarm) {
			this.repeatTimer = this.setInterval(() => this.notifyAll(text, false, true), min * 60000);
		}
	}

	/**
	 * Stops repeating the alarm message
	 */
	private stopRepeat(): void {
		if (this.repeatTimer) {
			this.clearInterval(this.repeatTimer);
			this.repeatTimer = undefined;
		}
	}

	/**
	 * sends a text to every configured messenger instance
	 *
	 * @param text message text
	 * @param test true for the test message of the settings
	 * @param alert true for alarms: severity "alert" for messengers that get the notification format
	 */
	private notifyAll(text: string, test = false, alert = false): void {
		for (const row of this.config.notify || []) {
			if (!row?.instance || row.enabled === false) {
				continue;
			}
			void this.notifyOne(row, text, alert);
		}
		if (test) {
			this.log.info('Test notification sent');
		}
	}

	/**
	 * Sends a text to one messenger instance: known ones with "send", the others like the notification manager
	 *
	 * @param row row of the notification table
	 * @param row.instance messenger instance
	 * @param row.user optional user
	 * @param row.chatId optional chat ID
	 * @param text message
	 * @param alert true for alarms (severity "alert")
	 */
	private async notifyOne(
		row: { instance: string; user?: string; chatId?: string },
		text: string,
		alert: boolean,
	): Promise<void> {
		const inst = row.instance;
		const format = SEND_FORMAT[inst.replace(/\.\d+$/, '')];
		try {
			if (format) {
				const payload = format(text);
				if (row.user) {
					payload.user = row.user;
				}
				if (row.chatId) {
					payload.chatId = row.chatId;
				}
				this.sendTo(inst, 'send', payload);
				return;
			}
			const obj = await this.getForeignObjectAsync(`system.adapter.${inst}`);
			const supports = (obj?.common as { supportedMessages?: { notifications?: boolean } } | undefined)
				?.supportedMessages?.notifications;
			if (!supports) {
				// unknown adapter without notification support: try the usual "send" fields
				this.sendTo(inst, 'send', { text, message: text, title: 'Home Guard' });
				return;
			}
			// the format of the notification manager (LocalizedNotification); the messenger builds its own text
			const res = (await this.sendToAsync(
				inst,
				'sendNotification',
				{
					host: `system.host.${this.host}`,
					scope: { name: 'Home Guard', description: this.T.title },
					category: {
						name: alert ? this.T.alarmWord : this.T.title,
						description: '',
						severity: alert ? 'alert' : 'notify',
						instances: { [this.namespace]: { messages: [{ message: text, ts: Date.now() }] } },
					},
				},
				{ timeout: 10000 },
			)) as { sent?: boolean } | undefined;
			if (!res || res.sent !== true) {
				this.log.warn(`${inst} did not confirm the notification`);
			}
		} catch (err) {
			this.log.warn(`Notification to ${inst} failed: ${(err as Error).message}`);
		}
	}

	/**
	 * Value from the settings: true, false, number or text
	 *
	 * @param v text
	 */
	private parseValue(v: string): ioBroker.StateValue {
		const s = String(v ?? '').trim();
		if (s === 'true') {
			return true;
		}
		if (s === 'false') {
			return false;
		}
		if (s !== '' && !isNaN(Number(s))) {
			return Number(s);
		}
		return s;
	}

	/**
	 * states written on an event (table "actions")
	 *
	 * @param e the event
	 */
	private async runActions(e: AlarmEvent | 'simStart' | 'simStop'): Promise<void> {
		for (const a of this.config.actions || []) {
			if (!a?.id || a.enabled === false) {
				continue;
			}
			const match =
				a.event === e ||
				(a.event === 'armed' && (e === 'armedFull' || e === 'armedPerimeter' || e === 'armedNight'));
			if (match) {
				await this.setForeignStateAsync(a.id, this.parseValue(a.value), false);
			}
		}
	}

	// ======================================================================
	// alarm outputs: lamps (on/blink) and sirens
	// ======================================================================

	/**
	 * Lamps and sirens on (or blink) and off again
	 *
	 * @param on on or off
	 */
	private async setOutputs(on: boolean): Promise<void> {
		const c = this.config;
		// a second trigger during the alarm must not take the blinking lamps as "before" or start a second blinker
		if (on === this.outputsOn) {
			return;
		}
		this.outputsOn = on;
		if (on) {
			for (const l of this.lampOuts) {
				l.prev = (await this.getForeignStateAsync(l.id))?.val ?? l.off;
				await this.setForeignStateAsync(l.id, l.on, false);
			}
			if (c.lampMode === 'blink' && this.lampOuts.length) {
				this.blinkOn = true;
				const ms = clamp(num(c.blinkSec, 1), 0.5, 10) * 1000;
				this.blinkTimer = this.setInterval(() => {
					this.blinkOn = !this.blinkOn;
					for (const l of this.lampOuts) {
						void this.setForeignStateAsync(l.id, this.blinkOn ? l.on : l.off, false);
					}
				}, ms);
			}
			await this.sirens(true);
			return;
		}
		if (this.blinkTimer) {
			this.clearInterval(this.blinkTimer);
			this.blinkTimer = undefined;
		}
		await this.sirens(false);
		for (const l of this.lampOuts) {
			await this.setForeignStateAsync(l.id, c.lampsRestore !== false ? l.prev : l.on, false);
		}
	}

	/**
	 * Sirens on or off
	 *
	 * @param on on or off
	 */
	private async sirens(on: boolean): Promise<void> {
		// own running times of single sirens end with the alarm
		for (const t of this.sirenTimers) {
			if (t) {
				this.clearTimeout(t);
			}
		}
		this.sirenTimers = [];
		const mode = this.alarm?.mode || 'off';
		for (const s of this.config.sirens || []) {
			if (!s?.id || s.enabled === false) {
				continue;
			}
			// "full" = outside siren only for full protection, "home" = inside siren only for perimeter/night;
			// an alarm while disarmed (danger detector, panic) sounds every siren
			const when = s.when || 'all';
			const runs =
				!on || mode === 'off' || when === 'all' || (when === 'full' ? mode === 'full' : mode !== 'full');
			if (!runs) {
				continue;
			}
			const off = this.parseValue(s.valueOff || 'false');
			await this.setForeignStateAsync(s.id, on ? this.parseValue(s.valueOn || 'true') : off, false);
			const sec = clamp(num(s.durationSec, 0), 0, 3600);
			if (on && sec > 0) {
				this.sirenTimers.push(
					this.setTimeout(() => void this.setForeignStateAsync(s.id, off, false), sec * 1000),
				);
			}
		}
	}

	// ======================================================================
	// test alarm: the chosen parts for a short time, marked as a test, without a real alarm
	// ======================================================================

	/**
	 * Starts a test alarm
	 *
	 * @param msg parts to test: notify, speech, lamps, sirens, actions (booleans) and duration (s)
	 */
	private async startTest(msg: Record<string, unknown>): Promise<{ result?: string; error?: string }> {
		const c = this.config;
		const T = this.T;
		const phase = this.alarm.status().phase;
		if (phase === 'alarm' || phase === 'entry' || this.outputsOn) {
			return { error: T.testBusy };
		}
		await this.endTest();
		const on = (k: string, d: boolean): boolean =>
			msg[k] === undefined ? d : msg[k] === true || msg[k] === 'true';
		const duration = Math.min(300, Math.max(5, num(msg.duration, 15)));
		const text = `${T.testPrefix}${T.alarm(T.testTrigger)}`;
		const done: string[] = [];
		const sirenCount = (c.sirens || []).filter(x => x?.id && x.enabled !== false).length;
		const actionCount = (c.actions || []).filter(a => a?.id && a.enabled !== false && a.event === 'alarm').length;
		const anything =
			(on('notify', true) && (c.notify || []).some(r => r?.instance && r.enabled !== false)) ||
			(on('speech', true) && !!c.speechId) ||
			(on('lamps', true) && this.lampOuts.length > 0) ||
			(on('sirens', false) && sirenCount > 0) ||
			(on('actions', false) && actionCount > 0);
		if (!anything) {
			return { result: T.testNothing };
		}
		this.addLog('test', text);
		this.log.info(`Test alarm for ${duration} s`);
		if (on('notify', true) && (c.notify || []).some(r => r?.instance && r.enabled !== false)) {
			this.notifyAll(text, false, true);
			done.push(T.testParts.notify);
		}
		if (on('speech', true) && c.speechId) {
			await this.setForeignStateAsync(c.speechId, text.replace(/[^\p{L}\p{N}\s.,:–-]/gu, '').trim());
			done.push(T.testParts.speech);
		}
		const test: NonNullable<typeof this.test> = { timer: undefined, lamps: [], sirens: false, actions: false };
		if (on('lamps', true) && this.lampOuts.length) {
			for (const l of this.lampOuts) {
				const prev = (await this.getForeignStateAsync(l.id))?.val ?? l.off;
				test.lamps.push({ ...l, prev });
				await this.setForeignStateAsync(l.id, l.on, false);
			}
			if (c.lampMode === 'blink') {
				let lit = true;
				test.blink = this.setInterval(
					() => {
						lit = !lit;
						for (const l of test.lamps) {
							void this.setForeignStateAsync(l.id, lit ? l.on : l.off, false);
						}
					},
					clamp(num(c.blinkSec, 1), 0.5, 10) * 1000,
				);
			}
			done.push(T.testParts.lamps(test.lamps.length));
		}
		if (on('sirens', false) && sirenCount) {
			await this.sirens(true);
			test.sirens = true;
			done.push(T.testParts.sirens(sirenCount));
		}
		if (on('actions', false) && actionCount) {
			await this.runActions('alarm');
			test.actions = true;
			done.push(T.testParts.actions(actionCount));
		}
		test.timer = this.setTimeout(() => void this.endTest(), duration * 1000);
		this.test = test;
		return { result: done.length ? T.testRunning(duration, done.join(', ')) : T.testNothing };
	}

	/**
	 * Ends a running test alarm: lamps as before, sirens off, actions of "alarm ended"
	 */
	private async endTest(): Promise<void> {
		const test = this.test;
		if (!test) {
			return;
		}
		this.test = null;
		if (test.timer) {
			this.clearTimeout(test.timer);
		}
		if (test.blink) {
			this.clearInterval(test.blink);
		}
		for (const l of test.lamps) {
			await this.setForeignStateAsync(l.id, l.prev, false);
		}
		if (test.sirens) {
			await this.sirens(false);
		}
		if (test.actions) {
			await this.runActions('alarmEnd');
		}
		this.addLog('test', this.T.testEnd);
	}

	// ======================================================================
	// status states
	// ======================================================================

	/**
	 * Writes the status states
	 *
	 * @param s status
	 */
	private async publishAlarm(s: AlarmStatus): Promise<void> {
		const json = JSON.stringify(s);
		const countdownOnly =
			this.lastStatusJson &&
			json.replace(/"countdown":\d+/, '') === this.lastStatusJson.replace(/"countdown":\d+/, '');
		this.lastStatusJson = json;
		await this.setStateChangedAsync('status.countdown', s.countdown, true);
		if (countdownOnly) {
			return;
		}
		await this.setStateChangedAsync('status.mode', s.mode, true);
		await this.setStateChangedAsync('control.mode', s.mode, true);
		await this.setStateChangedAsync('status.phase', s.phase, true);
		await this.setStateChangedAsync(
			'status.armed',
			s.phase === 'armed' || s.phase === 'entry' || s.phase === 'alarm',
			true,
		);
		await this.setStateChangedAsync('status.alarm', s.alarm, true);
		await this.setStateChangedAsync('status.entry', s.entry, true);
		const text =
			s.phase === 'disarmed' ? this.T.phase.disarmed : `${this.T.phase[s.phase]} – ${this.modeName(s.mode)}`;
		await this.setStateChangedAsync('status.text', text, true);
		await this.setStateChangedAsync('status.openContacts', JSON.stringify(s.openContacts.map(o => o.name)), true);
		await this.setStateChangedAsync('status.openCount', s.openContacts.length, true);
		await this.setStateChangedAsync('status.readyFull', s.readyFull, true);
		await this.setStateChangedAsync('status.readyPerimeter', s.readyPerimeter, true);
		await this.updateSimulation();
	}

	/**
	 * Writes the presence states
	 */
	private async publishPresence(): Promise<void> {
		// one person may have several states (GPS, ping, ...): at home when one of them says so
		const persons = new Map<string, boolean>();
		for (const id of this.presenceIds) {
			const name = this.personOf.get(id) || id;
			persons.set(name, persons.get(name) || false || !!this.presenceVals.get(id));
		}
		const list = [...persons.entries()]
			.map(([name, home]) => ({ name, home }))
			.sort((a, b) => a.name.localeCompare(b.name));
		const home = list.filter(p => p.home).length;
		await this.setStateChangedAsync('status.presentCount', home, true);
		await this.setStateChangedAsync('status.present', JSON.stringify(list), true);
		await this.setStateChangedAsync('status.someoneHome', home > 0 || !this.presenceIds.length, true);
	}

	/**
	 * Adds an entry to the logbook
	 *
	 * @param type event
	 * @param text text
	 */
	private addLog(type: string, text: string): void {
		this.log_.unshift({ ts: Date.now(), type, text });
		this.log_ = this.log_.slice(0, Math.max(10, num(this.config.logSize, 100)));
		void this.setStateAsync('status.log', JSON.stringify(this.log_), true);
	}

	// ======================================================================
	// presence simulation
	// ======================================================================

	/** should the simulation run now? */
	private simWanted(): boolean {
		const c = this.config;
		if (!c.simEnabled || !this.simLamps.length) {
			return false;
		}
		const st = this.alarm?.status();
		const armedFull = !!st && st.mode === 'full' && st.phase !== 'disarmed';
		const away = this.presenceIds.length > 0 && !this.someoneHome();
		switch (c.simCoupling) {
			case 'alarm':
				return armedFull;
			case 'away':
				return away;
			case 'alarmOrAway':
				return armedFull || away;
			default:
				return false;
		}
	}

	/**
	 * Starts or stops the simulation as wanted
	 */
	private async updateSimulation(): Promise<void> {
		// not before the start is complete: lamps and presence must be known
		if (!this.sim || !this.started) {
			return;
		}
		const want = !!this.config.simEnabled && this.simLamps.length > 0 && this.simWanted();
		// first decision after a restart: a simulation that was running goes on without a new log entry or message
		const quiet = this.simRestoring;
		this.simRestoring = false;
		if (want === this.lastSimActive) {
			return;
		}
		this.lastSimActive = want;
		if (want) {
			this.learner.reset();
			this.sim.start();
			if (quiet) {
				return;
			}
			if (this.config.notifySim) {
				this.notifyAll(this.T.simStart);
			}
			this.addLog('simStart', this.T.simStart);
			await this.runActions('simStart');
		} else {
			this.sim.stop();
			if (this.config.notifySim) {
				this.notifyAll(this.T.simStop);
			}
			this.addLog('simStop', this.T.simStop);
			await this.runActions('simStop');
		}
	}

	/**
	 * Plan of the current evening
	 *
	 * @param now current time
	 */
	private makePlan(now: number): PlanStep[] {
		// with the evening/morning light, those lamps belong to it and not to the simulation
		const lamps = this.simLamps.filter(
			l => !(l.type === 'evening' && this.eveningOn()) && !(l.type === 'morning' && this.morningOn()),
		);
		// the current evening (until 12:00 the one before) and the next one, so there is always something ahead
		const first = eveningNoon(now);
		return [...this.planOne(first, now, lamps), ...this.planOne(first + 24 * 3600000, now, lamps)].sort(
			(a, b) => a.at - b.at,
		);
	}

	/**
	 * Plan of the evening light: only the evening lamps, at dusk on and at "lights out" off
	 *
	 * @param now current time
	 */
	private makeEveningPlan(now: number): PlanStep[] {
		const first = eveningNoon(now);
		// evening and morning planned on their own: one lamp can be both, and each has its own switches
		const part = (type: LampType, on: boolean, off: boolean): PlanStep[] => {
			const lamps = this.simLamps.filter(l => l.type === type);
			return [
				...this.planOne(first, now, lamps, true),
				...this.planOne(first + 24 * 3600000, now, lamps, true),
			].filter(st => (st.on ? on : off));
		};
		return [
			...(this.eveningOn() ? part('evening', this.lightSw.eveningOn, this.lightSw.eveningOff) : []),
			...(this.morningOn() ? part('morning', this.lightSw.morningOn, this.lightSw.morningOff) : []),
		].sort((a, b) => a.at - b.at);
	}

	/** @returns the evening light is switched on and has lamps - every evening, independent of the simulation */
	private eveningOn(): boolean {
		return (
			(this.lightSw.eveningOn || this.lightSw.eveningOff) &&
			!!this.config.eveningLight &&
			this.simLamps.some(l => l.type === 'evening')
		);
	}

	/** @returns the morning light is switched on and has lamps */
	private morningOn(): boolean {
		return (
			(this.lightSw.morningOn || this.lightSw.morningOff) &&
			!!this.config.morningLight &&
			this.simLamps.some(l => l.type === 'morning')
		);
	}

	/**
	 * Starts, re-plans or stops the evening and morning light after the settings or the lamps changed
	 *
	 * @param catchUp switched on by hand: lamps that should be on now go on at once
	 */
	private updateEvening(catchUp = false): void {
		if (this.eveningOn() || this.morningOn()) {
			const lamps = this.simLamps.filter(
				l => (l.type === 'evening' && this.eveningOn()) || (l.type === 'morning' && this.morningOn()),
			).length;
			this.log.info(`Evening/morning light active for ${lamps} lamps`);
			if (this.evening.active) {
				this.evening.replan(catchUp);
			} else {
				this.evening.start(catchUp);
			}
		} else {
			this.evening.stop();
		}
	}

	/**
	 * Is a time inside the learning window (always, only when dark, or between two times)?
	 *
	 * @param ts time in ms
	 */
	private inLearnWindow(ts: number): boolean {
		const c = this.config;
		const d = new Date(ts);
		if (c.simLearnWindow === 'times') {
			const m = d.getHours() * 60 + d.getMinutes();
			const hm = (v: string, f: number): number => {
				const x = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
				return x ? Number(x[1]) * 60 + Number(x[2]) : f;
			};
			const from = hm(c.simLearnFrom, 15 * 60);
			const to = hm(c.simLearnTo, 2 * 60);
			return from <= to ? m >= from && m < to : m >= from || m < to;
		}
		if (c.simLearnWindow === 'dark') {
			const sun = sunTimes(d, this.lat, this.lon);
			if (!sun) {
				return true;
			}
			return ts >= sun.sunset - num(c.simLearnDarkOffset, 30) * 60000 || ts < sun.sunrise;
		}
		return true;
	}

	/**
	 * Plan of one evening
	 * Plan of one evening and the following morning
	 *
	 * @param noon 12:00 of the evening day
	 * @param now current time
	 * @param lamps lamps of this plan
	 * @param eveningLight true: plan of the evening light (dusk only, no visits)
	 */
	private planOne(noon: number, now: number, lamps: SimLamp[], eveningLight = false): PlanStep[] {
		const c = this.config;
		const sun = sunTimes(new Date(noon), this.lat, this.lon);
		let sunset = sun ? sun.sunset : noon + 6 * 3600000;
		const next = sunTimes(new Date(noon + 24 * 3600000), this.lat, this.lon);
		// lux below the threshold today: dusk starts then (if earlier)
		if (this.luxDuskTs && eveningKey(this.luxDuskTs) === eveningKey(noon) && eveningKey(noon) === eveningKey(now)) {
			sunset = Math.min(sunset, this.luxDuskTs - num(c.simStartOffset, -30) * 60000);
		}
		return planEvening(
			noon,
			sunset,
			lamps,
			{
				mode: eveningLight ? 'dusk' : c.simMode || 'dusk',
				startOffset: num(c.simStartOffset, -30),
				startRandom: num(c.simStartRandom, 20),
				end: c.simEnd || '22:30',
				endRandom: num(c.simEndRandom, 60),
				weekendLater: num(c.simWeekendLater, 45),
				visits: eveningLight ? 0 : num(c.simVisits, 4),
				visitMin: num(c.simVisitMin, 2),
				visitMax: num(c.simVisitMax, 15),
				learnDays: num(c.simLearnDays, 28),
				jitter: num(c.simJitter, 15),
				learnPick: c.simLearnPick === 'weekday' ? 'weekday' : 'kind',
				deviceMin: clamp(num(c.simDeviceMin, 60), 5, 600),
				deviceMax: clamp(num(c.simDeviceMax, 180), 5, 600),
				deviceCount: clamp(num(c.simDeviceCount, 1), 1, 5),
				wake: c.simWake || '06:30',
				wakeRandom: clamp(num(c.simWakeRandom, 20), 0, 120),
				wakeWeekendLater: clamp(num(c.simWakeWeekendLater, 60), 0, 240),
				sunriseNext: next ? next.sunrise : undefined,
				morningOffOffset: clamp(num(c.simMorningOffOffset, 5), -120, 240),
				morningOffRandom: clamp(num(c.simMorningOffRandom, 25), 0, 120),
				morningOffTime: c.simMorningOffTime || '',
				morningBright:
					this.luxBrightTs && eveningKey(this.luxBrightTs) === eveningKey(noon)
						? this.luxBrightTs
						: undefined,
				learnFilter: ts => this.inLearnWindow(ts),
			},
			this.learner,
		);
	}

	/**
	 * Brightness changed: the evening may start earlier
	 *
	 * @param lux brightness
	 */
	private onLux(lux: number): void {
		const c = this.config;
		if (isNaN(lux)) {
			return;
		}
		const now = Date.now();
		const hour = new Date(now).getHours();
		// morning: bright enough outside - the morning lamps go off (once per morning)
		const above = num(c.simMorningLuxAbove, 0);
		if (
			above > 0 &&
			lux > above &&
			hour >= 4 &&
			hour < 12 &&
			(!this.luxBrightTs || new Date(this.luxBrightTs).toDateString() !== new Date(now).toDateString())
		) {
			this.luxBrightTs = now;
			const automatic = (this.morningOn() && this.lightSw.morningOff) || this.sim.active;
			if (automatic) {
				for (const id of new Set(this.simLamps.filter(l => l.type === 'morning').map(l => l.id))) {
					if (this.simLampVals.get(id)) {
						void this.switchLamp(id, false);
					}
				}
			}
			this.sim.replan();
			this.evening.replan();
		}
		if (!c.simLuxBelow) {
			return;
		}
		if (lux < c.simLuxBelow && hour >= 14 && (!this.luxDuskTs || eveningKey(this.luxDuskTs) !== eveningKey(now))) {
			this.luxDuskTs = now;
			this.sim.replan();
			this.evening.replan();
		}
	}

	/**
	 * Switches a simulation lamp
	 *
	 * @param id state ID
	 * @param on on or off
	 */
	private async switchLamp(id: string, on: boolean): Promise<void> {
		const { on: vOn, off } = await this.onOffValues(id);
		// own values of the row (e.g. a scene for the TV), otherwise true/false or maximum/0
		const lamp = this.simLamps.find(l => l.id === id);
		const own = on ? lamp?.valueOn : lamp?.valueOff;
		await this.setForeignStateAsync(id, own ? this.parseValue(own) : on ? vOn : off, false);
	}

	/**
	 * Writes the simulation states
	 *
	 * @param active running
	 * @param plan remaining steps
	 * @param next next step
	 */
	private async publishSim(active: boolean, plan: PlanStep[], next: PlanStep | null): Promise<void> {
		const name = (id: string): string => this.simLamps.find(l => l.id === id)?.name || id;
		const fmt = (ts: number): string =>
			new Date(ts).toLocaleTimeString(this.T === texts('de') ? 'de-DE' : 'en-GB', {
				hour: '2-digit',
				minute: '2-digit',
			});
		await this.setStateChangedAsync('simulation.active', active, true);
		await this.setStateChangedAsync(
			'simulation.next',
			next ? `${fmt(next.at)} ${name(next.id)} ${this.T.onOff[next.on ? 1 : 0]}` : '',
			true,
		);
		await this.setStateChangedAsync(
			'simulation.plan',
			JSON.stringify(plan.map(s => ({ at: s.at, time: fmt(s.at), lamp: name(s.id), on: s.on, why: s.why }))),
			true,
		);
	}

	/**
	 * Saves the learned days a few seconds later
	 */
	private saveLearnedSoon(): void {
		if (this.learnSaveTimer) {
			this.clearTimeout(this.learnSaveTimer);
		}
		this.learnSaveTimer = this.setTimeout(() => {
			this.learnSaveTimer = undefined;
			this.learner.prune(Date.now(), num(this.config.simLearnDays, 28));
			void this.setStateAsync('simulation.learned', JSON.stringify(this.learner.data), true);
			void this.setStateAsync('simulation.learnedDays', Object.keys(this.learner.data.days).length, true);
		}, 5000);
	}

	// ======================================================================
	// every minute: night mode, sabotage, daily simulation plan
	// ======================================================================

	/**
	 * Every minute: night mode, sabotage, new plan at noon
	 */
	private async everyMinute(): Promise<void> {
		const c = this.config;
		const now = new Date();
		const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
		if (hm === this.lastMinute) {
			return;
		}
		this.lastMinute = hm;
		if (c.alarmEnabled && c.nightEnabled) {
			if (hm === c.nightStart && this.alarm.mode === 'off') {
				this.alarm.arm('night', 'night');
			}
			if (hm === c.nightEnd && this.alarm.mode === 'night') {
				this.alarm.disarm('night');
			}
		}
		if (hm === '12:05') {
			this.learner.prune(Date.now(), num(c.simLearnDays, 28));
			this.sim.replan();
			this.evening.replan();
		}
		if (now.getMinutes() === 7 || this.sabotageKnown.size === 0) {
			await this.checkSabotage();
		}
		await this.updateSimulation();
	}

	/**
	 * Reports sensors that did not report for too long
	 */
	private async checkSabotage(): Promise<void> {
		const hours = clamp(num(this.config.sabotageHours, 0), 0, 720);
		if (hours <= 0) {
			return;
		}
		const limit = Date.now() - hours * 3600000;
		const stale: SensorDef[] = [];
		for (const s of this.alarm.getSensors()) {
			const st = await this.getForeignStateAsync(s.id);
			if (!st || st.ts < limit) {
				stale.push(s);
			}
		}
		await this.setStateChangedAsync('status.sabotage', JSON.stringify(stale.map(s => s.name)), true);
		const fresh = stale.filter(s => !this.sabotageKnown.has(s.id));
		this.sabotageKnown = new Set(stale.map(s => s.id));
		this.sabotageKnown.add('#checked');
		if (fresh.length) {
			await this.onAlarmEvent('sabotage', { sensors: fresh });
		}
	}

	/**
	 * JSON of a state or the fallback
	 *
	 * @param v state value
	 * @param fallback used on errors
	 */
	private parseJson<T>(v: unknown, fallback: T): T {
		try {
			return typeof v === 'string' && v ? (JSON.parse(v) as T) : fallback;
		} catch {
			return fallback;
		}
	}
}

/**
 * A number limited to a range
 *
 * @param v value
 * @param min smallest value
 * @param max largest value
 */
function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}

/**
 * Number of a setting or the fallback
 *
 * @param v value
 * @param fallback used when empty or invalid
 */
function num(v: unknown, fallback: number): number {
	const n = Number(v);
	return v === '' || v === null || v === undefined || isNaN(n) ? fallback : n;
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new HomeGuard(options);
} else {
	// otherwise start the instance directly
	(() => new HomeGuard())();
}
