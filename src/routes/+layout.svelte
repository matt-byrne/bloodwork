<script lang="ts">
	import '../app.css';
	import { initBiomarkers } from '$lib/core/biomarkers.ts';
	import { initDatabase, migrateFromDexie, getSetting } from '$lib/core/db.ts';
	import { onMount } from 'svelte';
	import SetupScreen from '$lib/components/SetupScreen.svelte';

	let { children } = $props();

	let currentPath = $state('/');
	let showSetup = $state(false);
	let appReady = $state(false);

	onMount(async () => {
		initBiomarkers();
		currentPath = window.location.pathname;
		await initDatabase();
		await migrateFromDexie();
		const apiKey = await getSetting<string>('anthropic-api-key');
		if (!apiKey) {
			showSetup = true;
		}
		appReady = true;
	});

	const nav = [
		{ href: '/', label: 'Dashboard', icon: '◉' },
		{ href: '/charts', label: 'Charts', icon: '◈' },
		{ href: '/biomarkers', label: 'Biomarkers', icon: '◇' },
		{ href: '/milestones', label: 'Milestones', icon: '◆' },
		{ href: '/import', label: 'Import', icon: '+' },
		{ href: '/settings', label: 'Settings', icon: '⚙' }
	];
</script>

{#if appReady}
	<div class="app-shell">
		<nav class="sidebar">
			<div class="logo">
				<span class="logo-mark">B</span>
				<span class="logo-text">Bloodwork</span>
			</div>
			<ul class="nav-list">
				{#each nav as item}
					<li>
						<a
							href={item.href}
							class="nav-link"
							class:active={currentPath === item.href}
							onclick={() => (currentPath = item.href)}
						>
							<span class="nav-icon">{item.icon}</span>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
		<main class="main-content">
			{@render children()}
		</main>
	</div>

	{#if showSetup}
		<SetupScreen onComplete={() => (showSetup = false)} />
	{/if}
{/if}

<style>
	.app-shell {
		display: flex;
		min-height: 100dvh;
	}

	.sidebar {
		width: 220px;
		background: var(--surface-1);
		border-right: 1px solid var(--border);
		padding: 1.5rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
		position: fixed;
		top: 0;
		left: 0;
		height: 100dvh;
		z-index: 10;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0 0.5rem;
	}

	.logo-mark {
		width: 32px;
		height: 32px;
		background: var(--primary);
		color: white;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 1.1rem;
	}

	.logo-text {
		font-weight: 700;
		font-size: 1.15rem;
		color: var(--text);
	}

	.nav-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 0.9rem;
		font-weight: 500;
		transition: all 0.15s;
		text-decoration: none;
	}

	.nav-link:hover {
		background: var(--surface-3);
		color: var(--text);
		text-decoration: none;
	}

	.nav-link.active {
		background: var(--primary-light);
		color: var(--primary);
	}

	.nav-icon {
		font-size: 1rem;
		width: 1.25rem;
		text-align: center;
	}

	.main-content {
		flex: 1;
		margin-left: 220px;
		padding: 2rem 2.5rem;
		max-width: 1200px;
	}

	@media (max-width: 768px) {
		.sidebar {
			position: fixed;
			bottom: 0;
			top: auto;
			left: 0;
			right: 0;
			width: 100%;
			height: auto;
			flex-direction: row;
			padding: 0.5rem;
			border-right: none;
			border-top: 1px solid var(--border);
			z-index: 100;
		}

		.logo {
			display: none;
		}

		.nav-list {
			flex-direction: row;
			width: 100%;
			justify-content: space-around;
		}

		.nav-link {
			flex-direction: column;
			font-size: 0.7rem;
			padding: 0.4rem;
			gap: 0.2rem;
		}

		.main-content {
			margin-left: 0;
			padding: 1rem;
			padding-bottom: 5rem;
		}
	}
</style>
