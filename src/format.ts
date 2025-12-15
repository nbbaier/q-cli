import chalk from "chalk";
import type { SelectLog } from "./db/schema";

export function formatLogShort(log: SelectLog): string {
	const date = new Date(log.datetime_utc).toLocaleString();
	const copied = log.copied ? chalk.green("[copied]") : "";
	const prompt =
		log.prompt && log.prompt.length > 50
			? `${log.prompt.slice(0, 47)}...`
			: log.prompt;
	const response =
		log.response && log.response.length > 60
			? `${log.response.slice(0, 57)}...`
			: log.response;
	return `${chalk.dim(`#${log.id}`)} ${chalk.cyan(date)} ${copied}
  ${chalk.yellow(">")} ${prompt}
  ${chalk.green("$")} ${response}`;
}

export function formatLogFull(log: SelectLog): string {
	const date = new Date(log.datetime_utc).toLocaleString();
	const copied = log.copied ? chalk.green("yes") : chalk.gray("no");
	const tokens =
		log.total_tokens !== undefined
			? `${log.input_tokens ?? "?"}/${log.output_tokens ?? "?"} (${log.total_tokens} total)`
			: "N/A";
	const duration =
		log.duration_ms !== undefined ? `${log.duration_ms}ms` : "N/A";

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
