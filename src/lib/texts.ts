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
		openWarning: (m: string, list: string) => `⚠️ ${m} scharf, aber offen: ${list}`,
		entry: (name: string, sec: number) => `🚪 ${name} geöffnet – bitte innerhalb von ${sec} Sekunden entschärfen`,
		alarm: (name: string) => `🚨 ALARM: ${name}`,
		panic: (src: string) => `🚨 PANIK-ALARM ausgelöst (${src})`,
		alarmEnd: (src: string) => `✅ Alarm beendet${src}`,
		wrongPin: (n: number) => `🔢 ${n}× falsche PIN eingegeben`,
		sabotage: (list: string) => `🔋 Keine Meldung mehr von: ${list}`,
		simStart: '💡 Anwesenheitssimulation gestartet',
		simStop: '💡 Anwesenheitssimulation beendet',
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
		} as Record<string, string>,
		via: (s: string) => (s ? ` (${s})` : ''),
		test: '🧪 Testnachricht von Home Guard',
	},
	en: {
		mode: { off: 'Off', full: 'Full protection', perimeter: 'Perimeter protection', night: 'Night protection' },
		phase: { disarmed: 'Disarmed', arming: 'Arming', armed: 'Armed', entry: 'Entry delay', alarm: 'ALARM' },
		armed: (m: string, src: string) => `🛡️ Alarm system armed: ${m}${src}`,
		arming: (m: string, sec: number) => `⏳ ${m} will be armed in ${sec} seconds`,
		disarmed: (src: string) => `🔓 Alarm system disarmed${src}`,
		armingFailed: (m: string, list: string) => `⚠️ ${m} not armed – open: ${list}`,
		openWarning: (m: string, list: string) => `⚠️ ${m} armed, but open: ${list}`,
		entry: (name: string, sec: number) => `🚪 ${name} opened – please disarm within ${sec} seconds`,
		alarm: (name: string) => `🚨 ALARM: ${name}`,
		panic: (src: string) => `🚨 PANIC alarm triggered (${src})`,
		alarmEnd: (src: string) => `✅ Alarm ended${src}`,
		wrongPin: (n: number) => `🔢 Wrong PIN entered ${n} times`,
		sabotage: (list: string) => `🔋 No more reports from: ${list}`,
		simStart: '💡 Presence simulation started',
		simStop: '💡 Presence simulation stopped',
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
		} as Record<string, string>,
		via: (s: string) => (s ? ` (${s})` : ''),
		test: '🧪 Test message from Home Guard',
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
