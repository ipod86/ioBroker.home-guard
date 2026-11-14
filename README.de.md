![Logo](admin/home-guard.png)
# ioBroker.home-guard – Alarmanlage & Anwesenheitssimulation

**English: [README.md](README.md)**

Home Guard vereint eine Alarmanlage und eine Anwesenheitssimulation in einem Adapter. Beide Teile lassen sich einzeln oder zusammen nutzen.

## Highlights

- **Drei Modi**: Vollschutz (alle Sensoren), Hüllschutz (nur Türen und Fenster – du bist zu Hause) und Nachtschutz (wie Hüllschutz, nachts automatisch). 24-h-Sensoren (Rauch, Wasser) lösen immer aus.
- **Ausgangsverzögerung** je Modus, **sofort scharf**, wenn die Haustür zufällt, **Eingangsverzögerung** (stiller Alarm) für verzögerte Sensoren wie die Haustür.
- **Offen-Fenster-Prüfung** beim Scharfschalten: warnen und trotzdem scharf, verweigern oder ignorieren. Gekippte Fenster (Wert 1) zählen als offen.
- **Bewegungsmelder** lösen erst aus, wenn mehrere verschiedene Melder innerhalb einer einstellbaren Zeit (Standard 120 s) melden – eine Katze oder ein Vorhang allein ist kein Alarm.
- **PIN** (verschlüsselt gespeichert), auf Wunsch auch zum Scharfschalten; Meldung nach Fehleingaben.
- **Türschloss** (z. B. Nuki) schaltet beim Aufschließen unscharf, **Anwesenheit** (Personen, Handys) schaltet scharf, wenn der Letzte geht, und den Vollschutz unscharf, wenn jemand heimkommt.
- **Benachrichtigungen** über Telegram, Pushover, WhatsApp, Signal, E-Mail, Gotify, Discord, Matrix, ntfy, Pushsafer und den ioBroker-Benachrichtigungsmanager; Alarmmeldung wiederholen bis quittiert; **Sprachausgabe** (z. B. Alexa, SayIt).
- **Bei Alarm**: Lampen an oder blinkend (danach wieder wie vorher), Sirenen, beliebige Geräte über eine Aktionstabelle (z. B. Tür abschließen beim Scharfschalten, Rollläden runter, Kameraaufnahme).
- **Sabotage-Prüfung**: Sensoren, die sich eine einstellbare Zahl Stunden nicht gemeldet haben, werden gemeldet (Batterie leer, Funkproblem).
- **Anwesenheitssimulation** mit drei Planungsarten: *Dämmerung* (zufällige Zeiten um den Sonnenuntergang, Licht aus um eine feste Zeit, Freitag/Samstag später, kurze Gänge in Flur und Bad), *gelernt* (spielt einen echten Tag derselben Art aus deinem eigenen Schaltverhalten mit verschobenen Zeiten ab) und *kombiniert* (empfohlen).
- **Web-Komponente „Home Guard Panel“** für AURA und vis-2: Status, Modus-Tasten, PIN-Tastatur, offene Fenster, Simulation und Logbuch.

## Unterschiede zum alarm-Adapter

Der [alarm-Adapter](https://github.com/misanorot/ioBroker.alarm) ist eine bewährte, größere Alarmanlage. Home Guard setzt andere Schwerpunkte:

- Sensoren, Lampen und Personen kommen aus **Funktionen (Aufzählungen)** – ein neuer Fensterkontakt oder eine neue Lampe in der Funktion wird innerhalb von Sekunden übernommen, ohne Einstellungen zu ändern oder neu zu starten;
- **Bewegungsmelder-Logik** gegen Fehlalarme, **Türschloss- und Anwesenheitsanbindung** eingebaut;
- eine **lernende Anwesenheitssimulation** im selben Adapter, gekoppelt an die Alarmanlage (läuft bei scharf, wenn niemand zu Hause ist, oder von Hand);
- eine fertige **Web-Komponente** fürs Dashboard.

## Einstellungen

1. **Allgemein** – Alarmanlage und Anwesenheitssimulation ein- oder ausschalten.
2. **Auslöser** – Funktionen für Hüllschutz (Türen, Fenster), Vollschutz (innen, Bewegung) und 24-h-Sensoren wählen oder Sensoren von Hand eintragen (mit *verzögert*, *invertiert* und *Bewegungsmelder*).
3. **Ablauf & PIN** – Ausgangs- und Eingangsverzögerung, Haustürkontakt für sofort scharf, Offen-Fenster-Prüfung, Alarmdauer, PIN, Nachtschutz-Zeiten.
4. **Entschärfen & Anwesenheit** – Zustand des Türschlosses und die Werte für „aufgeschlossen“ (Nuki: 3, 5, 6), Anwesenheits-Datenpunkte und was passiert, wenn alle gehen oder jemand heimkommt.
5. **Benachrichtigungen** – Messenger-Instanzen, welche Ereignisse gemeldet werden, Datenpunkt für Sprachausgabe.
6. **Aktionen bei Alarm** – Lampen (Funktion oder Liste, an oder blinkend), Sirenen und eine Aktionstabelle für beliebige Ereignisse.
7. **Anwesenheitssimulation** – Lampen mit Typ *Abend*, *kurzer Gang* oder *kurz beim Zubettgehen*, Planungsart, Start relativ zum Sonnenuntergang oder unter einem Lux-Wert, Licht aus, Lernen.
8. **Dashboard** – Hinweise zur Web-Komponente.

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
| `status.presentCount`, `status.someoneHome` | Anwesenheit |
| `status.log` | Logbuch (JSON) |
| `control.mode` | Modus setzen (`off`, `full`, `perimeter`, `night`) |
| `control.full`, `control.perimeter`, `control.night`, `control.off` | Tasten |
| `control.cancel`, `control.ack`, `control.panic` | Scharfschalten abbrechen, Alarm quittieren, Panikalarm |
| `control.pin` | PIN schreiben zum Unscharfschalten |
| `simulation.enabled` | Simulation von Hand einschalten |
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
sendTo('home-guard.0', 'simulation', { enabled: true });
sendTo('home-guard.0', 'status', {}, status => log(JSON.stringify(status)));
```

## Web-Komponente

Nach der Installation steht das „Home Guard Panel“ in AURA und vis-2 in der Liste der Web-Komponenten. Instanz wählen – es zeigt Status, Countdown, Modus-Tasten, PIN-Tastatur, offene Fenster, Simulationsschalter und Logbuch.

## Hinweis

Home Guard ist eine Hausautomations-Hilfe, keine zertifizierte Alarmanlage. Sie funktioniert nur, solange ioBroker, Netzwerk und Sensoren laufen.

Changelog und Lizenz: siehe [README.md](README.md).
