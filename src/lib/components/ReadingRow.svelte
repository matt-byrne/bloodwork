<script lang="ts">
	import type { BiomarkerDefinition } from '$lib/core/types.ts';

	interface Props {
		testName: string;
		value: number;
		unit: string;
		matchedBiomarker?: BiomarkerDefinition;
		confidence?: number;
		onUpdate?: (data: { value: number; unit: string; biomarkerId?: string }) => void;
		onRemove?: () => void;
	}

	let { testName, value, unit, matchedBiomarker, confidence, onUpdate, onRemove }: Props =
		$props();

	let editValue = $state(value);
	let editUnit = $state(unit);

	function handleValueChange() {
		onUpdate?.({ value: editValue, unit: editUnit, biomarkerId: matchedBiomarker?.id });
	}
</script>

<div class="reading-row" class:low-confidence={confidence != null && confidence < 0.8}>
	<div class="name-col">
		<span class="test-name">{testName}</span>
		{#if matchedBiomarker}
			<span class="matched" title="Matched to {matchedBiomarker.name}">
				→ {matchedBiomarker.name}
				{#if confidence != null && confidence < 1}
					<span class="confidence">({Math.round(confidence * 100)}%)</span>
				{/if}
			</span>
		{:else}
			<span class="unmatched">No match</span>
		{/if}
	</div>
	<div class="value-col">
		<input
			type="number"
			step="any"
			bind:value={editValue}
			onchange={handleValueChange}
			class="value-input"
		/>
		<input
			type="text"
			bind:value={editUnit}
			onchange={handleValueChange}
			class="unit-input"
		/>
	</div>
	<div class="actions-col">
		{#if onRemove}
			<button class="btn-remove" onclick={onRemove} title="Remove">×</button>
		{/if}
	</div>
</div>

<style>
	.reading-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--border);
	}

	.reading-row.low-confidence {
		background: rgba(245, 158, 11, 0.05);
		border-radius: 8px;
		padding: 0.75rem;
		margin: 0 -0.75rem;
	}

	.name-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.test-name {
		font-weight: 500;
		color: var(--text);
	}

	.matched {
		font-size: 0.8rem;
		color: var(--primary);
	}

	.confidence {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.unmatched {
		font-size: 0.8rem;
		color: var(--warning);
		font-style: italic;
	}

	.value-col {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.value-input {
		width: 90px;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
		background: var(--surface-1);
		color: var(--text);
	}

	.unit-input {
		width: 70px;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 0.85rem;
		color: var(--text-muted);
		background: var(--surface-1);
	}

	.btn-remove {
		background: none;
		border: none;
		font-size: 1.25rem;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	.btn-remove:hover {
		color: var(--danger);
		background: rgba(239, 68, 68, 0.1);
	}
</style>
