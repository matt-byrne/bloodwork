import type { ExtractionResult, ExtractedReading, FileExtractionResult } from './types.ts';
import { matchBiomarkerName } from './biomarkers.ts';

export interface ExtractionRequest {
	files: File[];
	apiKey: string;
}

/**
 * Extract lab results from multiple files, each file producing its own report.
 * Files are processed in parallel for speed.
 */
export async function extractFromFiles(request: ExtractionRequest): Promise<FileExtractionResult[]> {
	const { files, apiKey } = request;

	const results = await Promise.all(
		files.map((file) => extractSingleFile(file, apiKey))
	);

	return results;
}

/**
 * Extract lab results from a single file.
 */
async function extractSingleFile(file: File, apiKey: string): Promise<FileExtractionResult> {
	const base64 = await fileToBase64(file);
	const mediaType = getMediaType(file);

	const content: unknown[] = [];

	if (mediaType === 'application/pdf') {
		content.push({
			type: 'document',
			source: { type: 'base64', media_type: 'application/pdf', data: base64 }
		});
	} else {
		content.push({
			type: 'image',
			source: { type: 'base64', media_type: mediaType, data: base64 }
		});
	}

	content.push({
		type: 'text',
		text: 'Extract all lab test results from this pathology report. Use the save_lab_results tool to return the structured data.'
	});

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
			'anthropic-dangerous-direct-browser-access': 'true'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 4096,
			tools: [
				{
					name: 'save_lab_results',
					description:
						'Save extracted lab results from a pathology report. Extract every single test result visible on the report, including reference ranges where shown.',
					input_schema: {
						type: 'object',
						properties: {
							collection_date: {
								type: 'string',
								description:
									'Date the blood was drawn/collected, in ISO 8601 format (YYYY-MM-DD). Look for "Collection Date", "Date Collected", "Specimen Date", etc.'
							},
							lab_name: {
								type: 'string',
								description:
									'Name of the pathology lab that processed the tests. Look for letterhead or "Laboratory" fields.'
							},
							results: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										test_name: {
											type: 'string',
											description:
												'The biomarker/test name exactly as printed on the report'
										},
										value: {
											type: 'number',
											description: 'The numeric result value'
										},
										unit: {
											type: 'string',
											description:
												'The unit of measurement (e.g., mmol/L, mg/dL, U/L, g/L, %, nmol/L, mIU/L)'
										},
										reference_low: {
											type: 'number',
											description:
												'Lower bound of reference range, if shown'
										},
										reference_high: {
											type: 'number',
											description:
												'Upper bound of reference range, if shown'
										},
										flag: {
											type: 'string',
											enum: ['high', 'low', 'normal'],
											description:
												'Whether the result is flagged as high, low, or normal. Infer from H/L flags, asterisks, or by comparing to reference range.'
										}
									},
									required: ['test_name', 'value', 'unit']
								}
							}
						},
						required: ['results']
					}
				}
			],
			tool_choice: { type: 'tool', name: 'save_lab_results' },
			messages: [{ role: 'user', content }]
		})
	});

	if (!response.ok) {
		const errorBody = await response.text();
		throw new Error(`API error for ${file.name} (${response.status}): ${errorBody}`);
	}

	const data = await response.json();

	const toolUse = data.content?.find(
		(block: { type: string }) => block.type === 'tool_use'
	);
	if (!toolUse) {
		throw new Error(`No structured results returned for ${file.name}`);
	}

	const input = toolUse.input as {
		collection_date?: string;
		lab_name?: string;
		results: {
			test_name: string;
			value: number;
			unit: string;
			reference_low?: number;
			reference_high?: number;
			flag?: 'high' | 'low' | 'normal';
		}[];
	};

	const results: ExtractedReading[] = input.results.map((r) => {
		const match = matchBiomarkerName(r.test_name);
		return {
			testName: r.test_name,
			value: r.value,
			unit: r.unit,
			referenceLow: r.reference_low,
			referenceHigh: r.reference_high,
			flag: r.flag,
			matchedBiomarkerId: match?.id,
			confidence: match?.confidence
		};
	});

	return {
		fileName: file.name,
		collectionDate: input.collection_date,
		labName: input.lab_name,
		results
	};
}

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			const base64 = result.split(',')[1];
			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

function getMediaType(file: File): string {
	const type = file.type;
	if (type === 'application/pdf') return 'application/pdf';
	if (type === 'image/png') return 'image/png';
	if (type === 'image/jpeg' || type === 'image/jpg') return 'image/jpeg';
	if (type === 'image/gif') return 'image/gif';
	if (type === 'image/webp') return 'image/webp';
	if (type.startsWith('image/')) return 'image/jpeg';
	return 'application/pdf';
}
