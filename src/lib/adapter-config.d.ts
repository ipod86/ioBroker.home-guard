// Settings of the adapter (native part of the instance object), see io-package.json for the defaults

/** A trigger sensor entered by hand (or overriding an automatically found one with the same ID) */
export interface SensorRow {
	enabled: boolean;
	id: string;
	name: string;
	/** perimeter = doors/windows (perimeter, night, full), interior = inside/motion (full only), 24h = always (smoke, water) */
	circuit: 'perimeter' | 'interior' | '24h';
	/** entry delay instead of an immediate alarm (e.g. the door you come in through) */
	delayed: boolean;
	/** the sensor reports "open" as false */
	invert: boolean;
	/** motion detector: counts for the "several sensors" rule */
	motion: boolean;
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
	user: string;
	chatId: string;
}

/** A lamp of the presence simulation */
export interface SimLampRow {
	enabled: boolean;
	id: string;
	name: string;
	/** evening = on for the evening, visit = short visits, bedtime = briefly at bedtime */
	type: 'evening' | 'visit' | 'bedtime';
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
			openCheck: 'refuse' | 'warn' | 'ignore';
			alarmDuration: number;
			nightEnabled: boolean;
			nightStart: string;
			nightEnd: string;
			pin: string;
			pinForDisarmState: boolean;
			pinForArm: boolean;
			maxWrongPin: number;
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
			simLamps: SimLampRow[];
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
			// logbook
			logSize: number;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
