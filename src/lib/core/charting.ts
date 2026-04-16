import type { Reading, Milestone, UserThreshold, BiomarkerDefinition } from './types.ts';
import type { Report } from './types.ts';

export interface ChartDataPoint {
	date: Date;
	value: number;
}

export interface ChartSeries {
	biomarker: BiomarkerDefinition;
	points: ChartDataPoint[];
	threshold?: UserThreshold;
}

export interface ChartConfig {
	series: ChartSeries[];
	milestones: Milestone[];
	dateRange?: { start: Date; end: Date };
}

// Vibrant, high-contrast palette designed for medical data viz
const PALETTE = [
	{ line: '#6366f1', glow: 'rgba(99, 102, 241, 0.35)', fill: 'rgba(99, 102, 241, 0.08)', fillEnd: 'rgba(99, 102, 241, 0)' },
	{ line: '#ec4899', glow: 'rgba(236, 72, 153, 0.35)', fill: 'rgba(236, 72, 153, 0.08)', fillEnd: 'rgba(236, 72, 153, 0)' },
	{ line: '#14b8a6', glow: 'rgba(20, 184, 166, 0.35)', fill: 'rgba(20, 184, 166, 0.08)', fillEnd: 'rgba(20, 184, 166, 0)' },
	{ line: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)', fill: 'rgba(245, 158, 11, 0.08)', fillEnd: 'rgba(245, 158, 11, 0)' },
	{ line: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.35)', fill: 'rgba(139, 92, 246, 0.08)', fillEnd: 'rgba(139, 92, 246, 0)' },
	{ line: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)', fill: 'rgba(6, 182, 212, 0.08)', fillEnd: 'rgba(6, 182, 212, 0)' },
];

export function buildChartOption(config: ChartConfig, darkMode: boolean = false) {
	const { series, milestones } = config;

	const textColor = darkMode ? '#e2e8f0' : '#475569';
	const textColorStrong = darkMode ? '#f1f5f9' : '#1e293b';
	const gridLineColor = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
	const tooltipBg = darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.97)';
	const tooltipBorder = darkMode ? 'rgba(51, 65, 85, 0.6)' : 'rgba(226, 232, 240, 0.8)';

	const echartsSeries: unknown[] = series.map((s, i) => {
		const palette = PALETTE[i % PALETTE.length];
		const data = s.points.map((p) => [p.date.getTime(), p.value]);

		const markLineData: unknown[] = [];
		const markAreaData: unknown[][] = [];

		// Threshold / reference range treatment
		const range = s.threshold
			? { low: s.threshold.low, high: s.threshold.high, isCustom: true, note: s.threshold.note }
			: s.biomarker.defaultRange
				? { low: s.biomarker.defaultRange.low, high: s.biomarker.defaultRange.high, isCustom: false, note: undefined }
				: null;

		if (range) {
			// Shaded "normal" band between low and high
			const hasLow = range.low != null && range.low > 0;
			const hasHigh = range.high != null && range.high < 900;

			if (hasLow && hasHigh) {
				markAreaData.push([
					{
						yAxis: range.low,
						itemStyle: {
							color: darkMode ? 'rgba(34, 197, 94, 0.04)' : 'rgba(34, 197, 94, 0.035)'
						}
					},
					{ yAxis: range.high }
				]);
			}

			// Threshold lines
			if (hasHigh) {
				const isCustom = range.isCustom;
				markLineData.push({
					yAxis: range.high,
					name: range.note ?? (isCustom ? 'Target' : 'Ref'),
					lineStyle: {
						color: isCustom ? '#ef4444' : 'rgba(239,68,68,0.3)',
						type: isCustom ? [8, 4] : [4, 4],
						width: isCustom ? 1.5 : 1
					},
					label: {
						formatter: isCustom
							? `${range.note ?? 'Target'}: {c}`
							: '{c}',
						position: 'insideEndTop',
						color: isCustom ? '#ef4444' : 'rgba(239,68,68,0.5)',
						fontSize: isCustom ? 11 : 10,
						fontWeight: isCustom ? 600 : 400,
						backgroundColor: isCustom ? (darkMode ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.85)') : 'transparent',
						padding: isCustom ? [2, 6] : 0,
						borderRadius: 3
					}
				});
			}

			if (hasLow) {
				const isCustom = range.isCustom;
				markLineData.push({
					yAxis: range.low,
					name: 'Lower',
					lineStyle: {
						color: isCustom ? '#f59e0b' : 'rgba(245,158,11,0.25)',
						type: isCustom ? [8, 4] : [4, 4],
						width: isCustom ? 1.5 : 1
					},
					label: {
						formatter: '{c}',
						position: 'insideEndBottom',
						color: isCustom ? '#f59e0b' : 'rgba(245,158,11,0.45)',
						fontSize: 10,
						fontWeight: isCustom ? 600 : 400
					}
				});
			}
		}

		// Milestone vertical lines (only on first series)
		if (i === 0) {
			for (const ms of milestones) {
				markLineData.push({
					xAxis: ms.date.getTime(),
					name: ms.title,
					lineStyle: {
						color: ms.color ?? '#a78bfa',
						type: [6, 3],
						width: 1.5,
						opacity: 0.7
					},
					label: {
						formatter: ms.title,
						position: 'insideStartTop',
						color: ms.color ?? '#a78bfa',
						fontSize: 10,
						fontWeight: 500,
						backgroundColor: darkMode ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.9)',
						padding: [2, 6],
						borderRadius: 3,
						rotate: 0
					}
				});
			}
		}

		return {
			name: s.biomarker.name,
			type: 'line',
			smooth: 0.35,
			symbol: 'circle',
			symbolSize: 10,
			showSymbol: true,
			data,
			// Gradient area fill
			areaStyle: {
				color: {
					type: 'linear',
					x: 0, y: 0, x2: 0, y2: 1,
					colorStops: [
						{ offset: 0, color: palette.fill },
						{ offset: 1, color: palette.fillEnd }
					]
				}
			},
			itemStyle: {
				color: palette.line,
				borderWidth: 2,
				borderColor: darkMode ? '#0f172a' : '#ffffff'
			},
			lineStyle: {
				width: 3,
				color: palette.line,
				shadowColor: palette.glow,
				shadowBlur: 8,
				shadowOffsetY: 4
			},
			emphasis: {
				itemStyle: {
					borderWidth: 3,
					borderColor: darkMode ? '#1e293b' : '#ffffff',
					shadowBlur: 12,
					shadowColor: palette.glow
				},
				lineStyle: {
					width: 3.5
				}
			},
			markLine: markLineData.length > 0
				? { silent: true, symbol: 'none', data: markLineData }
				: undefined,
			markArea: markAreaData.length > 0
				? { silent: true, data: markAreaData }
				: undefined
		};
	});

	// Compute grid top based on legend
	const hasLegend = series.length > 1;
	const gridTop = hasLegend ? 48 : 24;

	return {
		backgroundColor: 'transparent',
		grid: {
			left: 55,
			right: 24,
			top: gridTop,
			bottom: 60,
			containLabel: false
		},
		tooltip: {
			trigger: 'axis',
			backgroundColor: tooltipBg,
			borderColor: tooltipBorder,
			borderWidth: 1,
			padding: [12, 16],
			extraCssText: `backdrop-filter: blur(12px); border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,0.12);`,
			textStyle: { color: textColorStrong, fontSize: 13 },
			axisPointer: {
				type: 'cross',
				lineStyle: { color: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', type: 'dashed' },
				crossStyle: { color: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
				label: { show: false }
			},
			formatter(params: { seriesName: string; data: [number, number]; marker: string; color: string; seriesIndex: number }[]) {
				if (!Array.isArray(params) || params.length === 0) return '';
				const date = new Date(params[0].data[0]);
				const dateStr = date.toLocaleDateString('en-AU', {
					weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
				});
				let html = `<div style="font-weight:600;font-size:12px;color:${textColor};margin-bottom:8px;letter-spacing:0.02em">${dateStr}</div>`;
				for (const p of params) {
					const unit = series[p.seriesIndex]?.biomarker?.defaultUnit ?? '';
					html += `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">`;
					html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>`;
					html += `<span style="font-size:13px;color:${textColor}">${p.seriesName}</span>`;
					html += `<span style="font-weight:700;font-size:14px;margin-left:auto;font-variant-numeric:tabular-nums">${p.data[1]}</span>`;
					if (unit) html += `<span style="font-size:11px;color:${textColor};opacity:0.6;margin-left:2px">${unit}</span>`;
					html += `</div>`;
				}
				return html;
			}
		},
		legend: {
			show: hasLegend,
			top: 4,
			left: 'center',
			itemGap: 20,
			icon: 'circle',
			itemWidth: 8,
			itemHeight: 8,
			textStyle: { color: textColor, fontSize: 12, fontWeight: 500 },
			type: series.length > 6 ? 'scroll' as const : 'plain' as const,
			pageIconColor: '#6366f1',
			pageIconInactiveColor: '#94a3b8',
			pageTextStyle: { color: textColor, fontSize: 11 }
		},
		xAxis: {
			type: 'time',
			axisLabel: {
				color: textColor,
				fontSize: 11,
				fontWeight: 500,
				formatter: '{MMM} {yyyy}',
				margin: 12
			},
			axisLine: { show: false },
			axisTick: { show: false },
			splitLine: { show: false }
		},
		yAxis: {
			type: 'value',
			axisLabel: {
				color: textColor,
				fontSize: 11,
				fontWeight: 500,
				margin: 12
			},
			axisLine: { show: false },
			axisTick: { show: false },
			splitLine: {
				lineStyle: {
					color: gridLineColor,
					type: [4, 4]
				}
			}
		},
		dataZoom: [
			{ type: 'inside', xAxisIndex: 0, filterMode: 'none' },
			{
				type: 'slider',
				xAxisIndex: 0,
				bottom: 28,
				height: 22,
				borderColor: 'transparent',
				backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.5)' : 'rgba(241, 245, 249, 0.8)',
				fillerColor: darkMode ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)',
				handleSize: '120%',
				handleStyle: {
					color: '#6366f1',
					borderColor: '#6366f1',
					borderWidth: 1,
					shadowBlur: 4,
					shadowColor: 'rgba(99, 102, 241, 0.3)',
					shadowOffsetY: 2
				},
				moveHandleSize: 4,
				moveHandleStyle: { color: '#6366f1' },
				emphasis: {
					handleStyle: { borderColor: '#4f46e5' },
					moveHandleStyle: { color: '#4f46e5' }
				},
				textStyle: { color: textColor, fontSize: 10 },
				dataBackground: {
					lineStyle: { color: 'rgba(99,102,241,0.15)', width: 1 },
					areaStyle: { color: 'rgba(99,102,241,0.04)' }
				},
				selectedDataBackground: {
					lineStyle: { color: 'rgba(99,102,241,0.4)', width: 1 },
					areaStyle: { color: 'rgba(99,102,241,0.08)' }
				}
			}
		],
		animationDuration: 800,
		animationEasing: 'cubicOut',
		animationDelay(idx: number) {
			return idx * 40;
		},
		series: echartsSeries
	};
}

export function readingsToChartPoints(
	readings: Reading[],
	reports: Map<string, Report>
): ChartDataPoint[] {
	return readings
		.map((r) => {
			const report = reports.get(r.reportId);
			if (!report) return null;
			return { date: new Date(report.date), value: r.value };
		})
		.filter((p): p is ChartDataPoint => p !== null)
		.sort((a, b) => a.date.getTime() - b.date.getTime());
}
