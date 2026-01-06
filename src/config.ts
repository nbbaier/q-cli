import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CacheConfig {
	enabled: boolean;
	similarity_threshold: number;
	expiry_days: number;
}

export interface DefaultsConfig {
	model: string;
	context_limit: number;
	verbose: boolean;
}

export interface ApiConfig {
	openai_api_key: string | null;
}

export interface Config {
	cache: CacheConfig;
	defaults: DefaultsConfig;
	api: ApiConfig;
}

const DEFAULT_CONFIG: Config = {
	cache: {
		enabled: true,
		similarity_threshold: 0.85,
		expiry_days: 30,
	},
	defaults: {
		model: "gpt-4.1-mini",
		context_limit: 3,
		verbose: false,
	},
	api: {
		openai_api_key: null,
	},
};

function getConfigDir(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME;
	if (xdgConfigHome) {
		return join(xdgConfigHome, "q-cli");
	}
	return join(homedir(), ".config", "q-cli");
}

export function getConfigPath(): string {
	return join(getConfigDir(), "config.json");
}

function ensureConfigDir(): void {
	const dir = getConfigDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function loadConfigFile(): Partial<Config> {
	const configPath = getConfigPath();
	if (!existsSync(configPath)) {
		return {};
	}
	try {
		const content = readFileSync(configPath, "utf-8");
		return JSON.parse(content) as Partial<Config>;
	} catch {
		return {};
	}
}

export function saveConfig(config: {
	cache?: Partial<CacheConfig>;
	defaults?: Partial<DefaultsConfig>;
	api?: Partial<ApiConfig>;
}): void {
	ensureConfigDir();
	const configPath = getConfigPath();
	const existingConfig = loadConfigFile();
	const mergedConfig = deepMerge(existingConfig, config);
	writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), {
		mode: 0o600,
	});
}

function deepMerge<T extends Partial<Config>>(
	target: T,
	source: {
		cache?: Partial<CacheConfig>;
		defaults?: Partial<DefaultsConfig>;
		api?: Partial<ApiConfig>;
	},
): T {
	return {
		...target,
		cache: {
			...target.cache,
			...(source.cache || {}),
		},
		defaults: {
			...target.defaults,
			...(source.defaults || {}),
		},
		api: {
			...target.api,
			...(source.api || {}),
		},
	} as T;
}

// Cache for loaded config
let _config: Config | null = null;

export function getConfig(): Config {
	if (_config) return _config;

	const fileConfig = loadConfigFile();

	// Merge: defaults < file config < env vars
	const mergedConfig = deepMerge(DEFAULT_CONFIG, fileConfig) as Config;

	// Override API key from environment if not set in config
	if (!mergedConfig.api.openai_api_key) {
		mergedConfig.api.openai_api_key = process.env.OPENAI_API_KEY || null;
	}

	_config = mergedConfig;
	return _config;
}

// Reset config cache (useful for testing)
export function resetConfigCache(): void {
	_config = null;
}

// Get config with CLI overrides
export interface CLIOptions {
	noCache?: boolean;
	refresh?: boolean;
	verbose?: boolean;
	context?: number;
}

export function getEffectiveConfig(cliOptions: CLIOptions = {}): Config {
	const config = getConfig();

	return {
		...config,
		cache: {
			...config.cache,
			// --no-cache disables cache entirely for this query
			enabled: cliOptions.noCache ? false : config.cache.enabled,
		},
		defaults: {
			...config.defaults,
			verbose: cliOptions.verbose ?? config.defaults.verbose,
			context_limit: cliOptions.context ?? config.defaults.context_limit,
		},
	};
}

// Check if cache has been configured (first-run detection)
export function isCacheConfigured(): boolean {
	const configPath = getConfigPath();
	if (!existsSync(configPath)) {
		return false;
	}
	const fileConfig = loadConfigFile();
	return fileConfig.cache?.enabled !== undefined;
}

// Set cache enabled preference
export function setCacheEnabled(enabled: boolean): void {
	saveConfig({ cache: { enabled } });
	resetConfigCache();
}
