import { expect } from 'chai';
import { bestEnum, nextStep, stepNeeded, WIZARD_DEFAULTS, type EnumInfo } from './wizard';

describe('setup assistant', () => {
	const all = { alarm: true, sim: true, evening: true, morning: true };
	const lightOnly = { alarm: false, sim: false, evening: true, morning: false };

	it('goes through every step when everything is ticked', () => {
		const seen = [0];
		let s = 0;
		while (s < 8) {
			s = nextStep(s, 1, all);
			seen.push(s);
		}
		expect(seen).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7, 8]);
		expect(nextStep(8, 1, all)).to.equal(8);
		expect(nextStep(0, -1, all)).to.equal(0);
	});

	it('skips the alarm steps for the evening light only', () => {
		expect(nextStep(0, 1, lightOnly)).to.equal(6);
		expect(nextStep(7, 1, lightOnly)).to.equal(8);
		expect(nextStep(6, -1, lightOnly)).to.equal(0);
		expect(stepNeeded(3, lightOnly)).to.equal(false);
		expect(stepNeeded(3, { ...lightOnly, sim: true })).to.equal(true);
	});

	it('suggests sensible defaults', () => {
		expect(WIZARD_DEFAULTS.times.entryDelay).to.equal(30);
		expect(WIZARD_DEFAULTS.light.simWake).to.equal('06:30');
	});

	it('finds the fitting function by roles and name', () => {
		const enums: EnumInfo[] = [
			{ id: 'enum.functions.light', name: 'Licht', roles: ['switch.light', 'switch.light', 'level.dimmer'] },
			{ id: 'enum.functions.window', name: 'Fenster', roles: ['sensor.window', 'sensor.window', 'value.window'] },
			{ id: 'enum.functions.motion', name: 'Bewegung', roles: ['sensor.motion'] },
			{ id: 'enum.functions.abend_auto_an', name: 'abend_auto_an', roles: ['switch', 'switch'] },
			{ id: 'enum.functions.heating', name: 'Heizung', roles: ['level.temperature'] },
		];
		expect(bestEnum('perimeter', enums)?.id).to.equal('enum.functions.window');
		expect(bestEnum('full', enums)?.id).to.equal('enum.functions.motion');
		expect(bestEnum('lamps', enums)?.id).to.equal('enum.functions.light');
		expect(bestEnum('evening', enums)?.id).to.equal('enum.functions.abend_auto_an');
		expect(bestEnum('morning', enums)).to.equal(null);
		expect(bestEnum('fire', enums)).to.equal(null);
		const own: EnumInfo[] = [
			{ id: 'enum.functions.Lock', name: 'Sperren', roles: ['switch.lock', 'value.lock'] },
			{ id: 'enum.functions.alarm_huellschutz', name: 'alarm_huellschutz', roles: ['sensor.window', 'state'] },
			{
				id: 'enum.functions.alarm_vollschutz',
				name: 'alarm_vollschutz',
				roles: ['sensor.motion', 'sensor.window'],
			},
			{ id: 'enum.functions.anwesend', name: 'Anwesend', roles: [] },
			{ id: 'enum.functions.person_anwesend', name: 'person_anwesend', roles: ['indicator', 'indicator'] },
		];
		expect(bestEnum('perimeter', own)?.id).to.equal('enum.functions.alarm_huellschutz');
		expect(bestEnum('full', own)?.id).to.equal('enum.functions.alarm_vollschutz');
		expect(bestEnum('presence', own)?.id).to.equal('enum.functions.person_anwesend');
	});
});
