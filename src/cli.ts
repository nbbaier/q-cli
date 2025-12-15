import * as readline from "node:readline";
import { openai } from "@ai-sdk/openai";
import { Command } from "@commander-js/extra-typings";
import { type ModelMessage, streamText } from "ai";
import chalk from "chalk";
import clipboard from "clipboardy";
import ora from "ora";
import { handleLogsCommand, insertLog } from "./db/queries";

const SYSTEM_PROMPT =
	"You are a terminal assistant. Turn the natural language instructions into a terminal command. By default always only output code, and in a code block. DO NOT OUTPUT ADDITIONAL REMARKS ABOUT THE CODE YOU OUTPUT. Do not repeat the question the users asks. Do not add explanations for your code. Do not output any non-code words at all. Just output the code. Short is better. However, if the user is clearly asking a general question then answer it very briefly and well. Consider when the user request references a previous request.";

const FEW_SHOT_MESSAGES: ModelMessage[] = [
	{ role: "user", content: "get the current time from some website" },
	{
		role: "assistant",
		content: "curl -s http://worldtimeapi.org/api/ip | jq '.datetime'",
	},
	{ role: "user", content: "print hi" },
	{ role: "assistant", content: 'echo "hi"' },
];

async function handleQuery(query: string): Promise<void> {
	let printedLines = 0;

	function writeAndCount(text: string) {
		printedLines += (text.match(/\n/g) || []).length;
		process.stdout.write(text);
	}

	const messages: ModelMessage[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		...FEW_SHOT_MESSAGES,
		{ role: "user", content: query },
	];

	const spinner = ora("Generating response...").start();
	const startTime = performance.now();
	const modelId = "gpt-4.1-mini";

	const { textStream, usage } = streamText({
		model: openai(modelId),
		messages,
	});

	let message = "";
	for await (const textPart of textStream) {
		if (spinner.isSpinning) {
			spinner.stop();
			writeAndCount("\n    ");
		}
		const indentedPart = textPart.replace(/\n/g, "\n   ");
		message += textPart;
		writeAndCount(indentedPart);
	}

	const durationMs = Math.round(performance.now() - startTime);
	const tokenUsage = await usage;
	await insertLog({
		prompt: query,
		response: message,
		model: modelId,
		duration_ms: durationMs,
		datetime_utc: new Date(),
		input_tokens: tokenUsage.inputTokens,
		output_tokens: tokenUsage.outputTokens,
		total_tokens: tokenUsage.totalTokens,
		copied: false,
	});

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
	.action(async (queryParts) => {
		const query = queryParts.join(" ");
		if (!query) {
			console.error("No query provided");
			process.exit(1);
		}
		await handleQuery(query);
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
