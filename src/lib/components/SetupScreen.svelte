<script lang="ts">
	import { setSetting } from '$lib/core/db.ts';

	let { onComplete }: { onComplete: () => void } = $props();

	let apiKey = $state('');
	let saving = $state(false);
	let error = $state('');

	async function save() {
		const trimmed = apiKey.trim();
		if (!trimmed.startsWith('sk-ant-')) {
			error = 'That doesn\'t look like an Anthropic API key — it should start with sk-ant-';
			return;
		}
		saving = true;
		error = '';
		try {
			await setSetting('anthropic-api-key', trimmed);
			onComplete();
		} catch (e) {
			error = 'Failed to save the key. Please try again.';
			saving = false;
		}
	}

	function skip() {
		onComplete();
	}
</script>

<div class="setup-overlay">
	<div class="setup-card">
		<div class="logo-wrap">
			<div class="logo-mark">B</div>
		</div>
		<h1>Welcome to Bloodwork</h1>
		<p class="subtitle">
			Track your blood test results over time. Upload pathology reports for automatic AI extraction, or enter values manually.
		</p>

		<div class="divider"></div>

		<div class="section">
			<h2>Set up AI extraction</h2>
			<p class="section-desc">
				Bloodwork uses the <strong>Claude API</strong> to read your pathology reports and extract results automatically.
				You'll need your own Anthropic API key — it takes about a minute to set up, and costs pennies per report.
			</p>
			<a href="https://console.anthropic.com/" class="get-key-link" target="_blank" rel="noopener">
				Get your API key at console.anthropic.com →
			</a>
		</div>

		<div class="key-form">
			<label class="form-field">
				<span>Anthropic API Key</span>
				<input
					type="password"
					bind:value={apiKey}
					placeholder="sk-ant-..."
					autocomplete="off"
					onkeydown={(e) => { if (e.key === 'Enter' && apiKey.trim()) save(); }}
				/>
			</label>
			{#if error}
				<p class="error">{error}</p>
			{/if}
			<div class="form-actions">
				<button class="btn btn-primary" onclick={save} disabled={!apiKey.trim() || saving}>
					{saving ? 'Saving…' : 'Save and get started'}
				</button>
				<button class="btn btn-ghost skip-btn" onclick={skip}>
					Skip for now
				</button>
			</div>
			<p class="privacy-note">
				Your key is stored locally on your device and is only sent to the Anthropic API. Nothing goes to any other server.
			</p>
		</div>

		<p class="manual-note">
			You can always set or change your key later in <strong>Settings</strong>. Manual entry works without a key.
		</p>
	</div>
</div>

<style>
	.setup-overlay {
		position: fixed;
		inset: 0;
		background: var(--surface-2);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 2rem;
	}

	.setup-card {
		background: var(--surface-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		padding: 2.5rem;
		width: 100%;
		max-width: 520px;
	}

	.logo-wrap {
		margin-bottom: 1.25rem;
	}

	.logo-mark {
		width: 44px;
		height: 44px;
		background: var(--primary);
		color: white;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 1.4rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
		margin-bottom: 0.5rem;
	}

	.subtitle {
		font-size: 0.95rem;
		color: var(--text-secondary);
		line-height: 1.6;
	}

	.divider {
		height: 1px;
		background: var(--border);
		margin: 1.75rem 0;
	}

	.section {
		margin-bottom: 1.5rem;
	}

	h2 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		margin-bottom: 0.5rem;
	}

	.section-desc {
		font-size: 0.875rem;
		color: var(--text-secondary);
		line-height: 1.6;
		margin-bottom: 0.75rem;
	}

	.get-key-link {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--primary);
	}

	.key-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.form-field span {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.form-field input {
		font-family: inherit;
		font-size: 0.9rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface-1);
		color: var(--text);
		outline: none;
		transition: border-color 0.15s;
	}

	.form-field input:focus {
		border-color: var(--primary);
	}

	.error {
		font-size: 0.85rem;
		color: var(--danger);
	}

	.form-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.skip-btn {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.privacy-note {
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.manual-note {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
		line-height: 1.5;
	}
</style>
