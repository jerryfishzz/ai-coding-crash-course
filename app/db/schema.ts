import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from "drizzle-orm/sqlite-core";

export enum UserRole {
  Student = "student",
  Instructor = "instructor",
  Admin = "admin",
}

export enum CourseStatus {
  Draft = "draft",
  Published = "published",
  Archived = "archived",
}

export type DiscussionOverride = "inherit" | "enabled" | "disabled";
export type DiscussionInboxKind = "notifications" | "discussion_inbox";

export enum LessonProgressStatus {
  NotStarted = "not_started",
  InProgress = "in_progress",
  Completed = "completed",
}

export enum QuestionType {
  MultipleChoice = "multiple_choice",
  TrueFalse = "true_false",
}

export enum TeamMemberRole {
  Admin = "admin",
  Member = "member",
}

// ─── Tables ───

export const testTable = sqliteTable("test_table", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  note: text("note"),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().$type<UserRole>(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const courses = sqliteTable(
  "courses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    notes: text("notes"),
    salesCopy: text("sales_copy"),
    instructorId: integer("instructor_id")
      .notNull()
      .references(() => users.id),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    status: text("status").notNull().$type<CourseStatus>(),
    coverImageUrl: text("cover_image_url"),
    price: integer("price").notNull().default(0),
    pppEnabled: integer("ppp_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    discussionOverride: text("discussion_override")
      .notNull()
      .$type<DiscussionOverride>()
      .default("inherit"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    check(
      "courses_discussion_override",
      sql`${table.discussionOverride} in ('inherit', 'enabled', 'disabled')`
    ),
  ]
);

export const modules = sqliteTable("modules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseId: integer("course_id")
    .notNull()
    .references(() => courses.id),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const lessons = sqliteTable("lessons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moduleId: integer("module_id")
    .notNull()
    .references(() => modules.id),
  title: text("title").notNull(),
  content: text("content"),
  videoUrl: text("video_url"),
  githubRepoUrl: text("github_repo_url"),
  position: integer("position").notNull(),
  durationMinutes: integer("duration_minutes"),
  discussionPaused: integer("discussion_paused", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const enrollments = sqliteTable("enrollments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  courseId: integer("course_id")
    .notNull()
    .references(() => courses.id),
  enrolledAt: text("enrolled_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text("completed_at"),
});

export const lessonProgress = sqliteTable("lesson_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => lessons.id),
  status: text("status").notNull().$type<LessonProgressStatus>(),
  completedAt: text("completed_at"),
});

export const quizzes = sqliteTable("quizzes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => lessons.id),
  title: text("title").notNull(),
  passingScore: real("passing_score").notNull(),
});

export const quizQuestions = sqliteTable("quiz_questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quizId: integer("quiz_id")
    .notNull()
    .references(() => quizzes.id),
  questionText: text("question_text").notNull(),
  questionType: text("question_type").notNull().$type<QuestionType>(),
  position: integer("position").notNull(),
});

export const quizOptions = sqliteTable("quiz_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id")
    .notNull()
    .references(() => quizQuestions.id),
  optionText: text("option_text").notNull(),
  isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
});

export const quizAttempts = sqliteTable("quiz_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  quizId: integer("quiz_id")
    .notNull()
    .references(() => quizzes.id),
  score: real("score").notNull(),
  passed: integer("passed", { mode: "boolean" }).notNull(),
  attemptedAt: text("attempted_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const quizAnswers = sqliteTable("quiz_answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  attemptId: integer("attempt_id")
    .notNull()
    .references(() => quizAttempts.id),
  questionId: integer("question_id")
    .notNull()
    .references(() => quizQuestions.id),
  selectedOptionId: integer("selected_option_id")
    .notNull()
    .references(() => quizOptions.id),
});

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  courseId: integer("course_id")
    .notNull()
    .references(() => courses.id),
  pricePaid: integer("price_paid").notNull(),
  country: text("country"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const teamMembers = sqliteTable("team_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role").notNull().$type<TeamMemberRole>(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const coupons = sqliteTable("coupons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  courseId: integer("course_id")
    .notNull()
    .references(() => courses.id),
  code: text("code").notNull().unique(),
  purchaseId: integer("purchase_id")
    .notNull()
    .references(() => purchases.id),
  redeemedByUserId: integer("redeemed_by_user_id").references(() => users.id),
  redeemedAt: text("redeemed_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const videoWatchEvents = sqliteTable("video_watch_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => lessons.id),
  eventType: text("event_type").notNull(),
  positionSeconds: real("position_seconds").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const courseRatings = sqliteTable(
  "course_ratings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("course_ratings_course_user_unique").on(
      table.courseId,
      table.userId
    ),
    check(
      "course_ratings_range",
      sql`${table.rating} between 1 and 5 and typeof(${table.rating}) = 'integer'`
    ),
  ]
);

export const discussionSettings = sqliteTable(
  "discussion_settings",
  {
    id: integer("id").primaryKey(),
    defaultEnabled: integer("default_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    check("discussion_settings_singleton", sql`${table.id} = 1`),
    check(
      "discussion_settings_boolean",
      sql`${table.defaultEnabled} in (0, 1)`
    ),
  ]
);

const postTimestamps = () => ({
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  editedAt: text("edited_at"),
  deletedAt: text("deleted_at"),
  hiddenAt: text("hidden_at"),
  hiddenBy: integer("hidden_by").references(() => users.id),
});

export const discussionQuestions = sqliteTable(
  "discussion_questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    ...postTimestamps(),
    resolvedAt: text("resolved_at"),
    resolvedBy: integer("resolved_by").references(() => users.id),
  },
  (table) => [
    index("discussion_questions_lesson_order").on(
      table.lessonId,
      table.createdAt,
      table.id
    ),
    index("discussion_questions_author_time").on(
      table.authorId,
      table.createdAt
    ),
  ]
);

export const discussionReplies = sqliteTable(
  "discussion_replies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    questionId: integer("question_id")
      .notNull()
      .references(() => discussionQuestions.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    ...postTimestamps(),
  },
  (table) => [
    index("discussion_replies_question_order").on(
      table.questionId,
      table.createdAt,
      table.id
    ),
    index("discussion_replies_author_time").on(table.authorId, table.createdAt),
    uniqueIndex("discussion_replies_id_question").on(
      table.id,
      table.questionId
    ),
  ]
);

export const discussionReports = sqliteTable(
  "discussion_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reporterId: integer("reporter_id")
      .notNull()
      .references(() => users.id),
    questionId: integer("question_id").references(
      () => discussionQuestions.id,
      { onDelete: "cascade" }
    ),
    replyId: integer("reply_id").references(() => discussionReplies.id, {
      onDelete: "cascade",
    }),
    reason: text("reason"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    outcome: text("outcome").$type<"dismissed" | "hidden">(),
    reviewedAt: text("reviewed_at"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
  },
  (table) => [
    check(
      "discussion_reports_one_target",
      sql`(${table.questionId} is null) <> (${table.replyId} is null)`
    ),
    check(
      "discussion_reports_outcome",
      sql`${table.outcome} is null or ${table.outcome} in ('dismissed', 'hidden')`
    ),
    index("discussion_reports_question_review").on(
      table.questionId,
      table.reviewedAt
    ),
    index("discussion_reports_reply_review").on(
      table.replyId,
      table.reviewedAt
    ),
  ]
);

export const discussionNotifications = sqliteTable(
  "discussion_notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipientId: integer("recipient_id")
      .notNull()
      .references(() => users.id),
    inboxKind: text("inbox_kind").notNull().$type<DiscussionInboxKind>(),
    questionId: integer("question_id")
      .notNull()
      .references(() => discussionQuestions.id, { onDelete: "cascade" }),
    replyId: integer("reply_id"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    readAt: text("read_at"),
  },
  (table) => [
    check(
      "discussion_notifications_kind",
      sql`${table.inboxKind} in ('notifications', 'discussion_inbox')`
    ),
    foreignKey({
      columns: [table.replyId, table.questionId],
      foreignColumns: [discussionReplies.id, discussionReplies.questionId],
    }).onDelete("cascade"),
    index("discussion_notifications_order").on(
      table.recipientId,
      table.inboxKind,
      table.createdAt,
      table.id
    ),
    index("discussion_notifications_unread")
      .on(table.recipientId, table.inboxKind)
      .where(sql`${table.readAt} is null`),
    uniqueIndex("discussion_notifications_question_unique")
      .on(table.recipientId, table.inboxKind, table.questionId)
      .where(sql`${table.replyId} is null`),
    uniqueIndex("discussion_notifications_reply_unique")
      .on(table.recipientId, table.inboxKind, table.replyId)
      .where(sql`${table.replyId} is not null`),
  ]
);
