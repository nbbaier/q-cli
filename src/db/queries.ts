import { desc, eq } from "drizzle-orm";
import chalk from "chalk";
import { getDb, getDbPath } from "./index";
import { type InsertLog, type SelectLog, responses } from "./schema";
import { formatLogFull, formatLogShort } from "../format";

export async function insertLog(log: InsertLog): Promise<SelectLog[]> {
	const db = await getDb();
	return await db.insert(responses).values(log).returning();
}

export async function getLogs(limit: number = 10): Promise<SelectLog[]> {
	const db = await getDb();
	return await db
		.select()
		.from(responses)
		.orderBy(desc(responses.datetime_utc))
		.limit(limit);
}

export async function getLogById(id: number): Promise<SelectLog | undefined> {
	const db = await getDb();
	const results = await db
		.select()
		.from(responses)
		.where(eq(responses.id, id))
		.limit(1);
	return results[0];
}

export async function updateLogCopied(
	id: number,
	copied: boolean,
): Promise<SelectLog[]> {
	const db = await getDb();
	return await db
		.update(responses)
		.set({ copied })
		.where(eq(responses.id, id))
		.returning();
}

export async function handleLogsCommand(args: string[]): Promise<void> {
	let limit = 10;
	let logId: number | null = null;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--path") {
			console.log(getDbPath());
			return;
		}

		if (arg === "-n" && args[i + 1]) {
			limit = Number.parseInt(args[i + 1] as string, 10);
			i++;
			continue;
		}

		const maybeId = Number.parseInt(arg as string, 10);
		if (!Number.isNaN(maybeId)) {
			logId = maybeId;
		}
	}

	if (logId !== null) {
		const log = await getLogById(logId);
		if (!log) {
			console.error(chalk.red(`Log #${logId} not found.`));
			process.exit(1);
		}
		console.log(formatLogFull(log));
		return;
	}

	const logs = await getLogs(limit);

	if (logs.length === 0) {
		console.log(chalk.yellow("No logs found."));
		return;
	}

	console.log();
	for (const log of logs) {
		console.log(formatLogShort(log));
		console.log();
	}
}
