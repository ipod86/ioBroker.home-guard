![Logo](admin/home-guard.png)
# ioBroker.home-guard – Alarmanlage & Anwesenheitssimulation

**English: [README.md](README.md)**

Home Guard vereint eine Alarmanlage und eine Anwesenheitssimulation in einem Adapter. Beide Teile lassen sich einzeln oder zusammen nutzen.

![Home Guard Panel](https://raw.githubusercontent.com/ipod86/ioBroker.home-guard/main/docs/widget_de.jpg)

## Highlights

- **Drei Modi**: Vollschutz (alle Sensoren), Hüllschutz (nur Türen und Fenster – du bist zu Hause) und Nachtschutz (wie Hüllschutz, nachts automatisch). 24-h-Sensoren (Rauch, Wasser) lösen immer aus.
- **Ausgangsverzögerung** je Modus, **sofort scharf**, wenn die Haustür zufällt, **Eingangsverzögerung** (stiller Alarm) für verzögerte Sensoren wie die Haustür.
- **Offen-Fenster-Prüfung** beim Scharfschalten: warnen und trotzdem scharf, verweigern oder ignorieren. Gekippte Fenster (Wert 1) zählen als offen.
- **Bewegungsmelder** lösen erst aus, wenn mehrere verschiedene Melder innerhalb einer einstellbaren Zeit (Standard 120 s) melden – eine Katze oder ein Vorhang allein ist kein Alarm. Während der Eingangsverzögerung sind die Innen-Sensoren Mitläufer: Wer an den Bewegungsmeldern vorbei zum Panel geht, löst keinen Alarm aus.
- **PIN** (verschlüsselt gespeichert), auf Wunsch auch zum Scharfschalten; Meldung nach Fehleingaben und Sperre der PIN-Eingabe für einige Minuten gegen Ausprobieren.
- **Türschloss** (z. B. Nuki) schaltet beim Aufschließen unscharf, **Anwesenheit** (Personen, Handys) schaltet scharf, wenn der Letzte geht, und den Vollschutz unscharf, wenn jemand heimkommt.
- **Benachrichtigungen** über Telegram, Pushover, E-Mail, WhatsApp (cmb), Signal (cmb) und Pushsafer im jeweils eigenen Format sowie an **jeden Messenger, der ioBroker-Benachrichtigungen unterstützt** (z. B. Gotify, Discord, ioBroker.pro-App, GSM-SMS) im Format des Benachrichtigungsmanagers; zusätzlich an den Benachrichtigungsmanager selbst; Alarmmeldung wiederholen bis quittiert; **Sprachausgabe** (z. B. Alexa, SayIt).
- **Bei Alarm**: Lampen an oder blinkend (danach wieder wie vorher), Sirenen, beliebige Geräte über eine Aktionstabelle (z. B. Tür abschließen beim Scharfschalten, Rollläden runter, Kameraaufnahme).
- **Sabotage-Prüfung**: Sensoren, die sich eine einstellbare Zahl Stunden nicht gemeldet haben, werden gemeldet (Batterie leer, Funkproblem).
- **Anwesenheitssimulation** mit drei Planungsarten: *Dämmerung* (zufällige Zeiten um den Sonnenuntergang, Licht aus um eine feste Zeit, Freitag/Samstag später, kurze Gänge in Flur und Bad), *gelernt* (spielt einen echten Tag aus deinem eigenen Schaltverhalten mit verschobenen Zeiten ab – für einen Werktagsabend irgendeinen Werktag, fürs Wochenende irgendeinen Freitag/Samstag; wahlweise denselben Wochentag, wenn mindestens 3 davon gelernt sind) und *kombiniert* (empfohlen).
- **Abendlicht**: die Abendlampen jeden Abend, auch wenn jemand zu Hause ist – bei Dämmerung alle an (auch die am Vorabend von Hand ausgeschalteten), bei „Licht aus“ alle aus (auch die von Hand eingeschalteten). Kurze Gänge, Zubettgehen und Gelerntes nur, solange die Simulation läuft. Ein- und Ausschalten lassen sich jederzeit getrennt ein- oder ausschalten (z. B. automatisch an, von Hand aus) – über `control.eveningOn`/`eveningOff`/`morningOn`/`morningOff` oder die Schalter im Panel.
- **Fernseher und andere Geräte, Szenen oder Skripte** in der Simulation (Typ „Gerät / Szene / Skript“), nur während die Simulation läuft: Mit „Lernen von“ (z. B. dem echten Ein-Zustand des Fernsehers) werden deine echten Abende nachgespielt, auch mehrmals am Abend; ohne läuft es eine einstellbare Anzahl Male für eine zufällige Zeit. Ein eigener Wert für an und aus lässt eine Szene des Szenen-Adapters oder ein Skript mehrere Schritte übernehmen (Fernseher an, dann Sender).
- **Wenn die Simulation endet** (z. B. beim Heimkommen): je Eintrag automatisch (Geräte wie der Fernseher aus, Lampen bleiben an), ausschalten oder anlassen. Einträge in den Tabellen überschreiben die über eine Funktion gefundenen.
- **Lernfenster**: Lernen und Nachspielen nur bei Dunkelheit (ab kurz vor Sonnenuntergang bis Sonnenaufgang), zwischen zwei Uhrzeiten oder immer.
- **Gefahrenmelder** (Rauch, Wasser, Gas – 24-h-Sensoren) melden immer, auch unscharf; je Sensor: nur Nachricht, Nachricht und Sprachausgabe oder voller Alarm mit Sirenen, Lampen und Aktionen. Eigenes Ereignis „Gefahrenmelder“ für die Aktionstabelle (z. B. Wasserventil schließen).
- **Melde-Sensoren** (Gartentor, Briefkasten, Schuppen): eine Nachricht statt eines Alarms, nur bei scharfer Anlage oder immer; jederzeit schaltbar über `control.report`.
- **Sirenen je Modus**: bei jedem Alarm, nur bei Vollschutz (Außensirene) oder nur bei Hüll-/Nachtschutz (Innensirene), jeweils mit eigener Dauer.
- **Morgenlicht**: die Morgenlampen zur Aufstehzeit an (am Wochenende später) und nach Sonnenaufgang aus (eigener Versatz und Zufall, wahlweise spätestens zu einer festen Zeit – z. B. wenn ihr aus dem Haus geht – oder sobald der Helligkeitssensor Tageslicht meldet) – während der Simulation oder wie das Abendlicht jeden Morgen; mit gelernten Tagen werden die echten Morgen nachgespielt.
- **Alarm testen** in den Einstellungen (Reiter *Aktionen bei Alarm*): anhaken, was wirklich geschaltet wird (Benachrichtigungen, Sprachausgabe, Lampen, Sirenen, Aktionen), mit Rückfrage und als Test gekennzeichnet – ohne Scharfschalten, ohne echten Alarm, danach alles wieder wie vorher.
- **Neustart während eines Alarms**: Der Alarm bleibt bis zur Quittierung bestehen, die Sirenen werden ausgeschaltet.
- **Web-Komponente „Home Guard Panel“** für AURA und vis-2: Status, Modus-Tasten, PIN-Tastatur, offene Fenster, wer zu Hause ist (optional), Schalter für Automatik, Schalter für Abend-/Morgenlicht, überwachte Sensoren und ein ausklappbares Logbuch.

## Voraussetzungen

- Node.js 22 oder neuer, js-controller 6.0.11 oder neuer, Admin 7.6.20 oder neuer
- Web-Komponente: AURA ab 0.106.0, vis-2 ab 2.20.7

## Einstellungen

**Einrichtungsassistent:** Eine neue Instanz öffnet mit dem Reiter *Einrichtungsassistent*. Wer sich auskennt, hakt auf der ersten Seite *Ich kenne mich aus und richte ohne Assistent ein* an und sieht sofort alle Reiter. Er fragt Schritt für Schritt, was du nutzen willst (Alarmanlage, Anwesenheitssimulation, Abend-/Morgenlicht), erklärt jede Frage und überspringt, was du nicht brauchst. *Automatisch suchen* durchsucht deine Funktionen (Aufzählungen) und trägt passende ein (Fenster, Bewegungsmelder, Lampen, Anwesenheit), dazu ein Nuki-Schloss und einen Messenger; *Vorschläge übernehmen* setzt bewährte Zeiten. Die letzte Seite prüft alles (z. B. „kein Messenger“, „keine Tür verzögert“). Sobald du *Einrichtung abgeschlossen – alle Einstellungen zeigen* anhakst, erscheinen alle Reiter. Bereits eingerichtete Instanzen zeigen weiterhin alle Reiter.

1. **Allgemein** – Alarmanlage und Anwesenheitssimulation ein- oder ausschalten.
2. **Auslöser** – Funktionen für Hüllschutz (Türen, Fenster), Vollschutz (innen, Bewegung) und 24-h-Sensoren wählen oder Sensoren von Hand eintragen (mit *verzögert*, *invertiert* und *Bewegungsmelder*).
3. **Ablauf & PIN** – Ausgangs- und Eingangsverzögerung, Haustürkontakt für sofort scharf, Offen-Fenster-Prüfung, Alarmdauer, PIN, Nachtschutz-Zeiten.
4. **Entschärfen & Anwesenheit** – Zustand des Türschlosses und die Werte für „aufgeschlossen“ (Nuki: 3, 5, 6), Anwesenheits-Datenpunkte und was passiert, wenn alle gehen oder jemand heimkommt.
5. **Benachrichtigungen** – Messenger-Instanzen, welche Ereignisse gemeldet werden, Datenpunkt für Sprachausgabe.
6. **Aktionen bei Alarm** – Lampen (Funktion oder Liste, an oder blinkend), Sirenen und eine Aktionstabelle für beliebige Ereignisse.
7. **Anwesenheitssimulation** – Funktionen für Abend- und Morgenlampen, eine Lampentabelle mit den Rollen *Abend*, *Morgens*, *Kurze Gänge*, *Zubettgehen* (mehrere je Lampe) und Geräte/Szenen/Skripte, Planungsart, Start relativ zum Sonnenuntergang oder unter einem Lux-Wert, Licht aus, Lernen.

### Funktion oder Tabelle – was wie eingerichtet wird

Vieles lässt sich über eine **Funktion** (Aufzählung) einbinden – jeder Datenpunkt der Funktion wird genommen, neue Mitglieder werden ohne Neustart übernommen. Manche Einstellungen gibt es nur je Eintrag; diese Dinge müssen **von Hand in die Tabelle** eingetragen werden (mit der Datenpunkt-ID). Ein Tabelleneintrag überschreibt denselben Datenpunkt aus einer Funktion.

| Was | Über eine Funktion | Nur in der Tabelle |
|---|---|---|
| Sensoren – Außenhaut, innen, Gefahrenmelder, nur melden | ✓ je eine Funktion | *verzögert* (Eingangsverzögerung), *invertiert*, *Bewegungsmelder*, was ein Gefahrenmelder tut (Nachricht / Sprache / Alarm) |
| Anwesenheit (wer ist zu Hause) | ✓ | ein gemeinsamer Name für mehrere Datenpunkte einer Person (z. B. GPS und Ping) – ohne Namen gilt der Objektname |
| Lampen bei Alarm | ✓ | – |
| Sirenen | – | ✓ (Modus *jeder Alarm / nur Vollschutz / nur Hüll-/Nachtschutz* und Dauer je Sirene) |
| **Abendlampen** | ✓ Funktion *Abendlicht* | ✓ Haken *Abend* |
| **Morgenlampen** | ✓ Funktion *Morgenlicht* (darf dieselbe Funktion sein) | ✓ Haken *Morgens* |
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

## Web-Komponente

Nach der Installation steht das „Home Guard Panel“ in AURA und vis-2 in der Liste der Web-Komponenten. Instanz wählen – es zeigt Status, Countdown, Modus-Tasten, PIN-Tastatur, offene Fenster, Schalter für Abend-/Morgenlicht (nur wenn eingerichtet) und Logbuch. **In AURA beim Widget „Klicks“ auf „Komponente“ stellen** (`wcClick: "component"`), sonst kommen die Tasten nicht an.

## Hinweis

Home Guard ist eine Hausautomations-Hilfe, keine zertifizierte Alarmanlage. Sie funktioniert nur, solange ioBroker, Netzwerk und Sensoren laufen.

Changelog und Lizenz: siehe [README.md](README.md).
