import { expect } from 'chai';
import { bestEnum, nextStep, WIZARD_DEFAULTS, type EnumInfo } from './wizard';

describe('setup assistant', () => {
	it('goes through every page that is needed', () => {
		const seen = [0];
		let s = 0;
		while (s < 4) {
			s = nextStep(s, 1, '11111');
			seen.push(s);
		}
		expect(seen).to.deep.equal([0, 1, 2, 3, 4]);
		expect(nextStep(4, 1, '11111')).to.equal(4);
		expect(nextStep(0, -1, '11111')).to.equal(0);
	});

	it('skips pages that are not needed, in both directions', () => {
		expect(nextStep(1, 1, '1100011')).to.equal(5);
		expect(nextStep(5, -1, '1100011')).to.equal(1);
		expect(nextStep(5, 1, '1100010')).to.equal(6);
	});

	it('goes simply one page on when the list is missing or broken', () => {
		expect(nextStep(2, 1, '')).to.equal(3);
		expect(nextStep(2, -1, 'undefined')).to.equal(1);
		expect(nextStep(0, -1, '')).to.equal(0);
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
		// not only windows: glass break and vibration count as outer skin, a panic button as danger
		const more: EnumInfo[] = [
			{ id: 'enum.functions.glasbruch', name: 'Glasbruchmelder', roles: ['sensor.alarm', 'sensor.alarm'] },
			{ id: 'enum.functions.notruf', name: 'Panikknopf', roles: ['button'] },
		];
		expect(bestEnum('perimeter', more)?.id).to.equal('enum.functions.glasbruch');
		expect(bestEnum('fire', more)?.id).to.equal('enum.functions.notruf');
	});
});
