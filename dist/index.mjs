#!/usr/bin/env node
import { createRequire } from "node:module";
import * as readline from "node:readline";
import { openai } from "@ai-sdk/openai";
import { streamText, wrapLanguageModel } from "ai";
import chalk from "chalk";
import clipboard from "clipboardy";
import ora from "ora";
import { desc, eq } from "drizzle-orm";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __copyProps = (to, from, except, desc$1) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) {
				__defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc$1 = __getOwnPropDesc(from, key)) || desc$1.enumerable
				});
			}
		}
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
var __require = /* @__PURE__ */ createRequire(import.meta.url);

//#endregion
//#region node_modules/@commander-js/extra-typings/index.js
var require_extra_typings = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const commander = __require("commander");
	exports = module.exports = {};
	exports.program = new commander.Command();
	/**
	* Expose classes. The FooT versions are just types, so return Commander original implementations!
	*/
	exports.Argument = commander.Argument;
	exports.Command = commander.Command;
	exports.CommanderError = commander.CommanderError;
	exports.Help = commander.Help;
	exports.InvalidArgumentError = commander.InvalidArgumentError;
	exports.InvalidOptionArgumentError = commander.InvalidArgumentError;
	exports.Option = commander.Option;
	exports.createCommand = (name) => new commander.Command(name);
	exports.createOption = (flags, description) => new commander.Option(flags, description);
	exports.createArgument = (name, description) => new commander.Argument(name, description);
}));

//#endregion
//#region node_modules/@commander-js/extra-typings/esm.mjs
var import_extra_typings = /* @__PURE__ */ __toESM(require_extra_typings(), 1);
const { program: program$1, createCommand, createArgument, createOption, CommanderError, InvalidArgumentError, InvalidOptionArgumentError, Command, Argument, Option, Help } = import_extra_typings.default;

//#endregion
//#region src/format.ts
function formatLogShort(log) {
	const date = new Date(log.datetime_utc).toLocaleString();
	const copied = log.copied ? chalk.green("[copied]") : "";
	const prompt = log.prompt && log.prompt.length > 50 ? `${log.prompt.slice(0, 47)}...` : log.prompt;
	const response = log.response && log.response.length > 60 ? `${log.response.slice(0, 57)}...` : log.response;
	return `${chalk.dim(`#${log.id}`)} ${chalk.cyan(date)} ${copied}
  ${chalk.yellow(">")} ${prompt}
  ${chalk.green("$")} ${response}`;
}
function formatLogFull(log) {
	const date = new Date(log.datetime_utc).toLocaleString();
	const copied = log.copied ? chalk.green("yes") : chalk.gray("no");
	const tokens = log.total_tokens !== void 0 ? `${log.input_tokens ?? "?"}/${log.output_tokens ?? "?"} (${log.total_tokens} total)` : "N/A";
	const duration = log.duration_ms !== void 0 ? `${log.duration_ms}ms` : "N/A";
	return `${chalk.bold.cyan(`Log #${log.id}`)}
${chalk.dim("Date:")}     ${date}
${chalk.dim("Model:")}    ${log.model ?? "N/A"}
${chalk.dim("Duration:")} ${duration}
${chalk.dim("Tokens:")}   ${tokens}
${chalk.dim("Copied:")}   ${copied}

${chalk.yellow("Prompt:")}
${log.prompt ?? "N/A"}

${chalk.green("Response:")}
${log.response ?? "N/A"}
`;
}

//#endregion
//#region src/db/index.ts
function getDataDir() {
	const xdgDataHome = process.env.XDG_DATA_HOME;
	if (xdgDataHome) return join(xdgDataHome, "q-cli");
	return join(homedir(), ".local", "share", "q-cli");
}
function getDbPath() {
	return join(getDataDir(), "logs.db");
}
function getMigrationsPath() {
	return join(import.meta.dirname, "..", "migrations");
}
function ensureDataDir() {
	const dir = getDataDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
let _db = null;
let _initPromise = null;
async function initDb() {
	ensureDataDir();
	const database = drizzle({ connection: { url: `file:${getDbPath()}` } });
	const migrationsPath = getMigrationsPath();
	if (existsSync(migrationsPath)) await migrate(database, { migrationsFolder: migrationsPath });
	return database;
}
async function getDb() {
	if (_db) return _db;
	if (!_initPromise) _initPromise = initDb().then((database) => {
		_db = database;
		return database;
	});
	return _initPromise;
}

//#endregion
//#region src/db/schema.ts
const responses = sqliteTable("responses", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	model: text("model"),
	prompt: text("prompt"),
	system: text("system"),
	prompt_json: text("prompt_json", { mode: "json" }),
	options_json: text("options_json", { mode: "json" }),
	response: text("response"),
	response_json: text("response_json", { mode: "json" }),
	duration_ms: integer("duration_ms"),
	datetime_utc: integer("datetime_utc", { mode: "timestamp" }).notNull(),
	input_tokens: integer("input_tokens"),
	output_tokens: integer("output_tokens"),
	total_tokens: integer("total_tokens"),
	copied: integer("copied", { mode: "boolean" }).default(false)
}, (t) => [index("idx_responses_model").on(t.model)]);

//#endregion
//#region src/db/queries.ts
async function insertLog(log) {
	return await (await getDb()).insert(responses).values(log).returning();
}
async function getLogs(limit = 3) {
	return await (await getDb()).select().from(responses).orderBy(desc(responses.datetime_utc)).limit(limit);
}
async function getLogById(id) {
	return (await (await getDb()).select().from(responses).where(eq(responses.id, id)).limit(1))[0];
}
async function handleLogsCommand(args) {
	let limit = 10;
	let logId = null;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--path") {
			console.log(getDbPath());
			return;
		}
		if (arg === "-n" && args[i + 1]) {
			limit = Number.parseInt(args[i + 1], 10);
			i++;
			continue;
		}
		const maybeId = Number.parseInt(arg, 10);
		if (!Number.isNaN(maybeId)) logId = maybeId;
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

//#endregion
//#region src/logger.ts
const logRawStream = (typeof Bun !== "undefined" ? Bun.argv : process.argv).includes("--log-raw-stream");
function serializeError(error) {
	if (error instanceof Error) return {
		name: error.name,
		message: error.message,
		stack: error.stack
	};
	return { value: error };
}
const logger = {
	transformParams: async ({ type, params }) => {
		if (type === "stream" && logRawStream) return {
			...params,
			includeRawChunks: true
		};
		return params;
	},
	wrapGenerate: async ({ doGenerate, params, model: model$1 }) => {
		const system = params.prompt.find((p) => p.role === "system")?.content || void 0;
		const prompt = params.prompt.findLast((p) => p.role !== "system")?.content[0];
		console.log(prompt);
		const startTime = performance.now();
		const result = await doGenerate();
		const durationMs = Math.round(performance.now() - startTime);
		const datetimeUtc = new Date(performance.timeOrigin + performance.now());
		const response = result.content.map((c) => c.text).join("");
		await insertLog({
			model: model$1.modelId,
			prompt: prompt.text,
			system,
			prompt_json: params.prompt,
			options_json: params.providerOptions,
			response,
			response_json: result.response?.body || void 0,
			duration_ms: durationMs,
			datetime_utc: datetimeUtc,
			input_tokens: result.usage?.inputTokens,
			output_tokens: result.usage?.outputTokens,
			total_tokens: result.usage?.totalTokens
		});
		return result;
	},
	wrapStream: async ({ doStream, params, model: model$1 }) => {
		const system = params.prompt.find((p) => p.role === "system")?.content || void 0;
		const prompt = params.prompt.findLast((p) => p.role !== "system")?.content[0];
		const startTime = performance.now();
		const { stream, ...rest } = await doStream();
		const requestBody = rest.request?.body;
		const responseHeaders = rest.response?.headers;
		let generatedText = "";
		let responseMetadata;
		let warnings;
		let finishReason;
		let providerMetadata;
		let usage;
		const toolCalls = [];
		const toolResults = [];
		const errors = [];
		const rawChunks = [];
		const transformStream = new TransformStream({
			transform(chunk, controller) {
				switch (chunk.type) {
					case "stream-start":
						warnings = chunk.warnings;
						break;
					case "response-metadata":
						responseMetadata = {
							id: chunk.id,
							timestamp: chunk.timestamp,
							modelId: chunk.modelId
						};
						break;
					case "text-delta":
						generatedText += chunk.delta;
						break;
					case "tool-call":
						toolCalls.push(chunk);
						break;
					case "tool-result":
						toolResults.push(chunk);
						break;
					case "raw":
						if (logRawStream) rawChunks.push(chunk.rawValue);
						break;
					case "finish":
						finishReason = chunk.finishReason;
						usage = chunk.usage;
						providerMetadata = chunk.providerMetadata;
						break;
					case "error":
						errors.push(serializeError(chunk.error));
						break;
				}
				controller.enqueue(chunk);
			},
			async flush() {
				const durationMs = Math.round(performance.now() - startTime);
				const datetimeUtc = new Date(performance.timeOrigin + performance.now());
				const responseJson = {
					request: requestBody ? { body: requestBody } : void 0,
					response: responseHeaders ? { headers: responseHeaders } : void 0,
					stream: {
						warnings,
						responseMetadata,
						finishReason,
						usage,
						providerMetadata,
						toolCalls,
						toolResults,
						errors: errors.length > 0 ? errors : void 0
					}
				};
				if (logRawStream) responseJson.raw = rawChunks;
				await insertLog({
					model: model$1.modelId,
					prompt: prompt.text,
					system,
					prompt_json: params.prompt,
					options_json: params.providerOptions,
					response: generatedText,
					response_json: responseJson,
					duration_ms: durationMs,
					datetime_utc: datetimeUtc,
					input_tokens: usage?.inputTokens,
					output_tokens: usage?.outputTokens,
					total_tokens: usage?.totalTokens
				});
			}
		});
		return {
			stream: stream.pipeThrough(transformStream),
			...rest
		};
	}
};

//#endregion
//#region src/index.ts
const model = wrapLanguageModel({
	model: openai("gpt-4.1-mini"),
	middleware: [logger]
});
const SYSTEM_PROMPT = "You are a terminal assistant. Turn the natural language instructions into a terminal command. By default always only output code, and in a code block. DO NOT OUTPUT ADDITIONAL REMARKS ABOUT THE CODE YOU OUTPUT. Do not repeat the question the users asks. Do not add explanations for your code. Do not output any non-code words at all. Just output the code. Short is better. However, if the user is clearly asking a general question then answer it very briefly and well. Consider when the user request references a previous request.";
const FEW_SHOT_MESSAGES = [
	{
		role: "user",
		content: "get the current time from some website"
	},
	{
		role: "assistant",
		content: "curl -s http://worldtimeapi.org/api/ip | jq '.datetime'"
	},
	{
		role: "user",
		content: "print hi"
	},
	{
		role: "assistant",
		content: "echo \"hi\""
	}
];
async function handleQuery(query) {
	let printedLines = 0;
	function writeAndCount(text$1) {
		printedLines += (text$1.match(/\n/g) || []).length;
		process.stdout.write(text$1);
	}
	const messages = [
		{
			role: "system",
			content: SYSTEM_PROMPT
		},
		...FEW_SHOT_MESSAGES,
		{
			role: "user",
			content: query
		}
	];
	const spinner = ora("Generating response...").start();
	const result = streamText({
		model,
		messages
	});
	let message = "";
	for await (const chunk of result.fullStream) if (chunk.type === "text-delta") {
		if (spinner.isSpinning) {
			spinner.stop();
			writeAndCount("\n    ");
		}
		const text$1 = chunk.text;
		const indentedPart = text$1.replace(/\n/g, "\n   ");
		message += text$1;
		writeAndCount(indentedPart);
	}
	writeAndCount(chalk.gray(`\n\n${chalk.bold("Enter")} to copy to clipboard, ${chalk.bold("Ctrl+C")} to exit`));
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	rl.on("line", async () => {
		rl.close();
		try {
			await clipboard.write(message);
			readline.moveCursor(process.stdout, 0, -printedLines);
			readline.clearScreenDown(process.stdout);
			console.log("Copied to clipboard ✅");
			process.exit(0);
		} catch (error) {
			if (error instanceof Error) console.error(error.message);
			else console.error("Failed to copy to clipboard");
			console.error("Failed to copy to clipboard");
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
}
const program = new Command().name("q").description("Terminal AI assistant").argument("[query...]", "Natural language query").action(async (queryParts) => {
	const query = queryParts.join(" ");
	if (!query) {
		console.error("No query provided");
		process.exit(1);
	}
	await handleQuery(query);
});
program.command("logs").description("View query logs").option("--path", "Print database path").option("-n, --limit <number>", "Number of logs to show", "10").argument("[id]", "View specific log by ID").action(async (id, options) => {
	const args = [];
	if (options.path) args.push("--path");
	if (options.limit) args.push("-n", options.limit);
	if (id) args.push(id);
	await handleLogsCommand(args);
});
program.parse();

//#endregion
export {  };