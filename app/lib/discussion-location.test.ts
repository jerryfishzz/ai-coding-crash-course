import { describe, expect, it } from "vitest";
import {
  discussionSearch,
  parseDiscussionSelection,
} from "./discussion-location";

describe("lesson discussion URLs", () => {
  it("defaults pages and interprets a reply deep link", () => {
    expect(
      parseDiscussionSelection(
        new URLSearchParams("question=42&reply=87&other=keep")
      )
    ).toEqual({
      questionsPage: 1,
      repliesPage: 1,
      questionId: 42,
      replyId: 87,
    });
  });
  it.each([
    "question=0",
    "question=-1",
    "question=1.2",
    "question=1e2",
    "question=",
    "reply=2",
    "questionsPage=1000000001",
    "repliesPage=Infinity",
    "question=1&question=2",
  ])("rejects malformed selections: %s", (search) => {
    expect(parseDiscussionSelection(new URLSearchParams(search))).toBeNull();
  });
  it("retains unrelated context and the question list page through thread navigation", () => {
    const thread = discussionSearch("?tab=notes&questionsPage=3&reply=8", {
      questionsPage: 3,
      questionId: 42,
      replyId: 87,
    });
    expect(thread).toBe("?tab=notes&questionsPage=3&question=42&reply=87");
    expect(discussionSearch(thread, { questionsPage: 3 })).toBe(
      "?tab=notes&questionsPage=3"
    );
    expect(
      discussionSearch(thread, {
        questionsPage: 3,
        questionId: 42,
        repliesPage: 2,
      })
    ).toBe("?tab=notes&questionsPage=3&question=42&repliesPage=2");
  });
});
