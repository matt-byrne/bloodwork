// Unit conversion factors for common biomarkers
// Factor converts FROM the key unit TO the value's target unit
// e.g., cholesterol: 1 mmol/L = 38.67 mg/dL

interface ConversionRule {
	from: string;
	to: string;
	factor: number;
}

const CONVERSIONS: Record<string, ConversionRule[]> = {
	// Cholesterol family (Total, LDL, HDL)
	cholesterol: [
		{ from: 'mmol/L', to: 'mg/dL', factor: 38.67 },
		{ from: 'mg/dL', to: 'mmol/L', factor: 1 / 38.67 }
	],
	// Triglycerides
	triglycerides: [
		{ from: 'mmol/L', to: 'mg/dL', factor: 88.57 },
		{ from: 'mg/dL', to: 'mmol/L', factor: 1 / 88.57 }
	],
	// Glucose
	glucose: [
		{ from: 'mmol/L', to: 'mg/dL', factor: 18.02 },
		{ from: 'mg/dL', to: 'mmol/L', factor: 1 / 18.02 }
	],
	// CRP
	crp: [
		{ from: 'mg/L', to: 'mg/dL', factor: 0.1 },
		{ from: 'mg/dL', to: 'mg/L', factor: 10 }
	]
};

// Map biomarker IDs to their conversion group
const BIOMARKER_CONVERSION_GROUP: Record<string, string> = {
	'total-cholesterol': 'cholesterol',
	'ldl-cholesterol': 'cholesterol',
	'hdl-cholesterol': 'cholesterol',
	'non-hdl-cholesterol': 'cholesterol',
	triglycerides: 'triglycerides',
	'fasting-glucose': 'glucose',
	glucose: 'glucose',
	hba1c: 'glucose',
	'hs-crp': 'crp',
	crp: 'crp'
};

export function convertUnit(
	value: number,
	fromUnit: string,
	toUnit: string,
	biomarkerId: string
): number | null {
	if (fromUnit === toUnit) return value;

	const group = BIOMARKER_CONVERSION_GROUP[biomarkerId];
	if (!group) return null;

	const rules = CONVERSIONS[group];
	if (!rules) return null;

	const rule = rules.find((r) => r.from === fromUnit && r.to === toUnit);
	if (!rule) return null;

	return Math.round(value * rule.factor * 100) / 100;
}

export function getAvailableUnits(biomarkerId: string): string[] {
	const group = BIOMARKER_CONVERSION_GROUP[biomarkerId];
	if (!group) return [];

	const rules = CONVERSIONS[group];
	if (!rules) return [];

	const units = new Set<string>();
	for (const rule of rules) {
		units.add(rule.from);
		units.add(rule.to);
	}
	return [...units];
}
