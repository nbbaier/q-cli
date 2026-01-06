import chalk from "chalk";
import {
	clearAllCache,
	clearCacheById,
	getCacheStats,
	listCacheEntries,
	pruneExpiredEntries,
} from "./cache";
import { getConfig, getConfigPath } from "./config";

function formatDate(date: Date | null): string {
	if (!date) return "N/A";
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return `${str.slice(0, maxLen - 3)}...`;
}

export async function handleCacheList(limit: number): Promise<void> {
	const entries = await listCacheEntries(limit);

	if (entries.length === 0) {
		console.log(chalk.yellow("No cache entries found."));
		return;
	}

	console.log(chalk.bold("\nCached Entries:\n"));

	// Table header
	console.log(
		chalk.gray(
			`${"ID".padEnd(6)} ${"Query".padEnd(40)} ${"Created".padEnd(12)} ${"Expires".padEnd(12)} ${"Hits".padEnd(6)}`,
		),
	);
	console.log(chalk.gray("-".repeat(80)));

	for (const entry of entries) {
		const isExpired = entry.expires_at < new Date();
		const queryTrunc = truncate(entry.query.replace(/\n/g, " "), 38);
		const created = formatDate(entry.created_at);
		const expires = formatDate(entry.expires_at);
		const hits = String(entry.hit_count || 0);

		const line = `${String(entry.id).padEnd(6)} ${queryTrunc.padEnd(40)} ${created.padEnd(12)} ${expires.padEnd(12)} ${hits.padEnd(6)}`;

		console.log(isExpired ? chalk.dim(line) : line);
	}

	console.log();
}

export async function handleCacheStats(): Promise<void> {
	const stats = await getCacheStats();
	const config = getConfig();

	console.log(chalk.bold("\nCache Statistics:\n"));

	console.log(`  ${chalk.cyan("Total entries:")}     ${stats.totalEntries}`);
	console.log(`  ${chalk.cyan("Total hits:")}        ${stats.totalHits}`);
	console.log(
		`  ${chalk.cyan("Storage size:")}      ${formatBytes(stats.storageSize)}`,
	);
	console.log(`  ${chalk.cyan("Expired entries:")}   ${stats.expiredCount}`);
	console.log(
		`  ${chalk.cyan("Oldest entry:")}      ${formatDate(stats.oldestEntry)}`,
	);
	console.log(
		`  ${chalk.cyan("Newest entry:")}      ${formatDate(stats.newestEntry)}`,
	);

	// Calculate hit rate if we have data
	if (stats.totalEntries > 0) {
		const avgHits = (stats.totalHits / stats.totalEntries).toFixed(1);
		console.log(`  ${chalk.cyan("Avg hits/entry:")}    ${avgHits}`);
	}

	console.log(chalk.bold("\nConfiguration:\n"));
	console.log(
		`  ${chalk.cyan("Cache enabled:")}     ${config.cache.enabled ? "Yes" : "No"}`,
	);
	console.log(
		`  ${chalk.cyan("Similarity:")}        ${(config.cache.similarity_threshold * 100).toFixed(0)}%`,
	);
	console.log(
		`  ${chalk.cyan("TTL:")}               ${config.cache.expiry_days} days`,
	);
	console.log(`  ${chalk.cyan("Config path:")}       ${getConfigPath()}`);

	console.log();
}

export async function handleCacheClear(
	id?: number,
	expiredOnly?: boolean,
): Promise<void> {
	if (id !== undefined) {
		// Clear specific entry
		const success = await clearCacheById(id);
		if (success) {
			console.log(chalk.green(`Cleared cache entry #${id}`));
		} else {
			console.log(chalk.red(`Cache entry #${id} not found`));
		}
		return;
	}

	if (expiredOnly) {
		// Clear only expired entries
		const count = await pruneExpiredEntries();
		console.log(chalk.green(`Cleared ${count} expired cache entries`));
		return;
	}

	// Clear all entries
	const count = await clearAllCache();
	console.log(chalk.green(`Cleared all ${count} cache entries`));
}
