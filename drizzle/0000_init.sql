CREATE TABLE `daily_extras` (
	`local_date` text PRIMARY KEY NOT NULL,
	`complications` text,
	`weight_kg` real,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`name_normalized` text NOT NULL,
	`display_fr` text NOT NULL,
	`triggers` text,
	`is_custom` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `foods_name_normalized_unique` ON `foods` (`name_normalized`);--> statement-breakpoint
CREATE TABLE `insights_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`food_id` text NOT NULL,
	`portion` text DEFAULT 'medium' NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`tz` text NOT NULL,
	`local_date` text NOT NULL,
	`name` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`photo_uri` text,
	`ai_confidence` text,
	`ai_raw` text,
	`is_draft` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_meals_local_date` ON `meals` (`local_date`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`diagnosis` text,
	`diagnosis_year` integer,
	`baseline_stools` text,
	`flare_status` text DEFAULT 'unknown',
	`goals` text,
	`obstacles` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `symptom_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`tz` text NOT NULL,
	`local_date` text NOT NULL,
	`kind` text NOT NULL,
	`bristol` integer,
	`urgency` integer,
	`blood` integer,
	`pain` integer,
	`pain_zone` text,
	`fatigue` integer,
	`wellbeing` integer,
	`extra_intestinal` text,
	`notes` text,
	`is_draft` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_symptom_entries_local_date` ON `symptom_entries` (`local_date`);--> statement-breakpoint
CREATE TABLE `treatment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`treatment_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`local_date` text NOT NULL,
	`kind` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`treatment_id`) REFERENCES `treatments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `treatments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text,
	`cadence_weeks` integer,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer
);
