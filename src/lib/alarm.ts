// Alarm logic: modes, exit and entry delay, open contacts, motion rule, alarm, panic, acknowledge.
// Pure logic - everything that touches ioBroker goes through the AlarmHost, so it can be tested with a fake clock.

export type Mode = 'off' | 'full' | 'perimeter' | 'night';
export type Phase = 'disarmed' | 'arming' | 'armed' | 'entry' | 'alarm';
export type Circuit = 'perimeter' | 'interior' | '24h' | 'report';

/** Events that can trigger notifications and actions */
export type AlarmEvent =
	| 'armedFull'
	| 'armedPerimeter'
	| 'armedNight'
	| 'arming'
	| 'disarmed'
	| 'armingFailed'
	| 'openWarning'
	| 'entry'
	| 'alarm'
	| 'alarmMore'
	| 'alarmEnd'
	| 'wrongPin'
	| 'sabotage'
	| 'hazard'
	| 'report';

export interface SensorDef {
	id: string;
	name: string;
	circuit: Circuit;
	delayed: boolean;
	invert: boolean;
	motion: boolean;
	/** 24 h sensors: only a message, message and speech, or a full alarm (sirens, lamps, actions) */
	hazard?: 'notify' | 'speech' | 'alarm';
	/** window handle: "tilted" is no alarm in perimeter and night protection (fully open still is) */
	tiltOk?: boolean;
}

export interface AlarmOptions {
	exitDelayFull: number; // s
	exitDelayPerimeter: number; // s
	armEarlyId: string;
	entryDelay: number; // s
	/** open contacts when arming: refuse, warn, ignore, or bypass them until they are closed */
	openCheck: 'refuse' | 'warn' | 'ignore' | 'bypass';
	alarmDuration: number; // s
	/** after the alarm duration: further movement or a further sensor starts the outputs again for one more alarm duration */
	retrigger?: boolean;
	motionCount: number;
	motionWindowSec: number;
	/** report-only sensors: only while armed, or always */
	reportWhen?: 'armed' | 'always';
}

export interface AlarmHost {
	now(): number;
	setTimer(fn: () => void, ms: number): unknown;
	clearTimer(handle: unknown): void;
	/** writes the status states (mode, phase, countdown, open contacts, ...) */
	publish(status: AlarmStatus): void;
	/** an event happened: notifications, actions, logbook */
	event(event: AlarmEvent, info: EventInfo): void;
	/** the alarm outputs (lamps, sirens) on or off */
	outputs(on: boolean): void;
}

export interface EventInfo {
	mode?: Mode;
	sensor?: SensorDef;
	sensors?: SensorDef[];
	source?: string;
	panic?: boolean;
	/** openWarning: the open contacts are bypassed until they are closed */
	bypass?: boolean;
	/** alarmEnd: the alarm was acknowledged - outputs off, the system stays armed */
	acked?: boolean;
	/** alarm, alarmMore: names of all sensors that triggered during this alarm, the first one first */
	triggered?: string[];
}

export interface AlarmStatus {
	mode: Mode;
	phase: Phase;
	countdown: number;
	alarm: boolean;
	entry: boolean;
	openContacts: SensorDef[];
	readyFull: boolean;
	readyPerimeter: boolean;
	lastTrigger: string;
	lastTriggerTime: number;
	/** open contacts left out at arming, watched again as soon as they are closed */
	bypassed: SensorDef[];
}

/**
 * Does a value mean "open" / "triggered"? Numbers > 0 (WINDOW_STATE 1 = tilted, 2 = open), strings like open/true/1
 *
 * @param val state value
 * @param invert the sensor reports open as false
 */
export function isOpenValue(val: unknown, invert = false): boolean {
	let open: boolean;
	if (typeof val === 'boolean') {
		open = val;
	} else if (typeof val === 'number') {
		open = val > 0;
	} else if (typeof val === 'string') {
		const v = val.trim().toLowerCase();
		open = ['true', 'open', 'opened', 'on', '1', '2', 'tilted', 'offen', 'gekippt', 'auf'].includes(v);
	} else {
		open = false;
	}
	return invert ? !open : open;
}

/**
 * Is a value "tilted"? Window handles (Homematic WINDOW_STATE, rotary handles): 0 = closed, 1 = tilted, 2 = open
 *
 * @param val state value
 */
export function isTiltedValue(val: unknown): boolean {
	if (typeof val === 'number') {
		return val === 1;
	}
	if (typeof val === 'string') {
		return ['tilted', 'gekippt'].includes(val.trim().toLowerCase());
	}
	return false;
}

/**
 * Which circuits trigger in which mode
 *
 * @param circuit circuit of the sensor
 * @param mode current mode
 */
export function circuitActive(circuit: Circuit, mode: Mode): boolean {
	if (circuit === '24h') {
		return true;
	}
	if (circuit === 'report') {
		return false; // report-only sensors never trigger the alarm and never block arming
	}
	if (mode === 'off') {
		return false;
	}
	if (circuit === 'perimeter') {
		return true;
	}
	return mode === 'full';
}

/**
 * Alarm logic: modes, delays, triggers and outputs
 */
export class AlarmEngine {
	mode: Mode = 'off';
	phase: Phase = 'disarmed';
	private sensors = new Map<string, SensorDef>();
	private open = new Map<string, boolean>();
	private tilted = new Map<string, boolean>();
	/** open contacts bypassed at arming (openCheck "bypass") until they are closed */
	private bypassed = new Set<string>();
	private countdownEnd = 0;
	private countdownTimer: unknown = null;
	private tickTimer: unknown = null;
	private outputTimer: unknown = null;
	private motionHits: {
		id: string;
		ts: number;
	}[] = [];
	private armingMode: Mode = 'off';
	private lastTrigger = '';
	private lastTriggerTime = 0;
	private alarmActive = false;
	/** alarm acknowledged while armed: the same incident - a further sensor alarms at once, without entry delay */
	private afterAck = false;
	/** sensors that triggered during the running alarm (ids and names, the first one first) */
	private alarmIds = new Set<string>();
	private alarmNames: string[] = [];
	/** report-only sensors switched on (state control.report) */
	reportOn = true;

	/**
	 * Creates the engine
	 *
	 * @param host access to timers, states and notifications
	 * @param opts delays and rules
	 */
	constructor(
		private host: AlarmHost,
		public opts: AlarmOptions,
	) {}

	// ---------- sensors ----------

	/**
	 * Sets the monitored sensors and their current values
	 *
	 * @param list the sensors
	 * @param values current values by state ID
	 */
	setSensors(list: SensorDef[], values: Record<string, unknown>): void {
		this.sensors = new Map(list.map(s => [s.id, s]));
		this.open = new Map(list.map(s => [s.id, isOpenValue(values[s.id], s.invert)]));
		this.tilted = new Map(list.map(s => [s.id, isTiltedValue(values[s.id])]));
		for (const id of [...this.bypassed]) {
			if (!this.sensors.has(id)) {
				this.bypassed.delete(id);
			}
		}
		this.publish();
	}

	/**
	 * The monitored sensors
	 */
	getSensors(): SensorDef[] {
		return [...this.sensors.values()];
	}

	/**
	 * open contacts that matter for a mode (motion detectors never block arming)
	 *
	 * @param mode mode to check
	 */
	openFor(mode: Mode): SensorDef[] {
		return this.getSensors().filter(
			s => this.isOpen(s, mode) && !s.motion && s.circuit !== '24h' && circuitActive(s.circuit, mode),
		);
	}

	/**
	 * open as far as the alarm is concerned: a tilted window with "tilted is fine" counts as closed at home
	 * (perimeter and night protection), but as open in full protection
	 *
	 * @param s the sensor
	 * @param mode mode to judge for
	 */
	private isOpen(s: SensorDef, mode: Mode): boolean {
		if (!this.open.get(s.id)) {
			return false;
		}
		return !(s.tiltOk && this.tilted.get(s.id) && mode !== 'full');
	}

	/**
	 * a sensor value changed
	 *
	 * @param id state ID of the sensor
	 * @param val new value
	 */
	sensorChanged(id: string, val: unknown): void {
		const s = this.sensors.get(id);
		if (!s) {
			return;
		}
		const was = this.isOpen(s, this.mode);
		this.open.set(id, isOpenValue(val, s.invert));
		this.tilted.set(id, isTiltedValue(val));
		const now = this.isOpen(s, this.mode);
		// a bypassed contact is watched again as soon as it is closed
		if (!now && this.bypassed.delete(id)) {
			this.publish();
		}
		// close the early-arming contact (e.g. front door) while the exit delay runs: armed at once
		if (this.phase === 'arming' && id === this.opts.armEarlyId && was && !now) {
			this.finishArming();
			return;
		}
		if (!was && now) {
			this.triggered(s);
		}
		this.publish();
	}

	/**
	 * A sensor changed to open: alarm, entry delay or nothing, depending on mode and rules
	 *
	 * @param s the sensor
	 */
	private triggered(s: SensorDef): void {
		if (s.circuit === 'report') {
			// report-only (garden gate, letter box, shed): a message, never an alarm
			if (this.reportOn && (this.opts.reportWhen === 'always' || this.mode !== 'off')) {
				this.host.event('report', { mode: this.mode, sensor: s });
			}
			return;
		}
		if (s.circuit === '24h') {
			// danger detectors (smoke, water, gas): a full alarm only when set so, otherwise a danger message
			if (s.hazard === 'alarm') {
				this.alarm(s);
			} else {
				this.lastTrigger = s.name;
				this.lastTriggerTime = this.host.now();
				this.host.event('hazard', { mode: this.mode, sensor: s });
			}
			return;
		}
		if (this.phase === 'alarm') {
			// alarm already running: further sensors are collected and reported once each (where is the burglar?)
			if (this.mode !== 'off' && circuitActive(s.circuit, this.mode) && !this.bypassed.has(s.id)) {
				this.more(s);
				// sirens already silent after the alarm duration (not acknowledged): any further movement or
				// sensor - the same one again too - sounds again for one more alarm duration, when set so
				if (
					this.opts.retrigger &&
					this.opts.alarmDuration > 0 &&
					this.outputTimer === null &&
					this.alarmActive
				) {
					this.startOutputs();
				}
			}
			return;
		}
		if (this.phase !== 'armed' && this.phase !== 'entry') {
			return; // disarmed or exit delay running
		}
		if (!circuitActive(s.circuit, this.mode)) {
			return;
		}
		if (this.bypassed.has(s.id)) {
			return; // left out at arming because it was open - watched again once it is closed
		}
		// entry delay running: inside sensors follow (walking to the panel past motion detectors is no alarm)
		if (this.phase === 'entry' && s.circuit === 'interior') {
			return;
		}
		if (s.motion && this.opts.motionCount > 1) {
			const t = this.host.now();
			const windowMs = this.opts.motionWindowSec * 1000;
			this.motionHits = this.motionHits.filter(h => t - h.ts <= windowMs && h.id !== s.id);
			this.motionHits.push({ id: s.id, ts: t });
			if (this.motionHits.length < this.opts.motionCount) {
				return; // one detector alone (cat, curtain) is not yet an alarm
			}
			this.motionHits = [];
		}
		if (s.delayed && this.opts.entryDelay > 0 && !this.afterAck) {
			if (this.phase === 'armed') {
				this.startEntry(s);
			}
			return; // already in the entry delay: the countdown keeps running
		}
		this.alarm(s);
	}

	// ---------- arming ----------

	/**
	 * Arm in a mode. Returns null when done/started, otherwise the reason it was refused.
	 *
	 * @param mode full, perimeter or night
	 * @param source who armed (pin, state, presence, widget, schedule)
	 */
	arm(
		mode: Mode,
		source: string,
	): {
		ok: boolean;
		open: SensorDef[];
	} {
		if (mode === 'off') {
			this.disarm(source);
			return { ok: true, open: [] };
		}
		const open = this.openFor(mode);
		if (open.length && this.opts.openCheck === 'refuse') {
			this.host.event('armingFailed', { mode, sensors: open, source });
			this.publish();
			return { ok: false, open };
		}
		const hadAlarm = this.alarmActive || this.phase === 'alarm';
		this.clearTimers();
		this.stopOutputs();
		this.alarmActive = false;
		this.afterAck = false;
		if (hadAlarm) {
			this.host.event('alarmEnd', { mode, source });
		}
		this.bypassed.clear();
		if (open.length && this.opts.openCheck === 'bypass') {
			open.forEach(s => this.bypassed.add(s.id));
			this.host.event('openWarning', { mode, sensors: open, source, bypass: true });
		} else if (open.length && this.opts.openCheck === 'warn') {
			this.host.event('openWarning', { mode, sensors: open, source });
		}
		const delay =
			mode === 'full' ? this.opts.exitDelayFull : mode === 'perimeter' ? this.opts.exitDelayPerimeter : 0;
		this.armingMode = mode;
		if (delay > 0) {
			this.mode = mode;
			this.phase = 'arming';
			this.host.event('arming', { mode, source });
			this.startCountdown(delay, () => this.finishArming());
		} else {
			this.mode = mode;
			this.finishArming(source);
		}
		return { ok: true, open };
	}

	/**
	 * cancel a running exit delay
	 *
	 * @param source who cancelled
	 */
	cancelArming(source: string): void {
		if (this.phase === 'arming') {
			this.disarm(source);
		}
	}

	/**
	 * The exit delay is over (or skipped): armed
	 *
	 * @param source who armed
	 */
	private finishArming(source = 'delay'): void {
		this.clearTimers();
		this.mode = this.armingMode;
		this.phase = 'armed';
		this.motionHits = [];
		const ev = this.mode === 'full' ? 'armedFull' : this.mode === 'perimeter' ? 'armedPerimeter' : 'armedNight';
		this.host.event(ev, { mode: this.mode, source });
		this.publish();
	}

	/**
	 * restore after a restart: armed again without exit delay and without a notification
	 *
	 * @param mode mode that was armed before the restart
	 */
	restore(mode: Mode): void {
		if (mode === 'off') {
			return;
		}
		this.mode = mode;
		this.armingMode = mode;
		this.phase = 'armed';
		this.publish();
	}

	/**
	 * restore after a restart during an alarm: the alarm stays until it is acknowledged, without a new notification
	 *
	 * @param mode mode that was armed before the restart ("off" for a 24 h or panic alarm)
	 * @param trigger name of the sensor that triggered
	 */
	restoreAlarm(mode: Mode, trigger: string): void {
		this.mode = mode;
		this.armingMode = mode;
		this.phase = 'alarm';
		this.alarmActive = true;
		this.lastTrigger = trigger;
		this.lastTriggerTime = this.host.now();
		this.publish();
	}

	// ---------- entry delay and alarm ----------

	/**
	 * Starts the entry delay (silent alarm)
	 *
	 * @param s the delayed sensor
	 */
	private startEntry(s: SensorDef): void {
		this.phase = 'entry';
		this.lastTrigger = s.name;
		this.lastTriggerTime = this.host.now();
		this.host.event('entry', { mode: this.mode, sensor: s });
		this.startCountdown(this.opts.entryDelay, () => this.alarm(s));
	}

	/**
	 * trigger the alarm (also used for panic)
	 *
	 * @param s triggering sensor
	 * @param panic true for the panic button
	 */
	alarm(s: SensorDef, panic = false): void {
		if (this.phase !== 'alarm') {
			this.alarmIds.clear();
			this.alarmNames = [];
		}
		if (!this.alarmIds.has(s.id)) {
			this.alarmIds.add(s.id);
			this.alarmNames.push(s.name);
		}
		this.clearTimers();
		this.phase = 'alarm';
		this.alarmActive = true;
		this.lastTrigger = s.name;
		this.lastTriggerTime = this.host.now();
		this.host.event('alarm', { mode: this.mode, sensor: s, panic, triggered: [...this.alarmNames] });
		this.startOutputs();
		this.publish();
	}

	/** alarm outputs on, for the alarm duration (0 = until acknowledged or disarmed) */
	private startOutputs(): void {
		this.host.outputs(true);
		if (this.opts.alarmDuration > 0) {
			this.outputTimer = this.host.setTimer(() => {
				this.outputTimer = null;
				this.host.outputs(false);
			}, this.opts.alarmDuration * 1000);
		}
	}

	/**
	 * A further sensor during a running alarm: reported once per sensor, the alarm itself goes on unchanged
	 *
	 * @param s the sensor
	 */
	private more(s: SensorDef): void {
		if (this.alarmIds.has(s.id)) {
			return;
		}
		this.alarmIds.add(s.id);
		this.alarmNames.push(s.name);
		this.host.event('alarmMore', { mode: this.mode, sensor: s, triggered: [...this.alarmNames] });
	}

	/**
	 * Panic alarm, also when disarmed
	 *
	 * @param source name shown as trigger
	 */
	panic(source: string): void {
		this.alarm({ id: 'panic', name: source, circuit: '24h', delayed: false, invert: false, motion: false }, true);
	}

	/**
	 * acknowledge: outputs off, alarm flag off; the system stays armed
	 *
	 * @param source who acknowledged
	 */
	ack(source: string): void {
		if (!this.alarmActive && this.phase !== 'alarm') {
			return;
		}
		this.stopOutputs();
		this.alarmActive = false;
		this.phase = this.mode === 'off' ? 'disarmed' : 'armed';
		// still armed: whoever acknowledged is maybe not the owner - the next sensor alarms without entry delay
		this.afterAck = this.mode !== 'off';
		this.host.event('alarmEnd', { mode: this.mode, source, acked: true });
		this.publish();
	}

	/**
	 * Disarms and ends a running alarm
	 *
	 * @param source who disarmed
	 */
	disarm(source: string): void {
		const hadAlarm = this.alarmActive || this.phase === 'alarm';
		const wasOff = this.mode === 'off' && this.phase === 'disarmed';
		this.clearTimers();
		this.stopOutputs();
		this.alarmActive = false;
		this.afterAck = false;
		this.mode = 'off';
		this.armingMode = 'off';
		this.phase = 'disarmed';
		this.motionHits = [];
		this.bypassed.clear();
		if (hadAlarm) {
			this.host.event('alarmEnd', { mode: 'off', source });
		}
		if (!wasOff) {
			this.host.event('disarmed', { mode: 'off', source });
		}
		this.publish();
	}

	// ---------- timers ----------

	/**
	 * Countdown with a status update every second
	 *
	 * @param seconds length
	 * @param done called at the end
	 */
	private startCountdown(seconds: number, done: () => void): void {
		this.clearTimers();
		this.countdownEnd = this.host.now() + seconds * 1000;
		this.countdownTimer = this.host.setTimer(() => {
			this.countdownTimer = null;
			done();
		}, seconds * 1000);
		const tick = (): void => {
			this.publish();
			if (this.countdownTimer) {
				this.tickTimer = this.host.setTimer(tick, 1000);
			}
		};
		tick();
	}

	/**
	 * Stops the countdown
	 */
	private clearTimers(): void {
		if (this.countdownTimer) {
			this.host.clearTimer(this.countdownTimer);
		}
		if (this.tickTimer) {
			this.host.clearTimer(this.tickTimer);
		}
		this.countdownTimer = null;
		this.tickTimer = null;
		this.countdownEnd = 0;
	}

	/**
	 * Switches lamps and sirens off
	 */
	private stopOutputs(): void {
		if (this.outputTimer) {
			this.host.clearTimer(this.outputTimer);
			this.outputTimer = null;
		}
		if (this.alarmActive || this.phase === 'alarm') {
			this.host.outputs(false);
		}
	}

	/** stop everything (adapter unload) */
	destroy(): void {
		this.clearTimers();
		if (this.outputTimer) {
			this.host.clearTimer(this.outputTimer);
			this.outputTimer = null;
		}
	}

	// ---------- status ----------

	/**
	 * Current status for the states and the panel
	 */
	status(): AlarmStatus {
		const countdown = this.countdownEnd ? Math.max(0, Math.ceil((this.countdownEnd - this.host.now()) / 1000)) : 0;
		const openAll = this.getSensors().filter(s => this.open.get(s.id) && !s.motion && s.circuit !== 'report');
		const bypassed = this.getSensors().filter(s => this.bypassed.has(s.id));
		return {
			mode: this.mode,
			phase: this.phase,
			countdown,
			alarm: this.alarmActive,
			entry: this.phase === 'entry',
			openContacts: openAll,
			readyFull: this.openFor('full').length === 0,
			readyPerimeter: this.openFor('perimeter').length === 0,
			lastTrigger: this.lastTrigger,
			lastTriggerTime: this.lastTriggerTime,
			bypassed,
		};
	}

	/**
	 * Hands the status to the host
	 */
	private publish(): void {
		this.host.publish(this.status());
	}
}
