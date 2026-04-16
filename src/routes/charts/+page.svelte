<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllReports, getAllReadings, getAllMilestones, getThresholdForBiomarker } from '$lib/core/db.ts';
	import { getBiomarker, getBiomarkersByCategory } from '$lib/core/biomarkers.ts';
	import { buildChartOption, readingsToChartPoints } from '$lib/core/charting.ts';
	import Chart from '$lib/components/Chart.svelte';
	import type { Report, Reading, Milestone, UserThreshold, BiomarkerDefinition } from '$lib/core/types.ts';
	import type { ChartSeries } from '$lib/core/charting.ts';

	let reports = $state<Report[]>([]);
	let readings = $state<Reading[]>([]);
	let milestones = $state<Milestone[]>([]);
	let selectedBiomarkerIds = $state<string[]>([]);
	let showMilestones = $state(true);
	let selectorSearch = $state('');
	let collapsedCategories = $state<Set<string>>(new Set());

	onMount(async () => {
		[reports, readings, milestones] = await Promise.all([
			getAllReports(),
			getAllReadings(),
			getAllMilestones()
		]);
	});

	// Available biomarkers (those with readings), grouped by category
	const availableByCategory = $derived(() => {
		const ids = new Set(readings.map((r) => r.biomarkerId));
		const allCategories = getBiomarkersByCategory();
		const result: { category: string; biomarkers: BiomarkerDefinition[] }[] = [];
		for (const [category, biomarkers] of allCategories) {
			const withData = biomarkers.filter((b) => ids.has(b.id));
			if (withData.length > 0) {
				result.push({ category, biomarkers: withData });
			}
		}
		return result;
	});

	// Filtered by search
	const filteredByCategory = $derived(() => {
		const groups = availableByCategory();
		if (!selectorSearch.trim()) return groups;
		const q = selectorSearch.toLowerCase();
		return groups
			.map((g) => ({
				category: g.category,
				biomarkers: g.biomarkers.filter(
					(b) => b.name.toLowerCase().includes(q) || b.aliases.some((a: string) => a.toLowerCase().includes(q))
				)
			}))
			.filter((g) => g.biomarkers.length > 0);
	});

	const hasAnyData = $derived(() => availableByCategory().length > 0);
	const totalAvailable = $derived(() => availableByCategory().reduce((sum, g) => sum + g.biomarkers.length, 0));

	// Auto-select first biomarker when data loads
	$effect(() => {
		const groups = availableByCategory();
		if (groups.length > 0 && selectedBiomarkerIds.length === 0) {
			selectedBiomarkerIds = [groups[0].biomarkers[0].id];
		}
	});

	function toggleBiomarker(id: string) {
		if (selectedBiomarkerIds.includes(id)) {
			selectedBiomarkerIds = selectedBiomarkerIds.filter((b) => b !== id);
		} else {
			selectedBiomarkerIds = [...selectedBiomarkerIds, id];
		}
	}

	function selectCategory(biomarkers: BiomarkerDefinition[]) {
		const ids = biomarkers.map((b) => b.id);
		const allSelected = ids.every((id) => selectedBiomarkerIds.includes(id));
		if (allSelected) {
			selectedBiomarkerIds = selectedBiomarkerIds.filter((id) => !ids.includes(id));
		} else {
			const newIds = ids.filter((id) => !selectedBiomarkerIds.includes(id));
			selectedBiomarkerIds = [...selectedBiomarkerIds, ...newIds];
		}
	}

	function clearAll() {
		selectedBiomarkerIds = [];
	}

	function toggleCategoryCollapse(cat: string) {
		const next = new Set(collapsedCategories);
		if (next.has(cat)) next.delete(cat);
		else next.add(cat);
		collapsedCategories = next;
	}

	let thresholds = $state<Map<string, UserThreshold>>(new Map());

	$effect(() => {
		Promise.all(
			selectedBiomarkerIds.map(async (id) => {
				const t = await getThresholdForBiomarker(id);
				return [id, t] as const;
			})
		).then((results) => {
			const map = new Map<string, UserThreshold>();
			for (const [id, t] of results) {
				if (t) map.set(id, t);
			}
			thresholds = map;
		});
	});

	const chartOption = $derived(() => {
		if (selectedBiomarkerIds.length === 0) return null;

		const reportMap = new Map(reports.map((r) => [r.id, r]));
		const series: ChartSeries[] = [];

		for (const bioId of selectedBiomarkerIds) {
			const biomarker = getBiomarker(bioId);
			if (!biomarker) continue;

			const bioReadings = readings.filter((r) => r.biomarkerId === bioId);
			const points = readingsToChartPoints(bioReadings, reportMap);
			if (points.length === 0) continue;

			series.push({
				biomarker,
				points,
				threshold: thresholds.get(bioId)
			});
		}

		if (series.length === 0) return null;

		return buildChartOption({
			series,
			milestones: showMilestones ? milestones.filter((m) => m.showOnCharts) : []
		});
	});

	// Selected biomarker names for display
	const selectedNames = $derived(() => {
		return selectedBiomarkerIds
			.map((id) => getBiomarker(id)?.name ?? id)
			.slice(0, 4);
	});
</script>

<svelte:head>
	<title>Charts — Bloodwork</title>
</svelte:head>

<div class="page-header">
	<h1>Charts</h1>
</div>

{#if !hasAnyData()}
	<div class="empty-state">
		<h2>No data to chart</h2>
		<p>Add some blood test results first.</p>
		<a href="/import" class="btn btn-primary" style="margin-top:1rem">Add Results</a>
	</div>
{:else}
	<div class="chart-layout">
		<!-- Sidebar selector -->
		<div class="selector-panel card">
			<div class="selector-header">
				<span class="selector-title">Biomarkers</span>
				<span class="selector-count">{selectedBiomarkerIds.length} / {totalAvailable()}</span>
			</div>

			<input
				type="text"
				class="selector-search"
				bind:value={selectorSearch}
				placeholder="Filter..."
			/>

			<div class="selector-actions">
				{#if selectedBiomarkerIds.length > 0}
					<button class="action-link" onclick={clearAll}>Clear all</button>
				{/if}
			</div>

			<div class="selector-list">
				{#each filteredByCategory() as { category, biomarkers }}
					{@const allInCatSelected = biomarkers.every((b) => selectedBiomarkerIds.includes(b.id))}
					<div class="selector-category">
						<div class="category-row" role="button" tabindex="0" onclick={() => toggleCategoryCollapse(category)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCategoryCollapse(category); }}}>
							<span class="category-chevron" class:collapsed={collapsedCategories.has(category)}>
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
							</span>
							<span class="category-name">{category}</span>
							<span class="category-badge">{biomarkers.length}</span>
							<button
								class="category-select-all"
								onclick={(e) => { e.stopPropagation(); selectCategory(biomarkers); }}
								title={allInCatSelected ? 'Deselect all in category' : 'Select all in category'}
							>
								{allInCatSelected ? 'none' : 'all'}
							</button>
						</div>
						{#if !collapsedCategories.has(category)}
							<div class="category-items">
								{#each biomarkers as bio}
									{@const isSelected = selectedBiomarkerIds.includes(bio.id)}
									<button
										class="biomarker-item"
										class:selected={isSelected}
										onclick={() => toggleBiomarker(bio.id)}
									>
										<span class="item-check">
											{#if isSelected}
												<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
											{/if}
										</span>
										<span class="item-name">{bio.name}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<div class="selector-footer">
				<label class="toggle-label">
					<input type="checkbox" bind:checked={showMilestones} />
					Show milestones
				</label>
			</div>
		</div>

		<!-- Chart area -->
		<div class="chart-area">
			{#if selectedBiomarkerIds.length > 0}
				<div class="selected-summary">
					{#each selectedNames() as name, i}
						<span class="selected-tag">{name}</span>
					{/each}
					{#if selectedBiomarkerIds.length > 4}
						<span class="selected-tag more">+{selectedBiomarkerIds.length - 4} more</span>
					{/if}
				</div>
			{/if}

			{#if chartOption()}
				<div class="card chart-card">
					<Chart option={chartOption()} height="500px" />
				</div>
			{:else}
				<div class="empty-state">
					<p>Select at least one biomarker with data to display a chart.</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.chart-layout {
		display: grid;
		grid-template-columns: 240px 1fr;
		gap: 1.25rem;
		align-items: start;
	}

	/* --- Selector panel --- */
	.selector-panel {
		padding: 0;
		position: sticky;
		top: 1rem;
		max-height: calc(100dvh - 2rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.selector-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.85rem 1rem 0.5rem;
	}

	.selector-title {
		font-size: 0.78rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.selector-count {
		font-size: 0.72rem;
		color: var(--text-muted);
		background: var(--surface-3);
		padding: 0.1rem 0.45rem;
		border-radius: 8px;
	}

	.selector-search {
		margin: 0 0.65rem 0.5rem;
		padding: 0.4rem 0.6rem;
		font-size: 0.82rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text);
		font-family: inherit;
	}

	.selector-search:focus {
		outline: none;
		border-color: var(--primary);
		box-shadow: 0 0 0 2px var(--primary-light);
	}

	.selector-actions {
		display: flex;
		gap: 0.5rem;
		padding: 0 1rem 0.5rem;
	}

	.action-link {
		font-size: 0.72rem;
		color: var(--primary);
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		padding: 0;
	}

	.action-link:hover {
		text-decoration: underline;
	}

	.selector-list {
		flex: 1;
		overflow-y: auto;
		border-top: 1px solid var(--border);
	}

	.selector-category {
		border-bottom: 1px solid var(--surface-3);
	}

	.category-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: var(--surface-2);
		border: none;
		cursor: pointer;
		font-family: inherit;
	}

	.category-row:hover {
		background: var(--surface-3);
	}

	.category-chevron {
		color: var(--text-muted);
		transition: transform 0.2s;
		display: flex;
		flex-shrink: 0;
	}

	.category-chevron.collapsed {
		transform: rotate(-90deg);
	}

	.category-name {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-muted);
		flex: 1;
		text-align: left;
	}

	.category-badge {
		font-size: 0.65rem;
		color: var(--text-muted);
		background: var(--surface-1);
		padding: 0.05rem 0.3rem;
		border-radius: 6px;
	}

	.category-select-all {
		font-size: 0.65rem;
		color: var(--primary);
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.category-row:hover .category-select-all {
		opacity: 1;
	}

	.category-select-all:hover {
		background: var(--primary-light);
	}

	.category-items {
		display: flex;
		flex-direction: column;
	}

	.biomarker-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.75rem 0.35rem 1.6rem;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.82rem;
		color: var(--text-secondary);
		text-align: left;
		transition: all 0.1s;
	}

	.biomarker-item:hover {
		background: var(--surface-3);
		color: var(--text);
	}

	.biomarker-item.selected {
		color: var(--primary);
		font-weight: 500;
	}

	.item-check {
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--border);
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.1s;
	}

	.biomarker-item.selected .item-check {
		background: var(--primary);
		border-color: var(--primary);
		color: white;
	}

	.item-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.selector-footer {
		padding: 0.65rem 1rem;
		border-top: 1px solid var(--border);
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.82rem;
		color: var(--text-secondary);
		cursor: pointer;
	}

	/* --- Chart area --- */
	.chart-area {
		min-width: 0;
	}

	.selected-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.75rem;
	}

	.selected-tag {
		font-size: 0.72rem;
		font-weight: 500;
		padding: 0.2rem 0.55rem;
		border-radius: 12px;
		background: var(--primary-light);
		color: var(--primary);
	}

	.selected-tag.more {
		background: var(--surface-3);
		color: var(--text-muted);
	}

	.chart-card {
		padding: 1.25rem;
	}

	/* --- Responsive --- */
	@media (max-width: 768px) {
		.chart-layout {
			grid-template-columns: 1fr;
		}

		.selector-panel {
			position: static;
			max-height: none;
		}

		.selector-list {
			max-height: 300px;
		}
	}
</style>
