# Older Changelog

<!-- older entries moved here by release-script -->

### 0.3.1 (2026-11-18)
* (ipod86) feat: messengers sent to directly in their own format: in addition Gotify, SMS (gsmsms, seven.io), Discord, MAX, ioBroker Visu app and Synology Chat; only supported and installed messengers can be chosen, each with its own fields
* (ipod86) change: no more generic notification format and free instance input – other messengers via the notification manager

### 0.3.0 (2026-11-18)
* (ipod86) simulation: time window per device – in the evening, the whole day or own times – with own count (also a range like 1-3 = random each day) and duration
* (ipod86) Amazon Echo (alexa2): per Echo for the alarm (volume, sound, announcement) and as radio in the simulation (station or random station, volume, time window, learning); setup assistant page "Alexa"
* (ipod86) setup assistant: the Alexa page asks every setting one by one with an explanation; the lamp page explains the table column by column

### 0.2.1 (2026-11-16)
* (ipod86) fix: panel – the PIN keypad was white with invisible keys in a dark theme; it now uses the colours of the panel

### 0.2.0 (2026-11-15)
* (ipod86) fix: evening and morning light also work when the presence simulation is not used
* (ipod86) setup assistant: guided first setup – first what you want to use and what you have, then only the pages that fit; automatic search, suggested times and a final check; the other tabs appear when it is finished
* (ipod86) simulation: the type "TV / device" is now called "Device / scene / script" – any state can be switched while simulating
* (ipod86) settings: evening and morning each have their own section (times, brightness); shown only when the evening/morning light or the simulation uses them
* (ipod86) morning light off: own offset after sunrise, latest time, brightness sensor; panel shows "on" and "off" side by side for evening and morning light
* (ipod86) simulation lamps: own function for the morning light; in the table a lamp has roles (evening, morning, short visits, bedtime – several at once) instead of one type; older tables are converted automatically
* (ipod86) evening/morning light: switching on and off as states (`control.eveningOn` …) and switches in the panel, only shown when set up; the simulation runs only coupled (alarm system/nobody at home), the manual switch `simulation.enabled` was removed
* (ipod86) learned simulation: choose the learned day by weekday/weekend (default, more variety) or by the same day of the week (only with at least 3 of them)

### 0.1.1 (2026-11-14)
* (ipod86) internal: timer variable renamed (repochecker W5051); first release published automatically via GitHub (trusted publishing)

### 0.1.0 (2026-11-14)
* (ipod86) initial release: alarm system with full, perimeter and night protection, presence simulation (dusk, learned, combined) and widget (web component; AURA 0.106.0+, vis-2 2.20.7+ and other visualisations)
