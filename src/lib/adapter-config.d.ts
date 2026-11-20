// Settings of the adapter (native part of the instance object), see io-package.json for the defaults

/** A trigger sensor entered by hand (or overriding an automatically found one with the same ID) */
export interface SensorRow {
	enabled: boolean;
	id: string;
	name: string;
	/** perimeter = doors/windows (perimeter, night, full), interior = inside/motion (full only), 24h = always (smoke, water) */
	circuit: 'perimeter' | 'interior' | '24h' | 'report';
	/** entry delay instead of an immediate alarm (e.g. the door you come in through) */
	delayed: boolean;
	/** outer skin only: ignored in perimeter and night protection (you are at home), e.g. the bedroom window */
	homeIgnore?: boolean;
	/** window handle: tilted is no alarm in perimeter and night protection, fully open still is */
	tiltOk?: boolean;
	/** the sensor reports "open" as false */
	invert: boolean;
	/** motion detector: counts for the "several sensors" rule */
	motion: boolean;
	/** 24 h sensors: message only, message and speech, or full alarm */
	hazard?: 'notify' | 'speech' | 'alarm';
	/** note of the automatic search (value at that time, camera, last report) - display only */
	info?: string;
}

/** A plain state ID with an optional name */
export interface IdRow {
	enabled: boolean;
	id: string;
	name: string;
}

/** A siren or other device switched while the alarm runs */
export interface SirenRow {
	enabled: boolean;
	id: string;
	valueOn: string;
	valueOff: string;
	/** all = every alarm, full = outside siren (full protection only), home = inside siren (perimeter/night) */
	when?: 'all' | 'full' | 'home';
	/** own running time in s (0/empty = the alarm duration) */
	durationSec?: number;
}

/** A state written on an event */
export interface ActionRow {
	enabled: boolean;
	event: string;
	id: string;
	value: string;
}

/** A messenger instance */
export interface NotifyRow {
	enabled: boolean;
	instance: string;
	/** fields per messenger: see lib/messengers.ts */
	user?: string;
	chatId?: string;
	phone?: string;
	to?: string;
	device?: string;
	channel?: string;
}

/** A lamp of the presence simulation */
export interface SimLampRow {
	enabled: boolean;
	id: string;
	name: string;
	/** lamp (roles below) or device = TV/radio; old configurations: the role itself (migrated at the start) */
	type: 'lamp' | 'device' | 'evening' | 'visit' | 'bedtime' | 'morning';
	/** roles of a lamp: on for the evening, morning, short visits, briefly at bedtime - several at once */
	evening?: boolean;
	morning?: boolean;
	visit?: boolean;
	bedtime?: boolean;
	/** own value for on / off (optional) */
	valueOn?: string;
	valueOff?: string;
	/** learn from this state instead (e.g. the real power state of the TV) */
	learnFrom?: string;
	/** when the simulation ends: '' automatic (devices off, lamps on), 'off', 'keep' */
	stopOff?: '' | 'off' | 'keep';
	/** devices: time window ('' / evening = dusk to lights out, day = wake-up to lights out, custom = times) */
	window?: '' | 'evening' | 'day' | 'custom';
	/** devices with an own window: "HH:MM-HH:MM" */
	times?: string;
	/** devices: how often, "2" or "1-3" = random each day (empty = general setting) */
	count?: number | string;
	/** devices: how long, minutes "min-max" or "min" (empty = general setting) */
	dur?: string;
}

/** an Amazon Echo (alexa2 adapter): used for the alarm and/or the presence simulation, each with own settings */
export interface EchoRow {
	enabled: boolean;
	/** device object of the alexa2 adapter, e.g. alexa2.0.Echo-Devices.G090XX */
	device: string;
	/** own name (optional) */
	name?: string;
	/** alarm: sound and announcement on this Echo */
	alarm?: boolean;
	/** volume for the alarm 0-100 */
	alarmVolume?: number | string;
	/** sound of the Amazon sound library ('' = none) */
	alarmSound?: string;
	/** read the alarm text aloud */
	alarmText?: boolean;
	/** simulation: play radio on this Echo */
	sim?: boolean;
	/** station(s): name or TuneIn ID (s12345); several separated by commas = a random one each time */
	stations?: string;
	/** volume for the radio 0-100 (empty = as it is) */
	simVolume?: number | string;
	/** time window, times, how often, how long - as for the devices of the simulation */
	window?: '' | 'evening' | 'day' | 'custom';
	times?: string;
	count?: number | string;
	dur?: string;
	/** learn when radio or music really plays on this Echo (runs of at least 5 minutes) */
	learn?: boolean;
}

declare global {
	namespace ioBroker {
		interface AdapterConfig {
			// general
			alarmEnabled: boolean;
			simEnabled: boolean;
			// triggers
			autoFull: boolean;
			enumFull: string;
			autoPerimeter: boolean;
			enumPerimeter: string;
			autoFire: boolean;
			enumFire: string;
			sensors: SensorRow[];
			motionCount: number;
			motionWindowSec: number;
			sabotageHours: number;
			// procedure and PIN
			exitDelayFull: number;
			exitDelayPerimeter: number;
			armEarlyId: string;
			entryDelay: number;
			openCheck: 'refuse' | 'warn' | 'ignore' | 'bypass';
			alarmDuration: number;
			nightEnabled: boolean;
			nightStart: string;
			nightEnd: string;
			pin: string;
			/** duress PIN: disarms like the PIN, but sends a silent alarm to the messengers */
			pinDuress?: string;
			pinForDisarmState: boolean;
			pinForArm: boolean;
			maxWrongPin: number;
			pinLockMin: number;
			testNotify: boolean;
			testSpeech: boolean;
			testLamps: boolean;
			testSirens: boolean;
			testActions: boolean;
			testDuration: number;
			/** walk test: minutes until it ends by itself */
			walkTestMin?: number;
			eveningLight: boolean;
			morningLight: boolean;
			simWake: string;
			simWakeRandom: number;
			simWakeWeekendLater: number;
			simMorningOffOffset: number;
			simMorningOffRandom: number;
			simMorningOffTime: string;
			simMorningLuxAbove: number;
			reportWhen: 'armed' | 'always';
			notifyReport: boolean;
			autoReport: boolean;
			enumReport: string;
			hazardDefault: 'notify' | 'speech' | 'alarm';
			notifyHazard: boolean;
			presenceEnabled: boolean;
			simDeviceMin: number;
			simDeviceMax: number;
			simDeviceCount: number;
			simLearnWindow: 'all' | 'dark' | 'times';
			simLearnDarkOffset: number;
			simLearnFrom: string;
			simLearnTo: string;
			// disarm and presence
			lockEnabled: boolean;
			lockId: string;
			lockValues: string;
			presenceAuto: boolean;
			enumPresence: string;
			presence: IdRow[];
			presenceArm: 'off' | 'full' | 'perimeter';
			presenceDisarm: boolean;
			// notifications
			notify: NotifyRow[];
			notifyArmed: boolean;
			notifyDisarmed: boolean;
			notifyArmingFailed: boolean;
			notifyOpenWarning: boolean;
			notifyEntry: boolean;
			notifyAlarm: boolean;
			notifyAlarmEnd: boolean;
			notifyWrongPin: boolean;
			notifySabotage: boolean;
			notifySim: boolean;
			alarmRepeatMin: number;
			notificationManager: boolean;
			speechId: string;
			speechArming: boolean;
			speechEntry: boolean;
			speechAlarm: boolean;
			// actions
			lampsAuto: boolean;
			enumLamps: string;
			lamps: IdRow[];
			lampMode: 'on' | 'blink';
			blinkSec: number;
			lampsRestore: boolean;
			sirens: SirenRow[];
			actions: ActionRow[];
			// presence simulation
			simCoupling: 'manual' | 'alarm' | 'away' | 'alarmOrAway';
			simAuto: boolean;
			enumSimLamps: string;
			enumMorningLamps: string;
			simLamps: SimLampRow[];
			/** setup assistant: current page, finished (all tabs shown), result of the search */
			wizStep: number;
			wizDone: boolean;
			wizScanInfo: string;
			/** setup assistant: what the user has (decides the pages) and yes/no questions on a page */
			wizHasDoors: boolean;
			wizHasMotion: boolean;
			wizHasFire: boolean;
			wizHasReport: boolean;
			wizHasSiren: boolean;
			wizHasSpeaker: boolean;
			wizHasLux: boolean;
			wizHasDevices: boolean;
			wizQLamps: boolean;
			wizQActions: boolean;
			wizSimMorning: boolean;
			/** setup assistant: an Echo was found / use it for the alarm / for the simulation */
			wizHasAlexa: boolean;
			wizAlexaAlarm: boolean;
			wizAlexaSim: boolean;
			/** Amazon Echo devices (alexa2) for the alarm and the simulation */
			echos: EchoRow[];
			simMode: 'dusk' | 'learned' | 'combined';
			simStartOffset: number;
			simStartRandom: number;
			simLuxId: string;
			simLuxBelow: number;
			simEnd: string;
			simEndRandom: number;
			simWeekendLater: number;
			simVisits: number;
			simVisitMin: number;
			simVisitMax: number;
			simLearnDays: number;
			simLearnDevicesOnly: boolean;
			simJitter: number;
			simLearnPick: 'kind' | 'weekday';
			// logbook
			logSize: number;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
