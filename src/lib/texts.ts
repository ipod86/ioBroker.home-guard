// Texts of notifications, logbook and speech output (German and English, other languages get English)

export type Lang = 'de' | 'en';

const T = {
	de: {
		mode: { off: 'Aus', full: 'Vollschutz', perimeter: 'Hüllschutz', night: 'Nachtschutz' },
		phase: {
			disarmed: 'Unscharf',
			arming: 'Wird scharf',
			armed: 'Scharf',
			entry: 'Eingangsverzögerung',
			alarm: 'ALARM',
		},
		armed: (m: string, src: string) => `🛡️ Alarmanlage scharf: ${m}${src}`,
		arming: (m: string, sec: number) => `⏳ ${m} wird in ${sec} Sekunden scharf geschaltet`,
		disarmed: (src: string) => `🔓 Alarmanlage unscharf${src}`,
		armingFailed: (m: string, list: string) => `⚠️ ${m} nicht scharf geschaltet – offen: ${list}`,
		openBypass: (m: string, list: string) =>
			`⚠️ ${m} scharf – offen und ausgenommen, bis es geschlossen wird: ${list}`,
		duress: (src: string) => `🆘 STILLER ALARM: Die Anlage wurde mit der Bedrohungs-PIN ausgeschaltet${src}`,
		walkStart: (min: number) =>
			`🚶 Gehtest gestartet (${min} min) – jetzt jede Tür, jedes Fenster und jeden Bewegungsmelder auslösen`,
		walkDone: (seen: number, total: number, missing: string) =>
			missing
				? `🚶 Gehtest beendet: ${seen} von ${total} Sensoren gemeldet. Nicht gemeldet: ${missing}`
				: `🚶 Gehtest beendet: alle ${total} Sensoren haben sich gemeldet`,
		openWarning: (m: string, list: string) => `⚠️ ${m} scharf, aber offen: ${list}`,
		entry: (name: string, sec: number) => `🚪 ${name} geöffnet – bitte innerhalb von ${sec} Sekunden entschärfen`,
		alarm: (name: string) => `🚨 ALARM: ${name}`,
		panic: (src: string) => `🚨 PANIK-ALARM ausgelöst (${src})`,
		alarmEnd: (src: string) => `✅ Alarm beendet${src}`,
		alarmAcked: (src: string, noPin: boolean) =>
			`🔕 Alarm quittiert${src}${noPin ? ' – ohne PIN' : ''}. Die Anlage bleibt scharf: jeder weitere Sensor löst sofort wieder aus`,
		wrongPin: (n: number) => `🔢 ${n}× falsche PIN eingegeben`,
		sabotage: (list: string) => `🔋 Keine Meldung mehr von: ${list}`,
		hazard: (name: string) => `⚠️ Gefahrenmelder hat ausgelöst: ${name}`,
		report: (name: string) => `📣 Meldung: ${name}`,
		simStart: '💡 Anwesenheitssimulation gestartet',
		simStop: '💡 Anwesenheitssimulation beendet',
		title: 'Alarmanlage',
		autoOn: '🤖 Automatisch scharf/unscharf über Anwesenheit eingeschaltet',
		autoOff: '✋ Automatisch scharf/unscharf über Anwesenheit ausgeschaltet',
		lightSwitch: {
			eveningOn: 'Abends automatisch an',
			eveningOff: 'Abends automatisch aus',
			morningOn: 'Morgens automatisch an',
			morningOff: 'Morgens automatisch aus',
		} as Record<string, string>,
		switchedOn: 'eingeschaltet',
		switchedOff: 'ausgeschaltet',
		testPrefix: '🧪 TEST – ',
		testTrigger: 'Testauslöser',
		testEnd: '🧪 Test beendet',
		alarmWord: 'Alarm',
		by: {
			pin: 'PIN',
			state: 'Datenpunkt',
			presence: 'Anwesenheit',
			lock: 'Türschloss',
			widget: 'Bedienfeld',
			night: 'Nachtzeit',
			delay: '',
			panic: 'Panik-Taste',
			schedule: 'Zeitplan',
			message: 'Befehl',
			rearm: 'wieder scharf, niemand zu Hause',
		} as Record<string, string>,
		via: (s: string) => (s ? ` (${s})` : ''),
		test: '🧪 Testnachricht von Home Guard',
		onOff: ['aus', 'an'],
	},
	en: {
		mode: { off: 'Off', full: 'Full protection', perimeter: 'Perimeter protection', night: 'Night protection' },
		phase: { disarmed: 'Disarmed', arming: 'Arming', armed: 'Armed', entry: 'Entry delay', alarm: 'ALARM' },
		armed: (m: string, src: string) => `🛡️ Alarm system armed: ${m}${src}`,
		arming: (m: string, sec: number) => `⏳ ${m} will be armed in ${sec} seconds`,
		disarmed: (src: string) => `🔓 Alarm system disarmed${src}`,
		armingFailed: (m: string, list: string) => `⚠️ ${m} not armed – open: ${list}`,
		openBypass: (m: string, list: string) => `⚠️ ${m} armed – open and left out until closed: ${list}`,
		duress: (src: string) => `🆘 SILENT ALARM: the system was disarmed with the duress PIN${src}`,
		walkStart: (min: number) =>
			`🚶 Walk test started (${min} min) – now trigger every door, window and motion detector`,
		walkDone: (seen: number, total: number, missing: string) =>
			missing
				? `🚶 Walk test finished: ${seen} of ${total} sensors reported. Not reported: ${missing}`
				: `🚶 Walk test finished: all ${total} sensors reported`,
		openWarning: (m: string, list: string) => `⚠️ ${m} armed, but open: ${list}`,
		entry: (name: string, sec: number) => `🚪 ${name} opened – please disarm within ${sec} seconds`,
		alarm: (name: string) => `🚨 ALARM: ${name}`,
		panic: (src: string) => `🚨 PANIC alarm triggered (${src})`,
		alarmEnd: (src: string) => `✅ Alarm ended${src}`,
		alarmAcked: (src: string, noPin: boolean) =>
			`🔕 Alarm acknowledged${src}${noPin ? ' – without PIN' : ''}. The system stays armed: any further sensor triggers the alarm at once`,
		wrongPin: (n: number) => `🔢 Wrong PIN entered ${n} times`,
		sabotage: (list: string) => `🔋 No more reports from: ${list}`,
		hazard: (name: string) => `⚠️ Danger detector triggered: ${name}`,
		report: (name: string) => `📣 Report: ${name}`,
		simStart: '💡 Presence simulation started',
		simStop: '💡 Presence simulation stopped',
		title: 'Alarm system',
		autoOn: '🤖 Automatic arming by presence switched on',
		autoOff: '✋ Automatic arming by presence switched off',
		lightSwitch: {
			eveningOn: 'Evening: switch on automatically',
			eveningOff: 'Evening: switch off automatically',
			morningOn: 'Morning: switch on automatically',
			morningOff: 'Morning: switch off automatically',
		} as Record<string, string>,
		switchedOn: 'switched on',
		switchedOff: 'switched off',
		testPrefix: '🧪 TEST – ',
		testTrigger: 'test trigger',
		testEnd: '🧪 Test finished',
		alarmWord: 'Alarm',
		by: {
			pin: 'PIN',
			state: 'state',
			presence: 'presence',
			lock: 'door lock',
			widget: 'panel',
			night: 'night time',
			delay: '',
			panic: 'panic button',
			schedule: 'schedule',
			message: 'command',
			rearm: 'armed again, nobody at home',
		} as Record<string, string>,
		via: (s: string) => (s ? ` (${s})` : ''),
		test: '🧪 Test message from Home Guard',
		onOff: ['off', 'on'],
	},
};

export type Texts = (typeof T)['de'];

/**
 * Texts in the system language (German or English)
 *
 * @param lang system language
 */
export function texts(lang: string): Texts {
	return lang === 'de' ? T.de : T.en;
}
