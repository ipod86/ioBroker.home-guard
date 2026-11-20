// Texts the adapter itself shows in the admin (results of the setup assistant, notes, test result):
// translated through the admin i18n files, so they exist in all languages of the admin

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** translate an English text; every "%s" is replaced by the next argument */
export type Tr = (en: string, ...args: (string | number)[]) => string;

/**
 * Fills the "%s" placeholders of a text
 *
 * @param text text with placeholders
 * @param args values
 */
export function fill(text: string, args: (string | number)[]): string {
	let i = 0;
	return text.replace(/%s/g, () => String(args[i++] ?? ''));
}

/**
 * English: the key itself
 *
 * @param en English text
 * @param args values for the placeholders
 */
export const trEn: Tr = (en, ...args) => fill(en, args);

/**
 * Translation function for a language, from admin/i18n/<lang>.json (English if the file or the text is missing)
 *
 * @param lang system language
 * @param dir folder with the i18n files
 */
export function loadTr(lang: string, dir: string): Tr {
	let dict: Record<string, string> = {};
	try {
		dict = JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')) as Record<string, string>;
	} catch {
		dict = {};
	}
	return (en, ...args) => fill(dict[en] || en, args);
}
