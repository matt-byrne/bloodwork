<script lang="ts">
	import { onMount } from 'svelte';
	import { v4 as uuid } from 'uuid';
	import { getAllBiomarkersByCategory, getBiomarker } from '$lib/core/biomarkers.ts';
	import { addReport, addReadings, getSetting } from '$lib/core/db.ts';
	import { extractFromFiles } from '$lib/core/extraction.ts';
	import type { Report, Reading, ExtractedReading, FileExtractionResult, BiomarkerDefinition } from '$lib/core/types.ts';
	import { goto } from '$app/navigation';

	type Mode = 'choose' | 'manual' | 'upload' | 'extracting' | 'review';

	let hasApiKey = $state<boolean | null>(null);

	onMount(async () => {
		const key = await getSetting<string>('anthropic-api-key');
		hasApiKey = !!key;
	});

	let mode = $state<Mode>('choose');

	// --- Manual entry shared fields ---
	let reportDate = $state(new Date().toISOString().split('T')[0]);
	let labName = $state('');

	// --- Manual entry ---
	interface ManualEntry {
		id: string;
		biomarkerId: string;
		value: string;
		unit: string;
	}

	let manualEntries = $state<ManualEntry[]>([
		{ id: uuid(), biomarkerId: '', value: '', unit: '' }
	]);

	const biomarkerGroups = getAllBiomarkersByCategory();
	const allBiomarkers = biomarkerGroups.flatMap((g) => g.biomarkers);

	// --- Searchable biomarker picker state ---
	let openPickerKey = $state<string | null>(null);
	let pickerSearch = $state('');

	function filteredBiomarkerGroups(query: string) {
		if (!query.trim()) return biomarkerGroups;
		const q = query.toLowerCase();
		return biomarkerGroups
			.map((g) => ({
				category: g.category,
				biomarkers: g.biomarkers.filter(
					(b) => b.name.toLowerCase().includes(q) || b.aliases.some((a) => a.toLowerCase().includes(q))
				)
			}))
			.filter((g) => g.biomarkers.length > 0);
	}

	function openPicker(key: string) {
		openPickerKey = key;
		pickerSearch = '';
	}

	function closePicker() {
		openPickerKey = null;
		pickerSearch = '';
	}

	function addManualEntry() {
		manualEntries = [...manualEntries, { id: uuid(), biomarkerId: '', value: '', unit: '' }];
	}

	function removeManualEntry(id: string) {
		manualEntries = manualEntries.filter((e) => e.id !== id);
	}

	function onBiomarkerSelect(entry: ManualEntry, biomarkerId: string) {
		entry.biomarkerId = biomarkerId;
		const bio = getBiomarker(biomarkerId);
		if (bio && !entry.unit) {
			entry.unit = bio.defaultUnit;
		}
		manualEntries = [...manualEntries];
	}

	// --- AI Extraction (multi-file, per-file reports) ---
	let selectedFiles = $state<File[]>([]);
	let extractionError = $state('');
	let extractionProgress = $state('');
	let dragOver = $state(false);

	// Per-file extraction results
	interface ReviewGroup {
		fileName: string;
		reportDate: string;
		labName: string;
		results: ExtractedReading[];
	}

	let reviewGroups = $state<ReviewGroup[]>([]);

	function handleFileDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			addFiles(files);
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			addFiles(input.files);
			input.value = '';
		}
	}

	function addFiles(fileList: FileList) {
		const newFiles = [...fileList].filter((f) => {
			const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
			return validTypes.includes(f.type) || f.type.startsWith('image/');
		});
		selectedFiles = [...selectedFiles, ...newFiles];
	}

	function removeFile(index: number) {
		selectedFiles = selectedFiles.filter((_, i) => i !== index);
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function getFileTypeLabel(type: string): string {
		if (type === 'application/pdf') return 'PDF';
		if (type.includes('png')) return 'PNG';
		if (type.includes('jpeg') || type.includes('jpg')) return 'JPEG';
		if (type.includes('webp')) return 'WebP';
		return 'Image';
	}

	async function startExtraction() {
		if (selectedFiles.length === 0) return;

		const apiKey = await getSetting<string>('anthropic-api-key');
		if (!apiKey) {
			extractionError = 'No API key configured. Go to Settings to add your Anthropic API key.';
			return;
		}

		mode = 'extracting';
		extractionError = '';
		extractionProgress = `Analysing ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} (each separately)...`;

		try {
			const fileResults = await extractFromFiles({ files: selectedFiles, apiKey });

			// Convert to ReviewGroups
			reviewGroups = fileResults.map((fr) => ({
				fileName: fr.fileName,
				reportDate: fr.collectionDate ?? new Date().toISOString().split('T')[0],
				labName: fr.labName ?? '',
				results: fr.results
			}));

			extractionProgress = '';
			mode = 'review';
		} catch (err) {
			extractionError = String(err);
			extractionProgress = '';
			mode = 'upload';
		}
	}

	// --- Review & Edit extracted results ---
	function removeExtracted(groupIndex: number, resultIndex: number) {
		reviewGroups = reviewGroups.map((g, gi) => {
			if (gi !== groupIndex) return g;
			return { ...g, results: g.results.filter((_, i) => i !== resultIndex) };
		});
	}

	function removeGroup(groupIndex: number) {
		reviewGroups = reviewGroups.filter((_, i) => i !== groupIndex);
	}

	function rematchBiomarker(groupIndex: number, resultIndex: number, biomarkerId: string) {
		reviewGroups = reviewGroups.map((g, gi) => {
			if (gi !== groupIndex) return g;
			return {
				...g,
				results: g.results.map((r, i) => {
					if (i === resultIndex) return { ...r, matchedBiomarkerId: biomarkerId, confidence: 1.0 };
					return r;
				})
			};
		});
	}

	function updateExtractedValue(groupIndex: number, resultIndex: number, value: number) {
		reviewGroups = reviewGroups.map((g, gi) => {
			if (gi !== groupIndex) return g;
			return {
				...g,
				results: g.results.map((r, i) => {
					if (i === resultIndex) return { ...r, value };
					return r;
				})
			};
		});
	}

	function updateExtractedUnit(groupIndex: number, resultIndex: number, unit: string) {
		reviewGroups = reviewGroups.map((g, gi) => {
			if (gi !== groupIndex) return g;
			return {
				...g,
				results: g.results.map((r, i) => {
					if (i === resultIndex) return { ...r, unit };
					return r;
				})
			};
		});
	}

	function updateGroupDate(groupIndex: number, date: string) {
		reviewGroups = reviewGroups.map((g, i) => i === groupIndex ? { ...g, reportDate: date } : g);
	}

	function updateGroupLabName(groupIndex: number, name: string) {
		reviewGroups = reviewGroups.map((g, i) => i === groupIndex ? { ...g, labName: name } : g);
	}

	// --- Save ---
	let saving = $state(false);
	let error = $state('');

	async function saveManual() {
		error = '';
		const validEntries = manualEntries.filter((e) => e.biomarkerId && e.value);
		if (validEntries.length === 0) { error = 'Add at least one result.'; return; }

		saving = true;
		try {
			const reportId = uuid();
			const report: Report = {
				id: reportId, date: new Date(reportDate),
				labName: labName || undefined, sourceType: 'manual', createdAt: new Date()
			};
			const readings: Reading[] = validEntries.map((e) => ({
				id: uuid(), reportId, biomarkerId: e.biomarkerId,
				value: parseFloat(e.value), unit: e.unit
			}));
			await addReport(report);
			await addReadings(readings);
			goto('/');
		} catch (err) { error = String(err); } finally { saving = false; }
	}

	async function saveExtracted() {
		error = '';

		// Count total matched results across all groups
		const totalMatched = reviewGroups.reduce(
			(sum, g) => sum + g.results.filter((r) => r.matchedBiomarkerId && r.value != null).length, 0
		);
		if (totalMatched === 0) { error = 'No matched results to save.'; return; }

		saving = true;
		try {
			// Create one report per group
			for (const group of reviewGroups) {
				const validResults = group.results.filter((r) => r.matchedBiomarkerId && r.value != null);
				if (validResults.length === 0) continue;

				const reportId = uuid();
				const sourceType = group.fileName.toLowerCase().endsWith('.pdf') ? 'pdf' as const : 'image' as const;
				const report: Report = {
					id: reportId,
					date: new Date(group.reportDate),
					labName: group.labName || undefined,
					sourceType,
					createdAt: new Date()
				};
				const readings: Reading[] = validResults.map((r) => ({
					id: uuid(), reportId, biomarkerId: r.matchedBiomarkerId!,
					value: r.value, unit: r.unit,
					referenceRange: r.referenceLow != null || r.referenceHigh != null
						? { low: r.referenceLow, high: r.referenceHigh } : undefined,
					flag: r.flag
				}));
				await addReport(report);
				await addReadings(readings);
			}
			goto('/');
		} catch (err) { error = String(err); } finally { saving = false; }
	}

	const totalMatchedCount = $derived(
		reviewGroups.reduce((sum, g) => sum + g.results.filter((r) => r.matchedBiomarkerId).length, 0)
	);
	const totalUnmatchedCount = $derived(
		reviewGroups.reduce((sum, g) => sum + g.results.filter((r) => !r.matchedBiomarkerId).length, 0)
	);
	const totalResultCount = $derived(
		reviewGroups.reduce((sum, g) => sum + g.results.length, 0)
	);
</script>

<svelte:head>
	<title>Import Results — Bloodwork</title>
</svelte:head>

<div class="page-header">
	<h1>
		{#if mode === 'choose'}Import Results
		{:else if mode === 'manual'}Manual Entry
		{:else if mode === 'upload'}Upload Report
		{:else if mode === 'extracting'}Analysing...
		{:else if mode === 'review'}Review Extracted Results
		{/if}
	</h1>
	{#if mode !== 'choose' && mode !== 'extracting'}
		<button class="btn btn-ghost" onclick={() => { mode = 'choose'; reviewGroups = []; extractionError = ''; selectedFiles = []; }}>
			← Back
		</button>
	{/if}
</div>

<!-- Step 1: Choose mode -->
{#if mode === 'choose'}
	<div class="mode-chooser">
		<button class="mode-card card" onclick={() => (mode = 'upload')}>
			<div class="mode-icon-wrap">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
					<polyline points="14 2 14 8 20 8"/>
					<path d="M12 18v-6"/>
					<path d="M9 15l3-3 3 3"/>
				</svg>
			</div>
			<h2>Upload Report</h2>
			<p>Upload PDFs or photos of pathology reports. AI extracts all results automatically. Each file becomes a separate report.</p>
		</button>
		<button class="mode-card card" onclick={() => (mode = 'manual')}>
			<div class="mode-icon-wrap">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
					<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
				</svg>
			</div>
			<h2>Manual Entry</h2>
			<p>Type in individual results by hand.</p>
		</button>
	</div>

<!-- Step 2a: Upload -->
{:else if mode === 'upload'}
	<div class="card upload-card">
		<!-- Drop zone -->
		<div
			class="drop-zone"
			class:drag-over={dragOver}
			ondragover={(e) => { e.preventDefault(); dragOver = true; }}
			ondragleave={() => (dragOver = false)}
			ondrop={handleFileDrop}
			role="button"
			tabindex="0"
		>
			<div class="drop-prompt">
				<svg class="drop-svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
					<polyline points="17 8 12 3 7 8"/>
					<line x1="12" y1="3" x2="12" y2="15"/>
				</svg>
				<p class="drop-text">Drop files here, or click to browse</p>
				<p class="drop-hint">PDF, PNG, JPEG, WebP — each file becomes a separate report</p>
			</div>
			<input
				type="file"
				accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
				multiple
				class="file-input"
				onchange={handleFileSelect}
			/>
		</div>

		<!-- File list -->
		{#if selectedFiles.length > 0}
			<div class="file-list">
				{#each selectedFiles as file, i}
					<div class="file-item">
						<div class="file-type-badge">{getFileTypeLabel(file.type)}</div>
						<div class="file-details">
							<span class="file-name">{file.name}</span>
							<span class="file-size">{formatFileSize(file.size)}</span>
						</div>
						<button class="file-remove" onclick={() => removeFile(i)} title="Remove file">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				{/each}
				<div class="file-summary">
					{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} — each will create a separate report
				</div>
			</div>
		{/if}

		{#if hasApiKey === false}
			<div class="api-key-banner">
				<div class="api-key-banner-content">
					<strong>API key required for extraction</strong>
					<p>
						AI extraction uses the Claude API. Add your Anthropic API key in
						<a href="/settings" onclick={() => goto('/settings')}>Settings</a> to continue.
					</p>
				</div>
			</div>
		{/if}

		{#if extractionError}
			<div class="error-msg">{extractionError}</div>
		{/if}

		<div class="form-actions">
			<button class="btn btn-primary" onclick={startExtraction} disabled={selectedFiles.length === 0 || hasApiKey === false}>
				Extract Results
			</button>
		</div>
	</div>

<!-- Step 2b: Extracting -->
{:else if mode === 'extracting'}
	<div class="card extracting-card">
		<div class="spinner"></div>
		<p class="progress-text">{extractionProgress}</p>
		<p class="progress-hint">
			This typically takes 5–15 seconds per file. The AI is reading each report and identifying every test result.
		</p>
	</div>

<!-- Step 3: Review extracted results (grouped by file) -->
{:else if mode === 'review'}
	<div class="card review-header-card">
		<div class="review-stats">
			<span class="stat stat-reports">{reviewGroups.length} report{reviewGroups.length !== 1 ? 's' : ''}</span>
			<span class="stat stat-matched">{totalMatchedCount} matched</span>
			{#if totalUnmatchedCount > 0}
				<span class="stat stat-unmatched">{totalUnmatchedCount} unmatched</span>
			{/if}
			<span class="stat stat-total">{totalResultCount} total</span>
		</div>
	</div>

	{#each reviewGroups as group, gi}
		<div class="card report-group">
			<div class="group-header">
				<div class="group-title">
					<span class="group-file-name">{group.fileName}</span>
					<span class="group-count">{group.results.length} result{group.results.length !== 1 ? 's' : ''}</span>
				</div>
				{#if reviewGroups.length > 1}
					<button class="btn btn-ghost btn-sm" onclick={() => removeGroup(gi)} title="Remove this report">Remove</button>
				{/if}
			</div>

			<div class="form-row group-fields">
				<label class="form-field">
					<span>Date of blood draw</span>
					<input type="date" value={group.reportDate} onchange={(e) => updateGroupDate(gi, (e.target as HTMLInputElement).value)} />
				</label>
				<label class="form-field">
					<span>Lab name</span>
					<input type="text" value={group.labName} onchange={(e) => updateGroupLabName(gi, (e.target as HTMLInputElement).value)} placeholder="e.g. Laverty Pathology" />
				</label>
			</div>

			<div class="review-list">
				{#each group.results as result, ri}
					<div class="review-row" class:matched={result.matchedBiomarkerId} class:unmatched={!result.matchedBiomarkerId} class:low-confidence={result.confidence != null && result.confidence < 0.8 && result.confidence >= 0.6}>
						<div class="review-name">
							<div class="original-name">{result.testName}</div>
							{#if result.matchedBiomarkerId}
								{@const bio = getBiomarker(result.matchedBiomarkerId)}
								<div class="match-info">
									→ {bio?.name ?? result.matchedBiomarkerId}
									{#if result.confidence != null && result.confidence < 1}
										<span class="confidence-badge">{Math.round(result.confidence * 100)}%</span>
									{/if}
								</div>
							{:else}
								{@const pickerKey = `${gi}-${ri}`}
								<div class="match-select">
									{#if openPickerKey === pickerKey}
										<div class="biomarker-picker">
											<!-- svelte-ignore a11y_autofocus -->
										<input
												type="text"
												class="picker-search"
												placeholder="Type to search..."
												bind:value={pickerSearch}
												onkeydown={(e) => { if (e.key === 'Escape') closePicker(); }}
												onblur={() => { setTimeout(closePicker, 150); }}
												autofocus
											/>
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div class="picker-dropdown" onmousedown={(e) => e.preventDefault()}>
												{#each filteredBiomarkerGroups(pickerSearch) as group}
													<div class="picker-category">{group.category}</div>
													{#each group.biomarkers as bio}
														<button class="picker-option" onclick={() => { rematchBiomarker(gi, ri, bio.id); closePicker(); }}>
															{bio.name}
														</button>
													{/each}
												{/each}
												{#if filteredBiomarkerGroups(pickerSearch).length === 0}
													<div class="picker-empty">No matches</div>
												{/if}
											</div>
										</div>
									{:else}
										<button class="picker-trigger" onclick={() => openPicker(pickerKey)}>Select biomarker...</button>
									{/if}
								</div>
							{/if}
						</div>

						<div class="review-value">
							<input type="number" step="any" value={result.value}
								onchange={(e) => updateExtractedValue(gi, ri, parseFloat((e.target as HTMLInputElement).value))}
								class="value-input" />
							<input type="text" value={result.unit}
								onchange={(e) => updateExtractedUnit(gi, ri, (e.target as HTMLInputElement).value)}
								class="unit-input" />
						</div>

						<div class="review-ref">
							{#if result.referenceLow != null || result.referenceHigh != null}
								<span class="ref-range">Ref: {result.referenceLow ?? '—'}–{result.referenceHigh ?? '—'}</span>
							{/if}
							{#if result.flag === 'high'}
								<span class="flag flag-high">H</span>
							{:else if result.flag === 'low'}
								<span class="flag flag-low">L</span>
							{/if}
						</div>

						<button class="btn-remove" onclick={() => removeExtracted(gi, ri)} title="Remove">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/each}

	{#if error}<div class="error-msg">{error}</div>{/if}

	<div class="card save-actions-card">
		<div class="form-actions">
			<button class="btn btn-primary" onclick={saveExtracted} disabled={saving || totalMatchedCount === 0}>
				{saving ? 'Saving...' : `Save ${totalMatchedCount} Results (${reviewGroups.length} report${reviewGroups.length !== 1 ? 's' : ''})`}
			</button>
			<button class="btn btn-secondary" onclick={() => { mode = 'upload'; reviewGroups = []; selectedFiles = []; }}>
				Re-upload
			</button>
		</div>
	</div>

<!-- Manual entry -->
{:else if mode === 'manual'}
	<div class="card">
		<div class="form-section">
			<h2>Report Details</h2>
			<div class="form-row">
				<label class="form-field"><span>Date of blood draw</span><input type="date" bind:value={reportDate} /></label>
				<label class="form-field"><span>Lab name (optional)</span><input type="text" bind:value={labName} placeholder="e.g. Laverty Pathology" /></label>
			</div>
		</div>
		<div class="form-section">
			<h2>Results</h2>
			<div class="entries">
				{#each manualEntries as entry (entry.id)}
					<div class="entry-row">
						<label class="form-field biomarker-field"><span>Biomarker</span>
							<select bind:value={entry.biomarkerId} onchange={(e) => onBiomarkerSelect(entry, (e.target as HTMLSelectElement).value)}>
								<option value="">Select biomarker...</option>
								{#each biomarkerGroups as group}
									<optgroup label={group.category}>
										{#each group.biomarkers as bio}<option value={bio.id}>{bio.name}</option>{/each}
									</optgroup>
								{/each}
							</select>
						</label>
						<label class="form-field value-field"><span>Value</span><input type="number" step="any" bind:value={entry.value} placeholder="0.0" /></label>
						<label class="form-field unit-field"><span>Unit</span><input type="text" bind:value={entry.unit} placeholder="mmol/L" /></label>
						{#if manualEntries.length > 1}
							<button class="btn-remove" onclick={() => removeManualEntry(entry.id)} title="Remove">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
							</button>
						{/if}
					</div>
				{/each}
			</div>
			<button class="btn btn-ghost" onclick={addManualEntry}>+ Add another result</button>
		</div>
		{#if error}<div class="error-msg">{error}</div>{/if}
		<div class="form-actions">
			<button class="btn btn-primary" onclick={saveManual} disabled={saving}>{saving ? 'Saving...' : 'Save Results'}</button>
			<a href="/" class="btn btn-secondary">Cancel</a>
		</div>
	</div>
{/if}

<style>
	.mode-chooser {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.25rem;
	}

	.mode-card {
		text-align: left;
		cursor: pointer;
		transition: all 0.2s;
		border: 2px solid var(--border);
		background: var(--surface-1);
		font-family: inherit;
	}

	.mode-card:hover {
		border-color: var(--primary);
		box-shadow: var(--shadow-md);
		transform: translateY(-2px);
	}

	.mode-icon-wrap {
		width: 56px;
		height: 56px;
		border-radius: 14px;
		background: var(--primary-light);
		color: var(--primary);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.mode-card h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.35rem; }
	.mode-card p { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.45; }

	/* Drop zone */
	.upload-card { padding: 0; overflow: hidden; }

	.drop-zone {
		position: relative;
		padding: 3rem 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s;
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}

	.drop-zone:hover, .drop-zone.drag-over {
		background: var(--primary-light);
	}

	.drop-zone.drag-over { outline: 2px dashed var(--primary); outline-offset: -6px; }

	.file-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.drop-prompt { pointer-events: none; }

	.drop-svg {
		color: var(--text-muted);
		margin-bottom: 0.75rem;
		opacity: 0.6;
	}

	.drop-text { font-size: 0.95rem; color: var(--text-secondary); font-weight: 500; }
	.drop-hint { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.3rem; }

	/* File list */
	.file-list { padding: 1rem 1.5rem; }

	.file-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0;
		border-bottom: 1px solid var(--surface-3);
	}

	.file-item:last-of-type { border-bottom: none; }

	.file-type-badge {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		background: var(--primary-light);
		color: var(--primary);
		flex-shrink: 0;
	}

	.file-details {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
	}

	.file-name {
		font-size: 0.88rem;
		font-weight: 500;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-size {
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.file-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		padding: 0.3rem;
		border-radius: 4px;
		display: flex;
		align-items: center;
		transition: all 0.15s;
	}

	.file-remove:hover { color: var(--danger); background: rgba(239, 68, 68, 0.08); }

	.file-summary {
		font-size: 0.8rem;
		color: var(--text-muted);
		padding-top: 0.5rem;
	}

	.api-key-banner {
		margin: 0 1.5rem;
		padding: 0.9rem 1rem;
		background: rgba(245, 158, 11, 0.08);
		border: 1px solid rgba(245, 158, 11, 0.3);
		border-radius: var(--radius-sm);
	}
	.api-key-banner-content strong {
		display: block;
		font-size: 0.875rem;
		color: var(--text);
		margin-bottom: 0.2rem;
	}
	.api-key-banner-content p {
		font-size: 0.825rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.form-actions { display: flex; gap: 0.75rem; padding: 1rem 1.5rem; border-top: 1px solid var(--border); }
	.upload-card .form-actions { background: var(--surface-1); }

	/* Extracting state */
	.extracting-card { text-align: center; padding: 3rem; }
	.spinner {
		width: 44px; height: 44px;
		border: 3px solid var(--border);
		border-top-color: var(--primary);
		border-radius: 50%;
		margin: 0 auto 1.5rem;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }
	.progress-text { font-size: 1.05rem; font-weight: 500; color: var(--text); }
	.progress-hint { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem; }

	/* Review */
	.review-header-card { margin-bottom: 1rem; }
	.review-stats { display: flex; gap: 0.75rem; flex-wrap: wrap; }
	.stat { font-size: 0.85rem; font-weight: 600; padding: 0.3rem 0.75rem; border-radius: 20px; }
	.stat-reports { background: rgba(99, 102, 241, 0.1); color: #6366f1; }
	.stat-matched { background: rgba(34, 197, 94, 0.1); color: #16a34a; }
	.stat-unmatched { background: rgba(245, 158, 11, 0.1); color: #d97706; }
	.stat-total { background: var(--surface-3); color: var(--text-secondary); }

	/* Report group */
	.report-group { margin-bottom: 1rem; }
	.group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}
	.group-title { display: flex; align-items: center; gap: 0.75rem; }
	.group-file-name { font-weight: 600; font-size: 0.95rem; color: var(--text); }
	.group-count { font-size: 0.78rem; color: var(--text-muted); background: var(--surface-3); padding: 0.15rem 0.5rem; border-radius: 10px; }
	.group-fields { margin-bottom: 1.25rem; }

	.save-actions-card { margin-top: 0; }

	.review-list { display: flex; flex-direction: column; gap: 0.4rem; }
	.review-row {
		display: flex; align-items: center; gap: 1rem;
		padding: 0.7rem 0.85rem; border-radius: var(--radius-md);
		border: 1px solid var(--border); transition: background 0.15s;
	}
	.review-row.matched { background: rgba(34, 197, 94, 0.03); }
	.review-row.unmatched { background: rgba(245, 158, 11, 0.05); border-color: rgba(245, 158, 11, 0.3); }
	.review-row.low-confidence { background: rgba(245, 158, 11, 0.03); border-color: rgba(245, 158, 11, 0.2); }

	.review-name { flex: 1; min-width: 0; }
	.original-name { font-weight: 500; font-size: 0.88rem; color: var(--text); }
	.match-info { font-size: 0.78rem; color: var(--primary); margin-top: 0.1rem; }
	.confidence-badge { font-size: 0.68rem; color: var(--warning); background: rgba(245, 158, 11, 0.1); padding: 0.08rem 0.35rem; border-radius: 10px; margin-left: 0.3rem; }
	.match-select { position: relative; }
	.picker-trigger {
		font-family: inherit; font-size: 0.78rem; padding: 0.2rem 0.5rem;
		border: 1px solid var(--warning); border-radius: var(--radius-sm);
		background: var(--surface-1); color: var(--warning); cursor: pointer;
		margin-top: 0.2rem;
	}
	.picker-trigger:hover { background: rgba(245, 158, 11, 0.06); }
	.biomarker-picker { position: relative; margin-top: 0.2rem; }
	.picker-search {
		font-family: inherit; font-size: 0.8rem; padding: 0.35rem 0.5rem;
		border: 1px solid var(--primary); border-radius: var(--radius-sm);
		background: var(--surface-1); color: var(--text); width: 200px;
		outline: none;
	}
	.picker-dropdown {
		position: absolute; top: 100%; left: 0; z-index: 100;
		width: 240px; max-height: 260px; overflow-y: auto;
		background: var(--surface-1); border: 1px solid var(--border);
		border-radius: var(--radius-md); box-shadow: 0 8px 24px rgba(0,0,0,0.12);
		margin-top: 2px;
	}
	.picker-category {
		font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
		letter-spacing: 0.04em; color: var(--text-muted); padding: 0.5rem 0.65rem 0.2rem;
		position: sticky; top: 0; background: var(--surface-1);
	}
	.picker-option {
		display: block; width: 100%; text-align: left; padding: 0.35rem 0.65rem;
		font-family: inherit; font-size: 0.82rem; border: none; background: none;
		color: var(--text); cursor: pointer;
	}
	.picker-option:hover { background: var(--primary-light); color: var(--primary); }
	.picker-empty { font-size: 0.8rem; color: var(--text-muted); padding: 0.75rem; text-align: center; }
	.review-value { display: flex; gap: 0.35rem; align-items: center; flex-shrink: 0; }
	.value-input { width: 80px; padding: 0.3rem 0.45rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.88rem; font-variant-numeric: tabular-nums; text-align: right; background: var(--surface-1); color: var(--text); font-family: inherit; }
	.unit-input { width: 60px; padding: 0.3rem 0.35rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--text-muted); background: var(--surface-1); font-family: inherit; }
	.review-ref { display: flex; gap: 0.4rem; align-items: center; flex-shrink: 0; }
	.ref-range { font-size: 0.72rem; color: var(--text-muted); }
	.flag { font-size: 0.65rem; font-weight: 800; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
	.flag-high { background: rgba(239, 68, 68, 0.12); color: #dc2626; }
	.flag-low { background: rgba(245, 158, 11, 0.12); color: #d97706; }

	.btn-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.3rem; border-radius: 4px; display: flex; align-items: center; flex-shrink: 0; transition: all 0.15s; }
	.btn-remove:hover { color: var(--danger); background: rgba(239, 68, 68, 0.08); }

	/* Shared form styles */
	.form-section { margin-bottom: 2rem; }
	.form-section h2 { font-size: 0.8rem; font-weight: 600; margin-bottom: 1rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
	.section-hint { font-size: 0.85rem; color: var(--text-muted); margin-top: -0.5rem; margin-bottom: 1rem; }
	.form-row { display: flex; gap: 1rem; flex-wrap: wrap; }
	.form-field { display: flex; flex-direction: column; gap: 0.3rem; }
	.form-field span { font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); }
	.entry-row { display: flex; gap: 0.75rem; align-items: flex-end; margin-bottom: 0.75rem; }
	.biomarker-field { flex: 2; }
	.value-field { flex: 1; max-width: 120px; }
	.unit-field { flex: 1; max-width: 100px; }
	select { font-family: inherit; font-size: 0.9rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-1); color: var(--text); }
	.error-msg { color: var(--danger); font-size: 0.9rem; margin-bottom: 1rem; padding: 0.75rem; background: rgba(239, 68, 68, 0.05); border-radius: var(--radius-sm); }

	.btn-sm { font-size: 0.78rem; padding: 0.3rem 0.6rem; }
</style>
