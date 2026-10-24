CREATE TABLE `__new_course_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "course_ratings_range" CHECK("rating" between 1 and 5 and typeof("rating") = 'integer')
);
--> statement-breakpoint
-- Original submission times are unknown; backfill existing ratings at migration time.
INSERT INTO `__new_course_ratings` (`id`, `course_id`, `user_id`, `rating`, `created_at`, `updated_at`)
SELECT `id`, `course_id`, `user_id`, `rating`,
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `course_ratings`;
--> statement-breakpoint
DROP TABLE `course_ratings`;
--> statement-breakpoint
ALTER TABLE `__new_course_ratings` RENAME TO `course_ratings`;
--> statement-breakpoint
CREATE UNIQUE INDEX `course_ratings_course_user_unique` ON `course_ratings` (`course_id`,`user_id`);
