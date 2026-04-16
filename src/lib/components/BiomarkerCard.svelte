<script lang="ts">
	import type { BiomarkerDefinition } from '$lib/core/types.ts';

	interface Props {
		biomarker: BiomarkerDefinition;
		latestValue?: number;
		latestUnit?: string;
		compact?: boolean;
	}

	let { biomarker, latestValue, latestUnit, compact = false }: Props = $props();

	const isOutOfRange = $derived(() => {
		if (latestValue == null) return false;
		const range = biomarker.defaultRange;
		if (range.high != null && latestValue > range.high) return true;
		if (range.low != null && latestValue < range.low) return true;
		return false;
	});
</script>

<div class="biomarker-card" class:compact class:warning={isOutOfRange()}>
	<div class="header">
		<span class="category">{biomarker.category}</span>
		<h3>{biomarker.name}</h3>
	</div>
	{#if latestValue != null}
		<div class="value">
			<span class="number">{latestValue}</span>
			<span class="unit">{latestUnit ?? biomarker.defaultUnit}</span>
		</div>
	{/if}
	{#if compact && latestValue != null}
		<div class="range-inline">
			{biomarker.defaultRange.low ?? '—'}–{biomarker.defaultRange.high ?? '—'} {biomarker.defaultRange.unit}
		</div>
	{/if}
	{#if !compact}
		<p class="description">{biomarker.description}</p>
		<details class="why-it-matters">
			<summary>Why it matters</summary>
			<p>{biomarker.whyItMatters}</p>
		</details>
		<div class="range">
			Reference: {biomarker.defaultRange.low ?? '—'}–{biomarker.defaultRange.high ?? '—'} {biomarker.defaultRange.unit}
		</div>
	{/if}
</div>

<style>
	.biomarker-card {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.25rem;
		transition: box-shadow 0.2s, border-color 0.2s;
	}

	.biomarker-card:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	}

	.biomarker-card.warning {
		border-color: var(--warning);
	}

	.biomarker-card.compact {
		padding: 0.75rem 1rem;
	}

	.header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.category {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		font-weight: 600;
	}

	h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text);
	}

	.compact h3 {
		font-size: 0.95rem;
	}

	.value {
		margin-top: 0.5rem;
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
	}

	.number {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.compact .number {
		font-size: 1.25rem;
	}

	.unit {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.description {
		margin-top: 0.75rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.why-it-matters {
		margin-top: 0.5rem;
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	.why-it-matters summary {
		cursor: pointer;
		font-weight: 500;
		color: var(--primary);
	}

	.why-it-matters p {
		margin-top: 0.35rem;
		line-height: 1.5;
	}

	.range-inline {
		font-size: 0.72rem;
		color: var(--text-muted);
		margin-top: 0.2rem;
	}

	.range {
		margin-top: 0.75rem;
		font-size: 0.8rem;
		color: var(--text-muted);
		padding: 0.35rem 0.6rem;
		background: var(--surface-2);
		border-radius: 6px;
		display: inline-block;
	}
</style>
