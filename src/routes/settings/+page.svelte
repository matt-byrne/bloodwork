<script lang="ts">
	import { onMount } from 'svelte';
	import { v4 as uuid } from 'uuid';
	import { getAllBiomarkers, getBiomarker } from '$lib/core/biomarkers.ts';
	import { getAllThresholds, setThreshold, deleteThreshold, getSetting, setSetting, exportAllData, importData } from '$lib/core/db.ts';
	import type { DataExport } from '$lib/core/db.ts';
	import type { UserThreshold } from '$lib/core/types.ts';

	let thresholds = $state<UserThreshold[]>([]);

	// API Key
	let apiKey = $state('');
	let apiKeyMasked = $state('');
	let apiKeySaved = $state(false);
	let showApiKey = $state(false);

	async function loadThresholds() {
		thresholds = await getAllThresholds();
	}

	onMount(async () => {
		const [savedKey] = await Promise.all([
			getSetting<string>('anthropic-api-key'),
			loadThresholds()
		]);
		if (savedKey) {
			apiKey = savedKey;
			apiKeyMasked = savedKey.slice(0, 10) + '...' + savedKey.slice(-4);
		}
	});

	async function saveApiKey() {
		await setSetting('anthropic-api-key', apiKey);
		apiKeyMasked = apiKey.slice(0, 10) + '...' + apiKey.slice(-4);
		apiKeySaved = true;
		showApiKey = false;
		setTimeout(() => (apiKeySaved = false), 2000);
	}

	async function clearApiKey() {
		await setSetting('anthropic-api-key', '');
		apiKey = '';
		apiKeyMasked = '';
	}

	// Thresholds
	const biomarkers = getAllBiomarkers();

	let selectedBiomarker = $state('');
	let thresholdLow = $state('');
	let thresholdHigh = $state('');
	let thresholdNote = $state('');

	function onBiomarkerSelect() {
		const bio = getBiomarker(selectedBiomarker);
		if (bio) {
			const existing = thresholds.find((t) => t.biomarkerId === selectedBiomarker);
			if (existing) {
				thresholdLow = existing.low?.toString() ?? '';
				thresholdHigh = existing.high?.toString() ?? '';
				thresholdNote = existing.note ?? '';
			} else {
				thresholdLow = bio.defaultRange.low?.toString() ?? '';
				thresholdHigh = bio.defaultRange.high?.toString() ?? '';
				thresholdNote = '';
			}
		}
	}

	async function saveThreshold() {
		if (!selectedBiomarker) return;
		const bio = getBiomarker(selectedBiomarker);
		if (!bio) return;

		await setThreshold({
			id: thresholds.find((t) => t.biomarkerId === selectedBiomarker)?.id ?? uuid(),
			biomarkerId: selectedBiomarker,
			low: thresholdLow ? parseFloat(thresholdLow) : undefined,
			high: thresholdHigh ? parseFloat(thresholdHigh) : undefined,
			unit: bio.defaultUnit,
			note: thresholdNote || undefined
		});
		await loadThresholds();
	}

	async function removeThreshold(biomarkerId: string) {
		await deleteThreshold(biomarkerId);
		await loadThresholds();
	}

	// Data export/import
	let importStatus = $state<'idle' | 'success' | 'error'>('idle');
	let importMessage = $state('');
	let exportStatus = $state<'idle' | 'done'>('idle');

	async function handleExport() {
		const data = await exportAllData();
		const json = JSON.stringify(data, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `bloodwork-export-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
		exportStatus = 'done';
		setTimeout(() => (exportStatus = 'idle'), 2000);
	}

	async function handleImport(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			const text = await file.text();
			const data: DataExport = JSON.parse(text);
			if (data.version !== 1) throw new Error('Unknown export format');
			const result = await importData(data);
			importStatus = 'success';
			importMessage = `Imported ${result.imported} records (${result.skipped} already existed).`;
		} catch (err) {
			importStatus = 'error';
			importMessage = err instanceof Error ? err.message : 'Import failed.';
		}
		input.value = '';
		setTimeout(() => { importStatus = 'idle'; importMessage = ''; }, 4000);
	}
</script>

<svelte:head>
	<title>Settings — Bloodwork</title>
</svelte:head>

<div class="page-header">
	<h1>Settings</h1>
</div>

<!-- API Key -->
<div class="card settings-section">
	<h2>AI Extraction</h2>
	<p class="section-desc">
		Provide your Anthropic API key to enable AI-powered extraction from pathology reports.
		Your key is stored locally in your browser and never sent to any server except the Anthropic API.
	</p>

	<div class="api-key-form">
		{#if apiKeyMasked && !showApiKey}
			<div class="api-key-display">
				<code class="api-key-masked">{apiKeyMasked}</code>
				<button class="btn btn-ghost btn-sm" onclick={() => (showApiKey = true)}>Edit</button>
				<button class="btn btn-ghost btn-sm" onclick={clearApiKey}>Remove</button>
			</div>
		{:else}
			<label class="form-field api-key-field">
				<span>Anthropic API Key</span>
				<input
					type="password"
					bind:value={apiKey}
					placeholder="sk-ant-..."
					autocomplete="off"
				/>
			</label>
			<button class="btn btn-primary" onclick={saveApiKey} disabled={!apiKey.trim()}>
				Save Key
			</button>
			{#if showApiKey}
				<button class="btn btn-ghost" onclick={() => (showApiKey = false)}>Cancel</button>
			{/if}
		{/if}
		{#if apiKeySaved}
			<span class="saved-indicator">Saved</span>
		{/if}
	</div>
</div>

<!-- Custom Thresholds -->
<div class="card settings-section">
	<h2>Custom Thresholds</h2>
	<p class="section-desc">
		Override default reference ranges with targets from your doctor. These appear as dashed lines on your charts.
	</p>

	<div class="threshold-form">
		<label class="form-field">
			<span>Biomarker</span>
			<select bind:value={selectedBiomarker} onchange={onBiomarkerSelect}>
				<option value="">Select...</option>
				{#each biomarkers as bio}
					<option value={bio.id}>{bio.name}</option>
				{/each}
			</select>
		</label>
		<label class="form-field">
			<span>Lower limit</span>
			<input type="number" step="any" bind:value={thresholdLow} placeholder="Optional" />
		</label>
		<label class="form-field">
			<span>Upper limit</span>
			<input type="number" step="any" bind:value={thresholdHigh} placeholder="Optional" />
		</label>
		<label class="form-field">
			<span>Note</span>
			<input type="text" bind:value={thresholdNote} placeholder="e.g. Cardiologist target" />
		</label>
		<button class="btn btn-primary" onclick={saveThreshold} disabled={!selectedBiomarker}>
			Save
		</button>
	</div>

	{#if thresholds.length > 0}
		<h3>Active Thresholds</h3>
		<table class="thresholds-table">
			<thead>
				<tr>
					<th>Biomarker</th>
					<th>Low</th>
					<th>High</th>
					<th>Note</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each thresholds as t}
					{@const bio = getBiomarker(t.biomarkerId)}
					<tr>
						<td>{bio?.name ?? t.biomarkerId}</td>
						<td>{t.low ?? '—'}</td>
						<td>{t.high ?? '—'} {t.unit}</td>
						<td>{t.note ?? ''}</td>
						<td>
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => removeThreshold(t.biomarkerId)}
							>
								Remove
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<!-- Data export / import -->
<div class="card settings-section">
	<h2>Data</h2>
	<p class="section-desc">
		Export your data as a JSON file to back it up or move it to another device. Import a previously exported file to restore or merge data.
	</p>

	<div class="data-actions">
		<button class="btn btn-secondary" onclick={handleExport}>
			{exportStatus === 'done' ? 'Downloaded!' : 'Export data'}
		</button>
		<label class="btn btn-secondary file-btn">
			Import data
			<input type="file" accept=".json,application/json" onchange={handleImport} hidden />
		</label>
	</div>

	{#if importStatus === 'success'}
		<p class="import-success">{importMessage}</p>
	{:else if importStatus === 'error'}
		<p class="import-error">{importMessage}</p>
	{/if}
</div>

<style>
	.settings-section {
		margin-bottom: 1.5rem;
	}

	h2 {
		font-size: 1.05rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	h3 {
		font-size: 0.95rem;
		font-weight: 600;
		margin-top: 2rem;
		margin-bottom: 0.75rem;
	}

	.section-desc {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 1.25rem;
		line-height: 1.5;
	}

	/* API Key */
	.api-key-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: flex-end;
	}

	.api-key-field {
		flex: 1;
		min-width: 280px;
	}

	.api-key-display {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.api-key-masked {
		font-size: 0.85rem;
		padding: 0.4rem 0.75rem;
		background: var(--surface-3);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
	}

	.saved-indicator {
		font-size: 0.85rem;
		color: var(--success);
		font-weight: 500;
	}

	/* Thresholds */
	.threshold-form {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: flex-end;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.form-field span {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	select {
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-1);
		color: var(--text);
	}

	.thresholds-table {
		width: 100%;
		border-collapse: collapse;
	}

	.thresholds-table th {
		text-align: left;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		padding: 0.5rem 0.75rem;
		border-bottom: 2px solid var(--border);
	}

	.thresholds-table td {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}

	.btn-sm {
		font-size: 0.8rem;
		padding: 0.3rem 0.6rem;
	}

	/* Data section */
	.data-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.file-btn {
		cursor: pointer;
	}

	.import-success {
		margin-top: 0.75rem;
		font-size: 0.875rem;
		color: var(--success);
	}

	.import-error {
		margin-top: 0.75rem;
		font-size: 0.875rem;
		color: var(--danger);
	}
</style>
