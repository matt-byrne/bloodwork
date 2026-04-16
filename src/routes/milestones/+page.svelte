<script lang="ts">
	import { onMount } from 'svelte';
	import { v4 as uuid } from 'uuid';
	import { getAllMilestones, addMilestone, deleteMilestone, updateMilestone } from '$lib/core/db.ts';
	import type { Milestone } from '$lib/core/types.ts';

	let milestones = $state<Milestone[]>([]);

	async function loadData() {
		milestones = (await getAllMilestones()).reverse();
	}

	onMount(loadData);

	// New milestone form
	let newTitle = $state('');
	let newDate = $state(new Date().toISOString().split('T')[0]);
	let newDescription = $state('');
	let newColor = $state('#8b5cf6');
	let newShowOnCharts = $state(true);

	async function handleAdd() {
		if (!newTitle.trim()) return;

		await addMilestone({
			id: uuid(),
			date: new Date(newDate),
			title: newTitle.trim(),
			description: newDescription.trim() || undefined,
			color: newColor,
			showOnCharts: newShowOnCharts
		});

		newTitle = '';
		newDescription = '';
		newDate = new Date().toISOString().split('T')[0];
		await loadData();
	}

	async function handleDelete(id: string) {
		await deleteMilestone(id);
		await loadData();
	}

	async function toggleChart(milestone: Milestone) {
		await updateMilestone(milestone.id, { showOnCharts: !milestone.showOnCharts });
		await loadData();
	}
</script>

<svelte:head>
	<title>Milestones — Bloodwork</title>
</svelte:head>

<div class="page-header">
	<h1>Milestones</h1>
</div>

<div class="card add-form">
	<h2>Add Milestone</h2>
	<p class="form-hint">
		Record medication changes, lifestyle events, or anything that might affect your results.
	</p>
	<div class="form-grid">
		<label class="form-field">
			<span>Title</span>
			<input type="text" bind:value={newTitle} placeholder="e.g. Started Rosuvastatin 20mg" />
		</label>
		<label class="form-field">
			<span>Date</span>
			<input type="date" bind:value={newDate} />
		</label>
		<label class="form-field">
			<span>Description (optional)</span>
			<input type="text" bind:value={newDescription} placeholder="Additional details..." />
		</label>
		<label class="form-field">
			<span>Color</span>
			<input type="color" bind:value={newColor} />
		</label>
		<label class="toggle-label">
			<input type="checkbox" bind:checked={newShowOnCharts} />
			Show on charts
		</label>
	</div>
	<button class="btn btn-primary" onclick={handleAdd} disabled={!newTitle.trim()}>
		Add Milestone
	</button>
</div>

{#if milestones.length === 0}
	<div class="empty-state">
		<h2>No milestones yet</h2>
		<p>Add medication changes or other events to see them on your charts.</p>
	</div>
{:else}
	<div class="milestones-list">
		{#each milestones as milestone}
			<div class="milestone-row card">
				<div class="milestone-marker" style:background-color={milestone.color ?? '#8b5cf6'}></div>
				<div class="milestone-content">
					<div class="milestone-title">{milestone.title}</div>
					<div class="milestone-date">
						{new Date(milestone.date).toLocaleDateString('en-AU', {
							day: 'numeric',
							month: 'short',
							year: 'numeric'
						})}
					</div>
					{#if milestone.description}
						<div class="milestone-desc">{milestone.description}</div>
					{/if}
				</div>
				<div class="milestone-actions">
					<label class="toggle-label small">
						<input
							type="checkbox"
							checked={milestone.showOnCharts}
							onchange={() => toggleChart(milestone)}
						/>
						Chart
					</label>
					<button class="btn btn-ghost btn-sm" onclick={() => handleDelete(milestone.id)}>
						Delete
					</button>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.add-form {
		margin-bottom: 2rem;
	}

	.add-form h2 {
		font-size: 1.05rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.form-hint {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 1rem;
	}

	.form-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1rem;
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

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.toggle-label.small {
		font-size: 0.8rem;
	}

	.milestones-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.milestone-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
	}

	.milestone-marker {
		width: 4px;
		height: 40px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.milestone-content {
		flex: 1;
	}

	.milestone-title {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.milestone-date {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.milestone-desc {
		font-size: 0.85rem;
		color: var(--text-secondary);
		margin-top: 0.2rem;
	}

	.milestone-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.btn-sm {
		font-size: 0.8rem;
		padding: 0.3rem 0.6rem;
	}
</style>
