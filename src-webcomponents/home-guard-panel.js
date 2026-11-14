/* Home Guard panel: status, arming, PIN keypad, open windows, presence simulation, logbook.
   It reads the states of the instance and changes things only through the adapter (sendTo):
   the PIN goes straight to the adapter and is never written to a state. */
import { IobWebComponent, defineWebComponent } from '@iobroker/web-components/element';

const TXT = {
	de: {
		mode: { off: 'Aus', full: 'Vollschutz', perimeter: 'Hüllschutz', night: 'Nachtschutz' },
		phase: {
			disarmed: 'Unscharf',
			arming: 'Wird scharf',
			armed: 'Scharf',
			entry: 'Bitte entschärfen',
			alarm: 'ALARM',
		},
		btn: { full: 'Voll', perimeter: 'Hülle', night: 'Nacht', off: 'Aus' },
		cancel: 'Abbrechen',
		ack: 'Quittieren',
		allClosed: 'Alle Fenster und Türen zu',
		open: 'Offen',
		sim: 'Anwesenheitssimulation',
		simOn: 'läuft',
		simOff: 'aus',
		next: 'Nächster Schritt',
		pin: 'PIN eingeben',
		wrong: 'Falsche PIN',
		refused: 'Nicht scharf – offen:',
		lastTrigger: 'Ausgelöst durch',
		chooseInstance: 'Bitte eine Home-Guard-Instanz wählen',
		logbook: 'Logbuch',
		present: 'Anwesend',
		nobody: '– niemand',
		auto: 'Automatisch scharf/unscharf',
		sensors: 'Überwachte Sensoren',
		circuit: { perimeter: 'Hülle', interior: 'Innen', '24h': '24 h' },
		locked: 'PIN-Eingabe vorübergehend gesperrt',
	},
	en: {
		mode: { off: 'Off', full: 'Full', perimeter: 'Perimeter', night: 'Night' },
		phase: { disarmed: 'Disarmed', arming: 'Arming', armed: 'Armed', entry: 'Please disarm', alarm: 'ALARM' },
		btn: { full: 'Full', perimeter: 'Perimeter', night: 'Night', off: 'Off' },
		cancel: 'Cancel',
		ack: 'Acknowledge',
		allClosed: 'All windows and doors closed',
		open: 'Open',
		sim: 'Presence simulation',
		simOn: 'running',
		simOff: 'off',
		next: 'Next step',
		pin: 'Enter PIN',
		wrong: 'Wrong PIN',
		refused: 'Not armed – open:',
		lastTrigger: 'Triggered by',
		chooseInstance: 'Please choose a Home Guard instance',
		logbook: 'Logbook',
		present: 'Present',
		nobody: '– nobody',
		auto: 'Automatic arming',
		sensors: 'Monitored sensors',
		circuit: { perimeter: 'Perimeter', interior: 'Inside', '24h': '24 h' },
		locked: 'PIN entry locked for a while',
	},
};

const ICON = {
	shield: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z"/></svg>',
	full: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6z"/></svg>',
	perimeter: '<svg viewBox="0 0 24 24"><path d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3L12 3z"/></svg>',
	night: '<svg viewBox="0 0 24 24"><path d="M12.3 2a9 9 0 1 0 9.7 11.6A7 7 0 0 1 12.3 2z"/></svg>',
	off: '<svg viewBox="0 0 24 24"><path d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6-9h-1V6a5 5 0 0 0-9.9-1l1.9.5A3 3 0 0 1 15 6v2H6a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z"/></svg>',
	bulb: '<svg viewBox="0 0 24 24"><path d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
};

const esc = s =>
	String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const parse = (v, d) => {
	try {
		return typeof v === 'string' && v ? JSON.parse(v) : d;
	} catch {
		return d;
	}
};

const STYLE = `
:host { display: block; width: 100%; height: 100%; container-type: size; }
* { box-sizing: border-box; }
.wrap { --hg-fill: color-mix(in srgb, currentColor 12%, transparent); --hg-line: color-mix(in srgb, currentColor 22%, transparent); --hg-btn-line: color-mix(in srgb, currentColor 55%, transparent); height: 100%; display: flex; flex-direction: column; gap: 3cqmin; padding: 3cqmin; overflow-y: auto; overflow-x: hidden; font-size: clamp(11px, 3.6cqmin, 18px); }
.head { border-radius: calc(var(--iob-border-radius, 4px) * 2); padding: 4cqmin; display: flex; align-items: center; justify-content: center; gap: 4cqmin; color: #fff; transition: background .3s; }
.head svg { width: 14cqmin; height: 14cqmin; fill: currentColor; flex: none; }
.head .t { flex: 0 1 auto; min-width: 0; text-align: center; }
.head .big { font-size: 1.6em; font-weight: 600; line-height: 1.1; }
.head .sub { opacity: .9; font-size: .9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head .cd { font-size: 2.2em; font-weight: 700; font-variant-numeric: tabular-nums; }
.disarmed { background: var(--iob-success, #2e7d32); }
.arming, .entry { background: var(--iob-warning, #ed6c02); color: #1f1400; }
.armed { background: var(--iob-primary, #1976d2); }
.alarm { background: var(--iob-error, #d32f2f); animation: pulse 1s infinite; }
.entry { animation: pulse 1.4s infinite; }
@keyframes pulse { 50% { filter: brightness(1.35); } }
.btns { display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 2cqmin; }
button { font: inherit; color: inherit; cursor: pointer; border: 2px solid var(--hg-btn-line, rgba(127,127,127,.6)); background: var(--hg-fill, rgba(127,127,127,.15)); border-radius: var(--iob-border-radius, 4px); padding: 2.5cqmin 1cqmin; display: flex; flex-direction: column; align-items: center; gap: 1cqmin; }
button svg { width: 7cqmin; height: 7cqmin; fill: currentColor; }
button.on { background: var(--iob-primary, #1976d2); color: #fff; font-weight: 600; border: 2px solid var(--iob-primary, #1976d2); }
button.wide { flex-direction: row; justify-content: center; font-weight: 600; }
button.warn { background: var(--iob-warning, #ed6c02); color: #1f1400; border-color: transparent; }
button.err { background: var(--iob-error, #d32f2f); color: #fff; border-color: transparent; }
button:disabled { opacity: .5; cursor: default; }
.box { border: 1px solid var(--hg-line, rgba(127,127,127,.35)); border-radius: calc(var(--iob-border-radius, 4px) * 2); padding: 2.5cqmin 3cqmin; }
.lbl { font-size: .8em; opacity: .85; margin-bottom: 1cqmin; }
.chips { display: flex; flex-wrap: wrap; gap: 1.5cqmin; }
.chip { background: var(--iob-warning, #ed6c02); color: #1f1400; border-radius: 99px; padding: .2em .7em; font-size: .85em; }
.ok { color: var(--iob-success, #2e7d32); }
.row { display: flex; align-items: center; gap: 3cqmin; }
.row .grow { flex: 1; min-width: 0; }
.row svg { width: 6cqmin; height: 6cqmin; fill: currentColor; flex: none; }
.sw { width: 11cqmin; height: 6cqmin; border-radius: 99px; background: rgba(127,127,127,.45); position: relative; border: 1px solid rgba(127,127,127,.6); padding: 0; flex: none; }
.sw::after { content: ''; position: absolute; top: .6cqmin; left: .6cqmin; width: 4.8cqmin; height: 4.8cqmin; border-radius: 50%; background: #fff; transition: left .2s; }
.sw.on { background: var(--iob-primary, #1976d2); }
.sw.on::after { left: 5.6cqmin; }
.small { font-size: .82em; opacity: .85; }
.wrap > * { flex-shrink: 0; }
.log { flex: none; }
.logrows > div { display: flex; gap: 2cqmin; font-size: .85em; padding: .2em 0; border-bottom: 1px solid var(--hg-line, rgba(127,127,127,.25)); }
.logrows > div:last-child { border-bottom: none; }
.loghead { all: unset; box-sizing: border-box; width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 2cqmin; cursor: pointer; font-size: .85em; opacity: .85; }
.log.shut { flex: none; }
.logrows { margin-top: 1.5cqmin; }
.logrows .grow { flex: 1; min-width: 0; }
.persons { display: flex; flex-wrap: wrap; align-items: center; gap: 1.5cqmin 3cqmin; }
.lbl2 { font-size: .8em; opacity: .7; }
.lbl2.gap { margin-left: 2cqmin; }
.pers { display: inline-flex; align-items: center; gap: 1.2cqmin; }
.pers i { width: 2.2cqmin; height: 2.2cqmin; border-radius: 50%; background: rgba(127,127,127,.6); display: inline-block; }
.pers.on i { background: var(--iob-success, #2e7d32); }
.pers.warn i { background: var(--iob-warning, #ed6c02); }
.row.sep { margin-top: 2cqmin; padding-top: 2cqmin; border-top: 1px solid var(--hg-line, rgba(127,127,127,.25)); }
.log time { opacity: .7; flex: none; font-variant-numeric: tabular-nums; }
.msg { color: var(--iob-error, #d32f2f); font-size: .9em; text-align: center; }
.pad { position: absolute; inset: 0; min-height: 100%; background: var(--iob-paper, #fff); color: inherit; display: flex; flex-direction: column; gap: 2.5cqmin; padding: 4cqmin; z-index: 2; }
.pad .dots { text-align: center; font-size: 2em; letter-spacing: .3em; min-height: 1.3em; }
.pad .keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2cqmin; flex: 1; }
.pad .keys button { font-size: 1.5em; justify-content: center; }
.center { text-align: center; }
`;

/**
 * The panel element
 */
class HomeGuardPanel extends IobWebComponent {
	/**
	 * Creates the element with its shadow DOM
	 */
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.pad = null; // { action, mode, pin }
		this.info = null; // answer of "status" (pin required, ...)
		this.msg = '';
		this.infoFor = '';
		this.shadowRoot.addEventListener('click', e => this.onClick(e));
	}

	/**
	 * ID of the chosen instance
	 *
	 * @returns e.g. home-guard.0
	 */
	get inst() {
		return this.settings.instance || 'home-guard.0';
	}

	/**
	 * Texts in the system language
	 *
	 * @returns the texts
	 */
	get t() {
		return TXT[this.systemLang === 'de' ? 'de' : 'en'];
	}

	/**
	 * States shown by the panel
	 *
	 * @param {Record<string, unknown>} settings settings of the panel
	 * @returns state IDs
	 */
	getStateIds(settings) {
		const i = settings.instance || 'home-guard.0';
		return [
			`${i}.status.mode`,
			`${i}.status.phase`,
			`${i}.status.countdown`,
			`${i}.status.openContacts`,
			`${i}.status.lastTrigger`,
			`${i}.status.log`,
			`${i}.simulation.enabled`,
			`${i}.simulation.active`,
			`${i}.simulation.next`,
			`${i}.status.present`,
			`${i}.status.sensors`,
			`${i}.control.autoArm`,
		];
	}

	/**
	 * Value of a state of the instance
	 *
	 * @param {string} rel ID without the instance
	 * @returns the value
	 */
	val(rel) {
		return this.states[`${this.inst}.${rel}`]?.val;
	}

	/** asks the adapter once per instance whether a PIN is needed */
	async loadInfo() {
		if (!this.socket || this.infoFor === this.inst) {
			return;
		}
		this.infoFor = this.inst;
		try {
			this.info = await this.socket.sendTo(this.inst, 'status', {});
		} catch {
			this.info = null;
		}
		if (!this.info || this.info.error) {
			// adapter not running yet: ask again on the next change
			this.info = null;
			this.infoFor = null;
		}
	}

	/**
	 * Sends a command to the adapter
	 *
	 * @param {string} command command
	 * @param {object} data data
	 * @returns the answer or null
	 */
	async send(command, data) {
		if (this.editMode || !this.socket) {
			return null;
		}
		try {
			return await this.socket.sendTo(this.inst, command, { ...data, source: 'widget' });
		} catch (e) {
			this.msg = String(e && e.message ? e.message : e);
			this.render();
			return null;
		}
	}

	/**
	 * Clicks on buttons, switch and keypad
	 *
	 * @param {MouseEvent} e the click
	 */
	async onClick(e) {
		if (this.editMode) {
			return;
		}
		const b = e.target.closest('[data-a]');
		if (!b) {
			return;
		}
		const a = b.dataset.a;
		if (!this.info) {
			await this.loadInfo();
		}
		const info = this.info || {};
		this.msg = '';
		if (a === 'mode') {
			const mode = b.dataset.m;
			const needPin = mode === 'off' ? info.pinRequired : info.pinForArm;
			if (needPin) {
				this.pad = { mode, pin: '' };
				this.render();
				return;
			}
			await this.doMode(mode, '');
		} else if (a === 'cancel') {
			await this.send('cancel', {});
		} else if (a === 'ack') {
			await this.send('ack', {});
		} else if (a === 'sim') {
			await this.setState(`${this.inst}.simulation.enabled`, !this.val('simulation.enabled'));
		} else if (a === 'auto') {
			await this.setState(`${this.inst}.control.autoArm`, this.val('control.autoArm') === false);
		} else if (a === 'sensors') {
			this.sensorsOpen = !this.sensorsOpen;
		} else if (a === 'key') {
			if (this.pad && this.pad.pin.length < 12) {
				this.pad.pin += b.dataset.k;
			}
		} else if (a === 'del') {
			if (this.pad) {
				this.pad.pin = this.pad.pin.slice(0, -1);
			}
		} else if (a === 'log') {
			this.logOpen = !(this.logOpen ?? this.settings.logOpen === true);
		} else if (a === 'close') {
			this.pad = null;
		} else if (a === 'ok' && this.pad) {
			const { mode, pin } = this.pad;
			this.pad = null;
			await this.doMode(mode, pin);
		}
		this.render();
	}

	/**
	 * Arms or disarms through the adapter
	 *
	 * @param {string} mode wanted mode
	 * @param {string} pin entered PIN
	 */
	async doMode(mode, pin) {
		const r = mode === 'off' ? await this.send('disarm', { pin }) : await this.send('arm', { mode, pin });
		if (r && r.ok === false) {
			this.msg =
				r.error === 'wrong pin'
					? this.t.wrong
					: r.error === 'pin locked'
						? this.t.locked
						: r.open && r.open.length
							? `${this.t.refused} ${r.open.join(', ')}`
							: String(r.error || '');
		}
		this.render();
	}

	/**
	 * Draws the panel
	 */
	render() {
		void this.loadInfo();
		const t = this.t;
		const s = this.settings;
		if (!this.settings.instance && !this.socket) {
			this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="wrap center">${esc(t.chooseInstance)}</div>`;
			return;
		}
		const mode = this.val('status.mode') || 'off';
		const phase = this.val('status.phase') || 'disarmed';
		const cd = Number(this.val('status.countdown')) || 0;
		const open = parse(this.val('status.openContacts'), []);
		const log = parse(this.val('status.log'), []);
		const showNight = s.night !== false;
		const modes = showNight ? ['full', 'perimeter', 'night', 'off'] : ['full', 'perimeter', 'off'];
		const sub =
			phase === 'alarm' || phase === 'entry'
				? `${t.lastTrigger}: ${esc(this.val('status.lastTrigger') || '')}`
				: phase === 'disarmed'
					? ''
					: esc(t.mode[mode] || mode);
		let html = `<style>${STYLE}</style><div class="wrap" style="position:relative${this.pad ? ';overflow:hidden' : ''}">`;
		html += `<div class="head ${phase}">${ICON[mode === 'off' ? 'shield' : mode] || ICON.shield}<div class="t"><div class="big">${esc(
			t.phase[phase] || phase,
		)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${cd > 0 && (phase === 'arming' || phase === 'entry') ? `<div class="cd">${cd}</div>` : ''}</div>`;
		if (phase === 'arming') {
			html += `<button class="wide warn" data-a="cancel">${esc(t.cancel)}</button>`;
		} else if (phase === 'alarm') {
			html += `<div class="btns" style="--n:2"><button class="wide err" data-a="ack">${esc(t.ack)}</button><button class="wide" data-a="mode" data-m="off">${ICON.off}${esc(t.btn.off)}</button></div>`;
		} else {
			html += `<div class="btns" style="--n:${modes.length}">${modes
				.map(m => {
					const on = (m === 'off' && mode === 'off') || (m === mode && mode !== 'off');
					return `<button class="${on ? 'on' : ''}" data-a="mode" data-m="${m}">${ICON[m]}<span>${esc(t.btn[m])}</span></button>`;
				})
				.join('')}</div>`;
		}
		if (this.msg) {
			html += `<div class="msg">${esc(this.msg)}</div>`;
		}
		if (s.open !== false) {
			html += `<div class="box"><div class="lbl">${esc(t.open)}</div>${
				open.length
					? `<div class="chips">${open.map(n => `<span class="chip">${esc(n)}</span>`).join('')}</div>`
					: `<div class="ok">${esc(t.allClosed)}</div>`
			}</div>`;
		}
		// who is at home, and the switch for automatic arming by presence
		const persons = parse(this.val('status.present'), []);
		const showPersons = (s.persons || 'off') !== 'off' && persons.length;
		const showAuto =
			s.autoArm !== false &&
			(!this.info || this.info.autoArmAvailable !== false) &&
			this.val('control.autoArm') !== null &&
			this.val('control.autoArm') !== undefined;
		if (showPersons || showAuto) {
			html += '<div class="box">';
			if (showPersons) {
				// "Present" and the names - the colour of the dot says who is at home
				const shown = s.persons === 'all' ? persons : persons.filter(p => p.home);
				html += `<div class="persons"><span class="lbl2">${esc(t.present)}</span>${
					shown.length
						? shown
								.map(p => `<span class="pers${p.home ? ' on' : ''}"><i></i>${esc(p.name)}</span>`)
								.join('')
						: `<span class="lbl2">${esc(t.nobody)}</span>`
				}</div>`;
			}
			if (showAuto) {
				html += `<div class="row${showPersons ? ' sep' : ''}"><div class="grow">${esc(t.auto)}</div><button class="sw ${
					this.val('control.autoArm') !== false ? 'on' : ''
				}" data-a="auto" aria-label="${esc(t.auto)}"></button></div>`;
			}
			html += '</div>';
		}
		if (s.sim !== false) {
			const active = !!this.val('simulation.active');
			const next = this.val('simulation.next') || '';
			html += `<div class="box row">${ICON.bulb}<div class="grow"><div>${esc(t.sim)}: <b>${esc(
				active ? t.simOn : t.simOff,
			)}</b></div>${active && next ? `<div class="small">${esc(t.next)}: ${esc(next)}</div>` : ''}</div><button class="sw ${
				this.val('simulation.enabled') ? 'on' : ''
			}" data-a="sim" aria-label="${esc(t.sim)}"></button></div>`;
		}
		const sensors = parse(this.val('status.sensors'), []);
		if (s.sensors !== false && sensors.length) {
			const openNames = new Set(open);
			html += `<div class="box log${this.sensorsOpen ? '' : ' shut'}"><button class="loghead" data-a="sensors" aria-expanded="${!!this.sensorsOpen}"><span>${esc(
				t.sensors,
			)}</span><span class="small">${sensors.length} ${this.sensorsOpen ? '▴' : '▾'}</span></button>${
				this.sensorsOpen
					? `<div class="logrows">${sensors
							.map(
								x =>
									`<div><span class="pers${openNames.has(x.name) ? ' warn' : ' on'}"><i></i></span><span class="grow">${esc(x.name)}</span><span class="small">${esc(
										(t.circuit[x.circuit] || x.circuit) +
											(x.delayed ? ' ⏱' : '') +
											(x.motion ? ' 🚶' : ''),
									)}</span></div>`,
							)
							.join('')}</div>`
					: ''
			}</div>`;
		}
		const n = Number(s.log ?? 4);
		if (n > 0 && log.length) {
			const loc = this.systemLang === 'de' ? 'de-DE' : 'en-GB';
			const open = this.logOpen ?? s.logOpen === true;
			html += `<div class="box log${open ? '' : ' shut'}"><button class="loghead" data-a="log" aria-expanded="${open}"><span>${esc(
				t.logbook,
			)}</span><span class="small">${esc(
				new Date(log[0].ts).toLocaleString(loc, { hour: '2-digit', minute: '2-digit' }),
			)} ${open ? '▴' : '▾'}</span></button>${
				open
					? `<div class="logrows">${log
							.slice(0, n)
							.map(
								e =>
									`<div><time>${new Date(e.ts).toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><span>${esc(e.text)}</span></div>`,
							)
							.join('')}</div>`
					: ''
			}</div>`;
		}
		if (this.pad) {
			html += `<div class="pad"><div class="lbl center">${esc(t.pin)}</div><div class="dots">${'•'.repeat(this.pad.pin.length)}</div><div class="keys">${[
				1, 2, 3, 4, 5, 6, 7, 8, 9,
			]
				.map(k => `<button data-a="key" data-k="${k}">${k}</button>`)
				.join(
					'',
				)}<button data-a="close">✕</button><button data-a="key" data-k="0">0</button><button data-a="del">⌫</button></div><button class="wide on" data-a="ok">OK</button></div>`;
		}
		html += '</div>';
		// keep the scroll position when redrawing; the PIN keypad is always shown from the top
		const before = this.shadowRoot.querySelector('.wrap');
		const top = before ? before.scrollTop : 0;
		this.shadowRoot.innerHTML = html;
		const wrap = this.shadowRoot.querySelector('.wrap');
		if (wrap) {
			wrap.scrollTop = this.pad ? 0 : top;
		}
	}
}

defineWebComponent('iob-home-guard-panel', HomeGuardPanel);
