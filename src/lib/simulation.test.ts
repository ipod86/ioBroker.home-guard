import { expect } from 'chai';
import {
	Learner,
	SimRunner,
	eveningKey,
	eveningNoon,
	planEvening,
	type PlanStep,
	type SimLamp,
	type SimOptions,
} from './simulation';
import { sunTimes } from './sun';

const MIN = 60000;
const lamps: SimLamp[] = [
	{ id: 'wz', name: 'Wohnzimmer', type: 'evening' },
	{ id: 'ess', name: 'Esszimmer', type: 'evening' },
	{ id: 'flur', name: 'Flur', type: 'visit' },
	{ id: 'bad', name: 'Bad', type: 'bedtime' },
];
const opts: SimOptions = {
	mode: 'dusk',
	startOffset: -30,
	startRandom: 20,
	end: '22:30',
	endRandom: 60,
	weekendLater: 45,
	visits: 4,
	visitMin: 2,
	visitMax: 15,
	learnDays: 28,
	jitter: 15,
};
// a Wednesday
const noon = new Date(2026, 10, 18, 12, 0, 0).getTime();
const sunset = new Date(2026, 10, 18, 16, 40, 0).getTime();

/**
 * Repeatable random numbers
 *
 * @param seed start value
 */
function seeded(seed = 1): () => number {
	let s = seed;
	return () => {
		s = (s * 16807) % 2147483647;
		return s / 2147483647;
	};
}

describe('sunTimes', () => {
	it('gives a plausible sunset for Hilchenbach in November', () => {
		const t = sunTimes(new Date(2026, 10, 18), 50.99, 8.1);
		const d = new Date(t!.sunset);
		const minutes = d.getHours() * 60 + d.getMinutes();
		expect(minutes).to.be.within(16 * 60 + 25, 16 * 60 + 50);
	});
});

describe('planEvening (dusk)', () => {
	it('switches the evening lamps on after dusk and off around the end, visits in between', () => {
		const plan = planEvening(noon, sunset, lamps, opts, new Learner(), seeded(3));
		const on = plan.filter(s => s.id === 'wz' && s.on)[0];
		const off = plan.filter(s => s.id === 'wz' && !s.on)[0];
		expect(on.at).to.be.within(sunset - 30 * MIN, sunset + 5 * MIN);
		const offMin = new Date(off.at).getHours() * 60 + new Date(off.at).getMinutes();
		expect(offMin).to.be.within(22 * 60 + 30, 23 * 60 + 55);
		expect(plan.filter(s => s.id === 'flur' && s.on).length).to.equal(4);
		expect(plan.filter(s => s.id === 'bad').length).to.equal(2);
		for (let i = 1; i < plan.length; i++) {
			expect(plan[i].at).to.be.at.least(plan[i - 1].at);
		}
	});

	it('is different every evening', () => {
		const a = planEvening(noon, sunset, lamps, opts, new Learner(), seeded(1)).map(s => s.at);
		const b = planEvening(noon, sunset, lamps, opts, new Learner(), seeded(2)).map(s => s.at);
		expect(a).to.not.deep.equal(b);
	});
});

describe('Learner and learned plans', () => {
	it('stores sessions per evening; after midnight still the evening before', () => {
		const l = new Learner();
		const d = new Date(2026, 10, 10, 2, 10).getTime(); // night from 9th to 10th
		l.record('flur', true, d);
		expect(l.record('flur', false, d + 4 * MIN)).to.equal(true);
		expect(Object.keys(l.data.days)).to.deep.equal(['2026-11-09']);
		const s = l.data.days['2026-11-09'].sessions[0];
		expect(s.dur).to.equal(4);
		expect(s.start).to.equal(14 * 60 + 10); // 02:10 = 14 h 10 min after noon
		expect(l.record('flur', true, d)).to.equal(false);
		expect(l.record('flur', false, d + 10000)).to.equal(false); // a flick is not learned
	});

	it('prunes old days', () => {
		const l = new Learner({
			days: {
				'2026-01-01': { weekend: false, sessions: [] },
				[eveningKey(noon)]: { weekend: false, sessions: [] },
			},
		});
		l.prune(noon, 28);
		expect(Object.keys(l.data.days)).to.deep.equal([eveningKey(noon)]);
	});

	it('learned mode replays a real day with shifted times', () => {
		const l = new Learner();
		const day = new Date(2026, 10, 11, 12).getTime(); // also a Wednesday
		l.record('wz', true, day + 6 * 60 * MIN); // 18:00
		l.record('wz', false, day + 10 * 60 * MIN); // 22:00
		l.record('flur', true, day + 14 * 60 * MIN); // 02:00
		l.record('flur', false, day + (14 * 60 + 3) * MIN);
		const plan = planEvening(noon, sunset, lamps, { ...opts, mode: 'learned' }, l, seeded(5));
		const wzOn = plan.find(s => s.id === 'wz' && s.on)!;
		expect(wzOn.at).to.be.within(eveningNoon(noon) + (6 * 60 - 15) * MIN, eveningNoon(noon) + (6 * 60 + 15) * MIN);
		const flur = plan.find(s => s.id === 'flur' && s.on)!;
		expect(new Date(flur.at).getHours()).to.be.oneOf([1, 2]);
		expect(plan.every(s => s.why === 'learned')).to.equal(true);
	});

	it('combined: dusk for the evening lamps, learned for visits; without data dusk', () => {
		const l = new Learner();
		const day = new Date(2026, 10, 11, 12).getTime();
		l.record('flur', true, day + 14 * 60 * MIN);
		l.record('flur', false, day + (14 * 60 + 3) * MIN);
		const plan = planEvening(noon, sunset, lamps, { ...opts, mode: 'combined' }, l, seeded(7));
		expect(plan.filter(s => s.id === 'wz').every(s => s.why === 'dusk')).to.equal(true);
		expect(plan.filter(s => s.id === 'flur').every(s => s.why === 'learned')).to.equal(true);
		const empty = planEvening(noon, sunset, lamps, { ...opts, mode: 'learned' }, new Learner(), seeded(7));
		expect(empty.some(s => s.why === 'dusk')).to.equal(true);
	});
});

describe('SimRunner', () => {
	it('switches due lamps, only switches off what it switched on', () => {
		let now = noon + 7 * 60 * MIN; // 19:00
		const lampState: Record<string, boolean> = { wz: false, ess: true, flur: false, bad: false };
		const log: string[] = [];
		const timers: { at: number; fn: () => void }[] = [];
		const plan: PlanStep[] = [
			{ at: noon + 5 * 60 * MIN, id: 'wz', on: true, why: 'dusk' },
			{ at: noon + 5 * 60 * MIN, id: 'ess', on: true, why: 'dusk' },
			{ at: noon + 8 * 60 * MIN, id: 'flur', on: true, why: 'visit' },
			{ at: noon + 8 * 60 * MIN + 5 * MIN, id: 'flur', on: false, why: 'visit' },
			{ at: noon + 10 * 60 * MIN, id: 'ess', on: false, why: 'dusk' },
		];
		const runner = new SimRunner(
			{
				now: () => now,
				setTimer: (fn, ms) => {
					timers.push({ at: now + ms, fn });
					return timers.length;
				},
				clearTimer: () => undefined,
				isOn: id => lampState[id],
				switchLamp: (id, on) => {
					lampState[id] = on;
					log.push(`${id}:${on}`);
				},
				publish: () => undefined,
			},
			() => plan,
		);
		runner.start();
		expect(log).to.deep.equal(['wz:true']); // ess was already on by hand
		const run = (): void => {
			const t = timers.shift()!;
			now = t.at;
			t.fn();
		};
		run();
		run();
		run(); // ess off: not ours, stays on
		expect(log).to.deep.equal(['wz:true', 'flur:true', 'flur:false']);
		expect(lampState.ess).to.equal(true);
		runner.stop();
		expect(log).to.deep.equal(['wz:true', 'flur:true', 'flur:false', 'wz:false']);
	});
});

describe('learn filter and evening light', () => {
	it('learned switching outside the filter is not replayed', () => {
		const l = new Learner();
		const day = new Date(2026, 10, 11, 12).getTime();
		l.record('flur', true, day + 1 * 60 * MIN); // 13:00, broad daylight
		l.record('flur', false, day + (1 * 60 + 5) * MIN);
		l.record('flur', true, day + 9 * 60 * MIN); // 21:00
		l.record('flur', false, day + (9 * 60 + 5) * MIN);
		const dark = (ts: number): boolean => new Date(ts).getHours() >= 16 || new Date(ts).getHours() < 7;
		const plan = planEvening(
			noon,
			sunset,
			lamps,
			{ ...opts, mode: 'learned', jitter: 0, learnFilter: dark },
			l,
			seeded(2),
		);
		const flur = plan.filter(s => s.id === 'flur' && s.on && s.why === 'learned');
		expect(flur.length).to.equal(1);
		expect(new Date(flur[0].at).getHours()).to.equal(21);
	});

	it('forced runner: on even if switched off by hand, off even if switched on by hand, no catching up', () => {
		let now = noon + 4 * 60 * MIN; // 16:00
		const lampState: Record<string, boolean> = { wz: false, ess: true };
		const log: string[] = [];
		const timers: { at: number; fn: () => void }[] = [];
		const plan: PlanStep[] = [
			{ at: noon + 3 * 60 * MIN, id: 'ess', on: true, why: 'dusk' }, // already due: not caught up
			{ at: noon + 5 * 60 * MIN, id: 'wz', on: true, why: 'dusk' },
			{ at: noon + 11 * 60 * MIN, id: 'wz', on: false, why: 'dusk' },
			{ at: noon + 11 * 60 * MIN, id: 'ess', on: false, why: 'dusk' },
		];
		const runner = new SimRunner(
			{
				now: () => now,
				setTimer: (fn, ms) => {
					timers.push({ at: now + ms, fn });
					return timers.length;
				},
				clearTimer: () => undefined,
				isOn: id => lampState[id],
				switchLamp: (id, on) => {
					lampState[id] = on;
					log.push(`${id}:${on}`);
				},
				publish: () => undefined,
			},
			() => plan,
			{ force: true, catchUp: false },
		);
		runner.start();
		expect(log).to.deep.equal([]);
		const run = (): void => {
			const t = timers.shift()!;
			now = t.at;
			t.fn();
		};
		run(); // 17:00 wz on
		run(); // 23:00 both off - ess was on by hand
		expect(log).to.deep.equal(['wz:true', 'wz:false', 'ess:false']);
		runner.stop();
		expect(log.length).to.equal(3); // stopping switches nothing
	});
});

describe('devices in the simulation', () => {
	it('a TV runs once in the evening between dusk and lights out, also in learned mode', () => {
		const withTv: SimLamp[] = [...lamps, { id: 'tv', name: 'TV', type: 'device', valueOn: 'true' }];
		for (const mode of ['dusk', 'learned', 'combined'] as const) {
			const plan = planEvening(
				noon,
				sunset,
				withTv,
				{ ...opts, mode, deviceMin: 60, deviceMax: 120 },
				new Learner(),
				seeded(4),
			);
			const on = plan.filter(s => s.id === 'tv' && s.on);
			const off = plan.filter(s => s.id === 'tv' && !s.on);
			expect(on.length).to.equal(1);
			const dur = (off[0].at - on[0].at) / MIN;
			expect(dur).to.be.within(60, 120);
			expect(on[0].at).to.be.at.least(sunset - 30 * MIN);
			const offMin = new Date(off[0].at).getHours() * 60 + new Date(off[0].at).getMinutes();
			expect(offMin).to.be.at.most(22 * 60 + 31);
		}
	});
});

describe('devices: count, learning, end of the simulation', () => {
	it('a device runs n times per evening without overlap', () => {
		const tv: SimLamp[] = [{ id: 'tv', name: 'TV', type: 'device' }];
		const plan = planEvening(
			noon,
			sunset,
			tv,
			{ ...opts, deviceMin: 30, deviceMax: 60, deviceCount: 3 },
			new Learner(),
			seeded(9),
		);
		const steps = plan.filter(s => s.id === 'tv');
		expect(steps.filter(s => s.on).length).to.equal(3);
		for (let i = 1; i < steps.length; i++) {
			expect(steps[i].at).to.be.at.least(steps[i - 1].at);
			expect(steps[i].on).to.equal(!steps[i - 1].on); // on, off, on, off ...
		}
	});

	it('a device with a learn source replays its learned evening (twice), otherwise it is planned at random', () => {
		const l = new Learner();
		const day = new Date(2026, 10, 11, 12).getTime();
		l.record('tv', true, day + 6 * 60 * MIN); // 18:00
		l.record('tv', false, day + 7 * 60 * MIN);
		l.record('tv', true, day + (8 * 60 + 15) * MIN); // 20:15
		l.record('tv', false, day + 10 * 60 * MIN);
		const tv: SimLamp[] = [{ id: 'tv', name: 'TV', type: 'device', learn: true }];
		const plan = planEvening(noon, sunset, tv, { ...opts, mode: 'combined', jitter: 0 }, l, seeded(3));
		const on = plan.filter(s => s.id === 'tv' && s.on);
		expect(on.map(s => s.why)).to.deep.equal(['learned', 'learned']);
		expect(on.map(s => new Date(s.at).getHours())).to.deep.equal([18, 20]);
		const notLearned = planEvening(
			noon,
			sunset,
			[{ ...tv[0], learn: false }],
			{ ...opts, mode: 'combined' },
			l,
			seeded(3),
		);
		expect(notLearned.filter(s => s.id === 'tv').every(s => s.why === 'device')).to.equal(true);
	});

	it('when the simulation ends, only lamps that should go off are switched off', () => {
		let now = noon + 7 * 60 * MIN;
		const state: Record<string, boolean> = { wz: false, tv: false };
		const log: string[] = [];
		const runner = new SimRunner(
			{
				now: () => now,
				setTimer: () => 1,
				clearTimer: () => undefined,
				isOn: id => state[id],
				switchLamp: (id, on) => {
					state[id] = on;
					log.push(`${id}:${on}`);
				},
				publish: () => undefined,
				offOnStop: id => id === 'tv',
			},
			() => [
				{ at: noon + 6 * 60 * MIN, id: 'wz', on: true, why: 'dusk' },
				{ at: noon + 6 * 60 * MIN, id: 'tv', on: true, why: 'device' },
			],
		);
		runner.start();
		runner.stop();
		expect(log).to.deep.equal(['wz:true', 'tv:true', 'tv:false']);
		now += 1;
	});

	it('evening light without catching up - unless it is switched on by hand', () => {
		const now = noon + 7 * 60 * MIN;
		const make = (): { runner: SimRunner; log: string[] } => {
			const state: Record<string, boolean> = { wz: false };
			const log: string[] = [];
			const runner = new SimRunner(
				{
					now: () => now,
					setTimer: () => 1,
					clearTimer: () => undefined,
					isOn: id => state[id],
					switchLamp: (id, on) => {
						state[id] = on;
						log.push(`${id}:${on}`);
					},
					publish: () => undefined,
				},
				() => [
					{ at: noon + 6 * 60 * MIN, id: 'wz', on: true, why: 'dusk' },
					{ at: noon + 11 * 60 * MIN, id: 'wz', on: false, why: 'dusk' },
				],
				{ force: true, catchUp: false },
			);
			return { runner, log };
		};
		const restart = make();
		restart.runner.start(); // after a restart: nothing switched
		expect(restart.log).to.deep.equal([]);
		const byHand = make();
		byHand.runner.start(true); // switched on by hand at 19:00: the lamp goes on at once
		expect(byHand.log).to.deep.equal(['wz:true']);
	});
});

describe('learned days: same weekday first', () => {
	it('a Wednesday replays a learned Wednesday, else a weekday, else any day', () => {
		const l = new Learner();
		// Tuesday 10.11. at 20:00 and Wednesday 11.11. at 21:00, Saturday 14.11. at 23:00
		for (const [d, h] of [
			[10, 20],
			[11, 21],
			[14, 23],
		]) {
			const day = new Date(2026, 10, d, 12).getTime();
			l.record('flur', true, day + (h - 12) * 60 * MIN);
			l.record('flur', false, day + ((h - 12) * 60 + 5) * MIN);
		}
		const ids = new Set(['flur']);
		// default: all weekdays for a weekday evening
		const wed = l.candidates(false, ids, eveningKey(noon)); // noon = Wednesday 18.11.
		expect(wed.length).to.equal(2); // Tuesday and Wednesday
		const sat = l.candidates(true, ids, eveningKey(noon + 3 * 86400000));
		expect(sat.length).to.equal(1);
		// same weekday: only with at least three of them, otherwise weekday/weekend
		expect(l.candidates(false, ids, eveningKey(noon), 'weekday').length).to.equal(2);
		for (const d of [21, 28]) {
			const day = new Date(2026, 9, d, 12).getTime(); // Wednesdays 21.10. and 28.10.
			l.record('flur', true, day + 8 * 60 * MIN);
			l.record('flur', false, day + (8 * 60 + 5) * MIN);
		}
		const wed3 = l.candidates(false, ids, eveningKey(noon), 'weekday');
		expect(wed3.length).to.equal(3);
		expect(wed3.every(d => [9 * 60, 8 * 60].includes(d.sessions[0].start))).to.equal(true);
		const thu = l.candidates(false, ids, eveningKey(noon + 86400000), 'weekday'); // no Thursday learned
		expect(thu.length).to.equal(4); // all weekdays
		const sun = l.candidates(false, ids, eveningKey(noon + 4 * 86400000)); // Sunday counts as weekday
		expect(sun.every(d => !d.weekend)).to.equal(true);
	});
});

describe('morning', () => {
	const kitchen: SimLamp[] = [{ id: 'kueche', name: 'Küche', type: 'morning' }];
	it('morning lamps go on at wake-up time and off after sunrise, later on the weekend', () => {
		const sunriseThu = new Date(2026, 10, 19, 7, 50).getTime(); // Wednesday evening -> Thursday morning
		const plan = planEvening(
			noon,
			sunset,
			kitchen,
			{ ...opts, wake: '06:30', wakeRandom: 0, sunriseNext: sunriseThu },
			new Learner(),
			seeded(2),
		);
		const on = plan.find(s => s.id === 'kueche' && s.on)!;
		const off = plan.find(s => s.id === 'kueche' && !s.on)!;
		expect(new Date(on.at).getHours()).to.equal(6);
		expect(off.at).to.be.within(sunriseThu + 5 * MIN, sunriseThu + 30 * MIN);
		const fri = noon + 2 * 86400000; // Friday evening -> Saturday morning
		const sunriseSat = new Date(2026, 10, 21, 7, 53).getTime();
		const sat = planEvening(
			fri,
			sunset,
			kitchen,
			{ ...opts, wake: '06:30', wakeRandom: 0, wakeWeekendLater: 60, sunriseNext: sunriseSat },
			new Learner(),
			seeded(2),
		);
		expect(new Date(sat.find(s => s.on)!.at).getHours()).to.equal(7);
	});
	it('no morning light when it is already light at wake-up time', () => {
		const sunriseSummer = new Date(2026, 10, 19, 5, 30).getTime();
		const plan = planEvening(
			noon,
			sunset,
			kitchen,
			{ ...opts, wake: '06:30', sunriseNext: sunriseSummer },
			new Learner(),
			seeded(2),
		);
		expect(plan.filter(s => s.id === 'kueche')).to.deep.equal([]);
	});
});
