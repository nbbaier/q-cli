import chalk from "chalk";
import logUpdate from "log-update";

/**
 * Lightweight streaming markdown renderer for terminal output.
 * Handles the common markdown elements without heavy dependencies.
 */
export class StreamingMarkdown {
	private buffer = "";

	/**
	 * Append a chunk and re-render
	 */
	append(chunk: string): void {
		this.buffer += chunk;
		logUpdate(this.render(this.buffer));
	}

	/**
	 * Finalize output
	 */
	done(): void {
		logUpdate.done();
	}

	/**
	 * Clear buffer and terminal
	 */
	clear(): void {
		this.buffer = "";
		logUpdate.clear();
	}

	/**
	 * Get current buffer contents
	 */
	getBuffer(): string {
		return this.buffer;
	}

	/**
	 * Render markdown to terminal-styled string
	 */
	private render(text: string): string {
		const lines = text.split("\n");
		const rendered: string[] = [];

		let inCodeBlock = false;
		let codeBlockLang = "";
		let codeBlockContent: string[] = [];

		for (const line of lines) {
			// Code block start
			if (!inCodeBlock && line.startsWith("```")) {
				inCodeBlock = true;
				codeBlockLang = line.slice(3).trim();
				codeBlockContent = [];
				continue;
			}

			// Code block end
			if (inCodeBlock && line === "```") {
				inCodeBlock = false;
				rendered.push(
					this.renderCodeBlock(codeBlockContent.join("\n"), codeBlockLang),
				);
				codeBlockLang = "";
				codeBlockContent = [];
				continue;
			}

			// Inside code block - collect lines
			if (inCodeBlock) {
				codeBlockContent.push(line);
				continue;
			}

			// Regular line - apply inline formatting
			rendered.push(this.renderLine(line));
		}

		// Handle unclosed code block (streaming in progress)
		if (inCodeBlock) {
			rendered.push(
				this.renderCodeBlock(codeBlockContent.join("\n"), codeBlockLang, true),
			);
		}

		return rendered.join("\n");
	}

	/**
	 * Render a single line with inline formatting
	 */
	private renderLine(line: string): string {
		// Headers (must check before inline formatting)
		if (line.startsWith("#### ")) {
			return chalk.bold(line.slice(5));
		}
		if (line.startsWith("### ")) {
			return chalk.bold.blue(line.slice(4));
		}
		if (line.startsWith("## ")) {
			return chalk.bold.cyan(line.slice(3));
		}
		if (line.startsWith("# ")) {
			return chalk.bold.magenta(line.slice(2));
		}

		// Blockquotes
		if (line.startsWith("> ")) {
			return chalk.dim.italic(`│ ${this.renderInline(line.slice(2))}`);
		}

		// Unordered lists
		if (/^[\s]*[-*+] /.test(line)) {
			const match = line.match(/^([\s]*)([-*+]) (.*)$/);
			if (match) {
				const [, indent, , content] = match as [string, string, string, string];
				return `${indent + chalk.cyan("•")} ${this.renderInline(content)}`;
			}
		}

		// Ordered lists
		if (/^[\s]*\d+\. /.test(line)) {
			const match = line.match(/^([\s]*)(\d+)\. (.*)$/);
			if (match) {
				const [, indent, num, content] = match;
				return (
					indent +
					chalk.cyan(`${num}.`) +
					" " +
					this.renderInline(content || "")
				);
			}
		}

		// Horizontal rule
		if (/^[-*_]{3,}$/.test(line.trim())) {
			return chalk.dim("─".repeat(40));
		}

		return this.renderInline(line);
	}

	/**
	 * Apply inline formatting (bold, italic, code, links)
	 */
	private renderInline(text: string): string {
		let result = text;

		// Inline code (do first to prevent formatting inside code)
		result = result.replace(/`([^`]+)`/g, (_, code) => chalk.cyan(code));

		// Bold + italic
		result = result.replace(/\*\*\*(.+?)\*\*\*/g, (_, t) =>
			chalk.bold.italic(t),
		);

		// Bold
		result = result.replace(/\*\*(.+?)\*\*/g, (_, t) => chalk.bold(t));
		result = result.replace(/__(.+?)__/g, (_, t) => chalk.bold(t));

		// Italic
		result = result.replace(/\*(.+?)\*/g, (_, t) => chalk.italic(t));
		result = result.replace(/_(.+?)_/g, (_, t) => chalk.italic(t));

		// Strikethrough
		result = result.replace(/~~(.+?)~~/g, (_, t) => chalk.strikethrough(t));

		// Links [text](url) - show text underlined, dim the url
		result = result.replace(
			/\[([^\]]+)\]\(([^)]+)\)/g,
			(_, text, url) => chalk.underline(text) + chalk.dim(` (${url})`),
		);

		return result;
	}

	/**
	 * Render a code block with optional language label
	 */
	private renderCodeBlock(
		code: string,
		lang: string,
		incomplete = false,
	): string {
		const border = chalk.dim("│");
		const lines = code.split("\n");

		const header = lang
			? chalk.dim(
					`┌─ ${lang} ${incomplete ? "(streaming...)" : ""}${"─".repeat(Math.max(0, 30 - lang.length))}`,
				)
			: chalk.dim(`┌${"─".repeat(35)}`);

		const footer = incomplete ? "" : chalk.dim(`└${"─".repeat(35)}`);

		const body = lines
			.map((line) => `${border} ${chalk.white(line)}`)
			.join("\n");

		return [header, body, footer].filter(Boolean).join("\n");
	}
}

// ============================================================
// Demo / test
// ============================================================

const demoContent = `# Streaming Markdown Demo

This is a **bold statement** and some *italic text*.

Here's some ***bold and italic*** together, plus ~~strikethrough~~.

## Code Example

Here's some code:

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("world"));
\`\`\`

You can also use \`inline code\` in sentences.

## Lists

- First item with **bold**
- Second item with *italic*
- Third item with \`inline code\`

Ordered list:

1. Step one
2. Step two
3. Step three

## Other Features

> This is a blockquote that can contain
> **formatted** text as well.

Check out [this link](https://example.com) for more info.

---

And that's the end.
`;

async function runDemo() {
	const renderer = new StreamingMarkdown();
	const chunkSize = 3; // characters per chunk
	const delay = 15; // ms between chunks

	for (let i = 0; i < demoContent.length; i += chunkSize) {
		const chunk = demoContent.slice(i, i + chunkSize);
		renderer.append(chunk);
		await new Promise((r) => setTimeout(r, delay));
	}

	renderer.done();
}

// Run if executed directly
runDemo();
