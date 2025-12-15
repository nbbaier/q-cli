import fs from "node:fs";
import path from "node:path";
import {
	type DrizzleSQLiteSnapshotJSON,
	generateSQLiteDrizzleJson,
	generateSQLiteMigration,
} from "drizzle-kit/api";

import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb, getMigrationsPath } from "./db/index";
import * as schema from "./db/schema";

function checkForMigrations(migrationsFolder: string) {
	if (!fs.existsSync(migrationsFolder)) {
		fs.mkdirSync(migrationsFolder, { recursive: true });
	}
	const metaFolder = path.join(migrationsFolder, "meta");
	if (!fs.existsSync(metaFolder)) {
		fs.mkdirSync(metaFolder, { recursive: true });
	}
	return true;
}
function getPreviousSnapshot(
	migrationsFolder: string,
): DrizzleSQLiteSnapshotJSON {
	const metaFolder = path.join(migrationsFolder, "meta");
	const snapshotFiles = fs
		.readdirSync(metaFolder)
		.filter((f) => f.endsWith(".json") && f !== "_journal.json")
		.sort()
		.map((f) => path.join(metaFolder, f));

	if (snapshotFiles.length === 0) {
		// Default empty schema for first migration
		return {
			version: "6",
			dialect: "sqlite",
			id: "00000000-0000-0000-0000-000000000000",
			prevId: "00000000-0000-0000-0000-000000000000",
			tables: {},
			enums: {},
			views: {},
			_meta: {
				schemas: {},
				tables: {},
				columns: {},
			},
			internal: {
				indexes: {},
			},
		} as DrizzleSQLiteSnapshotJSON;
	}

	const lastSnapshotFile = snapshotFiles[snapshotFiles.length - 1] as string;
	return JSON.parse(
		fs.readFileSync(lastSnapshotFile, "utf-8"),
	) as DrizzleSQLiteSnapshotJSON;
}

// Generate migration name (index-based)
function generateMigrationName(journal: Journal, prefixMode: string = "index") {
	const lastEntry = journal.entries[journal.entries.length - 1];
	const idx = typeof lastEntry === "undefined" ? 0 : lastEntry.idx + 1;

	if (prefixMode === "index") {
		const prefix = idx.toString().padStart(4, "0");
		const tag = `${prefix}_generated`;
		return { prefix, tag, idx };
	}

	// Add other prefix modes as needed
	const timestamp = Date.now();
	const tag = `${timestamp}_generated`;
	return { prefix: timestamp.toString(), tag, idx };
}
type Dialect =
	| "sqlite"
	| "mysql"
	| "postgresql"
	| "turso"
	| "singlestore"
	| "gel";

export type Journal = {
	version: string;
	dialect: Dialect;
	entries: {
		idx: number;
		version: string;
		when: number;
		tag: string;
		breakpoints: boolean;
	}[];
};
function getJournal(migrationsFolder: string): Journal {
	const journalPath = path.join(migrationsFolder, "meta", "_journal.json");

	if (!fs.existsSync(journalPath)) {
		const journal: Journal = {
			version: "6",
			dialect: "sqlite",
			entries: [],
		};
		fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
		return journal;
	}

	return JSON.parse(fs.readFileSync(journalPath, "utf-8"));
}

function writeMigrationFiles(
	migrationsFolder: string,
	sqlStatements: string[],
	currentSnapshot: DrizzleSQLiteSnapshotJSON,
	journal: Journal,
	{ prefix, tag, idx }: { prefix: string; tag: string; idx: number },
) {
	const metaFolder = path.join(migrationsFolder, "meta");

	// Write snapshot
	const snapshotWithMeta = {
		...currentSnapshot,
		_meta: {
			schemas: {},
			tables: {},
			columns: {},
		},
	};

	fs.writeFileSync(
		path.join(metaFolder, `${prefix}_snapshot.json`),
		JSON.stringify(snapshotWithMeta, null, 2),
	);

	// Write SQL migration
	const sql = sqlStatements.join("\n");
	fs.writeFileSync(path.join(migrationsFolder, `${tag}.sql`), sql);

	// Update journal
	journal.entries.push({
		idx,
		version: currentSnapshot.version,
		when: Date.now(),
		tag,
		breakpoints: false,
	});

	fs.writeFileSync(
		path.join(migrationsFolder, "meta", "_journal.json"),
		JSON.stringify(journal, null, 2),
	);
}

export async function generateMigration({
	migrationsFolder = getMigrationsPath(),
	schema: schemaToMigrate,
}: {
	migrationsFolder?: string;
	schema: Record<string, unknown>;
}) {
	checkForMigrations(migrationsFolder);
	const previousSnapshot = getPreviousSnapshot(migrationsFolder);
	const currentSnapshot = await generateSQLiteDrizzleJson(schemaToMigrate);

	const sqlStatements = await generateSQLiteMigration(
		previousSnapshot,
		currentSnapshot,
	);

	if (sqlStatements.length === 0) {
		console.log("No schema changes, nothing to migrate");
		return false;
	}

	const journal = getJournal(migrationsFolder);
	const migrationInfo = generateMigrationName(journal);

	writeMigrationFiles(
		migrationsFolder,
		sqlStatements,
		currentSnapshot,
		journal,
		migrationInfo,
	);

	console.log(`Generated migration: ${migrationInfo.tag}.sql`);
	return true;
}

export async function runMigrations() {
	const migrationsFolder = getMigrationsPath();
	await generateMigration({ schema });
	const db = await getDb();
	await migrate(db, { migrationsFolder });
}

if (import.meta.main) {
	await runMigrations();
}
