// Alarm logic: modes, exit and entry delay, open contacts, motion rule, alarm, panic, acknowledge.
// Pure logic - everything that touches ioBroker goes through the AlarmHost, so it can be tested with a fake clock.

export type Mode = 'off' | 'full' | 'perimeter' | 'night';
export type Phase = 'disarmed' | 'arming' | 'armed' | 'entry' | 'alarm';
export type Circuit = 'perimeter' | 'interior' | '24h';

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
	| 'alarmEnd'
	| 'wrongPin'
	| 'sabotage';

export interface SensorDef {
	id: string;
	name: string;
	circuit: Circuit;
	delayed: boolean;
	invert: boolean;
	motion: boolean;
}

export interface AlarmOptions {
	exitDelayFull: number; // s
	exitDelayPerimeter: number; // s
	armEarlyId: string;
	entryDelay: number; // s
	openCheck: 'refuse' | 'warn' | 'ignore';
	alarmDuration: number; // s
	motionCount: number;
	motionWindowSec: number;
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
}

/** Does a value mean "open" / "triggered"? Numbers > 0 (WINDOW_STATE 1 = tilted, 2 = open), strings like open/true/1 */
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

/** Which circuits trigger in which mode */
export function circuitActive(circuit: Circuit, mode: Mode): boolean {
	if (circuit === '24h') {
		return true;
	}
	if (mode === 'off') {
		return false;
	}
	if (circuit === 'perimeter') {
		return true;
	}
	return mode === 'full';
}

export class AlarmEngine {
	mode: Mode = 'off';
	phase: Phase = 'disarmed';
	private sensors = new Map<string, SensorDef>();
	private open = new Map<string, boolean>();
	private countdownEnd = 0;
	private countdownTimer: unknown = null;
	private tickTimer: unknown = null;
	private outputTimer: unknown = null;
	private motionHits: { id: string; ts: number }[] = [];
	private armingMode: Mode = 'off';
	private lastTrigger = '';
	private lastTriggerTime = 0;
	private alarmActive = false;

	constructor(
		private host: AlarmHost,
		public opts: AlarmOptions,
	) {}

	// ---------- sensors ----------

	setSensors(list: SensorDef[], values: Record<string, unknown>): void {
		this.sensors = new Map(list.map(s => [s.id, s]));
		this.open = new Map(list.map(s => [s.id, isOpenValue(values[s.id], s.invert)]));
		this.publish();
	}

	getSensors(): SensorDef[] {
		return [...this.sensors.values()];
	}

	/** open contacts that matter for a mode (motion detectors never block arming) */
	openFor(mode: Mode): SensorDef[] {
		return this.getSensors().filter(
			s => this.open.get(s.id) && !s.motion && s.circuit !== '24h' && circuitActive(s.circuit, mode),
		);
	}

	/** a sensor value changed */
	sensorChanged(id: string, val: unknown): void {
		const s = this.sensors.get(id);
		if (!s) {
			return;
		}
		const was = this.open.get(id) || false;
		const now = isOpenValue(val, s.invert);
		this.open.set(id, now);
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

	private triggered(s: SensorDef): void {
		if (s.circuit === '24h') {
			this.alarm(s);
			return;
		}
		if (this.phase !== 'armed' && this.phase !== 'entry') {
			return; // disarmed, exit delay running, or alarm already active
		}
		if (!circuitActive(s.circuit, this.mode)) {
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
		if (s.delayed && this.opts.entryDelay > 0) {
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
	arm(mode: Mode, source: string): { ok: boolean; open: SensorDef[] } {
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
		this.clearTimers();
		this.stopOutputs();
		this.alarmActive = false;
		if (open.length && this.opts.openCheck === 'warn') {
			this.host.event('openWarning', { mode, sensors: open, source });
		}
		const delay = mode === 'full' ? this.opts.exitDelayFull : mode === 'perimeter' ? this.opts.exitDelayPerimeter : 0;
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

	/** cancel a running exit delay */
	cancelArming(source: string): void {
		if (this.phase === 'arming') {
			this.disarm(source);
		}
	}

	private finishArming(source = 'delay'): void {
		this.clearTimers();
		this.mode = this.armingMode;
		this.phase = 'armed';
		this.motionHits = [];
		const ev = this.mode === 'full' ? 'armedFull' : this.mode === 'perimeter' ? 'armedPerimeter' : 'armedNight';
		this.host.event(ev, { mode: this.mode, source });
		this.publish();
	}

	/** restore after a restart: armed again without exit delay and without a notification */
	restore(mode: Mode): void {
		if (mode === 'off') {
			return;
		}
		this.mode = mode;
		this.armingMode = mode;
		this.phase = 'armed';
		this.publish();
	}

	// ---------- entry delay and alarm ----------

	private startEntry(s: SensorDef): void {
		this.phase = 'entry';
		this.lastTrigger = s.name;
		this.lastTriggerTime = this.host.now();
		this.host.event('entry', { mode: this.mode, sensor: s });
		this.startCountdown(this.opts.entryDelay, () => this.alarm(s));
	}

	/** trigger the alarm (also used for panic) */
	alarm(s: SensorDef, panic = false): void {
		this.clearTimers();
		this.phase = 'alarm';
		this.alarmActive = true;
		this.lastTrigger = s.name;
		this.lastTriggerTime = this.host.now();
		this.host.event('alarm', { mode: this.mode, sensor: s, panic });
		this.host.outputs(true);
		if (this.opts.alarmDuration > 0) {
			this.outputTimer = this.host.setTimer(() => {
				this.outputTimer = null;
				this.host.outputs(false);
			}, this.opts.alarmDuration * 1000);
		}
		this.publish();
	}

	panic(source: string): void {
		this.alarm({ id: 'panic', name: source, circuit: '24h', delayed: false, invert: false, motion: false }, true);
	}

	/** acknowledge: outputs off, alarm flag off; the system stays armed */
	ack(source: string): void {
		if (!this.alarmActive && this.phase !== 'alarm') {
			return;
		}
		this.stopOutputs();
		this.alarmActive = false;
		this.phase = this.mode === 'off' ? 'disarmed' : 'armed';
		this.host.event('alarmEnd', { mode: this.mode, source });
		this.publish();
	}

	disarm(source: string): void {
		const hadAlarm = this.alarmActive || this.phase === 'alarm';
		const wasOff = this.mode === 'off' && this.phase === 'disarmed';
		this.clearTimers();
		this.stopOutputs();
		this.alarmActive = false;
		this.mode = 'off';
		this.armingMode = 'off';
		this.phase = 'disarmed';
		this.motionHits = [];
		if (hadAlarm) {
			this.host.event('alarmEnd', { mode: 'off', source });
		}
		if (!wasOff) {
			this.host.event('disarmed', { mode: 'off', source });
		}
		this.publish();
	}

	// ---------- timers ----------

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

	status(): AlarmStatus {
		const countdown = this.countdownEnd ? Math.max(0, Math.ceil((this.countdownEnd - this.host.now()) / 1000)) : 0;
		const openAll = this.getSensors().filter(s => this.open.get(s.id) && !s.motion);
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
		};
	}

	private publish(): void {
		this.host.publish(this.status());
	}
}
