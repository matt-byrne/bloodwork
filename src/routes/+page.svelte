<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllReports, getAllReadings, getAllMilestones, deleteReport } from '$lib/core/db.ts';
	import { getBiomarker, getBiomarkersByCategory } from '$lib/core/biomarkers.ts';
	import { buildChartOption, readingsToChartPoints } from '$lib/core/charting.ts';
	import Chart from '$lib/components/Chart.svelte';
	import BiomarkerCard from '$lib/components/BiomarkerCard.svelte';
	import type { Report, Reading, Milestone, BiomarkerDefinition } from '$lib/core/types.ts';

	let reports = $state<Report[]>([]);
	let readings = $state<Reading[]>([]);
	let milestones = $state<Milestone[]>([]);
	let ready = $state(false);
	let confirmDeleteId = $state<string | null>(null);
	let expandedGroupKey = $state<string | null>(null);
	let collapsedCategories = $state<Set<string>>(new Set());

	async function loadData() {
		[reports, readings, milestones] = await Promise.all([
			getAllReports(),
			getAllReadings(),
			getAllMilestones()
		]);
		ready = true;
	}

	onMount(loadData);

	async function handleDelete(reportId: string) {
		await deleteReport(reportId);
		confirmDeleteId = null;
		await loadData();
	}

	function toggleCategory(cat: string) {
		const next = new Set(collapsedCategories);
		if (next.has(cat)) next.delete(cat);
		else next.add(cat);
		collapsedCategories = next;
	}

	// --- Latest results by biomarker ---
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

	// --- Tracked biomarkers grouped by category (only those with data) ---
	const trackedByCategory = $derived(() => {
		const tracked = latestByBiomarker();
		const allCategories = getBiomarkersByCategory();
		const result: { category: string; biomarkers: BiomarkerDefinition[] }[] = [];
		for (const [category, biomarkers] of allCategories) {
			const withData = biomarkers.filter((b) => tracked.has(b.id));
			if (withData.length > 0) {
				result.push({ category, biomarkers: withData });
			}
		}
		return result;
	});

	// --- Smart chart: find biomarker with most readings (prefer LDL if available) ---
	const heroChartData = $derived(() => {
		const reportMap = new Map(reports.map((r) => [r.id, r]));

		// Group readings by biomarker
		const byBiomarker = new Map<string, Reading[]>();
		for (const r of readings) {
			const arr = byBiomarker.get(r.biomarkerId) ?? [];
			arr.push(r);
			byBiomarker.set(r.biomarkerId, arr);
		}

		// Prefer LDL, then pick biomarker with most readings
		let bestId = 'ldl-cholesterol';
		if (!byBiomarker.has(bestId) || (byBiomarker.get(bestId)?.length ?? 0) < 2) {
			bestId = '';
			let bestCount = 0;
			for (const [id, arr] of byBiomarker) {
				if (arr.length > bestCount) {
					bestCount = arr.length;
					bestId = id;
				}
			}
		}

		if (!bestId) return null;
		const bioReadings = byBiomarker.get(bestId);
		if (!bioReadings || bioReadings.length < 2) return null;

		const biomarker = getBiomarker(bestId);
		if (!biomarker) return null;

		const points = readingsToChartPoints(bioReadings, reportMap);
		if (points.length < 2) return null;

		return {
			biomarker,
			option: buildChartOption({
				series: [{ biomarker, points }],
				milestones: milestones.filter((m) => m.showOnCharts)
			})
		};
	});

	// --- Summary stats ---
	const summaryStats = $derived(() => {
		const tracked = latestByBiomarker();
		let outOfRange = 0;
		for (const [bioId, data] of tracked) {
			const bio = getBiomarker(bioId);
			if (!bio) continue;
			const range = bio.defaultRange;
			if (range.high != null && data.value > range.high) outOfRange++;
			else if (range.low != null && data.value < range.low) outOfRange++;
		}
		return {
			totalTracked: tracked.size,
			totalReports: reports.length,
			outOfRange,
			lastReportDate: reports.length > 0 ? new Date(reports[0].date) : null
		};
	});

	// --- Merged reports: group by date + fuzzy lab name ---
	function normaliseLabName(name?: string): string {
		if (!name) return '';
		return name.toLowerCase().replace(/[^a-z0-9]/g, '');
	}

	interface MergedReport {
		key: string;
		date: Date;
		labName?: string;
		reportIds: string[];
		totalReadings: number;
		sourceTypes: Set<string>;
	}

	const mergedReports = $derived(() => {
		const groups = new Map<string, MergedReport>();
		for (const report of reports) {
			const dateStr = new Date(report.date).toISOString().split('T')[0];
			const normLab = normaliseLabName(report.labName);
			const key = `${dateStr}::${normLab}`;
			const existing = groups.get(key);
			const count = readings.filter((r) => r.reportId === report.id).length;
			if (existing) {
				existing.reportIds.push(report.id);
				existing.totalReadings += count;
				existing.sourceTypes.add(report.sourceType);
				if (report.labName && (!existing.labName || report.labName.length > existing.labName.length)) {
					existing.labName = report.labName;
				}
			} else {
				groups.set(key, {
					key,
					date: new Date(report.date),
					labName: report.labName,
					reportIds: [report.id],
					totalReadings: count,
					sourceTypes: new Set([report.sourceType])
				});
			}
		}
		return [...groups.values()];
	});

	// --- Readings for an expanded report group ---
	function getGroupReadings(reportIds: string[]) {
		const idSet = new Set(reportIds);
		return readings
			.filter((r) => idSet.has(r.reportId))
			.map((r) => {
				const bio = getBiomarker(r.biomarkerId);
				return { ...r, biomarkerName: bio?.name ?? r.biomarkerId, category: bio?.category ?? '' };
			})
			.sort((a, b) => a.category.localeCompare(b.category) || a.biomarkerName.localeCompare(b.biomarkerName));
	}
</script>

<svelte:head>
	<title>Dashboard — Bloodwork</title>
</svelte:head>

<div class="page-header">
	<h1>Dashboard</h1>
	<a href="/import" class="btn btn-primary">+ Add Results</a>
</div>

{#if !ready}
	<p>Loading...</p>
{:else if readings.length === 0}
	<div class="empty-state">
		<div class="empty-icon">
			<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
		</div>
		<h2>No blood test results yet</h2>
		<p>Import a pathology report or manually add your first results to get started.</p>
		<div class="empty-actions">
			<a href="/import" class="btn btn-primary">Import Report</a>
		</div>
	</div>
{:else}
	<!-- Hero: chart + summary side by side -->
	<div class="hero-row">
		{#if heroChartData()}
			<div class="card chart-card hero-chart">
				<h2>{heroChartData()?.biomarker.name} Trend</h2>
				<Chart option={heroChartData()!.option} height="300px" />
			</div>
		{/if}
		<div class="summary-panel">
			<div class="stat-card card">
				<div class="stat-value">{summaryStats().totalTracked}</div>
				<div class="stat-label">Tracked Biomarkers</div>
			</div>
			<div class="stat-card card">
				<div class="stat-value">{summaryStats().totalReports}</div>
				<div class="stat-label">Reports</div>
			</div>
			<div class="stat-card card" class:warning-stat={summaryStats().outOfRange > 0}>
				<div class="stat-value">{summaryStats().outOfRange}</div>
				<div class="stat-label">Out of Range</div>
			</div>
			{#if summaryStats().lastReportDate}
				<div class="stat-card card">
					<div class="stat-value stat-date">
						{summaryStats().lastReportDate!.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
					</div>
					<div class="stat-label">Last Report</div>
				</div>
			{/if}
		</div>
	</div>

	<h2 class="section-title">Latest Results</h2>
	{#each trackedByCategory() as { category, biomarkers }}
		<button class="category-header" onclick={() => toggleCategory(category)}>
			<span class="category-label">{category}</span>
			<span class="category-count">{biomarkers.length}</span>
			<span class="category-chevron" class:collapsed={collapsedCategories.has(category)}>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
			</span>
		</button>
		{#if !collapsedCategories.has(category)}
			<div class="biomarker-grid">
				{#each biomarkers as biomarker}
					{@const latest = latestByBiomarker().get(biomarker.id)}
					<a href="/biomarkers/{biomarker.id}" class="card-link">
						<BiomarkerCard {biomarker} latestValue={latest?.value} latestUnit={latest?.unit} compact />
					</a>
				{/each}
			</div>
		{/if}
	{/each}

	<div class="section-header">
		<h2 class="section-title">Reports</h2>
	</div>
	<div class="reports-list">
		{#each mergedReports() as group}
			<div class="report-group-wrap">
				<div class="report-row card" class:expanded={expandedGroupKey === group.key}>
					<button class="report-expand" onclick={() => expandedGroupKey = expandedGroupKey === group.key ? null : group.key} title="Show results">
						<span class="expand-chevron" class:open={expandedGroupKey === group.key}>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 6 15 12 9 18"/></svg>
						</span>
					</button>
					<div class="report-date">
						{group.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
					</div>
					<div class="report-meta">
						{#if group.labName}<span class="report-lab">{group.labName}</span>{/if}
						{#each [...group.sourceTypes] as st}
							<span class="report-source-badge">{st}</span>
						{/each}
					</div>
					<div class="report-count">{group.totalReadings} result{group.totalReadings !== 1 ? 's' : ''}</div>
					<div class="report-actions">
						{#if confirmDeleteId && group.reportIds.includes(confirmDeleteId)}
							<button class="btn btn-danger btn-sm" onclick={async () => { for (const id of group.reportIds) await handleDelete(id); }}>Delete all</button>
							<button class="btn btn-ghost btn-sm" onclick={() => (confirmDeleteId = null)}>Cancel</button>
						{:else}
							<button class="btn btn-ghost btn-sm btn-delete" onclick={() => (confirmDeleteId = group.reportIds[0])} title="Delete report and all its results">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
							</button>
						{/if}
					</div>
				</div>

				{#if expandedGroupKey === group.key}
					<div class="report-detail card">
						<table class="readings-table">
							<thead>
								<tr><th>Biomarker</th><th class="val-col">Value</th><th class="unit-col">Unit</th><th class="flag-col">Flag</th></tr>
							</thead>
							<tbody>
								{#each getGroupReadings(group.reportIds) as reading}
									<tr>
										<td>
											<a href="/biomarkers/{reading.biomarkerId}" class="reading-link">{reading.biomarkerName}</a>
										</td>
										<td class="val-col">{reading.value}</td>
										<td class="unit-col">{reading.unit}</td>
										<td class="flag-col">
											{#if reading.flag === 'high'}<span class="flag flag-high">H</span>
											{:else if reading.flag === 'low'}<span class="flag flag-low">L</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.empty-icon { margin-bottom: 1rem; opacity: 0.25; color: var(--text-muted); }
	.empty-state h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
	.empty-actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; justify-content: center; }

	/* --- Hero row: chart + summary --- */
	.hero-row {
		display: grid;
		grid-template-columns: 1fr 200px;
		gap: 1.25rem;
		margin-bottom: 2rem;
		align-items: start;
	}

	.hero-chart { min-width: 0; }
	.chart-card h2 { font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; }

	.summary-panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.stat-card {
		padding: 0.85rem 1rem;
		text-align: center;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.stat-date {
		font-size: 1.15rem;
	}

	.stat-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-top: 0.15rem;
	}

	.warning-stat {
		border-color: var(--warning);
	}

	.warning-stat .stat-value {
		color: var(--warning);
	}

	.section-header { display: flex; align-items: center; justify-content: space-between; }
	.section-title { font-size: 1.1rem; font-weight: 600; margin: 1.5rem 0 1rem; }

	/* --- Category collapsible headers --- */
	.category-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem 0;
		margin-top: 0.5rem;
		font-family: inherit;
	}
	.category-label {
		font-size: 0.78rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}
	.category-count {
		font-size: 0.7rem;
		color: var(--text-muted);
		background: var(--surface-3);
		padding: 0.1rem 0.4rem;
		border-radius: 8px;
	}
	.category-chevron {
		margin-left: auto;
		color: var(--text-muted);
		transition: transform 0.2s;
		display: flex;
	}
	.category-chevron.collapsed { transform: rotate(-90deg); }

	.biomarker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; margin-bottom: 0.5rem; }
	.card-link { text-decoration: none; color: inherit; }

	/* --- Reports list --- */
	.reports-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.report-group-wrap { display: flex; flex-direction: column; }
	.report-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1.25rem; }
	.report-row.expanded { border-bottom-left-radius: 0; border-bottom-right-radius: 0; margin-bottom: 0; }
	.report-expand {
		background: none; border: none; cursor: pointer; padding: 0.25rem;
		color: var(--text-muted); display: flex; align-items: center;
	}
	.expand-chevron { transition: transform 0.2s; display: flex; }
	.expand-chevron.open { transform: rotate(90deg); }
	.report-date { font-weight: 600; min-width: 110px; font-size: 0.9rem; }
	.report-meta { flex: 1; display: flex; gap: 0.75rem; align-items: center; }
	.report-lab { color: var(--text-secondary); font-size: 0.88rem; }
	.report-source-badge {
		font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
		letter-spacing: 0.05em; padding: 0.15rem 0.45rem; border-radius: 4px;
		background: var(--surface-3); color: var(--text-muted);
	}
	.report-count { font-size: 0.82rem; color: var(--text-muted); min-width: 70px; }
	.report-actions { display: flex; gap: 0.4rem; align-items: center; }
	.btn-sm { font-size: 0.78rem; padding: 0.3rem 0.6rem; }
	.btn-delete { color: var(--text-muted); }
	.btn-delete:hover { color: var(--danger); background: rgba(239, 68, 68, 0.08); }

	/* --- Report detail / expanded readings --- */
	.report-detail {
		border-top: 1px solid var(--border);
		border-top-left-radius: 0;
		border-top-right-radius: 0;
		padding: 0.5rem 1.25rem 1rem;
		margin-top: -1px;
	}
	.readings-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
	.readings-table th {
		text-align: left; padding: 0.4rem 0.5rem; font-size: 0.72rem; font-weight: 600;
		text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted);
		border-bottom: 1px solid var(--border);
	}
	.readings-table td { padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--surface-3); }
	.readings-table tr:last-child td { border-bottom: none; }
	.val-col { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; width: 80px; }
	.unit-col { width: 70px; color: var(--text-muted); font-size: 0.8rem; }
	.flag-col { width: 30px; text-align: center; }
	.flag { font-size: 0.65rem; font-weight: 800; width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
	.flag-high { background: rgba(239, 68, 68, 0.12); color: #dc2626; }
	.flag-low { background: rgba(245, 158, 11, 0.12); color: #d97706; }
	.reading-link { color: var(--primary); text-decoration: none; }
	.reading-link:hover { text-decoration: underline; }

	/* --- Responsive --- */
	@media (max-width: 768px) {
		.hero-row {
			grid-template-columns: 1fr;
		}

		.summary-panel {
			flex-direction: row;
			flex-wrap: wrap;
		}

		.stat-card {
			flex: 1;
			min-width: 80px;
		}
	}
</style>
