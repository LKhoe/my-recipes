import { describe, expect, it, vi } from "vitest";
import { parseJson3Captions, pickCaptionTrack, pickThumbnailUrl } from "./youtube";

describe("pickCaptionTrack", () => {
  const track = (language_code: string, kind?: string) => ({ base_url: `https://x/${language_code}`, language_code, kind });

  it("prefers a creator-made Portuguese track over an auto-generated one", () => {
    expect(pickCaptionTrack([track("pt", "asr"), track("pt-BR")])).toEqual(track("pt-BR"));
  });

  it("prefers auto-generated Portuguese over another language", () => {
    expect(pickCaptionTrack([track("en"), track("pt", "asr")])).toEqual(track("pt", "asr"));
  });

  it("falls back to a creator-made track, then to the first one", () => {
    expect(pickCaptionTrack([track("es", "asr"), track("en")])).toEqual(track("en"));
    expect(pickCaptionTrack([track("es", "asr")])).toEqual(track("es", "asr"));
    expect(pickCaptionTrack([])).toBeNull();
  });
});

describe("parseJson3Captions", () => {
  it("joins every segment and collapses whitespace", () => {
    const json = {
      events: [
        { tStartMs: 0 },
        { segs: [{ utf8: "oi" }, { utf8: " gente" }] },
        { segs: [{ utf8: "\n" }] },
        { segs: [{ utf8: "hoje   eu vou" }, {}] },
      ],
    };
    expect(parseJson3Captions(json)).toBe("oi gente hoje eu vou");
  });

  it("returns an empty string when there are no events", () => {
    expect(parseJson3Captions({})).toBe("");
  });
});

describe("pickThumbnailUrl", () => {
  const thumb = (size: string) => ({ url: `https://i.ytimg.com/vi/x/${size}.jpg` });

  it("prefers maxres, then standard, then high", () => {
    expect(pickThumbnailUrl({ high: thumb("hq"), maxres: thumb("maxres"), standard: thumb("sd") })).toBe(
      "https://i.ytimg.com/vi/x/maxres.jpg",
    );
    expect(pickThumbnailUrl({ high: thumb("hq"), standard: thumb("sd") })).toBe("https://i.ytimg.com/vi/x/sd.jpg");
    expect(pickThumbnailUrl({ default: thumb("default"), high: thumb("hq") })).toBe("https://i.ytimg.com/vi/x/hq.jpg");
  });

  it("returns null when there are no thumbnails", () => {
    expect(pickThumbnailUrl(undefined)).toBeNull();
    expect(pickThumbnailUrl({})).toBeNull();
  });
});

describe("fetchTranscriptText", () => {
  it("throws CaptionsBlockedError when YouTube answers the caption download with 429", async () => {
    vi.resetModules();
    vi.doMock("youtubei.js", () => ({
      Log: { setLevel: vi.fn(), Level: { ERROR: 1 } },
      Innertube: {
        create: async () => ({
          getBasicInfo: async () => ({
            captions: { caption_tracks: [{ base_url: "https://www.youtube.com/api/timedtext?v=x", language_code: "pt", kind: "asr" }] },
          }),
        }),
      },
    }));
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "<title>Sorry...</title>" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const youtube = await import("./youtube");
      await expect(youtube.fetchTranscriptText("x")).rejects.toBeInstanceOf(youtube.CaptionsBlockedError);

      // Any other failure is still just "no transcript".
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" });
      await expect(youtube.fetchTranscriptText("x")).resolves.toBeNull();
    } finally {
      global.fetch = originalFetch;
      vi.doUnmock("youtubei.js");
      vi.restoreAllMocks();
    }
  });
});
