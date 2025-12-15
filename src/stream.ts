import { openai } from "@ai-sdk/openai";
import { streamText, wrapLanguageModel } from "ai";

import { logger } from "./logger";

const model = wrapLanguageModel({
	model: openai("gpt-4.1-mini"),
	middleware: [logger],
});

const { textStream, usage } = streamText({
	model,
	system: "You are a inventive storyteller.",
	prompt: "Tell me a three sentence bedtime story about a unicorn",
});

for await (const textPart of textStream) {
	process.stdout.write(textPart);
}
