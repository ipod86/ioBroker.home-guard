// Presence simulation: plans an evening (dusk, learned days or both) and switches the lamps.
// Learning: switching of the simulation lamps that did not come from the adapter is stored per day;
// the simulation replays a whole real day of the same kind (weekday/weekend) with shifted times.

export type SimMode = 'dusk' | 'learned' | 'combined';
export type LampType = 'evening' | 'visit' | 'bedtime' | 'device' | 'morning';

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
	/** learned switching is only replayed when this says yes for its time (e.g. only when dark) */
	learnFilter?: (ts: number) => boolean;
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
	 */
	record(id: string, on: boolean, ts: number): boolean {
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
		if (dur < 1 || dur > 16 * 60) {
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
	 * learned days with sessions of the given lamps: the same weekday first (a Tuesday for a Tuesday), then the
	 * same kind (weekday/weekend), then any
	 *
	 * @param weekend Friday/Saturday evening
	 * @param ids lamps that are wanted
	 * @param today key of the current evening (not used)
	 */
	candidates(weekend: boolean, ids: Set<string>, today: string): LearnedDay[] {
		const usable = Object.entries(this.data.days).filter(
			([k, d]) => k !== today && d.sessions.some(s => ids.has(s.id)),
		);
		const dayOf = (key: string): number => {
			const [y, m, d] = key.split('-').map(Number);
			return new Date(y, m - 1, d, 12).getDay();
		};
		const [ty, tm, td] = today.split('-').map(Number);
		const todayDay = new Date(ty, tm - 1, td, 12).getDay();
		const sameDay = usable.filter(([k]) => dayOf(k) === todayDay);
		if (sameDay.length) {
			return sameDay.map(([, d]) => d);
		}
		const sameKind = usable.filter(([, d]) => d.weekend === weekend);
		return (sameKind.length ? sameKind : usable).map(([, d]) => d);
	}
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
		const cands = learner.candidates(weekend, ids, today);
		if (cands.length) {
			learned = cands[Math.floor(rand() * cands.length)];
			for (const s of learned.sessions) {
				if (!ids.has(s.id)) {
					continue;
				}
				if (o.learnFilter && !o.learnFilter(noon + s.start * MIN)) {
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
	// devices (TV, radio) without learned switching: n times in the evening for a random time, between dusk and
	// lights out - each in its own part of the evening, so they do not overlap
	const devices = byType('device').filter(d => !learnedIds.has(d.id));
	if (devices.length) {
		const start = sunset + (o.startOffset + r(0, o.startRandom)) * MIN;
		let endMin = parseHm(o.end, 22 * 60 + 30) + (weekend ? o.weekendLater : 0);
		if (endMin < 12 * 60) {
			endMin += 24 * 60;
		}
		const end = Math.max(start + 30 * MIN, noon + (endMin - 12 * 60) * MIN);
		const dMin = Math.max(5, o.deviceMin ?? 60);
		const dMax = Math.max(dMin, o.deviceMax ?? 180);
		const n = Math.max(1, Math.min(5, Math.round(o.deviceCount ?? 1)));
		const slot = (end - start) / n;
		for (const d of devices) {
			for (let i = 0; i < n; i++) {
				const from = start + i * slot;
				const dur = Math.min(r(dMin, dMax), (slot / MIN) * (n > 1 ? 0.8 : 1));
				const on = r(from, Math.max(from, from + slot - dur * MIN));
				steps.push({ at: on, id: d.id, on: true, why: 'device' });
				steps.push({ at: on + dur * MIN, id: d.id, on: false, why: 'device' });
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
			const off = o.sunriseNext + r(5, 30) * MIN;
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
	 */
	start(): void {
		if (this.active) {
			return;
		}
		this.active = true;
		this.replan();
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

	/** new plan for the current evening; steps already due set the lamps as they should be now */
	replan(): void {
		if (!this.active) {
			return;
		}
		const now = this.host.now();
		const plan = this.makePlan(now);
		if (this.opts.catchUp !== false) {
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
		const wait = Math.max(0, Math.min(next.at - this.host.now(), 2 ** 31 - 1));
		this.timer = this.host.setTimer(() => {
			this.timer = null;
			const now = this.host.now();
			while (this.plan.length && this.plan[0].at <= now) {
				const s = this.plan.shift()!;
				this.apply(s.id, s.on);
			}
			this.schedule();
		}, wait);
	}
}
