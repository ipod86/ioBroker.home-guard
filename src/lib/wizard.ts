// Setup assistant of the instance settings: step navigation, suggested values and the automatic search

/** which steps apply to what was ticked in the first step (same order as in jsonConfig) */
export interface WizardChoice {
	alarm: boolean;
	sim: boolean;
	evening: boolean;
	morning: boolean;
}

/** number of steps of the assistant */
export const WIZARD_STEPS = 9;

/**
 * Is a step needed for the choice?
 *
 * @param step step index
 * @param c what was ticked in the first step
 */
export function stepNeeded(step: number, c: WizardChoice): boolean {
	const light = c.sim || c.evening || c.morning;
	switch (step) {
		case 1: // sensors
		case 2: // times
		case 4: // notifications
		case 5: // on alarm
			return c.alarm;
		case 3: // disarming & persons
			return c.alarm || c.sim;
		case 6: // simulation & lamps
		case 7: // evening & morning
			return light;
		default:
			return true;
	}
}

/**
 * Next (or previous) step that is needed
 *
 * @param step current step
 * @param dir 1 = next, -1 = back
 * @param c what was ticked in the first step
 */
export function nextStep(step: number, dir: number, c: WizardChoice): number {
	let s = Math.max(0, Math.min(WIZARD_STEPS - 1, Math.round(step) || 0));
	const d = dir < 0 ? -1 : 1;
	do {
		s += d;
	} while (s > 0 && s < WIZARD_STEPS - 1 && !stepNeeded(s, c));
	return Math.max(0, Math.min(WIZARD_STEPS - 1, s));
}

/** suggested values per page of the assistant */
export const WIZARD_DEFAULTS: Record<string, Record<string, string | number>> = {
	times: {
		exitDelayFull: 60,
		exitDelayPerimeter: 0,
		entryDelay: 30,
		alarmDuration: 180,
		openCheck: 'warn',
		nightStart: '23:00',
		nightEnd: '06:00',
	},
	light: {
		simStartOffset: -30,
		simStartRandom: 20,
		simEnd: '22:30',
		simEndRandom: 45,
		simWeekendLater: 45,
		simWake: '06:30',
		simWakeRandom: 20,
		simWakeWeekendLater: 60,
		simMorningOffOffset: 5,
		simMorningOffRandom: 25,
	},
};

/** kinds of functions the search looks for */
export type ScanKind = 'perimeter' | 'full' | 'fire' | 'report' | 'lamps' | 'evening' | 'morning' | 'presence';

interface KindRule {
	/** roles of member states that fit */
	role?: RegExp;
	/** words in the name of the function that fit */
	name: RegExp;
	/** a function is only taken when its name fits (e.g. evening lamps: not every lamp) */
	nameRequired?: boolean;
}

const RULES: Record<ScanKind, KindRule> = {
	perimeter: {
		role: /^(sensor\.(window|door|contact|lock)|value\.window|sensor\.open)/,
		name: /fenster|t(ü|ue)r|window|door|kontakt|contact|au(ß|ss)en|perimeter|h(ü|ue)lle/i,
	},
	full: { role: /^sensor\.motion/, name: /bewegung|motion|innen|inside|interior|pir/i },
	fire: {
		role: /^sensor\.alarm\.(fire|flood|smoke|gas|water)|^sensor\.(smoke|water|leak|gas)/,
		name: /rauch|smoke|wasser|water|leck|leak|gas|brand|fire|gefahr|hazard/i,
	},
	report: {
		name: /melde|briefkast|mailbox|letter|gartentor|garden.?gate|schuppen|shed|nur.?melden|report/i,
		nameRequired: true,
	},
	lamps: {
		role: /^(switch\.light|level\.dimmer|light|switch\.lamp)/,
		name: /licht|light|lamp|beleucht/i,
	},
	evening: { name: /abend|evening|dusk|d(ä|ae)mmerung/i, nameRequired: true },
	morning: { name: /morgen|morning|wake|aufsteh/i, nameRequired: true },
	presence: { role: /^(indicator\.presence|state\.presence|presence)/, name: /anwesen|presence|zuhause|at.?home/i },
};

/** a function and the roles of its member states */
export interface EnumInfo {
	id: string;
	name: string;
	roles: string[];
}

/**
 * Best fitting function for a kind, or null
 *
 * @param kind what is looked for
 * @param enums the functions with the roles of their states
 */
export function bestEnum(kind: ScanKind, enums: EnumInfo[]): { id: string; name: string; count: number } | null {
	const rule = RULES[kind];
	let best: { id: string; name: string; count: number; score: number } | null = null;
	for (const e of enums) {
		const nameFit = rule.name.test(e.name) || rule.name.test(e.id.split('.').pop() || '');
		if (rule.nameRequired && !nameFit) {
			continue;
		}
		const count = rule.role ? e.roles.filter(r => rule.role!.test(r)).length : e.roles.length;
		if (!nameFit && count === 0) {
			continue;
		}
		// share of fitting states counts, so "all lamps" wins over "everything in the hall"
		const share = e.roles.length ? count / e.roles.length : 0;
		const score = (nameFit ? 3 : 0) + count + share * 5;
		if (!best || score > best.score) {
			best = { id: e.id, name: e.name, count: rule.role ? count : e.roles.length, score };
		}
	}
	return best ? { id: best.id, name: best.name, count: best.count } : null;
}
