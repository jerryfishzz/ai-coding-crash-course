CREATE TABLE `__new_test_table` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
-- Existing creation times are unknown; the default records migration time.
INSERT INTO `__new_test_table` (`id`, `note`)
SELECT `id`, `note` FROM `test_table`;
--> statement-breakpoint
DROP TABLE `test_table`;
--> statement-breakpoint
ALTER TABLE `__new_test_table` RENAME TO `test_table`;
