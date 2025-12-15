import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

function getDataDir(): string {
	const xdgDataHome = process.env.XDG_DATA_HOME;
	if (xdgDataHome) {
		return join(xdgDataHome, "q-cli");
	}
	return join(homedir(), ".local", "share", "q-cli");
}

export function getDbPath(): string {
	return join(getDataDir(), "logs.db");
}

export function getMigrationsPath(): string {
	return join(import.meta.dirname, "..", "migrations");
}

function ensureDataDir(): void {
	const dir = getDataDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

let _db: LibSQLDatabase | null = null;
let _initPromise: Promise<LibSQLDatabase> | null = null;

async function initDb(): Promise<LibSQLDatabase> {
	ensureDataDir();

	const database = drizzle({ connection: { url: `file:${getDbPath()}` } });

	const migrationsPath = getMigrationsPath();
	if (existsSync(migrationsPath)) {
		await migrate(database, { migrationsFolder: migrationsPath });
	}

	return database;
}

export async function getDb(): Promise<LibSQLDatabase> {
	if (_db) return _db;

	if (!_initPromise) {
		_initPromise = initDb().then((database) => {
			_db = database;
			return database;
		});
	}

	return _initPromise;
}
