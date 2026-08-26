import { describe, expect, test } from "bun:test";
import { friendlyError, parseSseFrame, readSseStream, StreamStallError } from "../src/sse.ts";

describe("parseSseFrame", () => {
  test("reads a data payload", () => {
    const event = parseSseFrame('event: text\ndata: {"type":"text","text":"hi"}');
    expect(event).toEqual({ type: "text", text: "hi" });
  });

  test("reads a heartbeat", () => {
    expect(parseSseFrame('event: heartbeat\ndata: {"type":"heartbeat"}')).toEqual({ type: "heartbeat" });
  });
});

describe("readSseStream", () => {
  test("throws if the stream goes silent", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start() {},
    });
    await expect(readSseStream(stream, () => undefined, { stallMs: 25 })).rejects.toBeInstanceOf(
      StreamStallError,
    );
  });
});

describe("friendlyError", () => {
  test("maps status codes", () => {
    expect(friendlyError(429, "nope")).toMatch(/Too many requests/);
    expect(friendlyError(503, "{}")).toMatch(/unavailable/);
  });

  test("does not dump json blobs", () => {
    expect(friendlyError(500, '{"error":"rate_limited"}')).toBe("rate_limited");
    expect(friendlyError(500, '{"foo":1}')).toMatch(/retry/i);
  });

  test("hides stack traces", () => {
    expect(friendlyError(500, "Error\n    at foo (bar.ts:1:1)")).toMatch(/internal error/i);
  });
});
