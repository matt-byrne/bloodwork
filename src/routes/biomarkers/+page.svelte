<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllReports, getAllReadings } from '$lib/core/db.ts';
	import { getAllBiomarkers, getBiomarkersByCategory } from '$lib/core/biomarkers.ts';
	import BiomarkerCard from '$lib/components/BiomarkerCard.svelte';
	import type { Report, Reading } from '$lib/core/types.ts';

	let reports = $state<Report[]>([]);
	let readings = $state<Reading[]>([]);
	let searchQuery = $state('');
	let showAll = $state(false);

	onMount(async () => {
		[reports, readings] = await Promise.all([getAllReports(), getAllReadings()]);
	});

	const trackedIds = $derived(() => new Set(readings.map((r) => r.biomarkerId)));

	const latestByBiomarker = $derived(() => {
		const reportMap = new Map(reports.map((r) => [r.id, r]));
		const map = new Map<string, { value: number; unit: string; date: Date }>();
		for (const reading of readings) {
			const report = reportMap.get(reading.reportId);
			if (!report) continue;
			const existing = map.get(reading.biomarkerId);
			const reportDate = new Date(report.date);
			if (!existing || reportDate > existing.date) {
				map.set(reading.biomarkerId, { value: reading.value, unit: reading.unit, date: reportDate });
			}
		}
		return map;
	});

	const filteredCategories = $derived(() => {
		const categories = getBiomarkersByCategory();
		const tracked = trackedIds();
		const q = searchQuery.toLowerCase().trim();

		const filtered = new Map<string, typeof categories extends Map<string, infer V> ? V : never>();
		for (const [cat, biomarkers] of categories) {
			let matches = biomarkers;

			// Filter to tracked-only unless showing all or searching
			if (!showAll && !q) {
				matches = matches.filter((b) => tracked.has(b.id));
			}

			// Apply search filter
			if (q) {
				matches = matches.filter(
					(b) =>
						b.name.toLowerCase().includes(q) ||
						b.category.toLowerCase().includes(q) ||
						b.aliases.some((a) => a.toLowerCase().includes(q))
				);
			}

			if (matches.length > 0) filtered.set(cat, matches);
		}
		return filtered;
	});

	const trackedCount = $derived(trackedIds().size);
</script>

<svelte:head>
	<title>Biomarkers — Bloodwork</title>
</svelte:head>

<div class="page-header">
	<h1>Biomarkers</h1>
</div>

<div class="toolbar">
	<div class="search-bar">
		<input type="text" bind:value={searchQuery} placeholder="Search biomarkers..." />
	</div>
	<div class="view-toggle">
		<button
			class="toggle-btn"
			class:active={!showAll}
			onclick={() => (showAll = false)}
		>
			My Biomarkers
			{#if trackedCount > 0}<span class="count-badge">{trackedCount}</span>{/if}
		</button>
		<button
			class="toggle-btn"
			class:active={showAll}
			onclick={() => (showAll = true)}
		>
			All Biomarkers
		</button>
	</div>
</div>

{#if [...filteredCategories()].length === 0}
	<div class="empty-state">
		{#if !showAll && !searchQuery}
			<h2>No tracked biomarkers yet</h2>
			<p>Import a blood test report or browse the full catalog to get started.</p>
			<div class="empty-actions">
				<a href="/import" class="btn btn-primary">Import Report</a>
				<button class="btn btn-secondary" onclick={() => (showAll = true)}>Browse All Biomarkers</button>
			</div>
		{:else}
			<h2>No matches found</h2>
			<p>Try a different search term.</p>
		{/if}
	</div>
{:else}
	{#each [...filteredCategories()] as [category, biomarkers]}
		<h2 class="category-title">{category}</h2>
		<div class="biomarker-grid">
			{#each biomarkers as biomarker}
				{@const latest = latestByBiomarker().get(biomarker.id)}
				<a href="/biomarkers/{biomarker.id}" class="card-link">
					<BiomarkerCard
						{biomarker}
						latestValue={latest?.value}
						latestUnit={latest?.unit}
						compact={showAll && !latest}
					/>
				</a>
			{/each}
		</div>
	{/each}
{/if}

<style>
	.toolbar {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.search-bar {
		flex: 1;
		min-width: 200px;
	}

	.search-bar input {
		width: 100%;
		max-width: 400px;
		padding: 0.6rem 1rem;
		font-size: 0.95rem;
	}

	.view-toggle {
		display: flex;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.toggle-btn {
		padding: 0.5rem 0.9rem;
		font-size: 0.82rem;
		font-weight: 500;
		font-family: inherit;
		border: none;
		background: var(--surface-1);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.toggle-btn:not(:last-child) {
		border-right: 1px solid var(--border);
	}

	.toggle-btn:hover {
		background: var(--surface-3);
	}

	.toggle-btn.active {
		background: var(--primary);
		color: white;
	}

	.count-badge {
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(255, 255, 255, 0.25);
		padding: 0.05rem 0.4rem;
		border-radius: 10px;
	}

	.toggle-btn:not(.active) .count-badge {
		background: var(--surface-3);
		color: var(--text-muted);
	}

	.empty-actions {
		margin-top: 1.5rem;
		display: flex;
		gap: 0.75rem;
		justify-content: center;
	}

	.category-title {
		font-weight: 600;
		color: var(--text-secondary);
		margin: 1.5rem 0 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.8rem;
	}

	.biomarker-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.card-link {
		text-decoration: none;
		color: inherit;
	}
</style>
