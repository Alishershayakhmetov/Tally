CREATE TABLE `active_timer` (
	`task_id` text PRIMARY KEY NOT NULL,
	`first_started_at` integer NOT NULL,
	`utc_offset_min` integer NOT NULL,
	`running_since` integer,
	`accumulated_ms` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
