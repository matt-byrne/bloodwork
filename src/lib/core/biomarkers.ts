import type { BiomarkerDefinition } from './types.ts';
import definitions from '../data/biomarker-definitions.json';

const biomarkerMap = new Map<string, BiomarkerDefinition>();
const aliasMap = new Map<string, string>(); // alias -> biomarker id

export function initBiomarkers(): void {
	for (const def of definitions as BiomarkerDefinition[]) {
		biomarkerMap.set(def.id, def);
		aliasMap.set(def.name.toLowerCase(), def.id);
		for (const alias of def.aliases) {
			aliasMap.set(alias.toLowerCase(), def.id);
		}
	}
}

export function getBiomarker(id: string): BiomarkerDefinition | undefined {
	return biomarkerMap.get(id);
}

export function getAllBiomarkers(): BiomarkerDefinition[] {
	return [...biomarkerMap.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Preferred category display order — unlisted categories go at the end alphabetically
const CATEGORY_ORDER = [
	'Lipid Panel',
	'Full Blood Count',
	'Electrolytes',
	'Renal Function',
	'Liver Function',
	'Iron Studies',
	'Metabolic',
	'Inflammation',
	'Thyroid',
	'Hormones',
	'Vitamins',
	'Minerals',
	'Muscle',
	'Cardiac',
	'Coagulation',
	'Immunology',
	'Tumour Markers',
	'Haemoglobin Studies',
	'Pancreas'
];

function categorySort(a: string, b: string): number {
	const ai = CATEGORY_ORDER.indexOf(a);
	const bi = CATEGORY_ORDER.indexOf(b);
	if (ai >= 0 && bi >= 0) return ai - bi;
	if (ai >= 0) return -1;
	if (bi >= 0) return 1;
	return a.localeCompare(b);
}

export function getBiomarkersByCategory(): Map<string, BiomarkerDefinition[]> {
	const categories = new Map<string, BiomarkerDefinition[]>();
	for (const def of biomarkerMap.values()) {
		const list = categories.get(def.category) ?? [];
		list.push(def);
		categories.set(def.category, list);
	}
	// Sort biomarkers within each category alphabetically
	for (const [, list] of categories) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}
	// Return in canonical category order
	const sorted = new Map<string, BiomarkerDefinition[]>();
	const keys = [...categories.keys()].sort(categorySort);
	for (const key of keys) {
		sorted.set(key, categories.get(key)!);
	}
	return sorted;
}

export function getAllBiomarkersByCategory(): { category: string; biomarkers: BiomarkerDefinition[] }[] {
	const map = getBiomarkersByCategory();
	return [...map.entries()].map(([category, biomarkers]) => ({ category, biomarkers }));
}

export function matchBiomarkerName(name: string): { id: string; confidence: number } | null {
	const lower = name.toLowerCase().trim();

	// Exact match on name or alias
	const exactMatch = aliasMap.get(lower);
	if (exactMatch) return { id: exactMatch, confidence: 1.0 };

	// Fuzzy match using Dice coefficient
	let bestMatch: string | null = null;
	let bestScore = 0;

	for (const [alias, id] of aliasMap.entries()) {
		const score = diceCoefficient(lower, alias);
		if (score > bestScore) {
			bestScore = score;
			bestMatch = id;
		}
	}

	if (bestMatch && bestScore >= 0.6) {
		return { id: bestMatch, confidence: bestScore };
	}

	return null;
}

function bigrams(str: string): Set<string> {
	const s = new Set<string>();
	for (let i = 0; i < str.length - 1; i++) {
		s.add(str.slice(i, i + 2));
	}
	return s;
}

function diceCoefficient(a: string, b: string): number {
	if (a === b) return 1;
	if (a.length < 2 || b.length < 2) return 0;

	const aBigrams = bigrams(a);
	const bBigrams = bigrams(b);

	let intersection = 0;
	for (const bg of aBigrams) {
		if (bBigrams.has(bg)) intersection++;
	}

	return (2 * intersection) / (aBigrams.size + bBigrams.size);
}
