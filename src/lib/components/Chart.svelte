<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as echarts from 'echarts';

	interface Props {
		option: Record<string, unknown>;
		height?: string;
		class?: string;
	}

	let { option, height = '400px', class: className = '' }: Props = $props();

	let container: HTMLDivElement;
	let chart: echarts.ECharts | undefined;
	let resizeObserver: ResizeObserver | undefined;

	onMount(() => {
		chart = echarts.init(container, undefined, { renderer: 'canvas', devicePixelRatio: window.devicePixelRatio });
		chart.setOption(option);

		resizeObserver = new ResizeObserver(() => {
			chart?.resize();
		});
		resizeObserver.observe(container);
	});

	$effect(() => {
		if (chart && option) {
			chart.setOption(option, { notMerge: true });
		}
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		chart?.dispose();
	});
</script>

<div bind:this={container} class="chart-container {className}" style:height></div>

<style>
	.chart-container {
		width: 100%;
		min-height: 300px;
	}
</style>
