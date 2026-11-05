import { describe, expect, it, vi } from "vitest";
import { createUnreadController, type UnreadCounts } from "./unread-controller";

const initial = { notifications: 3, discussionInbox: 2 };
const zero = { notifications: 0, discussionInbox: 0 };
const sources = { lessonId: 1, questionId: 2, replyIds: [3] };
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve: (body: UnreadCounts, status = 200) =>
      resolve(Response.json(body, { status })),
  };
}

describe("layout unread request ordering", () => {
  it("discards superseded count responses", async () => {
    const first = deferred(),
      second = deferred();
    const send = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = createUnreadController(initial, send);
    const oldRequest = controller.refresh(),
      currentRequest = controller.refresh();
    second.resolve(zero);
    await currentRequest;
    first.resolve(initial);
    await oldRequest;
    expect(controller.snapshot()).toEqual(zero);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("invalidates a delayed GET when a receipt completes so cleared badges stay cleared", async () => {
    const delayed = deferred();
    const send = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(delayed.promise)
      .mockResolvedValueOnce(Response.json(zero));
    const controller = createUnreadController(initial, send);
    const older = controller.refresh();
    expect(await controller.acknowledge(sources, () => true)).toBe(true);
    expect(controller.snapshot()).toEqual(zero);
    delayed.resolve(initial);
    await older;
    expect(controller.snapshot()).toEqual(zero);
    expect(send.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(sources),
    });
  });

  it("does not publish a GET while a receipt is still pending", async () => {
    const pending = deferred();
    const send = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(
        Response.json({ notifications: 20, discussionInbox: 20 })
      );
    const controller = createUnreadController(initial, send);
    const receipt = controller.acknowledge(sources, () => true);
    await controller.refresh();
    expect(controller.snapshot()).toEqual(initial);
    pending.resolve(zero);
    await receipt;
    expect(controller.snapshot()).toEqual(zero);
  });

  it("refreshes after overlapping receipts complete out of order rather than trusting an older snapshot", async () => {
    const first = deferred(),
      second = deferred();
    const send = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValue(Response.json(zero));
    const controller = createUnreadController(initial, send);
    const older = controller.acknowledge(sources, () => false);
    expect(send).not.toHaveBeenCalled();
    await older;
    const one = controller.acknowledge(sources, () => true);
    const two = controller.acknowledge(
      { ...sources, replyIds: [4] },
      () => true
    );
    second.resolve({ notifications: 1, discussionInbox: 1 });
    await two;
    expect(controller.snapshot()).toEqual(initial);
    first.resolve({ notifications: 2, discussionInbox: 2 });
    await one;
    await vi.waitFor(() => expect(controller.snapshot()).toEqual(zero));
    expect(send.mock.calls[2][0]).toBe("/api/discussions/unread");
  });

  it("discards responses belonging to an unmounted actor and never notifies that actor's subscribers", async () => {
    const delayed = deferred();
    const controller = createUnreadController(
      initial,
      vi.fn<typeof fetch>().mockReturnValue(delayed.promise)
    );
    const changed = vi.fn();
    controller.subscribe(changed);
    const pending = controller.acknowledge(sources, () => true);
    controller.stop();
    delayed.resolve(zero);
    await pending;
    expect(controller.snapshot()).toEqual(initial);
    expect(changed).not.toHaveBeenCalled();
  });

  it("retains confirmed counts after transport/server/invalid-payload failures and succeeds on a later receipt", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ notifications: -1, discussionInbox: 0 })
      )
      .mockResolvedValueOnce(Response.json(zero));
    const controller = createUnreadController(initial, send);
    await controller.refresh();
    await controller.refresh();
    await controller.refresh();
    expect(controller.snapshot()).toEqual(initial);
    expect(await controller.acknowledge(sources, () => true)).toBe(true);
    expect(controller.snapshot()).toEqual(zero);
  });
});
