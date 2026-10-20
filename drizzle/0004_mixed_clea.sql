CREATE TABLE `course_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`rating` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "course_ratings_range" CHECK("course_ratings"."rating" between 1 and 5 and typeof("course_ratings"."rating") = 'integer')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_ratings_course_user_unique` ON `course_ratings` (`course_id`,`user_id`);