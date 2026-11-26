/* Home Guard panel: status, arming, PIN keypad, open windows, evening/morning light switches, logbook.
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
		evening: 'Abendlicht',
		morning: 'Morgenlicht',
		auton: 'an',
		autoff: 'aus',
		eveningOn: 'Abends automatisch an',
		eveningOff: 'Abends automatisch aus',
		morningOn: 'Morgens automatisch an',
		morningOff: 'Morgens automatisch aus',
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
		evening: 'Evening light',
		morning: 'Morning light',
		auton: 'on',
		autoff: 'off',
		eveningOn: 'Evening: on automatically',
		eveningOff: 'Evening: off automatically',
		morningOn: 'Morning: on automatically',
		morningOff: 'Morning: off automatically',
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
	fr: {
		mode: { off: 'Arrêt', full: 'Totale', perimeter: 'Périmètre', night: 'Nuit' },
		phase: { disarmed: 'Désarmé', arming: 'Armement', armed: 'Armé', entry: 'Veuillez désarmer', alarm: 'ALARME' },
		btn: { full: 'Totale', perimeter: 'Périmètre', night: 'Nuit', off: 'Arrêt' },
		cancel: 'Annuler',
		ack: 'Acquitter',
		allClosed: 'Toutes les portes et fenêtres fermées',
		open: 'Ouvert',
		evening: 'Éclairage du soir',
		morning: 'Éclairage du matin',
		auton: 'allumer',
		autoff: 'éteindre',
		eveningOn: 'Soir : allumer auto.',
		eveningOff: 'Soir : éteindre auto.',
		morningOn: 'Matin : allumer auto.',
		morningOff: 'Matin : éteindre auto.',
		sim: 'Simulation de présence',
		simOn: 'en cours',
		simOff: 'arrêtée',
		next: 'Prochaine étape',
		pin: 'Saisir le PIN',
		wrong: 'PIN erroné',
		refused: 'Non armé – ouvert :',
		lastTrigger: 'Déclenché par',
		chooseInstance: 'Veuillez choisir une instance Home Guard',
		logbook: 'Journal',
		present: 'Présents',
		nobody: '– personne',
		auto: 'Armement automatique',
		sensors: 'Capteurs surveillés',
		circuit: { perimeter: 'Périmètre', interior: 'Intérieur', '24h': '24 h' },
		locked: 'Saisie du PIN bloquée pour un moment',
	},
	es: {
		mode: { off: 'Apagado', full: 'Total', perimeter: 'Perímetro', night: 'Noche' },
		phase: {
			disarmed: 'Desarmado',
			arming: 'Armando',
			armed: 'Armado',
			entry: 'Desarme, por favor',
			alarm: 'ALARMA',
		},
		btn: { full: 'Total', perimeter: 'Perímetro', night: 'Noche', off: 'Apagado' },
		cancel: 'Cancelar',
		ack: 'Confirmar',
		allClosed: 'Todas las puertas y ventanas cerradas',
		open: 'Abierto',
		evening: 'Luz de la tarde',
		morning: 'Luz de la mañana',
		auton: 'enc.',
		autoff: 'apag.',
		eveningOn: 'Tarde: encender auto.',
		eveningOff: 'Tarde: apagar auto.',
		morningOn: 'Mañana: encender auto.',
		morningOff: 'Mañana: apagar auto.',
		sim: 'Simulación de presencia',
		simOn: 'en marcha',
		simOff: 'apagada',
		next: 'Siguiente paso',
		pin: 'Introducir PIN',
		wrong: 'PIN incorrecto',
		refused: 'No armado – abierto:',
		lastTrigger: 'Disparado por',
		chooseInstance: 'Elija una instancia de Home Guard',
		logbook: 'Registro',
		present: 'Presentes',
		nobody: '– nadie',
		auto: 'Armado automático',
		sensors: 'Sensores vigilados',
		circuit: { perimeter: 'Perímetro', interior: 'Interior', '24h': '24 h' },
		locked: 'Entrada de PIN bloqueada un rato',
	},
	it: {
		mode: { off: 'Spento', full: 'Totale', perimeter: 'Perimetro', night: 'Notte' },
		phase: {
			disarmed: 'Disinserito',
			arming: 'Inserimento',
			armed: 'Inserito',
			entry: 'Disinserire, prego',
			alarm: 'ALLARME',
		},
		btn: { full: 'Totale', perimeter: 'Perimetro', night: 'Notte', off: 'Spento' },
		cancel: 'Annulla',
		ack: 'Conferma',
		allClosed: 'Tutte le porte e finestre chiuse',
		open: 'Aperto',
		evening: 'Luce serale',
		morning: 'Luce mattutina',
		auton: 'acc.',
		autoff: 'spegn.',
		eveningOn: 'Sera: accendi auto',
		eveningOff: 'Sera: spegni auto',
		morningOn: 'Mattina: accendi auto',
		morningOff: 'Mattina: spegni auto',
		sim: 'Simulazione di presenza',
		simOn: 'in corso',
		simOff: 'spenta',
		next: 'Prossimo passo',
		pin: 'Inserire il PIN',
		wrong: 'PIN errato',
		refused: 'Non inserito – aperto:',
		lastTrigger: 'Attivato da',
		chooseInstance: "Scegliere un'istanza Home Guard",
		logbook: 'Registro',
		present: 'Presenti',
		nobody: '– nessuno',
		auto: 'Inserimento automatico',
		sensors: 'Sensori sorvegliati',
		circuit: { perimeter: 'Perimetro', interior: 'Interno', '24h': '24 h' },
		locked: "Inserimento PIN bloccato per un po'",
	},
	nl: {
		mode: { off: 'Uit', full: 'Volledig', perimeter: 'Schil', night: 'Nacht' },
		phase: {
			disarmed: 'Uitgeschakeld',
			arming: 'Wordt ingeschakeld',
			armed: 'Ingeschakeld',
			entry: 'Graag uitschakelen',
			alarm: 'ALARM',
		},
		btn: { full: 'Volledig', perimeter: 'Schil', night: 'Nacht', off: 'Uit' },
		cancel: 'Annuleren',
		ack: 'Bevestigen',
		allClosed: 'Alle deuren en ramen dicht',
		open: 'Open',
		evening: 'Avondverlichting',
		morning: 'Ochtendlicht',
		auton: 'aan',
		autoff: 'uit',
		eveningOn: "'s Avonds automatisch aan",
		eveningOff: "'s Avonds automatisch uit",
		morningOn: "'s Ochtends automatisch aan",
		morningOff: "'s Ochtends automatisch uit",
		sim: 'Aanwezigheidssimulatie',
		simOn: 'loopt',
		simOff: 'uit',
		next: 'Volgende stap',
		pin: 'Pincode invoeren',
		wrong: 'Verkeerde pincode',
		refused: 'Niet ingeschakeld – open:',
		lastTrigger: 'Geactiveerd door',
		chooseInstance: 'Kies een Home Guard-instantie',
		logbook: 'Logboek',
		present: 'Aanwezig',
		nobody: '– niemand',
		auto: 'Automatisch inschakelen',
		sensors: 'Bewaakte sensoren',
		circuit: { perimeter: 'Schil', interior: 'Binnen', '24h': '24 u' },
		locked: 'Pincode-invoer tijdelijk geblokkeerd',
	},
	pl: {
		mode: { off: 'Wył.', full: 'Pełna', perimeter: 'Obwód', night: 'Noc' },
		phase: {
			disarmed: 'Rozbrojony',
			arming: 'Uzbrajanie',
			armed: 'Uzbrojony',
			entry: 'Proszę rozbroić',
			alarm: 'ALARM',
		},
		btn: { full: 'Pełna', perimeter: 'Obwód', night: 'Noc', off: 'Wył.' },
		cancel: 'Anuluj',
		ack: 'Potwierdź',
		allClosed: 'Wszystkie drzwi i okna zamknięte',
		open: 'Otwarte',
		evening: 'Światło wieczorne',
		morning: 'Światło poranne',
		auton: 'wł.',
		autoff: 'wył.',
		eveningOn: 'Wieczorem auto. wł.',
		eveningOff: 'Wieczorem auto. wył.',
		morningOn: 'Rano auto. wł.',
		morningOff: 'Rano auto. wył.',
		sim: 'Symulacja obecności',
		simOn: 'działa',
		simOff: 'wył.',
		next: 'Następny krok',
		pin: 'Wprowadź PIN',
		wrong: 'Błędny PIN',
		refused: 'Nie uzbrojono – otwarte:',
		lastTrigger: 'Wyzwolone przez',
		chooseInstance: 'Wybierz instancję Home Guard',
		logbook: 'Dziennik',
		present: 'Obecni',
		nobody: '– nikt',
		auto: 'Automatyczne uzbrajanie',
		sensors: 'Monitorowane czujniki',
		circuit: { perimeter: 'Obwód', interior: 'Wewnątrz', '24h': '24 h' },
		locked: 'Wprowadzanie PIN-u chwilowo zablokowane',
	},
	pt: {
		mode: { off: 'Desligado', full: 'Total', perimeter: 'Perímetro', night: 'Noite' },
		phase: {
			disarmed: 'Desativado',
			arming: 'A ativar',
			armed: 'Ativado',
			entry: 'Desative, por favor',
			alarm: 'ALARME',
		},
		btn: { full: 'Total', perimeter: 'Perímetro', night: 'Noite', off: 'Desligado' },
		cancel: 'Cancelar',
		ack: 'Confirmar',
		allClosed: 'Todas as portas e janelas fechadas',
		open: 'Aberto',
		evening: 'Luz da noite',
		morning: 'Luz da manhã',
		auton: 'ligar',
		autoff: 'desl.',
		eveningOn: 'Noite: ligar auto.',
		eveningOff: 'Noite: desligar auto.',
		morningOn: 'Manhã: ligar auto.',
		morningOff: 'Manhã: desligar auto.',
		sim: 'Simulação de presença',
		simOn: 'em curso',
		simOff: 'desligada',
		next: 'Próximo passo',
		pin: 'Introduzir PIN',
		wrong: 'PIN errado',
		refused: 'Não ativado – aberto:',
		lastTrigger: 'Disparado por',
		chooseInstance: 'Escolha uma instância Home Guard',
		logbook: 'Registo',
		present: 'Presentes',
		nobody: '– ninguém',
		auto: 'Ativação automática',
		sensors: 'Sensores vigiados',
		circuit: { perimeter: 'Perímetro', interior: 'Interior', '24h': '24 h' },
		locked: 'Introdução do PIN bloqueada por algum tempo',
	},
	ru: {
		mode: { off: 'Выкл.', full: 'Полная', perimeter: 'Периметр', night: 'Ночь' },
		phase: {
			disarmed: 'Снято с охраны',
			arming: 'Постановка',
			armed: 'На охране',
			entry: 'Снимите с охраны',
			alarm: 'ТРЕВОГА',
		},
		btn: { full: 'Полная', perimeter: 'Периметр', night: 'Ночь', off: 'Выкл.' },
		cancel: 'Отмена',
		ack: 'Подтвердить',
		allClosed: 'Все двери и окна закрыты',
		open: 'Открыто',
		evening: 'Вечерний свет',
		morning: 'Утренний свет',
		auton: 'вкл.',
		autoff: 'выкл.',
		eveningOn: 'Вечером авто вкл.',
		eveningOff: 'Вечером авто выкл.',
		morningOn: 'Утром авто вкл.',
		morningOff: 'Утром авто выкл.',
		sim: 'Имитация присутствия',
		simOn: 'работает',
		simOff: 'выкл.',
		next: 'Следующий шаг',
		pin: 'Введите PIN',
		wrong: 'Неверный PIN',
		refused: 'Не поставлено – открыто:',
		lastTrigger: 'Сработал',
		chooseInstance: 'Выберите экземпляр Home Guard',
		logbook: 'Журнал',
		present: 'Дома',
		nobody: '– никого',
		auto: 'Автопостановка',
		sensors: 'Контролируемые датчики',
		circuit: { perimeter: 'Периметр', interior: 'Внутри', '24h': '24 ч' },
		locked: 'Ввод PIN временно заблокирован',
	},
	uk: {
		mode: { off: 'Вимк.', full: 'Повна', perimeter: 'Периметр', night: 'Ніч' },
		phase: {
			disarmed: 'Знято з охорони',
			arming: 'Постановка',
			armed: 'На охороні',
			entry: 'Зніміть з охорони',
			alarm: 'ТРИВОГА',
		},
		btn: { full: 'Повна', perimeter: 'Периметр', night: 'Ніч', off: 'Вимк.' },
		cancel: 'Скасувати',
		ack: 'Підтвердити',
		allClosed: 'Усі двері та вікна зачинені',
		open: 'Відчинено',
		evening: 'Вечірнє світло',
		morning: 'Ранкове світло',
		auton: 'увімк.',
		autoff: 'вимк.',
		eveningOn: 'Увечері авто увімк.',
		eveningOff: 'Увечері авто вимк.',
		morningOn: 'Вранці авто увімк.',
		morningOff: 'Вранці авто вимк.',
		sim: 'Імітація присутності',
		simOn: 'працює',
		simOff: 'вимк.',
		next: 'Наступний крок',
		pin: 'Введіть PIN',
		wrong: 'Неправильний PIN',
		refused: 'Не поставлено – відчинено:',
		lastTrigger: 'Спрацював',
		chooseInstance: 'Виберіть екземпляр Home Guard',
		logbook: 'Журнал',
		present: 'Удома',
		nobody: '– нікого',
		auto: 'Автопостановка',
		sensors: 'Контрольовані датчики',
		circuit: { perimeter: 'Периметр', interior: 'Всередині', '24h': '24 год' },
		locked: 'Введення PIN тимчасово заблоковано',
	},
	'zh-cn': {
		mode: { off: '关闭', full: '全面', perimeter: '周界', night: '夜间' },
		phase: { disarmed: '已撤防', arming: '布防中', armed: '已布防', entry: '请撤防', alarm: '报警' },
		btn: { full: '全面', perimeter: '周界', night: '夜间', off: '关闭' },
		cancel: '取消',
		ack: '确认',
		allClosed: '所有门窗已关闭',
		open: '打开',
		evening: '傍晚灯光',
		morning: '早晨灯光',
		auton: '开',
		autoff: '关',
		eveningOn: '傍晚自动开',
		eveningOff: '傍晚自动关',
		morningOn: '早晨自动开',
		morningOff: '早晨自动关',
		sim: '在家模拟',
		simOn: '运行中',
		simOff: '关闭',
		next: '下一步',
		pin: '输入 PIN',
		wrong: 'PIN 错误',
		refused: '未布防 – 打开：',
		lastTrigger: '触发者',
		chooseInstance: '请选择 Home Guard 实例',
		logbook: '日志',
		present: '在家',
		nobody: '– 无人',
		auto: '自动布防',
		sensors: '监控的传感器',
		circuit: { perimeter: '周界', interior: '室内', '24h': '24 小时' },
		locked: 'PIN 输入暂时锁定',
	},
};

const ICON = {
	shield: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z"/></svg>',
	// shield with an X cut out, same outline as the shield with the tick: shown while disarmed
	disarmed:
		'<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zM9.17 7.76 12 10.59l2.83-2.83 1.41 1.41L13.41 12l2.83 2.83-1.41 1.41L12 13.41l-2.83 2.83-1.41-1.41L10.59 12 7.76 9.17z"/></svg>',
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
.sw { width: 11cqmin; height: 6cqmin; border-radius: 99px; background: rgba(127,127,127,.45); position: relative; border: none; padding: 0; flex: none; box-sizing: border-box; }
.sw::after { content: ''; position: absolute; top: 50%; left: .7cqmin; width: 4.4cqmin; height: 4.4cqmin; border-radius: 50%; background: #fff; transform: translateY(-50%); transition: left .2s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.sw.on { background: var(--iob-primary, #1976d2); }
.sw.on::after { left: calc(100% - 4.4cqmin - .7cqmin); }
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
.lightrow .lbl2 { margin-left: 2cqmin; }
.row.sep { margin-top: 2cqmin; padding-top: 2cqmin; border-top: 1px solid var(--hg-line, rgba(127,127,127,.25)); }
.log time { opacity: .7; flex: none; font-variant-numeric: tabular-nums; }
.msg { color: var(--iob-error, #d32f2f); font-size: .9em; text-align: center; }
.pad { flex: 1 0 auto; display: flex; flex-direction: column; gap: 2.5cqmin; }
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
		return TXT[this.systemLang] || TXT.en;
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
			`${i}.status.present`,
			`${i}.status.sensors`,
			`${i}.control.autoArm`,
			`${i}.control.eveningOn`,
			`${i}.control.eveningOff`,
			`${i}.control.morningOn`,
			`${i}.control.morningOff`,
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
		if (!this._ready) {
			this.render();
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
			// acknowledging can need the PIN as well (setting of the adapter)
			if (info.pinForAck) {
				this.pad = { mode: 'ack', pin: '' };
				this.render();
				return;
			}
			const r = await this.doMode('ack', '');
			if (r && r.error === 'pin required') {
				// the setting was switched on after the panel loaded
				this.msg = '';
				this.info = { ...info, pinForAck: true };
				this.pad = { mode: 'ack', pin: '' };
			}
		} else if (a === 'light') {
			const k = b.dataset.k;
			await this.setState(`${this.inst}.control.${k}`, this.val(`control.${k}`) === false);
		} else if (a === 'auto') {
			await this.setState(`${this.inst}.control.autoArm`, this.val('control.autoArm') === false);
		} else if (a === 'sensors') {
			this.sensorsOpen = !this.sensorsOpen;
		} else if (a === 'key') {
			if (this.pad && this.pad.pin.length < 12) {
				this.pad.pin += b.dataset.k;
				this.pad.msg = '';
				// PIN complete: accept without OK (the adapter tells only the length, never the PIN)
				const len = Number(info.pinLength) || 0;
				if (this.settings.autoSubmit !== false && len && this.pad.pin.length === len) {
					await this.submitPad();
					return;
				}
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
			await this.submitPad();
			return;
		}
		this.render();
	}

	/** Sends the entered PIN; a wrong one leaves the keypad open and empty with the reason */
	async submitPad() {
		const { mode, pin } = this.pad;
		this.pad.pin = '';
		this.render();
		const r = await this.doMode(mode, pin);
		if (this.pad && r && r.ok === false && (r.error === 'wrong pin' || r.error === 'pin locked')) {
			this.pad.msg = this.msg;
			this.msg = '';
		} else {
			this.pad = null;
		}
		this.render();
	}

	/**
	 * Arms or disarms through the adapter
	 *
	 * @param {string} mode wanted mode
	 * @param {string} pin entered PIN
	 * @returns {Promise<object|null>} the answer of the adapter
	 */
	async doMode(mode, pin) {
		const r =
			mode === 'ack'
				? await this.send('ack', { pin })
				: mode === 'off'
					? await this.send('disarm', { pin })
					: await this.send('arm', { mode, pin });
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
		return r;
	}

	/**
	 * Draws the panel
	 */
	render() {
		void this.loadInfo();
		const t = this.t;
		const s = this.settings;
		// draw only when all values and the answer of the adapter are there - otherwise the panel builds up in jumps
		if (!this._ready && !this.editMode) {
			const complete =
				!!this.socket &&
				this.getStateIds(s).every(id => this.states[id] !== undefined) &&
				(this.info || this.infoFor === null);
			if (!complete) {
				if (!this._readyTimer) {
					this._readyTimer = setTimeout(() => {
						this._ready = true;
						this.render();
					}, 2500);
				}
				return;
			}
			this._ready = true;
			clearTimeout(this._readyTimer);
		}
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
		// keypad for acknowledging: pointless once the alarm is over (disarmed elsewhere, alarm time ended)
		if (this.pad && this.pad.mode === 'ack' && phase !== 'alarm') {
			this.pad = null;
		}
		const start = `<style>${STYLE}</style><div class="wrap">`;
		let html = start;
		html += `<div class="head ${phase}">${ICON[mode === 'off' ? (phase === 'alarm' ? 'shield' : 'disarmed') : mode] || ICON.shield}<div class="t"><div class="big">${esc(
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
		// switches of the evening and morning light - "on" and "off" side by side, only for what is set up
		if (s.light !== false && this.info) {
			const has = k => this.val(`control.${k}`) !== null && this.val(`control.${k}`) !== undefined;
			const sw = k =>
				`<span class="lbl2">${esc(t[k.endsWith('On') ? 'auton' : 'autoff'])}</span><button class="sw ${
					this.val(`control.${k}`) !== false ? 'on' : ''
				}" data-a="light" data-k="${k}" aria-label="${esc(t[k])}"></button>`;
			const rows = [
				this.info.eveningAvailable && has('eveningOn') ? ['evening', 'eveningOn', 'eveningOff'] : null,
				this.info.morningAvailable && has('morningOn') ? ['morning', 'morningOn', 'morningOff'] : null,
			].filter(Boolean);
			if (rows.length) {
				html += `<div class="box">${rows
					.map(
						([name, on, off], n) =>
							`<div class="row lightrow${n ? ' sep' : ''}"><div class="grow">${esc(t[name])}</div>${sw(on)}${sw(off)}</div>`,
					)
					.join('')}</div>`;
			}
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
			// the keypad replaces the content (no overlay with an own background): colours of the panel in every theme
			html = `${
				start
			}<div class="pad"><div class="lbl center">${esc(t.pin)}</div><div class="dots">${'•'.repeat(this.pad.pin.length)}</div>${
				this.pad.msg ? `<div class="msg center">${esc(this.pad.msg)}</div>` : ''
			}<div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9]
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
