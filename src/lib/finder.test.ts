import { expect } from 'chai';
import { findSensors, sameDevices, sensorNote, type FinderObject } from './finder';
import { fill, loadTr, trEn } from './i18n';

const st = (role: string, name = '', extra: Partial<FinderObject['common']> = {}): FinderObject => ({
	type: 'state',
	common: { role, name, ...extra },
});
const objects: Record<string, FinderObject> = {
	// Homematic: a real window contact, a switch actuator with a wrong role, a thermostat
	'hm-rpc.0.A': { type: 'device', common: { name: 'Fenster Bad' }, native: { TYPE: 'HmIP-SWDO-I' } },
	'hm-rpc.0.A.1': { type: 'channel', common: { name: 'Fenster Bad:1' } },
	'hm-rpc.0.A.1.STATE': st('sensor.window'),
	'hm-rpc.0.B': { type: 'device', common: { name: 'Flurlicht' }, native: { TYPE: 'HmIP-DRSI1' } },
	'hm-rpc.0.B.1.STATE': st('sensor.window'),
	'hm-rpc.0.T': { type: 'device', common: { name: 'Heizung' }, native: { TYPE: 'HmIP-eTRV-2' } },
	'hm-rpc.0.T.1.WINDOW_STATE': st('value.window'),
	'hm-rpc.0.T.1.SET_POINT_TEMPERATURE': st('level.temperature'),
	// aliases: one of the contact (wins over its target), one of the thermostat window, one with a wrong role
	'alias.0.Bad.Fenster': st('sensor.window', 'Fenster', { alias: { id: 'hm-rpc.0.A.1.STATE' } }),
	'alias.0.Heizung.WINDOW_STATE': st('value.window', 'Heizung', { alias: { id: 'hm-rpc.0.T.1.WINDOW_STATE' } }),
	'alias.0.Flur.BWM.Ausgeloest': st('sensor.motion', 'Ausgeloest'),
	// zigbee: contact without a role reports "closed" as true; a second state of the same channel
	'zigbee.0.x': { type: 'device', common: { name: 'Tür' } },
	'zigbee.0.x.contact': st('state', 'Contact'),
	'zigbee.0.y': { type: 'device', common: { name: 'PIR' } },
	'zigbee.0.y.occupancy': st('sensor.motion'),
	'zigbee.0.y.occupancy_2': st('sensor.motion'),
	// camera, disabled adapter, own adapter, presence of a person (no sensor)
	'reolink.0.sensor.motion': st('sensor.motion', 'motion'),
	'deconz.0.z.presence': st('sensor.motion'),
	'home-guard.1.status.alarm': st('sensor.alarm.secure'),
	'fb-checkpresence.0.familyMembers.x.presence': st('indicator'),
	'enum.rooms.keller': { type: 'enum', common: { name: { de: 'Keller', en: 'Basement' }, members: ['zigbee.0.x'] } },
};
const instances = {
	'hm-rpc.0': true,
	'zigbee.0': true,
	'reolink.0': true,
	'deconz.0': false,
	'fb-checkpresence.0': true,
};
const found = findSensors({ objects, instances, ownAdapter: 'home-guard', lang: 'de' });
const byId = Object.fromEntries(found.map(f => [f.id, f]));

describe('findSensors', () => {
	it('finds the real sensors only', () => {
		expect(found.map(f => f.id).sort()).to.deep.equal([
			'alias.0.Bad.Fenster',
			'alias.0.Flur.BWM.Ausgeloest',
			'reolink.0.sensor.motion',
			'zigbee.0.x.contact',
			'zigbee.0.y.occupancy',
		]);
	});
	it('takes the alias instead of its target, leaves out thermostats and actuators', () => {
		expect(byId['hm-rpc.0.A.1.STATE']).to.equal(undefined);
		expect(byId['hm-rpc.0.B.1.STATE']).to.equal(undefined);
		expect(byId['alias.0.Heizung.WINDOW_STATE']).to.equal(undefined);
	});
	it('shows the target if its alias has a wrong role', () => {
		const o = {
			...objects,
			'alias.0.Bad.Fenster': st('state', 'Fenster', { alias: { id: 'hm-rpc.0.A.1.STATE' } }),
		};
		const f = findSensors({ objects: o, instances, ownAdapter: 'home-guard', lang: 'de' });
		expect(f.map(s => s.id)).to.include('hm-rpc.0.A.1.STATE');
		expect(f.find(s => s.id === 'hm-rpc.0.A.1.STATE')!.name).to.equal('Fenster Bad');
	});
	it('names with room, folder and device', () => {
		expect(byId['zigbee.0.x.contact'].name).to.equal('Keller – Tür');
		expect(byId['alias.0.Flur.BWM.Ausgeloest'].name).to.equal('BWM');
	});
	it('zigbee contact is inverted, camera is marked, one state per channel', () => {
		expect(byId['zigbee.0.x.contact'].invert).to.equal(true);
		expect(byId['zigbee.0.x.contact'].circuit).to.equal('perimeter');
		expect(byId['reolink.0.sensor.motion'].camera).to.equal(true);
		expect(byId['zigbee.0.y.occupancy_2']).to.equal(undefined);
	});
});

describe('sameDevices', () => {
	it('adds alias targets and the aliases of targets', () => {
		const s = sameDevices(['alias.0.Bad.Fenster'], objects);
		expect([...s]).to.include.members(['alias.0.Bad.Fenster', 'hm-rpc.0.A.1.STATE']);
		expect([...sameDevices(['hm-rpc.0.A.1.STATE'], objects)]).to.include('alias.0.Bad.Fenster');
	});
});

describe('sensorNote', () => {
	const now = Date.UTC(2026, 10, 18);
	it('value, camera and silence', () => {
		const n = sensorNote(byId['reolink.0.sensor.motion'], { val: false, ts: now - 45 * 86_400_000 }, now, trEn);
		expect(n.note).to.equal('now: quiet · no report for 45 days · camera – often false alarms');
		expect(n.stale).to.equal(true);
	});
	it('inverted contact', () => {
		const n = sensorNote(byId['zigbee.0.x.contact'], { val: true, ts: now }, now, trEn);
		expect(n.note).to.match(/^now: closed · reports/);
		expect(n.stale).to.equal(false);
	});
});

describe('i18n', () => {
	it('fills placeholders in order', () => {
		expect(fill('%s: "%s" (%s states)', ['Presence', 'Anwesend', 4])).to.equal('Presence: "Anwesend" (4 states)');
	});
	it('falls back to English for a missing file', () => {
		expect(loadTr('xx', '/nonexistent')('no report for %s days', 3)).to.equal('no report for 3 days');
	});
});
