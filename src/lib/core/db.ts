/**
 * db.ts — Storage abstraction for Bloodwork
 *
 * In the browser (dev/web): uses Dexie / IndexedDB.
 * In Tauri (desktop app): uses SQLite via tauri-plugin-sql.
 *
 * On first Tauri launch with an empty SQLite database, data is automatically
 * migrated from Dexie so nothing is lost.
 *
 * All pages import from this file — no import changes needed elsewhere.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Report, Reading, Milestone, UserThreshold, AppSettings } from './types.ts';

// ─── Dexie (browser) ────────────────────────────────────────────────────────

export const db = new Dexie('bloodwork') as Dexie & {
	reports: EntityTable<Report, 'id'>;
	readings: EntityTable<Reading, 'id'>;
	milestones: EntityTable<Milestone, 'id'>;
	userThresholds: EntityTable<UserThreshold, 'id'>;
	settings: EntityTable<AppSettings, 'key'>;
};

db.version(1).stores({
	reports: 'id, date',
	readings: 'id, reportId, biomarkerId, [biomarkerId+reportId]',
	milestones: 'id, date',
	userThresholds: 'id, biomarkerId',
	settings: 'key'
});

// ─── Tauri detection ─────────────────────────────────────────────────────────

export function isTauri(): boolean {
	return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

// ─── SQLite helpers ──────────────────────────────────────────────────────────

// Lazily loaded so the module is never imported in the browser.
// The type import is erased at runtime — safe to reference without bundling Tauri APIs.
import type Database from '@tauri-apps/plugin-sql';
let _sql: InstanceType<typeof Database> | null = null;

async function getSql(): Promise<InstanceType<typeof Database>> {
	if (_sql) return _sql;
	const SqlPlugin = await import('@tauri-apps/plugin-sql');
	// Stored at AppData\Roaming\com.bloodwork.app\bloodwork.db on Windows
	_sql = await SqlPlugin.default.load('sqlite:bloodwork.db');
	return _sql;
}

async function sqlExecute(query: string, params: unknown[] = []): Promise<void> {
	const sql = await getSql();
	await sql.execute(query, params);
}

async function sqlSelect<T>(query: string, params: unknown[] = []): Promise<T[]> {
	const sql = await getSql();
	return sql.select<T[]>(query, params);
}

// ─── Database initialisation ─────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
	if (!isTauri()) return;
	await sqlExecute(`
		CREATE TABLE IF NOT EXISTS reports (
			id TEXT PRIMARY KEY,
			date TEXT NOT NULL,
			labName TEXT,
			sourceType TEXT NOT NULL,
			notes TEXT,
			createdAt TEXT NOT NULL
		)
	`);
	await sqlExecute(`
		CREATE TABLE IF NOT EXISTS readings (
			id TEXT PRIMARY KEY,
			reportId TEXT NOT NULL,
			biomarkerId TEXT NOT NULL,
			value REAL NOT NULL,
			unit TEXT NOT NULL,
			referenceRange TEXT,
			flag TEXT
		)
	`);
	await sqlExecute(`
		CREATE TABLE IF NOT EXISTS milestones (
			id TEXT PRIMARY KEY,
			date TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT,
			color TEXT,
			showOnCharts INTEGER NOT NULL DEFAULT 1
		)
	`);
	await sqlExecute(`
		CREATE TABLE IF NOT EXISTS user_thresholds (
			id TEXT PRIMARY KEY,
			biomarkerId TEXT NOT NULL UNIQUE,
			low REAL,
			high REAL,
			unit TEXT NOT NULL,
			note TEXT
		)
	`);
	await sqlExecute(`
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)
	`);
}

// ─── Migration: Dexie → SQLite ────────────────────────────────────────────────

export async function migrateFromDexie(): Promise<void> {
	if (!isTauri()) return;

	// Check if already migrated
	const migrated = await getSetting<boolean>('dexie_migrated');
	if (migrated) return;

	// Check if Dexie has any data worth migrating
	const reportCount = await db.reports.count();
	if (reportCount === 0) {
		// Nothing to migrate — just mark as done
		await setSetting('dexie_migrated', true);
		return;
	}

	// Export everything from Dexie
	const [reports, readings, milestones, thresholds] = await Promise.all([
		db.reports.toArray(),
		db.readings.toArray(),
		db.milestones.toArray(),
		db.userThresholds.toArray()
	]);

	// Write reports
	for (const r of reports) {
		await sqlExecute(
			`INSERT OR IGNORE INTO reports (id, date, labName, sourceType, notes, createdAt)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[r.id, r.date.toISOString(), r.labName ?? null, r.sourceType, r.notes ?? null, r.createdAt.toISOString()]
		);
	}

	// Write readings
	for (const r of readings) {
		await sqlExecute(
			`INSERT OR IGNORE INTO readings (id, reportId, biomarkerId, value, unit, referenceRange, flag)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[r.id, r.reportId, r.biomarkerId, r.value, r.unit,
			 r.referenceRange ? JSON.stringify(r.referenceRange) : null,
			 r.flag ?? null]
		);
	}

	// Write milestones
	for (const m of milestones) {
		await sqlExecute(
			`INSERT OR IGNORE INTO milestones (id, date, title, description, color, showOnCharts)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[m.id, m.date.toISOString(), m.title, m.description ?? null, m.color ?? null, m.showOnCharts ? 1 : 0]
		);
	}

	// Write thresholds
	for (const t of thresholds) {
		await sqlExecute(
			`INSERT OR IGNORE INTO user_thresholds (id, biomarkerId, low, high, unit, note)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[t.id, t.biomarkerId, t.low ?? null, t.high ?? null, t.unit, t.note ?? null]
		);
	}

	await setSetting('dexie_migrated', true);
}

// ─── Row → domain type helpers ───────────────────────────────────────────────

type ReportRow = { id: string; date: string; labName: string | null; sourceType: string; notes: string | null; createdAt: string };
type ReadingRow = { id: string; reportId: string; biomarkerId: string; value: number; unit: string; referenceRange: string | null; flag: string | null };
type MilestoneRow = { id: string; date: string; title: string; description: string | null; color: string | null; showOnCharts: number };
type ThresholdRow = { id: string; biomarkerId: string; low: number | null; high: number | null; unit: string; note: string | null };

function rowToReport(r: ReportRow): Report {
	return {
		id: r.id,
		date: new Date(r.date),
		labName: r.labName ?? undefined,
		sourceType: r.sourceType as Report['sourceType'],
		notes: r.notes ?? undefined,
		createdAt: new Date(r.createdAt)
	};
}

function rowToReading(r: ReadingRow): Reading {
	return {
		id: r.id,
		reportId: r.reportId,
		biomarkerId: r.biomarkerId,
		value: r.value,
		unit: r.unit,
		referenceRange: r.referenceRange ? JSON.parse(r.referenceRange) : undefined,
		flag: (r.flag as Reading['flag']) ?? undefined
	};
}

function rowToMilestone(r: MilestoneRow): Milestone {
	return {
		id: r.id,
		date: new Date(r.date),
		title: r.title,
		description: r.description ?? undefined,
		color: r.color ?? undefined,
		showOnCharts: r.showOnCharts === 1
	};
}

function rowToThreshold(r: ThresholdRow): UserThreshold {
	return {
		id: r.id,
		biomarkerId: r.biomarkerId,
		low: r.low ?? undefined,
		high: r.high ?? undefined,
		unit: r.unit,
		note: r.note ?? undefined
	};
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function addReport(report: Report): Promise<string> {
	if (isTauri()) {
		await sqlExecute(
			`INSERT INTO reports (id, date, labName, sourceType, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
			[report.id, report.date.toISOString(), report.labName ?? null, report.sourceType, report.notes ?? null, report.createdAt.toISOString()]
		);
		return report.id;
	}
	return db.reports.add(report);
}

export async function getReport(id: string): Promise<Report | undefined> {
	if (isTauri()) {
		const rows = await sqlSelect<ReportRow>(`SELECT * FROM reports WHERE id = ?`, [id]);
		return rows[0] ? rowToReport(rows[0]) : undefined;
	}
	return db.reports.get(id);
}

export async function getAllReports(): Promise<Report[]> {
	if (isTauri()) {
		const rows = await sqlSelect<ReportRow>(`SELECT * FROM reports ORDER BY date DESC`);
		return rows.map(rowToReport);
	}
	return db.reports.orderBy('date').reverse().toArray();
}

export async function getAllReadings(): Promise<Reading[]> {
	if (isTauri()) {
		const rows = await sqlSelect<ReadingRow>(`SELECT * FROM readings`);
		return rows.map(rowToReading);
	}
	return db.readings.toArray();
}

export async function deleteReport(id: string): Promise<void> {
	if (isTauri()) {
		await sqlExecute(`DELETE FROM readings WHERE reportId = ?`, [id]);
		await sqlExecute(`DELETE FROM reports WHERE id = ?`, [id]);
		return;
	}
	await db.transaction('rw', [db.reports, db.readings], async () => {
		await db.readings.where('reportId').equals(id).delete();
		await db.reports.delete(id);
	});
}

// ─── Readings ─────────────────────────────────────────────────────────────────

export async function addReadings(readings: Reading[]): Promise<void> {
	if (isTauri()) {
		for (const r of readings) {
			await sqlExecute(
				`INSERT INTO readings (id, reportId, biomarkerId, value, unit, referenceRange, flag) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[r.id, r.reportId, r.biomarkerId, r.value, r.unit,
				 r.referenceRange ? JSON.stringify(r.referenceRange) : null,
				 r.flag ?? null]
			);
		}
		return;
	}
	await db.readings.bulkAdd(readings);
}

export async function getReadingsForReport(reportId: string): Promise<Reading[]> {
	if (isTauri()) {
		const rows = await sqlSelect<ReadingRow>(`SELECT * FROM readings WHERE reportId = ?`, [reportId]);
		return rows.map(rowToReading);
	}
	return db.readings.where('reportId').equals(reportId).toArray();
}

export async function getReadingsForBiomarker(biomarkerId: string): Promise<Reading[]> {
	if (isTauri()) {
		const rows = await sqlSelect<ReadingRow>(
			`SELECT r.* FROM readings r
			 JOIN reports rep ON r.reportId = rep.id
			 WHERE r.biomarkerId = ?
			 ORDER BY rep.date ASC`,
			[biomarkerId]
		);
		return rows.map(rowToReading);
	}
	// Dexie path — join manually
	const readings = await db.readings.where('biomarkerId').equals(biomarkerId).toArray();
	const reportIds = [...new Set(readings.map((r) => r.reportId))];
	const reports = await db.reports.bulkGet(reportIds);
	const reportDateMap = new Map(reports.filter(Boolean).map((r) => [r!.id, r!.date]));
	return readings.sort((a, b) => {
		const dateA = reportDateMap.get(a.reportId)?.getTime() ?? 0;
		const dateB = reportDateMap.get(b.reportId)?.getTime() ?? 0;
		return dateA - dateB;
	});
}

export async function updateReading(id: string, changes: Partial<Reading>): Promise<void> {
	if (isTauri()) {
		const fields = Object.keys(changes) as (keyof Reading)[];
		if (fields.length === 0) return;
		const setClauses = fields.map((f) => {
			if (f === 'referenceRange') return `referenceRange = ?`;
			return `${f} = ?`;
		});
		const values = fields.map((f) => {
			if (f === 'referenceRange') return changes.referenceRange ? JSON.stringify(changes.referenceRange) : null;
			return changes[f] ?? null;
		});
		await sqlExecute(
			`UPDATE readings SET ${setClauses.join(', ')} WHERE id = ?`,
			[...values, id]
		);
		return;
	}
	await db.readings.update(id, changes);
}

export async function deleteReading(id: string): Promise<void> {
	if (isTauri()) {
		await sqlExecute(`DELETE FROM readings WHERE id = ?`, [id]);
		return;
	}
	await db.readings.delete(id);
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export async function addMilestone(milestone: Milestone): Promise<string> {
	if (isTauri()) {
		await sqlExecute(
			`INSERT INTO milestones (id, date, title, description, color, showOnCharts) VALUES (?, ?, ?, ?, ?, ?)`,
			[milestone.id, milestone.date.toISOString(), milestone.title, milestone.description ?? null, milestone.color ?? null, milestone.showOnCharts ? 1 : 0]
		);
		return milestone.id;
	}
	return db.milestones.add(milestone);
}

export async function getAllMilestones(): Promise<Milestone[]> {
	if (isTauri()) {
		const rows = await sqlSelect<MilestoneRow>(`SELECT * FROM milestones ORDER BY date ASC`);
		return rows.map(rowToMilestone);
	}
	return db.milestones.orderBy('date').toArray();
}

export async function updateMilestone(id: string, changes: Partial<Milestone>): Promise<void> {
	if (isTauri()) {
		const fields = Object.keys(changes) as (keyof Milestone)[];
		if (fields.length === 0) return;
		const setClauses = fields.map((f) => {
			if (f === 'showOnCharts') return `showOnCharts = ?`;
			if (f === 'date') return `date = ?`;
			return `${f} = ?`;
		});
		const values = fields.map((f) => {
			if (f === 'showOnCharts') return (changes.showOnCharts as boolean) ? 1 : 0;
			if (f === 'date') return (changes.date as Date).toISOString();
			return changes[f] ?? null;
		});
		await sqlExecute(
			`UPDATE milestones SET ${setClauses.join(', ')} WHERE id = ?`,
			[...values, id]
		);
		return;
	}
	await db.milestones.update(id, changes);
}

export async function deleteMilestone(id: string): Promise<void> {
	if (isTauri()) {
		await sqlExecute(`DELETE FROM milestones WHERE id = ?`, [id]);
		return;
	}
	await db.milestones.delete(id);
}

// ─── User Thresholds ──────────────────────────────────────────────────────────

export async function getAllThresholds(): Promise<UserThreshold[]> {
	if (isTauri()) {
		const rows = await sqlSelect<ThresholdRow>(`SELECT * FROM user_thresholds`);
		return rows.map(rowToThreshold);
	}
	return db.userThresholds.toArray();
}

export async function getThresholdForBiomarker(
	biomarkerId: string
): Promise<UserThreshold | undefined> {
	if (isTauri()) {
		const rows = await sqlSelect<ThresholdRow>(
			`SELECT * FROM user_thresholds WHERE biomarkerId = ?`,
			[biomarkerId]
		);
		return rows[0] ? rowToThreshold(rows[0]) : undefined;
	}
	return db.userThresholds.where('biomarkerId').equals(biomarkerId).first();
}

export async function setThreshold(threshold: UserThreshold): Promise<void> {
	if (isTauri()) {
		await sqlExecute(
			`INSERT INTO user_thresholds (id, biomarkerId, low, high, unit, note)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(biomarkerId) DO UPDATE SET
			   id = excluded.id, low = excluded.low, high = excluded.high,
			   unit = excluded.unit, note = excluded.note`,
			[threshold.id, threshold.biomarkerId, threshold.low ?? null, threshold.high ?? null, threshold.unit, threshold.note ?? null]
		);
		return;
	}
	await db.userThresholds.put(threshold);
}

export async function deleteThreshold(biomarkerId: string): Promise<void> {
	if (isTauri()) {
		await sqlExecute(`DELETE FROM user_thresholds WHERE biomarkerId = ?`, [biomarkerId]);
		return;
	}
	await db.userThresholds.where('biomarkerId').equals(biomarkerId).delete();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting<T>(key: string): Promise<T | undefined> {
	if (isTauri()) {
		const rows = await sqlSelect<{ key: string; value: string }>(
			`SELECT value FROM settings WHERE key = ?`,
			[key]
		);
		if (!rows[0]) return undefined;
		return JSON.parse(rows[0].value) as T;
	}
	const setting = await db.settings.get(key);
	return setting?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
	if (isTauri()) {
		await sqlExecute(
			`INSERT INTO settings (key, value) VALUES (?, ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			[key, JSON.stringify(value)]
		);
		return;
	}
	await db.settings.put({ key, value });
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export interface DataExport {
	version: 1;
	exportedAt: string;
	reports: Array<Omit<Report, 'date' | 'createdAt'> & { date: string; createdAt: string }>;
	readings: Reading[];
	milestones: Array<Omit<Milestone, 'date'> & { date: string }>;
	thresholds: UserThreshold[];
}

/** Export all data from the current storage backend as a JSON-serialisable object. */
export async function exportAllData(): Promise<DataExport> {
	const [reports, readings, milestones, thresholds] = await Promise.all([
		getAllReports(),
		getAllReadings(),
		getAllMilestones(),
		getAllThresholds()
	]);
	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		reports: reports.map((r) => ({
			...r,
			date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
			createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)
		})),
		readings,
		milestones: milestones.map((m) => ({
			...m,
			date: m.date instanceof Date ? m.date.toISOString() : String(m.date)
		})),
		thresholds
	};
}

/** Import a DataExport blob into the current storage backend. Existing records are skipped (INSERT OR IGNORE). */
export async function importData(data: DataExport): Promise<{ imported: number; skipped: number }> {
	let imported = 0;
	let skipped = 0;

	const reports: Report[] = data.reports.map((r) => ({
		...r,
		date: new Date(r.date),
		createdAt: new Date(r.createdAt)
	}));
	const milestones: Milestone[] = data.milestones.map((m) => ({
		...m,
		date: new Date(m.date)
	}));

	if (isTauri()) {
		for (const r of reports) {
			const existing = await sqlSelect<{ id: string }>(`SELECT id FROM reports WHERE id = ?`, [r.id]);
			if (existing.length > 0) { skipped++; continue; }
			await sqlExecute(
				`INSERT OR IGNORE INTO reports (id, date, labName, sourceType, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
				[r.id, r.date.toISOString(), r.labName ?? null, r.sourceType, r.notes ?? null, r.createdAt.toISOString()]
			);
			imported++;
		}
		for (const r of data.readings) {
			const existing = await sqlSelect<{ id: string }>(`SELECT id FROM readings WHERE id = ?`, [r.id]);
			if (existing.length > 0) { skipped++; continue; }
			await sqlExecute(
				`INSERT OR IGNORE INTO readings (id, reportId, biomarkerId, value, unit, referenceRange, flag) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[r.id, r.reportId, r.biomarkerId, r.value, r.unit,
				 r.referenceRange ? JSON.stringify(r.referenceRange) : null, r.flag ?? null]
			);
			imported++;
		}
		for (const m of milestones) {
			const existing = await sqlSelect<{ id: string }>(`SELECT id FROM milestones WHERE id = ?`, [m.id]);
			if (existing.length > 0) { skipped++; continue; }
			await sqlExecute(
				`INSERT OR IGNORE INTO milestones (id, date, title, description, color, showOnCharts) VALUES (?, ?, ?, ?, ?, ?)`,
				[m.id, m.date.toISOString(), m.title, m.description ?? null, m.color ?? null, m.showOnCharts ? 1 : 0]
			);
			imported++;
		}
		for (const t of data.thresholds) {
			await sqlExecute(
				`INSERT INTO user_thresholds (id, biomarkerId, low, high, unit, note)
				 VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT(biomarkerId) DO NOTHING`,
				[t.id, t.biomarkerId, t.low ?? null, t.high ?? null, t.unit, t.note ?? null]
			);
			imported++;
		}
		// Mark migration done so auto-migrate doesn't overwrite
		await setSetting('dexie_migrated', true);
	} else {
		// Dexie path (browser — used during export testing)
		for (const r of reports) {
			const existing = await db.reports.get(r.id);
			if (existing) { skipped++; continue; }
			await db.reports.add(r);
			imported++;
		}
		for (const r of data.readings) {
			const existing = await db.readings.get(r.id);
			if (existing) { skipped++; continue; }
			await db.readings.add(r);
			imported++;
		}
		for (const m of milestones) {
			const existing = await db.milestones.get(m.id);
			if (existing) { skipped++; continue; }
			await db.milestones.add(m);
			imported++;
		}
		for (const t of data.thresholds) {
			await db.userThresholds.put(t);
			imported++;
		}
	}

	return { imported, skipped };
}
