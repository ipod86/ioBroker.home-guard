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
