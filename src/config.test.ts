import { afterEach, describe, expect, test } from "bun:test";
import {
	type CLIOptions,
	getConfig,
	getEffectiveConfig,
	resetConfigCache,
} from "./config";

describe("config", () => {
	// Reset config cache after each test
	afterEach(() => {
		resetConfigCache();
	});

	describe("getConfig", () => {
		test("returns default config values", () => {
			const config = getConfig();

			// Check cache defaults
			expect(config.cache.enabled).toBe(true);
			expect(config.cache.similarity_threshold).toBe(0.85);
			expect(config.cache.expiry_days).toBe(30);

			// Check defaults
			expect(config.defaults.model).toBe("gpt-4.1-mini");
			expect(config.defaults.context_limit).toBe(3);
			expect(config.defaults.verbose).toBe(false);
		});

		test("caches config on subsequent calls", () => {
			const config1 = getConfig();
			const config2 = getConfig();

			// Should be the same reference (cached)
			expect(config1).toBe(config2);
		});
	});

	describe("getEffectiveConfig", () => {
		test("returns base config when no CLI options", () => {
			const effectiveConfig = getEffectiveConfig();
			const baseConfig = getConfig();

			expect(effectiveConfig.cache.enabled).toBe(baseConfig.cache.enabled);
			expect(effectiveConfig.defaults.verbose).toBe(
				baseConfig.defaults.verbose,
			);
		});

		test("noCache option disables cache", () => {
			const options: CLIOptions = { noCache: true };
			const effectiveConfig = getEffectiveConfig(options);

			expect(effectiveConfig.cache.enabled).toBe(false);
		});

		test("verbose option overrides default", () => {
			const options: CLIOptions = { verbose: true };
			const effectiveConfig = getEffectiveConfig(options);

			expect(effectiveConfig.defaults.verbose).toBe(true);
		});

		test("context option overrides default", () => {
			const options: CLIOptions = { context: 5 };
			const effectiveConfig = getEffectiveConfig(options);

			expect(effectiveConfig.defaults.context_limit).toBe(5);
		});

		test("multiple options work together", () => {
			const options: CLIOptions = {
				noCache: true,
				verbose: true,
				context: 10,
			};
			const effectiveConfig = getEffectiveConfig(options);

			expect(effectiveConfig.cache.enabled).toBe(false);
			expect(effectiveConfig.defaults.verbose).toBe(true);
			expect(effectiveConfig.defaults.context_limit).toBe(10);
		});

		test("preserves non-overridden settings", () => {
			const options: CLIOptions = { verbose: true };
			const effectiveConfig = getEffectiveConfig(options);

			// These should remain unchanged
			expect(effectiveConfig.cache.similarity_threshold).toBe(0.85);
			expect(effectiveConfig.cache.expiry_days).toBe(30);
			expect(effectiveConfig.defaults.model).toBe("gpt-4.1-mini");
		});
	});
});
