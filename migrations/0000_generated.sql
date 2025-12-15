CREATE TABLE IF NOT EXISTS
   `responses` (
      `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      `model` text,
      `prompt` text,
      `system` text,
      `prompt_json` text,
      `options_json` text,
      `response` text,
      `response_json` text,
      `duration_ms` integer,
      `datetime_utc` integer NOT NULL,
      `input_tokens` integer,
      `output_tokens` integer,
      `total_tokens` integer,
      `copied` integer DEFAULT false
   );

CREATE INDEX IF NOT EXISTS `idx_responses_model` ON `responses` (`model`);