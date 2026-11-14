// Sunset (and sunrise) after the NOAA approximation - accurate to about a minute, no dependency needed

const rad = Math.PI / 180;

/**
 * Sunrise and sunset of a day in ms since epoch (UTC based), or null near the poles (no sunset that day)
 *
 * @param date any time on the wanted day (local date of the system is used)
 * @param lat latitude in degrees
 * @param lon longitude in degrees (east positive)
 */
export function sunTimes(date: Date, lat: number, lon: number): { sunrise: number; sunset: number } | null {
	const day = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
	const start = new Date(day.getFullYear(), 0, 0, 12, 0, 0);
	const n = Math.round((day.getTime() - start.getTime()) / 86400000);
	const g = ((2 * Math.PI) / 365) * (n - 1);
	const eqTime =
		229.18 *
		(0.000075 +
			0.001868 * Math.cos(g) -
			0.032077 * Math.sin(g) -
			0.014615 * Math.cos(2 * g) -
			0.040849 * Math.sin(2 * g));
	const decl =
		0.006918 -
		0.399912 * Math.cos(g) +
		0.070257 * Math.sin(g) -
		0.006758 * Math.cos(2 * g) +
		0.000907 * Math.sin(2 * g) -
		0.002697 * Math.cos(3 * g) +
		0.00148 * Math.sin(3 * g);
	const cosHa =
		Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
	if (cosHa < -1 || cosHa > 1) {
		return null;
	}
	const ha = Math.acos(cosHa) / rad;
	// minutes after midnight UTC
	const riseMin = 720 - 4 * (lon + ha) - eqTime;
	const setMin = 720 - 4 * (lon - ha) - eqTime;
	const utcMidnight = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
	return { sunrise: utcMidnight + riseMin * 60000, sunset: utcMidnight + setMin * 60000 };
}
