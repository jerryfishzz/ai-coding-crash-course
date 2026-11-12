CREATE TABLE `discussion_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` integer NOT NULL,
	`inbox_kind` text NOT NULL,
	`question_id` integer NOT NULL,
	`reply_id` integer,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `discussion_questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reply_id`,`question_id`) REFERENCES `discussion_replies`(`id`,`question_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "discussion_notifications_kind" CHECK("discussion_notifications"."inbox_kind" in ('notifications', 'discussion_inbox'))
);
--> statement-breakpoint
CREATE INDEX `discussion_notifications_order` ON `discussion_notifications` (`recipient_id`,`inbox_kind`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `discussion_notifications_unread` ON `discussion_notifications` (`recipient_id`,`inbox_kind`) WHERE "discussion_notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `discussion_notifications_question_unique` ON `discussion_notifications` (`recipient_id`,`inbox_kind`,`question_id`) WHERE "discussion_notifications"."reply_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `discussion_notifications_reply_unique` ON `discussion_notifications` (`recipient_id`,`inbox_kind`,`reply_id`) WHERE "discussion_notifications"."reply_id" is not null;--> statement-breakpoint
CREATE TABLE `discussion_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`edited_at` text,
	`deleted_at` text,
	`hidden_at` text,
	`hidden_by` integer,
	`resolved_at` text,
	`resolved_by` integer,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hidden_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `discussion_questions_lesson_order` ON `discussion_questions` (`lesson_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `discussion_questions_author_time` ON `discussion_questions` (`author_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `discussion_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`edited_at` text,
	`deleted_at` text,
	`hidden_at` text,
	`hidden_by` integer,
	FOREIGN KEY (`question_id`) REFERENCES `discussion_questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hidden_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `discussion_replies_question_order` ON `discussion_replies` (`question_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `discussion_replies_author_time` ON `discussion_replies` (`author_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `discussion_replies_id_question` ON `discussion_replies` (`id`,`question_id`);--> statement-breakpoint
CREATE TABLE `discussion_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reporter_id` integer NOT NULL,
	`question_id` integer,
	`reply_id` integer,
	`reason` text,
	`created_at` text NOT NULL,
	`outcome` text,
	`reviewed_at` text,
	`reviewed_by` integer,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `discussion_questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reply_id`) REFERENCES `discussion_replies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "discussion_reports_one_target" CHECK(("discussion_reports"."question_id" is null) <> ("discussion_reports"."reply_id" is null)),
	CONSTRAINT "discussion_reports_outcome" CHECK("discussion_reports"."outcome" is null or "discussion_reports"."outcome" in ('dismissed', 'hidden'))
);
--> statement-breakpoint
CREATE INDEX `discussion_reports_question_review` ON `discussion_reports` (`question_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `discussion_reports_reply_review` ON `discussion_reports` (`reply_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `discussion_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`default_enabled` integer DEFAULT false NOT NULL,
	CONSTRAINT "discussion_settings_singleton" CHECK("discussion_settings"."id" = 1),
	CONSTRAINT "discussion_settings_boolean" CHECK("discussion_settings"."default_enabled" in (0, 1))
);
--> statement-breakpoint
-- Add the checked column in place; rebuilding courses risks existing child rows.
ALTER TABLE `courses` ADD `discussion_override` text DEFAULT 'inherit' NOT NULL
  CONSTRAINT `courses_discussion_override` CHECK (`discussion_override` in ('inherit', 'enabled', 'disabled'));
--> statement-breakpoint
ALTER TABLE `lessons` ADD `discussion_paused` integer DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT INTO `discussion_settings` (`id`, `default_enabled`) VALUES (1, 0);
