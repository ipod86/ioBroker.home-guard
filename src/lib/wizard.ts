// Setup assistant of the instance settings: step navigation, suggested values and the automatic search

/**
 * Next (or previous) page that is needed
 *
 * The form sends which pages are needed as a string of 0/1 (one place in jsonConfig decides it for hiding
 * and for the navigation). Missing or broken: simply one page on.
 *
 * @param step current page
 * @param dir 1 = next, -1 = back
 * @param need "1" per needed page, "0" per page that is skipped
 */
export function nextStep(step: number, dir: number, need: string): number {
	const d = dir < 0 ? -1 : 1;
	if (!/^[01]+$/.test(need)) {
		return Math.max(0, (Math.round(step) || 0) + d);
	}
	const pages = need;
	const last = pages.length - 1;
	let s = Math.max(0, Math.min(last, Math.round(step) || 0));
	do {
		s += d;
	} while (s > 0 && s < last && pages[s] === '0');
	return Math.max(0, Math.min(last, s));
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
	// anything that reports a break-in from outside: contacts, handles, glass break, vibration
	perimeter: {
		role: /^(sensor\.(window|door|contact|open|glass|vibration|tilt)|value\.window|sensor\.alarm(\.secure)?$)/,
		name: /fenster|t(ü|ue)r|window|door|kontakt|contact|au(ß|ss)en|perimeter|h(ü|ue)ll|glas|glass|ersch(ü|ue)tter|vibration|einbruch|intrusion/i,
	},
	full: {
		role: /^sensor\.(motion|occupancy)/,
		name: /bewegung|motion|innen|inside|interior|pir|voll|lichtschranke/i,
	},
	// always active: danger and emergency
	fire: {
		role: /^sensor\.alarm\.(fire|flood|smoke|gas|water|heat|co)|^sensor\.(smoke|water|leak|gas|heat|co)/,
		name: /rauch|smoke|wasser|water|leck|leak|gas|brand|fire|hitze|heat(?!ing)|kohlenmonoxid|\bco\b|gefahr|hazard|panik|panic|notruf|sos/i,
	},
	report: {
		name: /melde|briefkast|mailbox|letter|gartentor|garden.?gate|schuppen|shed|klingel|doorbell|nur.?melden|report/i,
		nameRequired: true,
	},
	lamps: {
		role: /^(switch\.light|level\.dimmer|light|switch\.lamp)/,
		name: /licht|light|lamp|beleucht/i,
	},
	evening: { name: /abend|evening|dusk|d(ä|ae)mmerung/i, nameRequired: true },
	morning: { name: /morgen|morning|wake|aufsteh/i, nameRequired: true },
	presence: { name: /anwesen|presence|zuhause|at.?home/i, nameRequired: true },
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
		if (!e.roles.length) {
			continue; // an empty function is no help
		}
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
