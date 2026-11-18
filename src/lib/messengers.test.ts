import { expect } from 'chai';
import { MESSENGERS, listMessengers, sendToMessenger, type MessengerHost } from './messengers';

/** fake adapter that records what is sent */
function fakeHost(): MessengerHost & { calls: Record<string, unknown>[] } {
	const calls: Record<string, unknown>[] = [];
	return {
		calls,
		sendTo: (inst, cmd, msg) => {
			calls.push({ inst, cmd, msg });
		},
		setForeignStateAsync: (id, val, ack) => {
			calls.push({ id, val, ack });
			return Promise.resolve();
		},
	};
}
const msg = { title: 'Home Guard', text: 'Alarm: Haustür', alert: true };

describe('messengers', () => {
	it('knows the 12 supported messengers', () => {
		expect(Object.keys(MESSENGERS)).to.have.length(12);
	});
	it('lists only installed supported instances', () => {
		const list = listMessengers(
			['telegram.0', 'admin.0', 'gotify.0', 'notification-manager.0', 'ai-assistant.0'].map(
				i => `system.adapter.${i}`,
			),
		);
		expect(list.map(l => l.value)).to.deep.equal(['gotify.0', 'telegram.0']);
		expect(list[1].label).to.equal('Telegram (telegram.0)');
	});
	it('telegram keeps user and chatId of old rows', async () => {
		const h = fakeHost();
		await sendToMessenger(h, { instance: 'telegram.0', user: '', chatId: '-100123' }, msg);
		expect(h.calls[0]).to.deep.equal({
			inst: 'telegram.0',
			cmd: 'send',
			msg: { text: 'Alarm: Haustür', chatId: '-100123' },
		});
	});
	it('rejects unsupported adapters and missing required fields', async () => {
		const h = fakeHost();
		const errs: string[] = [];
		for (const instance of ['foo.0', 'gsmsms.0', 'discord.0', 'synochat.0']) {
			await sendToMessenger(h, { instance }, msg).catch((e: Error) => errs.push(e.message));
		}
		expect(errs[0]).to.match(/not supported/);
		expect(errs[1]).to.match(/phone/);
		expect(errs[2]).to.match(/user or channel/);
		expect(errs[3]).to.match(/channel/);
		expect(h.calls).to.have.length(0);
	});
	it('builds each format', async () => {
		const h = fakeHost();
		await sendToMessenger(h, { instance: 'pushover.0', device: 'phone' }, msg);
		await sendToMessenger(h, { instance: 'email.0', to: 'a@b.de' }, msg);
		await sendToMessenger(h, { instance: 'gsmsms.0', phone: '+49170' }, msg);
		await sendToMessenger(h, { instance: 'discord.0', user: 'anna#0' }, msg);
		await sendToMessenger(h, { instance: 'iot.0' }, { ...msg, alert: false });
		await sendToMessenger(h, { instance: 'synochat.0', channel: 'home' }, msg);
		expect(h.calls[0].msg).to.deep.equal({
			message: 'Alarm: Haustür',
			title: 'Home Guard',
			priority: 1,
			device: 'phone',
		});
		expect(h.calls[1].msg).to.deep.equal({
			subject: 'Home Guard: Alarm: Haustür',
			text: 'Alarm: Haustür',
			to: 'a@b.de',
		});
		expect(h.calls[2].msg).to.deep.equal({ text: 'Home Guard: Alarm: Haustür', recipient: '+49170', alert: false });
		expect(h.calls[3]).to.deep.include({ cmd: 'sendMessage' });
		expect(h.calls[3].msg).to.deep.include({ userTag: 'anna#0' });
		expect(JSON.parse(h.calls[4].val as string)).to.deep.equal({
			message: 'Alarm: Haustür',
			title: 'Home Guard',
			priority: 'normal',
		});
		expect(h.calls[5]).to.deep.equal({
			id: 'synochat.0.home.message',
			val: 'Home Guard: Alarm: Haustür',
			ack: false,
		});
	});
});
