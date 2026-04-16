export interface BiomarkerDefinition {
	id: string;
	name: string;
	aliases: string[];
	category: string;
	description: string;
	whyItMatters: string;
	defaultUnit: string;
	alternateUnits: { unit: string; conversionFactor: number }[];
	defaultRange: { low?: number; high?: number; unit: string };
}

export interface UserThreshold {
	id: string;
	biomarkerId: string;
	low?: number;
	high?: number;
	unit: string;
	note?: string;
}

export interface Report {
	id: string;
	date: Date;
	labName?: string;
	sourceType: 'pdf' | 'image' | 'manual';
	notes?: string;
	createdAt: Date;
}

export interface Reading {
	id: string;
	reportId: string;
	biomarkerId: string;
	value: number;
	unit: string;
	referenceRange?: { low?: number; high?: number };
	flag?: 'high' | 'low' | 'normal';
}

export interface Milestone {
	id: string;
	date: Date;
	title: string;
	description?: string;
	color?: string;
	showOnCharts: boolean;
}

export interface AppSettings {
	key: string;
	value: unknown;
}

export interface ExtractedReading {
	testName: string;
	value: number;
	unit: string;
	referenceLow?: number;
	referenceHigh?: number;
	flag?: 'high' | 'low' | 'normal';
	matchedBiomarkerId?: string;
	confidence?: number;
}

export interface ExtractionResult {
	collectionDate?: string;
	labName?: string;
	results: ExtractedReading[];
}

export interface FileExtractionResult {
	fileName: string;
	collectionDate?: string;
	labName?: string;
	results: ExtractedReading[];
}
