#!/usr/bin/env node
import * as readline from "node:readline";
import { openai } from "@ai-sdk/openai";
import { type ModelMessage, streamText, wrapLanguageModel } from "ai";
import chalk from "chalk";
import clipboard from "clipboardy";
import { Command } from "commander";
import ora from "ora";
import { detectsContext, getContextMessages } from "./context";
import { handleLogsCommand, updateLogCopied } from "./db/queries";
import { getLastLogId, logger } from "./logger";

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

async function handleQuery(
	query: string,
	explicitContextLimit?: number,
): Promise<void> {
	let printedLines = 0;

	function writeAndCount(text: string) {
		printedLines += (text.match(/\n/g) || []).length;
		process.stdout.write(text);
	}

	// Determine context limit
	const shouldIncludeContext =
		explicitContextLimit !== undefined
			? explicitContextLimit > 0
			: detectsContext(query);

	const contextLimit = explicitContextLimit ?? (shouldIncludeContext ? 3 : 0);

	// Fetch context if needed
	let contextMessages: ModelMessage[] = [];
	if (contextLimit > 0) {
		contextMessages = await getContextMessages(contextLimit);
	}

	const messages: ModelMessage[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		...FEW_SHOT_MESSAGES,
		...contextMessages, // Insert context here
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

	writeAndCount(
		chalk.gray(
			`\n\n${chalk.bold("Enter")} to copy to clipboard, ${chalk.bold("Ctrl+C")} to exit`,
		),
	);

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	rl.on("line", async () => {
		rl.close();
		try {
			await clipboard.write(message);

			// Update the copied status in the database
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

const program = new Command()
	.name("q")
	.description("Terminal AI assistant")
	.argument("[query...]", "Natural language query")
	.option(
		"-c, --context <number>",
		"Include N previous interactions for context",
		"0",
	)
	.action(async (queryParts: string[], options: { context: string }) => {
		const query = queryParts.join(" ");
		if (!query) {
			console.error("No query provided");
			process.exit(1);
		}
		const contextLimit = Number.parseInt(options.context, 10);
		await handleQuery(query, contextLimit);
	});

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

program.parse();
