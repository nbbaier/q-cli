import type {
	LanguageModelV3Middleware,
	LanguageModelV3StreamPart,
	LanguageModelV3Text,
	LanguageModelV3TextPart,
} from "@ai-sdk/provider";
import { insertLog } from "./db/queries";

const argv = typeof globalThis !== "undefined" && "Bun" in globalThis ? (globalThis as Record<string, any>).Bun.argv : process.argv;
const logRawStream = argv.includes("--log-raw-stream");

let lastLogId: number | null = null;

export function getLastLogId(): number | null {
	return lastLogId;
}

export function setLastLogId(id: number | null): void {
	lastLogId = id;
}

function serializeError(error: unknown) {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	return { value: error };
}

export const logger: LanguageModelV3Middleware = {
	specificationVersion: "v3",
	transformParams: async ({ type, params }) => {
		if (type === "stream" && logRawStream) {
			return { ...params, includeRawChunks: true };
		}

		return params;
	},
	wrapGenerate: async ({ doGenerate, params, model }) => {
		const system =
			params.prompt.find((p) => p.role === "system")?.content || undefined;
		const prompt = params.prompt.findLast((p) => p.role !== "system")
			?.content[0] as LanguageModelV3TextPart;
		const startTime = performance.now();
		const result = await doGenerate();
		const durationMs = Math.round(performance.now() - startTime);
		const datetimeUtc = new Date(performance.timeOrigin + performance.now());

		const response = (result.content as LanguageModelV3Text[])
			.map((c) => c.text)
			.join("");

		const inputTokens = result.usage?.inputTokens?.total;
		const outputTokens = result.usage?.outputTokens?.total;
		const totalTokens =
			inputTokens != null && outputTokens != null
				? inputTokens + outputTokens
				: undefined;

		const logs = await insertLog({
			model: model.modelId,
			prompt: prompt.text,
			system,
			prompt_json: params.prompt,
			options_json: params.providerOptions,
			response,
			response_json: result.response?.body || undefined,
			duration_ms: durationMs,
			datetime_utc: datetimeUtc,
			input_tokens: inputTokens,
			output_tokens: outputTokens,
			total_tokens: totalTokens,
		});

		if (logs[0]?.id) {
			lastLogId = logs[0].id;
		}

		return result;
	},

	wrapStream: async ({ doStream, params, model }) => {
		const system =
			params.prompt.find((p) => p.role === "system")?.content || undefined;
		const prompt = params.prompt.findLast((p) => p.role !== "system")
			?.content[0] as LanguageModelV3TextPart;

		const startTime = performance.now();
		const { stream, ...rest } = await doStream();

		const requestBody = (rest as { request?: { body?: unknown } }).request
			?.body;
		const responseHeaders = (rest as { response?: { headers?: unknown } })
			.response?.headers;

		let generatedText = "";
		let responseMetadata:
			| { id?: string; timestamp?: Date; modelId?: string }
			| undefined;
		let warnings: unknown[] | undefined;
		let finishReason: unknown | undefined;
		let providerMetadata: unknown | undefined;
		let usage:
			| {
					inputTokens?: { total?: number };
					outputTokens?: { total?: number };
			  }
			| undefined;

		const toolCalls: unknown[] = [];
		const toolResults: unknown[] = [];
		const errors: unknown[] = [];
		const rawChunks: unknown[] = [];

		const transformStream = new TransformStream<
			LanguageModelV3StreamPart,
			LanguageModelV3StreamPart
		>({
			transform(chunk, controller) {
				switch (chunk.type) {
					case "stream-start": {
						warnings = chunk.warnings;
						break;
					}
					case "response-metadata": {
						responseMetadata = {
							id: chunk.id,
							timestamp: chunk.timestamp,
							modelId: chunk.modelId,
						};
						break;
					}
					case "text-delta": {
						generatedText += chunk.delta;
						break;
					}
					case "tool-call": {
						toolCalls.push(chunk);
						break;
					}
					case "tool-result": {
						toolResults.push(chunk);
						break;
					}
					case "raw": {
						if (logRawStream) rawChunks.push(chunk.rawValue);
						break;
					}
					case "finish": {
						finishReason = chunk.finishReason;
						usage = chunk.usage;
						providerMetadata = chunk.providerMetadata;
						break;
					}
					case "error": {
						errors.push(serializeError(chunk.error));
						break;
					}
				}

				controller.enqueue(chunk);
			},

			async flush() {
				const durationMs = Math.round(performance.now() - startTime);
				const datetimeUtc = new Date(
					performance.timeOrigin + performance.now(),
				);

				const responseJson: Record<string, unknown> = {
					request: requestBody ? { body: requestBody } : undefined,
					response: responseHeaders ? { headers: responseHeaders } : undefined,
					stream: {
						warnings,
						responseMetadata,
						finishReason,
						usage,
						providerMetadata,
						toolCalls,
						toolResults,
						errors: errors.length > 0 ? errors : undefined,
					},
				};

				if (logRawStream) {
					responseJson.raw = rawChunks;
				}

				const streamInputTokens = usage?.inputTokens?.total;
				const streamOutputTokens = usage?.outputTokens?.total;
				const streamTotalTokens =
					streamInputTokens != null && streamOutputTokens != null
						? streamInputTokens + streamOutputTokens
						: undefined;

				const logs = await insertLog({
					model: model.modelId,
					prompt: prompt.text,
					system,
					prompt_json: params.prompt,
					options_json: params.providerOptions,
					response: generatedText,
					response_json: responseJson,
					duration_ms: durationMs,
					datetime_utc: datetimeUtc,
					input_tokens: streamInputTokens,
					output_tokens: streamOutputTokens,
					total_tokens: streamTotalTokens,
				});

				if (logs[0]?.id) {
					lastLogId = logs[0].id;
				}
			},
		});

		return {
			stream: stream.pipeThrough(transformStream),
			...rest,
		};
	},
};
