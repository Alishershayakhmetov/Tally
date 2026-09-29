CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`amount` integer NOT NULL,
	`source` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`utc_offset_min` integer NOT NULL,
	`local_date` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entries_task_day_idx` ON `entries` (`task_id`,`local_date`) WHERE "entries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `entries_task_time_idx` ON `entries` (`task_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emoji` text,
	`color` text NOT NULL,
	`measure` text DEFAULT 'count' NOT NULL,
	`unit_label` text,
	`target` integer NOT NULL,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`weekday_mask` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`increments` text NOT NULL,
	`reminder_time` text,
	`day_start_min` integer,
	`sort_order` real NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
