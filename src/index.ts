#!/usr/bin/env node
import * as readline from "node:readline";
import { openai } from "@ai-sdk/openai";
import { type ModelMessage, streamText, wrapLanguageModel } from "ai";
import chalk from "chalk";
import clipboard from "clipboardy";
import { Command } from "commander";
import ora from "ora";
import {
	type CacheMatch,
	logCacheHit,
	lookupCache,
	storeCache,
	updateCache,
} from "./cache";
import {
	type CLIOptions,
	getEffectiveConfig,
	isCacheConfigured,
	setCacheEnabled,
} from "./config";
import {
	detectsContext,
	getContextMessages,
	getContextResponses,
} from "./context";
import { handleLogsCommand, updateLogCopied } from "./db/queries";
import { getLastLogId, logger, setLastLogId } from "./logger";

const model = wrapLanguageModel({
	model: openai("gpt-4.1-mini"),
	middleware: [logger],
});

const SYSTEM_PROMPT =
	"You are a terminal assistant. Turn natural language instructions into terminal commands. When the user references previous interactions (e.g., 'modify last command', 'run that again'), use the conversation history to understand the context. By default always only output code, and in a code block. DO NOT OUTPUT ADDITIONAL REMARKS ABOUT THE CODE YOU OUTPUT. Do not repeat the question the users asks. Do not add explanations for your code. Do not output any non-code words at all. Just output the code. Short is better. However, if the user is clearly asking a general question then answer it very briefly and well.";

const FEW_SHOT_MESSAGES: ModelMessage[] = [
	{ role: "user", content: "get the current time from some website" },
	{
		role: "assistant",
		content: "curl -s http://worldtimeapi.org/api/ip | jq '.datetime'",
	},
	{ role: "user", content: "print hi" },
	{ role: "assistant", content: 'echo "hi"' },
];

/**
 * Query-specific options that extend the base {@link CLIOptions}.
 *
 * This interface is used to control how individual queries are executed,
 * particularly with respect to caching behavior:
 *
 * - `noCache` (inherited from {@link CLIOptions}) disables both reading from
 *   and writing to the cache for the query. When `noCache` is true, the cache
 *   is effectively ignored.
 * - `refresh` (defined below) forces a refresh of the cached value for the
 *   query: a new response is fetched and the cache is updated even if a
 *   cached entry exists.
 *
 * When both flags are present, `noCache` takes precedence and the cache is
 * neither read nor written, regardless of the value of `refresh`.
 */
interface QueryOptions extends CLIOptions {
	/**
	 * If true, bypasses any existing cached response for this query and forces
	 * a fresh request, updating the cache with the new result.
	 *
	 * This is different from `noCache` (from {@link CLIOptions}):
	 * - `refresh: true` will still use the cache mechanism, but ensures it is
	 *   repopulated with a fresh value.
	 * - `noCache: true` disables the cache entirely for the query (no read,
	 *   no write).
	 */
	refresh?: boolean;
}

async function promptForCachePreference(): Promise<boolean> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		console.log(
			chalk.cyan(
				"\nWould you like to enable query caching?\nCaching reduces API calls by reusing responses for similar queries.",
			),
		);

		rl.question(chalk.bold("[y/n]: "), (answer) => {
			rl.close();
			const enabled = answer.toLowerCase().startsWith("y");
			setCacheEnabled(enabled);
			console.log(
				enabled
					? chalk.green("Cache enabled!")
					: chalk.yellow("Cache disabled."),
			);
			resolve(enabled);
		});
	});
}

async function handleQuery(
	query: string,
	options: QueryOptions = {},
): Promise<void> {
	const config = getEffectiveConfig(options);
	let printedLines = 0;
	let cacheMatch: CacheMatch | null = null;

	function writeAndCount(text: string) {
		printedLines += (text.match(/\n/g) || []).length;
		process.stdout.write(text);
	}

	// First-run experience: prompt for cache preference
	if (config.cache.enabled && !isCacheConfigured()) {
		const enabled = await promptForCachePreference();
		if (!enabled) {
			config.cache.enabled = false;
		}
	}

	// Determine context limit
	const explicitContextLimit = options.context;
	const shouldIncludeContext =
		explicitContextLimit !== undefined
			? explicitContextLimit > 0
			: detectsContext(query);

	const contextLimit =
		explicitContextLimit ??
		(shouldIncludeContext ? config.defaults.context_limit : 0);

	// Fetch context if needed
	let contextMessages: ModelMessage[] = [];
	let contextResponses: string[] = [];
	if (contextLimit > 0) {
		contextMessages = await getContextMessages(contextLimit);
		contextResponses = await getContextResponses(contextLimit);
	}

	// Try cache lookup (unless --no-cache or --refresh)
	if (config.cache.enabled && !options.noCache && !options.refresh) {
		const spinner = ora("Checking cache...").start();
		try {
			cacheMatch = await lookupCache(query, contextResponses);
			if (spinner.isSpinning) {
				spinner.stop();
			}
		} catch (error) {
			if (spinner.isSpinning) {
				spinner.stop();
			}
			// Continue without cache on error
		}
	}

	// If we have a cache hit, display it
	if (cacheMatch) {
		const response = cacheMatch.entry.response;

		// Log cache hit to responses table
		const logId = await logCacheHit(
			{
				model: "gpt-4.1-mini",
				prompt: query,
				system: SYSTEM_PROMPT,
				prompt_json: null,
				options_json: null,
			},
			response,
			cacheMatch.entry.id,
			cacheMatch.similarity,
		);
		setLastLogId(logId);

		// Display cached response
		writeAndCount("\n    ");
		writeAndCount(response.replace(/\n/g, "\n   "));

		// Show cache info
		if (options.verbose) {
			const age = Math.floor(
				(Date.now() - cacheMatch.entry.created_at.getTime()) /
					(1000 * 60 * 60 * 24),
			);
			writeAndCount(
				chalk.gray(
					`\n\n    [CACHED] Original query: "${cacheMatch.entry.query.slice(0, 50)}..."`,
				),
			);
			writeAndCount(
				chalk.gray(
					`\n    Similarity: ${(cacheMatch.similarity * 100).toFixed(1)}% | Age: ${age} days`,
				),
			);
		}

		writeAndCount(
			chalk.gray(
				`\n\n${chalk.bold("Enter")} to copy | ${chalk.bold("r")} to regenerate | ${chalk.bold("Ctrl+C")} to exit`,
			) + chalk.cyan(" (cached)"),
		);

		// Handle user input for cached result
		await handleCachedResultInput(
			query,
			response,
			printedLines,
			cacheMatch,
			options,
			contextMessages,
			contextResponses,
		);
		return;
	}

	// No cache hit - generate fresh response
	const messages: ModelMessage[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		...FEW_SHOT_MESSAGES,
		...contextMessages,
		{ role: "user", content: query },
	];

	const spinner = ora("Generating response...").start();
	const result = streamText({ model, messages });

	let message = "";
	for await (const chunk of result.fullStream) {
		if (chunk.type === "text-delta") {
			if (spinner.isSpinning) {
				spinner.stop();
				writeAndCount("\n    ");
			}
			const text = (chunk as { text: string }).text;
			const indentedPart = text.replace(/\n/g, "\n   ");
			message += text;
			writeAndCount(indentedPart);
		}
	}

	// Store in cache (unless --no-cache)
	if (config.cache.enabled && !options.noCache) {
		const logId = getLastLogId();
		try {
			// Create new cache entry (--refresh just skips lookup, but still stores)
			await storeCache(query, message, logId, contextResponses);
		} catch (error) {
			// Cache storage failure is non-fatal
			if (options.verbose) {
				console.error(chalk.yellow("\nWarning: Failed to cache response"));
			}
		}
	}

	writeAndCount(
		chalk.gray(
			`\n\n${chalk.bold("Enter")} to copy to clipboard, ${chalk.bold("Ctrl+C")} to exit`,
		),
	);

	await handleFreshResultInput(message, printedLines);
}

async function handleCachedResultInput(
	query: string,
	response: string,
	printedLines: number,
	cacheMatch: CacheMatch,
	options: QueryOptions,
	contextMessages: ModelMessage[],
	contextResponses: string[],
): Promise<void> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		// Enable raw mode to capture single keystrokes
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}
		process.stdin.resume();

		const cleanup = () => {
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false);
			}
			rl.close();
		};

		process.stdin.once("data", async (key) => {
			const keyStr = key.toString();

			if (keyStr === "\r" || keyStr === "\n") {
				// Enter - copy to clipboard
				cleanup();
				try {
					await clipboard.write(response);

					const logId = getLastLogId();
					if (logId !== null) {
						await updateLogCopied(logId, true);
					}

					readline.moveCursor(process.stdout, 0, -printedLines);
					readline.clearScreenDown(process.stdout);
					console.log("Copied to clipboard ✅");
					process.exit(0);
				} catch {
					console.error("Failed to copy to clipboard");
					process.exit(1);
				}
			} else if (keyStr === "r" || keyStr === "R") {
				// Regenerate
				cleanup();
				readline.moveCursor(process.stdout, 0, -printedLines);
				readline.clearScreenDown(process.stdout);

				// Force fresh API call and update cache
				await handleRegenerateQuery(
					query,
					{ ...options, refresh: true },
					cacheMatch,
					contextMessages,
					contextResponses,
				);
				resolve();
			} else if (keyStr === "\x03") {
				// Ctrl+C
				cleanup();
				process.stdout.write("\n");
				readline.moveCursor(process.stdout, 0, -printedLines);
				readline.clearScreenDown(process.stdout);
				console.log("Exited without copying ❌");
				process.exit(0);
			}
		});
	});
}

async function handleRegenerateQuery(
	query: string,
	options: QueryOptions,
	cacheMatch: CacheMatch,
	contextMessages: ModelMessage[],
	contextResponses: string[],
): Promise<void> {
	const config = getEffectiveConfig(options);
	let printedLines = 0;

	function writeAndCount(text: string) {
		printedLines += (text.match(/\n/g) || []).length;
		process.stdout.write(text);
	}

	const messages: ModelMessage[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		...FEW_SHOT_MESSAGES,
		...contextMessages,
		{ role: "user", content: query },
	];

	const spinner = ora("Regenerating response...").start();
	const result = streamText({ model, messages });

	let message = "";
	for await (const chunk of result.fullStream) {
		if (chunk.type === "text-delta") {
			if (spinner.isSpinning) {
				spinner.stop();
				writeAndCount("\n    ");
			}
			const text = (chunk as { text: string }).text;
			const indentedPart = text.replace(/\n/g, "\n   ");
			message += text;
			writeAndCount(indentedPart);
		}
	}

	// Update cache with new response
	if (config.cache.enabled) {
		const logId = getLastLogId();
		try {
			await updateCache(
				cacheMatch.entry.id,
				message,
				logId,
				cacheMatch.entry.context_hash,
			);
		} catch {
			// Non-fatal
		}
	}

	writeAndCount(
		chalk.gray(
			`\n\n${chalk.bold("Enter")} to copy to clipboard, ${chalk.bold("Ctrl+C")} to exit`,
		),
	);

	await handleFreshResultInput(message, printedLines);
}

async function handleFreshResultInput(
	message: string,
	printedLines: number,
): Promise<void> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		rl.on("line", async () => {
			rl.close();
			try {
				await clipboard.write(message);

				const logId = getLastLogId();
				if (logId !== null) {
					await updateLogCopied(logId, true);
				}

				readline.moveCursor(process.stdout, 0, -printedLines);
				readline.clearScreenDown(process.stdout);
				console.log("Copied to clipboard ✅");
				process.exit(0);
			} catch (error: unknown) {
				if (error instanceof Error) {
					console.error(error.message);
				} else {
					console.error("Failed to copy to clipboard");
				}

				process.exit(1);
			}
		});

		rl.on("SIGINT", () => {
			rl.close();
			process.stdout.write("\n");
			readline.moveCursor(process.stdout, 0, -printedLines);
			readline.clearScreenDown(process.stdout);
			console.log("Exited without copying ❌");
			process.exit(0);
		});
	});
}

const program = new Command()
	.name("q")
	.description("Terminal AI assistant")
	.argument("[query...]", "Natural language query")
	.option(
		"-c, --context <number>",
		"Include N previous interactions for context",
		"0",
	)
	.option("--no-cache", "Skip cache lookup, force API call, don't update cache")
	.option("--refresh", "Skip cache lookup, force API call, update cache")
	.option("-v, --verbose", "Show verbose output including cache info")
	.action(
		async (
			queryParts: string[],
			options: {
				context: string;
				cache: boolean;
				refresh: boolean;
				verbose: boolean;
			},
		) => {
			const query = queryParts.join(" ");
			if (!query) {
				console.error("No query provided");
				process.exit(1);
			}
			const contextLimit = Number.parseInt(options.context, 10);
			await handleQuery(query, {
				context: contextLimit,
				noCache: !options.cache,
				refresh: options.refresh,
				verbose: options.verbose,
			});
		},
	);

program
	.command("logs")
	.description("View query logs")
	.option("--path", "Print database path")
	.option("-n, --limit <number>", "Number of logs to show", "10")
	.argument("[id]", "View specific log by ID")
	.action(async (id, options) => {
		const args: string[] = [];
		if (options.path) args.push("--path");
		if (options.limit) args.push("-n", options.limit);
		if (id) args.push(id);
		await handleLogsCommand(args);
	});

// Cache management subcommand
const cacheCommand = program.command("cache").description("Manage query cache");

cacheCommand
	.command("list")
	.description("List cached entries")
	.option("-n, --limit <number>", "Number of entries to show", "20")
	.action(async (options) => {
		const { handleCacheList } = await import("./cache-commands");
		await handleCacheList(Number.parseInt(options.limit, 10));
	});

cacheCommand
	.command("stats")
	.description("Show cache statistics")
	.action(async () => {
		const { handleCacheStats } = await import("./cache-commands");
		await handleCacheStats();
	});

cacheCommand
	.command("clear")
	.description("Clear cache entries")
	.option("--expired", "Only clear expired entries")
	.argument("[id]", "Clear specific entry by ID")
	.action(async (id, options) => {
		const { handleCacheClear } = await import("./cache-commands");
		await handleCacheClear(
			id ? Number.parseInt(id, 10) : undefined,
			options.expired,
		);
	});

program.parse();
