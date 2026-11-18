// Presence simulation: plans an evening (dusk, learned days or both) and switches the lamps.
// Learning: switching of the simulation lamps that did not come from the adapter is stored per day;
// the simulation replays a whole real day of the same kind (weekday/weekend) with shifted times.

export type SimMode = 'dusk' | 'learned' | 'combined';
/** which learned days are candidates: same kind (weekday/weekend) or the same day of the week first */
export type LearnPick = 'kind' | 'weekday';
/** the same day of the week is only preferred when at least this many of them are learned */
const MIN_SAME_WEEKDAY = 3;
export type LampType = 'evening' | 'visit' | 'bedtime' | 'device' | 'morning';
/** when a device (TV, radio, Echo) runs in the simulation: in the evening, the whole day or between two times */
export type DeviceWindow = 'evening' | 'day' | 'custom';

export interface SimLamp {
	id: string;
	name: string;
	type: LampType;
	/** optional own value for "on" (e.g. a scene or a TV channel), otherwise true / the maximum */
	valueOn?: string;
	/** optional own value for "off", otherwise false / 0 */
	valueOff?: string;
	/** learned from a separate state (e.g. the real power state of the TV) - devices are learned only then */
	learn?: boolean;
	/** devices: time window (default: evening = dusk to lights out) */
	window?: DeviceWindow;
	/** devices with an own window: from / to (HH:MM, may pass midnight) */
	from?: string;
	to?: string;
	/** devices: how often and how long (minutes) - empty = the general settings */
	count?: number;
	durMin?: number;
	durMax?: number;
}

/** one learned switching: start in minutes after 12:00 of the evening day, duration in minutes */
export interface Session {
	id: string;
	start: number;
	dur: number;
}

export interface LearnedDay {
	weekend: boolean;
	sessions: Session[];
}

export interface Learned {
	days: Record<string, LearnedDay>;
}

export interface SimOptions {
	mode: SimMode;
	startOffset: number; // min, relative to sunset
	startRandom: number; // min
	end: string; // HH:MM
	endRandom: number; // min
	weekendLater: number; // min
	visits: number;
	visitMin: number; // min
	visitMax: number; // min
	learnDays: number;
	jitter: number; // min
	/** which learned days are candidates (default: weekday/weekend) */
	learnPick?: LearnPick;
	/** devices (TV, radio): running time in the evening from ... to ... minutes */
	deviceMin?: number;
	deviceMax?: number;
	/** devices: how often per evening (1 = once) */
	deviceCount?: number;
	/** morning lamps: on at this time (HH:MM) plus a random delay, off after sunrise */
	wake?: string;
	wakeRandom?: number; // min
	wakeWeekendLater?: number; // min, Saturday and Sunday morning
	/** sunrise of the next morning (ms) - without it no morning is planned */
	sunriseNext?: number;
	/** morning lamps off: minutes after sunrise plus a random delay (default 5 + 0..25) */
	morningOffOffset?: number;
	morningOffRandom?: number;
	/** morning lamps off at the latest at this time (HH:MM, e.g. when leaving the house; later on the weekend) */
	morningOffTime?: string;
	/** it became bright this morning (lux sensor): morning lamps off then at the latest */
	morningBright?: number;
	/** learned switching is only replayed when this says yes for its time and lamp (e.g. only when dark) */
	learnFilter?: (ts: number, id: string) => boolean;
}

export interface PlanStep {
	at: number; // ms
	id: string;
	on: boolean;
	why: string;
}

const MIN = 60000;

/**
 * the "evening day": switching after midnight still belongs to the evening before (until 12:00)
 *
 * @param ts time in ms
 */
export function eveningKey(ts: number): string {
	const d = new Date(ts - 12 * 3600000);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 12:00 local time of the evening day of ts
 *
 * @param ts time in ms
 */
export function eveningNoon(ts: number): number {
	const d = new Date(ts - 12 * 3600000);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime();
}

/**
 * Friday and Saturday evenings are the late ones
 *
 * @param ts time in ms
 */
export function isWeekendEvening(ts: number): boolean {
	// Friday and Saturday evenings are the late ones
	const day = new Date(eveningNoon(ts)).getDay();
	return day === 5 || day === 6;
}

/**
 * Minutes after midnight of "HH:MM"
 *
 * @param hm time text
 * @param fallback used when the text is invalid
 */
function parseHm(hm: string, fallback: number): number {
	const m = /^(\d{1,2}):(\d{2})$/.exec((hm || '').trim());
	return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/**
 * Learns switching of the simulation lamps per day
 */
export class Learner {
	private onSince = new Map<string, number>();

	/**
	 * Creates the learner
	 *
	 * @param data learned days of the last run
	 */
	constructor(public data: Learned = { days: {} }) {}

	/**
	 * a lamp was switched by somebody else than the adapter
	 *
	 * @param id lamp state ID
	 * @param on switched on (true) or off
	 * @param ts time of the switching in ms
	 * @param minDur shorter runs are not learned (minutes; e.g. an Echo that only answered a question)
	 */
	record(id: string, on: boolean, ts: number, minDur = 1): boolean {
		if (on) {
			if (!this.onSince.has(id)) {
				this.onSince.set(id, ts);
			}
			return false;
		}
		const since = this.onSince.get(id);
		this.onSince.delete(id);
		if (since === undefined) {
			return false;
		}
		const dur = Math.round((ts - since) / MIN);
		if (dur < Math.max(1, minDur) || dur > 16 * 60) {
			return false; // a flick of the switch or a lamp forgotten all day
		}
		const key = eveningKey(since);
		const day = (this.data.days[key] = this.data.days[key] || { weekend: isWeekendEvening(since), sessions: [] });
		day.sessions.push({ id, start: Math.round((since - eveningNoon(since)) / MIN), dur });
		return true;
	}

	/**
	 * drop days older than the learning window
	 *
	 * @param now current time in ms
	 * @param days number of days to keep
	 */
	prune(now: number, days: number): void {
		const oldest = eveningKey(now - days * 86400000);
		for (const k of Object.keys(this.data.days)) {
			if (k < oldest) {
				delete this.data.days[k];
			}
		}
	}

	/** forget the running "on" times (e.g. when the simulation starts) */
	reset(): void {
		this.onSince.clear();
	}

	/**
	 * learned days with sessions of the given lamps: with "weekday" the same weekday (a Tuesday for a Tuesday) when
	 * at least three of them are learned, otherwise - and always with "kind" - the same kind (weekday/weekend),
	 * then any
	 *
	 * @param weekend Friday/Saturday evening
	 * @param ids lamps that are wanted
	 * @param today key of the current evening (not used)
	 * @param pick "kind" (weekday/weekend) or "weekday" (same day of the week first)
	 */
	candidates(weekend: boolean, ids: Set<string>, today: string, pick: LearnPick = 'kind'): LearnedDay[] {
		const usable = Object.entries(this.data.days).filter(
			([k, d]) => k !== today && d.sessions.some(s => ids.has(s.id)),
		);
		if (pick === 'weekday') {
			const dayOf = (key: string): number => {
				const [y, m, d] = key.split('-').map(Number);
				return new Date(y, m - 1, d, 12).getDay();
			};
			const [ty, tm, td] = today.split('-').map(Number);
			const todayDay = new Date(ty, tm - 1, td, 12).getDay();
			const sameDay = usable.filter(([k]) => dayOf(k) === todayDay);
			if (sameDay.length >= MIN_SAME_WEEKDAY) {
				return sameDay.map(([, d]) => d);
			}
		}
		const sameKind = usable.filter(([, d]) => d.weekend === weekend);
		return (sameKind.length ? sameKind : usable).map(([, d]) => d);
	}
}

/**
 * The parts of a daily time window that lie in one evening day (12:00 to 12:00 of the next day)
 *
 * @param noon 12:00 of the evening day
 * @param fromMin start in minutes after midnight
 * @param toMin end in minutes after midnight (smaller than the start: the window passes midnight)
 * @returns [from, to] in ms, at least 10 minutes long
 */
export function windowParts(noon: number, fromMin: number, toMin: number): [number, number][] {
	const out: [number, number][] = [];
	const len = (toMin > fromMin ? toMin - fromMin : toMin + 24 * 60 - fromMin) * MIN;
	const lo = noon;
	const hi = noon + 24 * 3600000;
	for (const k of [-1, 0, 1]) {
		const midnight = new Date(noon + k * 24 * 3600000);
		midnight.setHours(0, 0, 0, 0);
		const a = Math.max(lo, midnight.getTime() + fromMin * MIN);
		const b = Math.min(hi, midnight.getTime() + fromMin * MIN + len);
		if (b - a >= 10 * MIN) {
			out.push([a, b]);
		}
	}
	return out.sort((x, y) => x[0] - y[0]);
}

/**
 * n runs spread over the parts of a window: each in its own share of the time, never across a gap
 *
 * @param parts the parts of the window
 * @param n number of runs
 * @param dMin shortest run (minutes)
 * @param dMax longest run (minutes)
 * @param r random number between a and b
 * @returns [on, off] in ms
 */
export function placeRuns(
	parts: [number, number][],
	n: number,
	dMin: number,
	dMax: number,
	r: (a: number, b: number) => number,
): [number, number][] {
	const total = parts.reduce((t, [a, b]) => t + (b - a), 0);
	if (!total || n < 1) {
		return [];
	}
	// position on the joined parts -> time and the end of its part
	const at = (pos: number): [number, number] => {
		for (const [a, b] of parts) {
			if (pos <= b - a) {
				return [a + pos, b];
			}
			pos -= b - a;
		}
		const [, b] = parts[parts.length - 1];
		return [b, b];
	};
	const slot = total / n;
	const runs: [number, number][] = [];
	for (let i = 0; i < n; i++) {
		const dur = Math.min(r(dMin, dMax) * MIN, slot * (n > 1 ? 0.8 : 1));
		const [on, partEnd] = at(r(i * slot, Math.max(i * slot, (i + 1) * slot - dur)));
		const off = Math.min(on + dur, partEnd);
		if (off - on >= MIN) {
			runs.push([on, off]);
		}
	}
	return runs;
}

/**
 * The plan of one evening.
 *
 * @param noon 12:00 of the evening day
 * @param sunset sunset of that day (ms)
 * @param lamps the simulation lamps
 * @param o options
 * @param learner learned days
 * @param rand random number generator 0..1 (injectable for tests)
 * @returns the steps sorted by time
 */
export function planEvening(
	noon: number,
	sunset: number,
	lamps: SimLamp[],
	o: SimOptions,
	learner: Learner,
	rand: () => number = Math.random,
): PlanStep[] {
	const r = (a: number, b: number): number => a + rand() * (b - a);
	const steps: PlanStep[] = [];
	const weekend = isWeekendEvening(noon);
	const today = eveningKey(noon);
	const byType = (t: LampType): SimLamp[] => lamps.filter(l => l.type === t);

	// learned day (for "learned" all lamps, for "combined" only visit and bedtime lamps)
	let learned: LearnedDay | null = null;
	const learnedIds = new Set<string>();
	if (o.mode !== 'dusk') {
		const ids = new Set(
			(o.mode === 'learned' ? lamps : lamps.filter(l => l.type !== 'evening'))
				.filter(l => l.type !== 'device' || l.learn)
				.map(l => l.id),
		);
		const cands = learner.candidates(weekend, ids, today, o.learnPick);
		if (cands.length) {
			learned = cands[Math.floor(rand() * cands.length)];
			for (const s of learned.sessions) {
				if (!ids.has(s.id)) {
					continue;
				}
				if (o.learnFilter && !o.learnFilter(noon + s.start * MIN, s.id)) {
					continue;
				}
				learnedIds.add(s.id);
				const at = noon + (s.start + r(-o.jitter, o.jitter)) * MIN;
				const dur = Math.max(1, s.dur * r(0.8, 1.2));
				steps.push({ at, id: s.id, on: true, why: 'learned' });
				steps.push({ at: at + dur * MIN, id: s.id, on: false, why: 'learned' });
			}
		}
	}

	const duskNeeded = o.mode === 'dusk' || o.mode === 'combined' || !learned;
	if (duskNeeded) {
		const start = sunset + (o.startOffset + r(0, o.startRandom)) * MIN;
		let endMin = parseHm(o.end, 22 * 60 + 30) + r(0, o.endRandom) + (weekend ? o.weekendLater : 0);
		if (endMin < 12 * 60) {
			endMin += 24 * 60; // e.g. 00:30
		}
		const end = Math.max(start + 30 * MIN, noon + (endMin - 12 * 60) * MIN);
		// evening lamps on one after the other, off one after the other
		for (const l of byType('evening')) {
			steps.push({ at: start + r(0, 15) * MIN, id: l.id, on: true, why: 'dusk' });
			steps.push({ at: end + r(0, 20) * MIN, id: l.id, on: false, why: 'dusk' });
		}
		// visits and bedtime only from dusk when nothing was learned for them
		if (!learned || o.mode === 'dusk') {
			const visitLamps = byType('visit');
			if (visitLamps.length && end - start > 40 * MIN) {
				for (let i = 0; i < o.visits; i++) {
					const lamp = visitLamps[Math.floor(rand() * visitLamps.length)];
					const at = r(start + 20 * MIN, end - 15 * MIN);
					const dur = r(o.visitMin, Math.max(o.visitMin, o.visitMax));
					steps.push({ at, id: lamp.id, on: true, why: 'visit' });
					steps.push({ at: at + dur * MIN, id: lamp.id, on: false, why: 'visit' });
				}
			}
			for (const l of byType('bedtime')) {
				const at = end + r(1, 10) * MIN;
				steps.push({ at, id: l.id, on: true, why: 'bedtime' });
				steps.push({ at: at + r(3, 12) * MIN, id: l.id, on: false, why: 'bedtime' });
			}
		}
	}
	// devices (TV, radio, Echo) without learned switching: n times for a random time in their window - in the evening
	// (dusk to lights out, the default), the whole day (wake-up to lights out) or between two own times; each run in
	// its own part of the window, so they do not overlap
	const devices = byType('device').filter(d => !learnedIds.has(d.id));
	if (devices.length) {
		const start = sunset + (o.startOffset + r(0, o.startRandom)) * MIN;
		let endMin = parseHm(o.end, 22 * 60 + 30) + (weekend ? o.weekendLater : 0);
		if (endMin < 12 * 60) {
			endMin += 24 * 60;
		}
		const end = Math.max(start + 30 * MIN, noon + (endMin - 12 * 60) * MIN);
		for (const d of devices) {
			const dMin = Math.max(5, d.durMin ?? o.deviceMin ?? 60);
			const dMax = Math.max(dMin, d.durMax ?? o.deviceMax ?? 180);
			const n = Math.max(1, Math.min(5, Math.round(d.count ?? o.deviceCount ?? 1)));
			let parts: [number, number][];
			if (d.window === 'day') {
				parts = windowParts(noon, parseHm(o.wake || '', 6 * 60 + 30), endMin % (24 * 60));
			} else if (d.window === 'custom') {
				parts = windowParts(noon, parseHm(d.from || '', 9 * 60), parseHm(d.to || '', 20 * 60));
			} else {
				parts = [[start, end]];
			}
			for (const [on, off] of placeRuns(parts, n, dMin, dMax, r)) {
				steps.push({ at: on, id: d.id, on: true, why: 'device' });
				steps.push({ at: off, id: d.id, on: false, why: 'device' });
			}
		}
	}
	// morning lamps without learned switching: on at wake-up time, off a little after sunrise - only while dark
	const mornings = byType('morning').filter(m => !learnedIds.has(m.id));
	if (mornings.length && o.sunriseNext) {
		const nextDay = new Date(noon + 24 * 3600000).getDay();
		const later = nextDay === 0 || nextDay === 6 ? (o.wakeWeekendLater ?? 60) : 0;
		const wakeMin = parseHm(o.wake || '', 6 * 60 + 30) + later;
		const wake = noon + (wakeMin + 12 * 60) * MIN + r(0, o.wakeRandom ?? 20) * MIN;
		for (const m of mornings) {
			const on = wake + r(0, 10) * MIN;
			const rnd = (): number => r(0, o.morningOffRandom ?? 25) * MIN;
			let off = o.sunriseNext + (o.morningOffOffset ?? 5) * MIN + rnd();
			const offTime = o.morningOffTime ? parseHm(o.morningOffTime, -1) : -1;
			if (offTime >= 0) {
				off = Math.min(off, noon + (offTime + later + 12 * 60) * MIN + rnd());
			}
			if (o.morningBright && o.morningBright > noon) {
				off = Math.min(off, o.morningBright);
			}
			if (off - on >= 10 * MIN) {
				steps.push({ at: on, id: m.id, on: true, why: 'morning' });
				steps.push({ at: off, id: m.id, on: false, why: 'morning' });
			}
		}
	}
	return steps.sort((a, b) => a.at - b.at);
}

export interface SimHost {
	now(): number;
	setTimer(fn: () => void, ms: number): unknown;
	clearTimer(handle: unknown): void;
	/** current value of a lamp (true = on) */
	isOn(id: string): boolean;
	switchLamp(id: string, on: boolean): void;
	/** plan and next step for the status states */
	publish(active: boolean, plan: PlanStep[], next: PlanStep | null): void;
	/** switch this lamp off when the simulation ends? (missing: yes) */
	offOnStop?(id: string): boolean;
}

export interface RunnerOptions {
	/**
	 * true: every step is carried out, whoever switched the lamp before (evening light: on at dusk even if switched
	 * off by hand the evening before, off at night even if switched on by hand). false (simulation): only lamps that
	 * were off are switched on, and only those are switched off again.
	 */
	force?: boolean;
	/** true: steps already due when starting are carried out (simulation); false: only steps from now on */
	catchUp?: boolean;
}

/** Runs the plan of the current evening while the simulation is active */
export class SimRunner {
	active = false;
	private timer: unknown = null;
	private plan: PlanStep[] = [];
	private ours = new Set<string>(); // lamps the simulation switched on

	/**
	 * Creates the runner
	 *
	 * @param host timers and lamps
	 * @param makePlan builds the plan of the current evening
	 * @param opts force switching, catch up on due steps
	 */
	constructor(
		private host: SimHost,
		private makePlan: (now: number) => PlanStep[],
		private opts: RunnerOptions = { force: false, catchUp: true },
	) {}

	/**
	 * Starts the simulation
	 *
	 * @param catchUp carry out the steps already due this time (e.g. evening light switched on by hand at 20:00)
	 */
	start(catchUp?: boolean): void {
		if (this.active) {
			return;
		}
		this.active = true;
		this.replan(catchUp);
	}

	/**
	 * Stops the simulation and switches off the lamps it switched on
	 */
	stop(): void {
		if (!this.active) {
			return;
		}
		this.active = false;
		if (this.timer) {
			this.host.clearTimer(this.timer);
			this.timer = null;
		}
		if (!this.opts.force) {
			for (const id of this.ours) {
				if (!this.host.offOnStop || this.host.offOnStop(id)) {
					this.host.switchLamp(id, false);
				}
			}
		}
		this.ours.clear();
		this.plan = [];
		this.host.publish(false, [], null);
	}

	/**
	 * new plan for the current evening; steps already due set the lamps as they should be now
	 *
	 * @param catchUp carry out the steps already due (default: as set in the options)
	 */
	replan(catchUp?: boolean): void {
		if (!this.active) {
			return;
		}
		const now = this.host.now();
		const plan = this.makePlan(now);
		if (catchUp ?? this.opts.catchUp !== false) {
			const due = new Map<string, boolean>();
			for (const s of plan) {
				if (s.at <= now) {
					due.set(s.id, s.on);
				}
			}
			for (const [id, on] of due) {
				this.apply(id, on);
			}
		}
		this.plan = plan.filter(s => s.at > now);
		this.schedule();
	}

	/**
	 * Was the lamp switched on by the simulation?
	 *
	 * @param id lamp state ID
	 */
	isOurs(id: string): boolean {
		return this.ours.has(id);
	}

	/**
	 * Switches a lamp - only lamps the simulation switched on are switched off again
	 *
	 * @param id lamp state ID
	 * @param on on or off
	 */
	private apply(id: string, on: boolean): void {
		if (this.opts.force) {
			if (this.host.isOn(id) !== on) {
				this.host.switchLamp(id, on);
			}
			return;
		}
		if (on) {
			if (!this.host.isOn(id)) {
				this.ours.add(id);
				this.host.switchLamp(id, true);
			}
		} else if (this.ours.has(id)) {
			this.ours.delete(id);
			this.host.switchLamp(id, false);
		}
	}

	/**
	 * Waits for the next step of the plan
	 */
	private schedule(): void {
		if (this.timer) {
			this.host.clearTimer(this.timer);
			this.timer = null;
		}
		const next = this.plan[0] || null;
		this.host.publish(this.active, this.plan, next);
		if (!next) {
			return;
		}
		const delayMs = Math.max(0, Math.min(next.at - this.host.now(), 2 ** 31 - 1));
		this.timer = this.host.setTimer(() => {
			this.timer = null;
			const now = this.host.now();
			while (this.plan.length && this.plan[0].at <= now) {
				const s = this.plan.shift()!;
				this.apply(s.id, s.on);
			}
			this.schedule();
		}, delayMs);
	}
}
