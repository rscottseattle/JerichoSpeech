CREATE TABLE `live_channels` (
	`channel` text PRIMARY KEY NOT NULL,
	`source_text` text DEFAULT '' NOT NULL,
	`translated_text` text DEFAULT '' NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
