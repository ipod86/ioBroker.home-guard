![Logo](admin/home-guard.png)
# ioBroker.home-guard – Alarmanlage & Anwesenheitssimulation

**English: [README.md](README.md)**

Home Guard vereint eine Alarmanlage und eine Anwesenheitssimulation in einem Adapter. Beide Teile lassen sich einzeln oder zusammen nutzen.

![Home Guard Panel](https://raw.githubusercontent.com/ipod86/ioBroker.home-guard/main/docs/widget_de.jpg)

## Highlights

- **Einrichtungsassistent**: Eine neue Instanz startet mit einer geführten Einrichtung. Zuerst fragt er, was du nutzen möchtest (Alarmanlage, Anwesenheitssimulation, Abend- und Morgenlicht) und was es bei dir schon gibt (Tür- und Fensterkontakte, Bewegungs- und Rauchmelder, Sirene, Türschloss, Anwesenheitserkennung, Lautsprecher …) – *Automatisch suchen* durchsucht dein ioBroker und hakt das Gefundene gleich an. Danach kommen nur die Seiten, die zu deinen Antworten passen: jede mit einem Thema, in einfachen Worten erklärt, mit Vorschlägen für die Zeiten und einer Prüfung am Ende („kein Messenger“, „keine Tür verzögert“ …). Wer sich auskennt, überspringt ihn mit einem Haken.

  <img src="https://raw.githubusercontent.com/ipod86/ioBroker.home-guard/main/docs/wizard_flow_de.png" alt="Ablauf des Einrichtungsassistenten" width="700">

- **Drei Modi**: Vollschutz (alle Sensoren), Hüllschutz (nur Türen und Fenster – du bist zu Hause) und Nachtschutz (wie Hüllschutz, nachts automatisch). 24-h-Sensoren (Rauch, Wasser) lösen immer aus.
- **Ausgangsverzögerung** je Modus, **sofort scharf**, wenn die Haustür zufällt, **Eingangsverzögerung** (stiller Alarm) für verzögerte Sensoren wie die Haustür.
- **Offen-Fenster-Prüfung** beim Scharfschalten: warnen und trotzdem scharf, verweigern oder ignorieren. Gekippte Fenster (Wert 1) zählen als offen.
- **Bewegungsmelder** lösen erst aus, wenn mehrere verschiedene Melder innerhalb einer einstellbaren Zeit (Standard 120 s) melden – eine Katze oder ein Vorhang allein ist kein Alarm. Während der Eingangsverzögerung sind die Innen-Sensoren Mitläufer: Wer an den Bewegungsmeldern vorbei zum Panel geht, löst keinen Alarm aus.
- **PIN** (verschlüsselt gespeichert), auf Wunsch auch zum Scharfschalten; Meldung nach Fehleingaben und Sperre der PIN-Eingabe für einige Minuten gegen Ausprobieren.
- **Türschloss** (z. B. Nuki) schaltet beim Aufschließen unscharf, **Anwesenheit** (Personen, Handys) schaltet scharf, wenn der Letzte geht, und den Vollschutz unscharf, wenn jemand heimkommt.
- **Benachrichtigungen** direkt an Telegram, E-Mail, Pushover, Pushsafer, Gotify, WhatsApp und Signal (CallMeBot), SMS (gsmsms), Discord, MAX, die ioBroker Visu App (iot) und Synology Chat – jeweils im eigenen Format mit den Feldern, die der Messenger braucht; angeboten werden nur installierte Messenger; zusätzlich an den Benachrichtigungsmanager selbst; Alarmmeldung wiederholen bis quittiert; **Sprachausgabe** (z. B. Alexa, SayIt).
- **Bei Alarm**: Lampen an oder blinkend (danach wieder wie vorher), Sirenen, beliebige Geräte über eine Aktionstabelle (z. B. Tür abschließen beim Scharfschalten, Rollläden runter, Kameraaufnahme).
- **Sabotage-Prüfung**: Sensoren, die sich eine einstellbare Zahl Stunden nicht gemeldet haben, werden gemeldet (Batterie leer, Funkproblem).
- **Anwesenheitssimulation** mit drei Planungsarten: *Dämmerung* (zufällige Zeiten um den Sonnenuntergang, Licht aus um eine feste Zeit, Freitag/Samstag später, kurze Gänge in Flur und Bad), *gelernt* (spielt einen echten Tag aus deinem eigenen Schaltverhalten mit verschobenen Zeiten ab – für einen Werktagsabend irgendeinen Werktag, fürs Wochenende irgendeinen Freitag/Samstag; wahlweise denselben Wochentag, wenn mindestens 3 davon gelernt sind) und *kombiniert* (empfohlen).
- **Abendlicht**: die Abendlampen jeden Abend, auch wenn jemand zu Hause ist – bei Dämmerung alle an (auch die am Vorabend von Hand ausgeschalteten), bei „Licht aus“ alle aus (auch die von Hand eingeschalteten). Kurze Gänge, Zubettgehen und Gelerntes nur, solange die Simulation läuft. Ein- und Ausschalten lassen sich jederzeit getrennt ein- oder ausschalten (z. B. automatisch an, von Hand aus) – über `control.eveningOn`/`eveningOff`/`morningOn`/`morningOff` oder die Schalter im Panel.
- **Fernseher und andere Geräte, Szenen oder Skripte** in der Simulation (Typ „Gerät / Szene / Skript“), nur während die Simulation läuft: Mit „Lernen von“ (z. B. dem echten Ein-Zustand des Fernsehers) werden deine echten Abende nachgespielt, auch mehrmals am Abend; ohne läuft es eine einstellbare Anzahl Male für eine zufällige Zeit – je Gerät **abends** (Dämmerung bis Licht aus), **den ganzen Tag** (Aufstehen bis Licht aus) oder zu **eigenen Zeiten**, mit eigener Häufigkeit (auch als Bereich wie 1-3 = jeden Tag zufällig) und Dauer. Ein eigener Wert für an und aus lässt eine Szene des Szenen-Adapters oder ein Skript mehrere Schritte übernehmen (Fernseher an, dann Sender).
- **Amazon Echo (Alexa)**, wenn der alexa2-Adapter installiert ist – pro Echo und pro Verwendung einstellbar: **bei Alarm** Lautstärke, Alarmton aus Amazons Geräuschbibliothek und Ansage des Alarms (zusätzlich zu einer echten Sirene, solange der Alarm läuft; auch beim Testalarm); **in der Simulation als Radio** mit festem Sender oder zufällig einem von mehreren (Name oder TuneIn-ID), eigener Lautstärke, Zeitfenster, Häufigkeit und Dauer – und auf Wunsch gelernt, wann bei euch wirklich Radio oder Musik läuft (ab 5 Minuten; Antworten auf Fragen zählen nicht). Der Einrichtungsassistent erkennt die Echos und fragt, wofür du sie nutzen möchtest.
- **Wenn die Simulation endet** (z. B. beim Heimkommen): je Eintrag automatisch (Geräte wie der Fernseher aus, Lampen bleiben an), ausschalten oder anlassen. Einträge in den Tabellen überschreiben die über eine Funktion gefundenen.
- **Lernfenster**: Lernen und Nachspielen nur bei Dunkelheit (ab kurz vor Sonnenuntergang bis Sonnenaufgang), zwischen zwei Uhrzeiten oder immer.
- **Gefahrenmelder** (Rauch, Wasser, Gas – 24-h-Sensoren) melden immer, auch unscharf; je Sensor: nur Nachricht, Nachricht und Sprachausgabe oder voller Alarm mit Sirenen, Lampen und Aktionen. Eigenes Ereignis „Gefahrenmelder“ für die Aktionstabelle (z. B. Wasserventil schließen).
- **Melde-Sensoren** (Gartentor, Briefkasten, Schuppen): eine Nachricht statt eines Alarms, nur bei scharfer Anlage oder immer; jederzeit schaltbar über `control.report`.
- **Sirenen je Modus**: bei jedem Alarm, nur bei Vollschutz (Außensirene) oder nur bei Hüll-/Nachtschutz (Innensirene), jeweils mit eigener Dauer.
- **Morgenlicht**: die Morgenlampen zur Aufstehzeit an (am Wochenende später) und nach Sonnenaufgang aus (eigener Versatz und Zufall, wahlweise spätestens zu einer festen Zeit – z. B. wenn ihr aus dem Haus geht – oder sobald der Helligkeitssensor Tageslicht meldet) – während der Simulation oder wie das Abendlicht jeden Morgen; mit gelernten Tagen werden die echten Morgen nachgespielt.
- **Alarm testen** in den Einstellungen (Reiter *Aktionen & Test*): anhaken, was wirklich geschaltet wird (Benachrichtigungen, Sprachausgabe, Lampen, Sirenen, Aktionen), mit Rückfrage und als Test gekennzeichnet – ohne Scharfschalten, ohne echten Alarm, danach alles wieder wie vorher.
- **Neustart während eines Alarms**: Der Alarm bleibt bis zur Quittierung bestehen, die Sirenen werden ausgeschaltet.
- **Widget „Home Guard Panel“** (Web-Komponente) für AURA, vis-2 und andere Visualisierungen, die Web-Komponenten unterstützen: Status, Modus-Tasten, PIN-Tastatur, offene Fenster, wer zu Hause ist (optional), Schalter für Automatik, Schalter für Abend-/Morgenlicht, überwachte Sensoren und ein ausklappbares Logbuch.

## Voraussetzungen

- Node.js 22 oder neuer, js-controller 6.0.11 oder neuer, Admin 7.6.20 oder neuer
- Widget: AURA ab 0.106.0, vis-2 ab 2.20.7 oder eine andere Visualisierung, die Web-Komponenten unterstützt

## Einstellungen

**Einrichtungsassistent:** Beim ersten Öffnen der Einstellungen führt der Einrichtungsassistent durch alles Nötige (siehe Highlights). Sobald du auf der letzten Seite *Einrichtung abgeschlossen – alle Einstellungen zeigen* anhakst – oder gleich auf der ersten Seite *Nein – ich richte selbst ein* wählst –, erscheinen die Reiter mit allen Detail-Einstellungen. Der Assistent bleibt als erster Reiter erreichbar; bereits eingerichtete Instanzen zeigen die Reiter weiterhin direkt.

Die Reiter der Einstellungen:

1. **Allgemein** – Alarmanlage und Anwesenheitssimulation ein- oder ausschalten.
2. **Auslöser** – Funktionen für Hüllschutz (Türen, Fenster), Vollschutz (innen, Bewegung) und 24-h-Sensoren wählen oder Sensoren von Hand eintragen (mit *verzögert*, *invertiert* und *Bewegungsmelder*). Jeder Gerätetyp geht – auch Glasbruch-, Erschütterungsmelder oder ein Panikknopf; eine Zeile in der Tabelle überschreibt oder schließt einen Sensor aus einer Funktion aus.
3. **Ablauf & PIN** – Ausgangs- und Eingangsverzögerung, Haustürkontakt für sofort scharf, Offen-Fenster-Prüfung, Alarmdauer, PIN, Nachtschutz-Zeiten.
4. **Schloss & Anwesenheit** – Zustand des Türschlosses und die Werte für „aufgeschlossen“ (Nuki: 3, 5, 6), Anwesenheits-Datenpunkte und was passiert, wenn alle gehen oder jemand heimkommt.
5. **Benachrichtigungen** – Messenger-Instanzen, welche Ereignisse gemeldet werden, Datenpunkt für Sprachausgabe.
6. **Aktionen & Test** – Lampen (Funktion oder Liste, an oder blinkend), Sirenen, eine Aktionstabelle für beliebige Ereignisse und der Testalarm.
7. **Anwesenheitssimulation** – Simulation, Abend- und Morgenlicht: Funktionen für Abend- und Morgenlampen, eine Lampentabelle mit den Rollen *Abend*, *Morgen*, *Kurze Gänge*, *Zubettgehen* (mehrere je Lampe) und Geräte/Szenen/Skripte, Planungsart, Start relativ zum Sonnenuntergang oder unter einem Lux-Wert, Licht aus, Lernen. Geräte bekommen je Zeile ein Zeitfenster (abends, ganzer Tag, eigene Zeiten), Häufigkeit und Dauer.
8. **Alexa** – Echo-Geräte für den Alarm (Lautstärke, Alarmton, Ansage) und als Radio in der Simulation (Sender, Lautstärke, Zeitfenster, Häufigkeit, Dauer, Lernen), jeweils pro Gerät.

### Funktion oder Tabelle – was wie eingerichtet wird

Vieles lässt sich über eine **Funktion** (Aufzählung) einbinden – jeder Datenpunkt der Funktion wird genommen, neue Mitglieder werden ohne Neustart übernommen. Manche Einstellungen gibt es nur je Eintrag; diese Dinge müssen **von Hand in die Tabelle** eingetragen werden (mit der Datenpunkt-ID). Ein Tabelleneintrag überschreibt denselben Datenpunkt aus einer Funktion.

| Was | Über eine Funktion | Nur in der Tabelle |
|---|---|---|
| Sensoren – Außenhaut, innen, Gefahrenmelder, nur melden | ✓ je eine Funktion | *verzögert* (Eingangsverzögerung), *invertiert*, *Bewegungsmelder*, was ein Gefahrenmelder tut (Nachricht / Sprache / Alarm) |
| Anwesenheit (wer ist zu Hause) | ✓ | ein gemeinsamer Name für mehrere Datenpunkte einer Person (z. B. GPS und Ping) – ohne Namen gilt der Objektname |
| Lampen bei Alarm | ✓ | – |
| Sirenen | – | ✓ (Modus *jeder Alarm / nur Vollschutz / nur Hüll-/Nachtschutz* und Dauer je Sirene) |
| **Abendlampen** | ✓ Funktion *Abendlicht* | ✓ Haken *Abend* |
| **Morgenlampen** | ✓ Funktion *Morgenlicht* (darf dieselbe Funktion sein) | ✓ Haken *Morgen* |
| Lampen für **kurze Gänge** und **Zubettgehen** | – | ✓ Haken *Kurze Gänge* / *Zubettgehen* |
| **Gerät / Szene / Skript** in der Simulation | – | ✓ (eigene Werte für an/aus, *Lernen von*, was beim Ende der Simulation passiert) |
| Aktionen (Tür abschließen, Rollläden, Kamera …) | – | ✓ |

Eine Lampe in der Tabelle kann mehrere Rollen zugleich haben (z. B. die Küche als Abend- und Morgenlampe). Beispiel: Flur- und Badlicht für kurze Gänge während der Simulation kommen mit Haken *Kurze Gänge* in die Tabelle; sie gehören nicht in die Funktion der Abendlampen, sonst wären sie den ganzen Abend an.

## Datenpunkte

| Datenpunkt | Bedeutung |
|---|---|
| `status.mode` | `off`, `full` (Vollschutz), `perimeter` (Hüllschutz), `night` (Nachtschutz) |
| `status.phase` | `disarmed`, `arming`, `armed`, `entry`, `alarm` |
| `status.text` | Status als Text |
| `status.armed`, `status.alarm`, `status.entry` | Schalter |
| `status.countdown` | Sekunden der laufenden Ausgangs-/Eingangsverzögerung |
| `status.openContacts`, `status.openCount` | offene Türen/Fenster |
| `status.readyFull`, `status.readyPerimeter` | Scharfschalten ohne offene Kontakte möglich |
| `status.lastTrigger`, `status.lastTriggerTime` | letzter auslösender Sensor |
| `status.wrongPin` | falsche PIN-Eingaben in Folge |
| `status.sabotage` | Sensoren ohne Meldung (JSON) |
| `status.sensors` | überwachte Sensoren (JSON) |
| `status.presentCount`, `status.someoneHome` | Personen zu Hause, jemand zu Hause |
| `status.present` | Personen und ob sie zu Hause sind (JSON) – mehrere Datenpunkte einer Person (GPS, Ping) zählen als eine |
| `status.log` | Logbuch (JSON) |
| `control.mode` | Modus setzen (`off`, `full`, `perimeter`, `night`) |
| `control.full`, `control.perimeter`, `control.night`, `control.off` | Tasten |
| `control.cancel`, `control.ack`, `control.panic` | Scharfschalten abbrechen, Alarm quittieren, Panikalarm |
| `control.pin` | PIN schreiben zum Unscharfschalten |
| `control.report` | Melde-Sensoren ein/aus |
| `control.eveningOn` / `control.eveningOff` | Abendlicht: automatisch an / aus (auch als Schalter im Panel; „an“ abends eingeschaltet: die Lampen gehen sofort an) |
| `control.morningOn` / `control.morningOff` | Morgenlicht: automatisch an / aus |
| `control.autoArm` | Automatisch scharf/unscharf über Anwesenheit ein/aus (auch als Schalter im Panel) |
| `simulation.active` | Simulation läuft |
| `simulation.next`, `simulation.plan` | nächster Schritt und Plan des Abends |
| `simulation.learned`, `simulation.learnedDays` | gelernte Tage |

Ist *Entschärfen per Datenpunkt nur mit PIN* gesetzt, schalten `control.mode` und `control.off` nicht unscharf – nur `control.pin`, das Panel oder das Türschloss.

## Skripte (sendTo)

```js
sendTo('home-guard.0', 'arm', { mode: 'full' }, res => log(JSON.stringify(res))); // { ok, open: [...] }
sendTo('home-guard.0', 'arm', { mode: 'perimeter', pin: '1234' });               // PIN nur bei „Scharfschalten braucht ebenfalls die PIN“
sendTo('home-guard.0', 'disarm', { pin: '1234' });
sendTo('home-guard.0', 'cancel', {});      // Ausgangsverzögerung abbrechen
sendTo('home-guard.0', 'ack', {});         // Alarm quittieren
sendTo('home-guard.0', 'panic', {});
sendTo('home-guard.0', 'testAlarm', { notify: true, lamps: true, sirens: false, duration: 15 }, res => log(res.result));
sendTo('home-guard.0', 'status', {}, status => log(JSON.stringify(status)));
```

## Widget (Web-Komponente)

Nach der Installation steht das „Home Guard Panel“ in der Widget-Liste von AURA, vis-2 und jeder anderen Visualisierung, die Web-Komponenten unterstützt. Instanz wählen – es zeigt Status, Countdown, Modus-Tasten, PIN-Tastatur, offene Fenster, Schalter für Abend-/Morgenlicht (nur wenn eingerichtet) und Logbuch. **In AURA beim Widget „Klicks“ auf „Komponente“ stellen** (`wcClick: "component"`), sonst kommen die Tasten nicht an.

## Hinweis

Home Guard ist eine Hausautomations-Hilfe, keine zertifizierte Alarmanlage. Sie funktioniert nur, solange ioBroker, Netzwerk und Sensoren laufen.

Changelog und Lizenz: siehe [README.md](README.md).
