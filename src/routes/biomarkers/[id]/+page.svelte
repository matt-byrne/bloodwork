<script lang="ts">
	import { page } from '$app/state';
	import { getAllReports, getReadingsForBiomarker, getAllMilestones, getThresholdForBiomarker } from '$lib/core/db.ts';
	import { getBiomarker } from '$lib/core/biomarkers.ts';
	import { buildChartOption, readingsToChartPoints } from '$lib/core/charting.ts';
	import Chart from '$lib/components/Chart.svelte';
	import BiomarkerCard from '$lib/components/BiomarkerCard.svelte';
	import type { Report, Reading, Milestone, UserThreshold } from '$lib/core/types.ts';

	const biomarkerId = $derived(page.params.id);
	const biomarker = $derived(getBiomarker(biomarkerId));

	let reports = $state<Report[]>([]);
	let readings = $state<Reading[]>([]);
	let milestones = $state<Milestone[]>([]);
	let threshold = $state<UserThreshold | undefined>();

	$effect(() => {
		const id = biomarkerId;
		if (!id) return;
		Promise.all([
			getAllReports(),
			getReadingsForBiomarker(id),
			getAllMilestones(),
			getThresholdForBiomarker(id)
		]).then(([r, rd, m, t]) => {
			reports = r;
			readings = rd;
			milestones = m;
			threshold = t;
		});
	});

	const chartOption = $derived(() => {
		if (!biomarker || readings.length < 2) return null;

		const reportMap = new Map(reports.map((r) => [r.id, r]));
		const points = readingsToChartPoints(readings, reportMap);
		if (points.length < 2) return null;

		return buildChartOption({
			series: [{ biomarker, points, threshold }],
			milestones: milestones.filter((m) => m.showOnCharts)
		});
	});

	const latestReading = $derived(() => {
		if (readings.length === 0) return null;
		const reportMap = new Map(reports.map((r) => [r.id, r]));
		let latest: { reading: Reading; date: Date } | null = null;
		for (const r of readings) {
			const report = reportMap.get(r.reportId);
			if (!report) continue;
			const d = new Date(report.date);
			if (!latest || d > latest.date) {
				latest = { reading: r, date: d };
			}
		}
		return latest;
	});

	const history = $derived(() => {
		const reportMap = new Map(reports.map((r) => [r.id, r]));
		return readings
			.map((r) => {
				const report = reportMap.get(r.reportId);
				return report ? { reading: r, date: new Date(report.date) } : null;
			})
			.filter((x): x is { reading: Reading; date: Date } => x !== null)
			.sort((a, b) => b.date.getTime() - a.date.getTime());
	});
</script>

<svelte:head>
	<title>{biomarker?.name ?? 'Biomarker'} — Bloodwork</title>
</svelte:head>

{#if !biomarker}
	<div class="empty-state">
		<h2>Biomarker not found</h2>
		<a href="/biomarkers" class="btn btn-secondary">Back to Biomarkers</a>
	</div>
{:else}
	<a href="/biomarkers" class="back-link">← All Biomarkers</a>

	<!-- Two-column layout: card + chart side by side on desktop -->
	<div class="detail-hero">
		<div class="detail-card-col">
			<BiomarkerCard
				{biomarker}
				latestValue={latestReading()?.reading.value}
				latestUnit={latestReading()?.reading.unit}
			/>
		</div>
		{#if chartOption()}
			<div class="card chart-section detail-chart-col">
				<h2>Trend</h2>
				<Chart option={chartOption()} height="320px" />
			</div>
		{/if}
	</div>

	<div class="card history-section">
		<h2>History</h2>
		{#if history().length === 0}
			<p class="no-data">No readings recorded yet.</p>
		{:else}
			<table class="history-table">
				<thead>
					<tr>
						<th>Date</th>
						<th>Value</th>
						<th>Unit</th>
						<th>Flag</th>
					</tr>
				</thead>
				<tbody>
					{#each history() as item}
						<tr>
							<td>{item.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
							<td class="value-cell">{item.reading.value}</td>
							<td>{item.reading.unit}</td>
							<td>
								{#if item.reading.flag === 'high'}
									<span class="flag-high">High</span>
								{:else if item.reading.flag === 'low'}
									<span class="flag-low">Low</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
{/if}

<style>
	.back-link {
		display: inline-block;
		margin-bottom: 1rem;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	/* Two-column hero layout */
	.detail-hero {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 1.25rem;
		align-items: start;
		margin-bottom: 1.5rem;
	}

	.detail-card-col {
		min-width: 0;
	}

	.detail-chart-col {
		min-width: 0;
	}

	.chart-section h2,
	.history-section h2 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.no-data {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.history-table {
		width: 100%;
		border-collapse: collapse;
	}

	.history-table th {
		text-align: left;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		padding: 0.5rem 0.75rem;
		border-bottom: 2px solid var(--border);
	}

	.history-table td {
		padding: 0.6rem 0.75rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}

	.value-cell {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.flag-high {
		color: var(--danger);
		font-size: 0.8rem;
		font-weight: 600;
	}

	.flag-low {
		color: var(--warning);
		font-size: 0.8rem;
		font-weight: 600;
	}

	@media (max-width: 768px) {
		.detail-hero {
			grid-template-columns: 1fr;
		}
	}
</style>
