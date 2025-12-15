import { openai } from "@ai-sdk/openai";
import { wrapLanguageModel } from "ai";
import { logger } from "./logger";

export const model = wrapLanguageModel({
	model: openai("gpt-4.1-mini"),
	middleware: [logger],
});
