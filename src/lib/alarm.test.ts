import { expect } from 'chai';
import {
	AlarmEngine,
	isOpenValue,
	type AlarmEvent,
	type AlarmHost,
	type AlarmStatus,
	type EventInfo,
	type SensorDef,
} from './alarm';

/**
 * Fake host with a manual clock
 *
 * @param opts options to override
 */
function setup(opts: Partial<AlarmEngine['opts']> = {}): {
	engine: AlarmEngine;
	events: AlarmEvent[];
	infos: EventInfo[];
	outputs: boolean[];
	status: () => AlarmStatus;
	tick: (sec: number) => void;
} {
	let now = 1_000_000;
	let timers: { at: number; fn: () => void; id: number }[] = [];
	let nextId = 1;
	const events: AlarmEvent[] = [];
	const infos: EventInfo[] = [];
	const outputs: boolean[] = [];
	let last: AlarmStatus | null = null;
	const host: AlarmHost = {
		now: () => now,
		setTimer: (fn, ms) => {
			const t = { at: now + ms, fn, id: nextId++ };
			timers.push(t);
			return t.id;
		},
		clearTimer: id => {
			timers = timers.filter(t => t.id !== id);
		},
		publish: s => {
			last = s;
		},
		event: (e, info) => {
			events.push(e);
			infos.push(info);
		},
		outputs: on => outputs.push(on),
	};
	const engine = new AlarmEngine(host, {
		exitDelayFull: 60,
		exitDelayPerimeter: 0,
		armEarlyId: 'door',
		entryDelay: 30,
		openCheck: 'warn',
		alarmDuration: 180,
		motionCount: 2,
		motionWindowSec: 120,
		...opts,
	});
	const sensors: SensorDef[] = [
		{ id: 'door', name: 'Haustür', circuit: 'perimeter', delayed: true, invert: false, motion: false },
		{ id: 'win', name: 'Küchenfenster', circuit: 'perimeter', delayed: false, invert: false, motion: false },
		{ id: 'pir1', name: 'BWM Flur', circuit: 'interior', delayed: false, invert: false, motion: true },
		{ id: 'pir2', name: 'BWM Wohnzimmer', circuit: 'interior', delayed: false, invert: false, motion: true },
		{
			id: 'smoke',
			name: 'Rauchmelder',
			circuit: '24h',
			delayed: false,
			invert: false,
			motion: false,
			hazard: 'alarm',
		},
		{
			id: 'water',
			name: 'Wassermelder',
			circuit: '24h',
			delayed: false,
			invert: false,
			motion: false,
			hazard: 'notify',
		},
		{ id: 'gate', name: 'Gartentor', circuit: 'report', delayed: false, invert: false, motion: false },
	];
	engine.setSensors(sensors, {
		door: false,
		win: 0,
		pir1: false,
		pir2: false,
		smoke: false,
		water: false,
		gate: false,
	});
	const tick = (sec: number): void => {
		const end = now + sec * 1000;
		for (;;) {
			timers.sort((a, b) => a.at - b.at);
			const t = timers[0];
			if (!t || t.at > end) {
				break;
			}
			timers.shift();
			now = t.at;
			t.fn();
		}
		now = end;
	};
	return { engine, events, infos, outputs, status: () => last ?? engine.status(), tick };
}

describe('isOpenValue', () => {
	it('understands booleans, window states and texts', () => {
		expect(isOpenValue(true)).to.equal(true);
		expect(isOpenValue(false)).to.equal(false);
		expect(isOpenValue(0)).to.equal(false);
		expect(isOpenValue(1)).to.equal(true); // tilted
		expect(isOpenValue(2)).to.equal(true);
		expect(isOpenValue('open')).to.equal(true);
		expect(isOpenValue('closed')).to.equal(false);
		expect(isOpenValue(false, true)).to.equal(true);
	});
});

describe('AlarmEngine', () => {
	it('arms full protection after the exit delay, without alarm while leaving', () => {
		const t = setup();
		t.engine.arm('full', 'state');
		expect(t.status().phase).to.equal('arming');
		t.engine.sensorChanged('door', true); // walk out
		t.tick(30);
		expect(t.status().countdown).to.equal(30);
		t.engine.sensorChanged('door', false);
		// closing the front door arms at once
		expect(t.status().phase).to.equal('armed');
		expect(t.events).to.include('armedFull');
		expect(t.events).to.not.include('alarm');
	});

	it('entry delay for the front door, disarm in time: no alarm', () => {
		const t = setup({ exitDelayFull: 0 });
		t.engine.arm('full', 'state');
		t.engine.sensorChanged('door', true);
		expect(t.status().phase).to.equal('entry');
		t.tick(20);
		t.engine.disarm('pin');
		t.tick(60);
		expect(t.events).to.not.include('alarm');
		expect(t.status().phase).to.equal('disarmed');
	});

	it('entry delay runs out: alarm, outputs on and off after the alarm duration', () => {
		const t = setup({ exitDelayFull: 0 });
		t.engine.arm('full', 'state');
		t.engine.sensorChanged('door', true);
		t.tick(31);
		expect(t.status().phase).to.equal('alarm');
		expect(t.outputs).to.deep.equal([true]);
		t.tick(181);
		expect(t.outputs).to.deep.equal([true, false]);
		expect(t.status().alarm).to.equal(true); // stays until acknowledged
		t.engine.ack('state');
		expect(t.status().phase).to.equal('armed');
		expect(t.events).to.include('alarmEnd');
	});

	it('acknowledged while armed: the delayed door alarms at once, after disarm/arm the entry delay is back', () => {
		const t = setup({ exitDelayFull: 0 });
		t.engine.arm('full', 'state');
		t.engine.sensorChanged('win', true);
		expect(t.status().phase).to.equal('alarm');
		t.engine.ack('widget');
		expect(t.status().phase).to.equal('armed');
		t.engine.sensorChanged('door', true);
		expect(t.status().phase).to.equal('alarm'); // no entry delay within the same incident
		t.engine.disarm('pin');
		t.engine.sensorChanged('door', false);
		t.engine.arm('full', 'state');
		t.engine.sensorChanged('door', true);
		expect(t.status().phase).to.equal('entry');
	});

	it('further sensors during the alarm are reported once each with the list, the alarm goes on', () => {
		const t = setup({ exitDelayFull: 0 });
		t.engine.arm('full', 'state');
		t.engine.sensorChanged('win', 2);
		t.engine.sensorChanged('pir1', true); // one detector alone is enough during an alarm
		t.engine.sensorChanged('pir1', false);
		t.engine.sensorChanged('pir1', true); // the same sensor again: no second message
		t.engine.sensorChanged('door', true); // delayed door: no entry delay, just reported
		expect(t.events.filter(e => e === 'alarmMore')).to.have.length(2);
		expect(t.infos[t.infos.length - 1].triggered).to.deep.equal(['Küchenfenster', 'BWM Flur', 'Haustür']);
		expect(t.status().phase).to.equal('alarm');
		expect(t.outputs.filter(o => o)).to.have.length(1); // sirens were not started again
		// a new alarm after acknowledging starts a new list
		t.engine.ack('widget');
		t.engine.sensorChanged('pir2', true);
		t.engine.sensorChanged('pir1', false);
		t.engine.sensorChanged('pir1', true);
		const last = t.infos[t.events.lastIndexOf('alarm')];
		expect(last.triggered).to.deep.equal(['BWM Flur']);
	});

	it('window opens: immediate alarm; closing does not trigger', () => {
		const t = setup({ exitDelayFull: 0 });
		t.engine.arm('perimeter', 'state');
		t.engine.sensorChanged('win', 2);
		expect(t.status().phase).to.equal('alarm');
		const t2 = setup({ exitDelayFull: 0 });
		t2.engine.sensorChanged('win', 2); // open while disarmed
		t2.engine.arm('perimeter', 'state');
		t2.engine.sensorChanged('win', 0); // closing it
		expect(t2.events).to.not.include('alarm');
	});

	it('perimeter ignores motion detectors, full needs two different detectors', () => {
		const t = setup({ exitDelayFull: 0 });
		t.engine.arm('perimeter', 'state');
		t.engine.sensorChanged('pir1', true);
		t.engine.sensorChanged('pir2', true);
		expect(t.events).to.not.include('alarm');
		t.engine.arm('full', 'state');
		t.engine.sensorChanged('pir1', false);
		t.engine.sensorChanged('pir1', true);
		expect(t.events).to.not.include('alarm');
		t.tick(10);
		t.engine.sensorChanged('pir2', false);
		t.engine.sensorChanged('pir2', true);
		expect(t.events).to.include('alarm');
	});

	it('one detector twice is no alarm; outside the time window it starts again', () => {
		const t = setup({ exitDelayFull: 0 });
		t.engine.arm('full', 'state');
		t.engine.sensorChanged('pir1', true);
		t.engine.sensorChanged('pir1', false);
		t.engine.sensorChanged('pir1', true);
		t.tick(200);
		t.engine.sensorChanged('pir2', true);
		expect(t.events).to.not.include('alarm');
	});

	it('open window: warn and arm, or refuse', () => {
		const warn = setup({ exitDelayFull: 0 });
		warn.engine.sensorChanged('win', true);
		const r = warn.engine.arm('full', 'state');
		expect(r.ok).to.equal(true);
		expect(r.open.map(s => s.name)).to.deep.equal(['Küchenfenster']);
		expect(warn.events).to.include('openWarning');
		const refuse = setup({ exitDelayFull: 0, openCheck: 'refuse' });
		refuse.engine.sensorChanged('win', true);
		expect(refuse.engine.arm('full', 'state').ok).to.equal(false);
		expect(refuse.status().phase).to.equal('disarmed');
		expect(refuse.events).to.include('armingFailed');
		expect(refuse.status().readyFull).to.equal(false);
	});

	it('24 h sensor triggers even when disarmed; panic too', () => {
		const t = setup();
		t.engine.sensorChanged('smoke', true);
		expect(t.status().phase).to.equal('alarm');
		t.engine.disarm('pin');
		t.engine.panic('Panik-Taste');
		expect(t.status().lastTrigger).to.equal('Panik-Taste');
	});

	it('cancel during the exit delay, restore after restart', () => {
		const t = setup();
		t.engine.arm('full', 'state');
		t.engine.cancelArming('widget');
		expect(t.status().phase).to.equal('disarmed');
		t.tick(120);
		expect(t.events).to.not.include('armedFull');
		t.engine.restore('night');
		expect(t.status().phase).to.equal('armed');
		expect(t.status().mode).to.equal('night');
	});

	it('entry delay: motion detectors inside follow, a window still triggers', () => {
		const t = setup({ exitDelayFull: 0, motionCount: 1 });
		t.engine.arm('full', 'state');
		t.engine.sensorChanged('door', true);
		t.engine.sensorChanged('pir1', true); // walking to the panel
		expect(t.status().phase).to.equal('entry');
		t.engine.sensorChanged('win', 2);
		expect(t.status().phase).to.equal('alarm');
	});

	it('arming again during an alarm ends the alarm first', () => {
		const t = setup({ exitDelayFull: 0 });
		t.engine.arm('perimeter', 'state');
		t.engine.sensorChanged('win', 2);
		t.engine.arm('full', 'state');
		expect(t.events.filter(e => e === 'alarmEnd').length).to.equal(1);
		expect(t.outputs).to.deep.equal([true, false]);
	});

	it('an alarm restored after a restart stays until acknowledged', () => {
		const t = setup();
		t.engine.restoreAlarm('full', 'Küchenfenster');
		expect(t.status().phase).to.equal('alarm');
		expect(t.events).to.deep.equal([]);
		t.engine.ack('state');
		expect(t.status().phase).to.equal('armed');
	});

	it('a danger detector set to message only reports without alarm, also when disarmed', () => {
		const t = setup();
		t.engine.sensorChanged('water', true);
		expect(t.events).to.deep.equal(['hazard']);
		expect(t.status().phase).to.equal('disarmed');
		expect(t.outputs).to.deep.equal([]);
		expect(t.status().lastTrigger).to.equal('Wassermelder');
	});

	it('report-only sensor: message while armed (or always), never alarm, never blocks arming', () => {
		const t = setup({ exitDelayFull: 0 });
		t.engine.sensorChanged('gate', true); // disarmed: nothing
		expect(t.events).to.deep.equal([]);
		expect(t.engine.arm('perimeter', 'state').open).to.deep.equal([]); // open gate does not block
		t.engine.sensorChanged('gate', false);
		t.engine.sensorChanged('gate', true);
		expect(t.events.filter(e => e === 'report').length).to.equal(1);
		expect(t.status().phase).to.equal('armed');
		const always = setup({ reportWhen: 'always' });
		always.engine.sensorChanged('gate', true);
		expect(always.events).to.deep.equal(['report']);
		always.engine.reportOn = false; // switched off by state
		always.engine.sensorChanged('gate', false);
		always.engine.sensorChanged('gate', true);
		expect(always.events).to.deep.equal(['report']);
	});

	it('tilted is fine at home with "tiltOk": fully open still triggers, in full protection tilted counts as open', () => {
		const t = setup({ exitDelayFull: 0 });
		const bed: SensorDef = {
			id: 'bed',
			name: 'Schlafzimmerfenster',
			circuit: 'perimeter',
			delayed: false,
			invert: false,
			motion: false,
			tiltOk: true,
		};
		t.engine.setSensors([...t.engine.getSensors(), bed], { bed: 0 });
		t.engine.arm('night', 'state');
		t.engine.sensorChanged('bed', 1); // tilted: no alarm at night
		expect(t.status().phase).to.equal('armed');
		t.engine.sensorChanged('bed', 2); // fully opened: alarm
		expect(t.status().phase).to.equal('alarm');
		t.engine.disarm('pin');
		t.engine.sensorChanged('bed', 1);
		// full protection: the tilted window is an open contact when arming
		expect(t.engine.arm('full', 'state').open.map(s => s.id)).to.deep.equal(['bed']);
		t.engine.disarm('pin');
		t.engine.sensorChanged('bed', 0);
		t.engine.arm('full', 'state');
		t.engine.sensorChanged('bed', 1); // tilting while away: alarm
		expect(t.status().phase).to.equal('alarm');
	});

	it('bypass: open contacts are left out at arming and watched again once closed', () => {
		const t = setup({ openCheck: 'bypass', exitDelayFull: 0 });
		t.engine.sensorChanged('win', 2);
		const r = t.engine.arm('perimeter', 'state');
		expect(r.ok).to.equal(true);
		expect(t.events).to.include('openWarning');
		expect(t.status().phase).to.equal('armed');
		expect(t.status().bypassed.map(s => s.id)).to.deep.equal(['win']);
		t.engine.sensorChanged('win', 0); // closed: watched again
		expect(t.status().bypassed).to.deep.equal([]);
		expect(t.status().phase).to.equal('armed');
		t.engine.sensorChanged('win', 2); // opened again: alarm
		expect(t.status().phase).to.equal('alarm');
		t.engine.disarm('pin');
		expect(t.status().bypassed).to.deep.equal([]);
	});
});
