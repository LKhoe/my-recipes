import { describe, expect, it } from "vitest";
import { extractMetaImageUrl, resolveImageUrl } from "./html-fetch";

describe("extractMetaImageUrl", () => {
  const page = "https://site.com.br/receitas/bolo";

  it("reads og:image, whatever the attribute order", () => {
    expect(extractMetaImageUrl('<meta content="https://cdn.site.com/bolo.jpg" property="og:image">', page)).toBe(
      "https://cdn.site.com/bolo.jpg",
    );
    expect(extractMetaImageUrl("<meta property='og:image' content='https://cdn.site.com/a.jpg?w=1&amp;h=2' />", page)).toBe(
      "https://cdn.site.com/a.jpg?w=1&h=2",
    );
  });

  it("prefers og:image over twitter:image and resolves relative URLs", () => {
    const html = '<meta name="twitter:image" content="/t.jpg"><meta property="og:image" content="/og.jpg">';
    expect(extractMetaImageUrl(html, page)).toBe("https://site.com.br/og.jpg");
    expect(extractMetaImageUrl('<meta name="twitter:image" content="t.jpg">', page)).toBe(
      "https://site.com.br/receitas/t.jpg",
    );
  });

  it("falls back to link rel=image_src, and is null without any", () => {
    expect(extractMetaImageUrl('<link rel="image_src" href="//cdn.site.com/x.png">', page)).toBe("https://cdn.site.com/x.png");
    expect(extractMetaImageUrl("<html><head><title>x</title></head></html>", page)).toBeNull();
  });
});

describe("resolveImageUrl", () => {
  it("only returns http(s) URLs", () => {
    expect(resolveImageUrl("data:image/png;base64,xx", "https://a.com")).toBeNull();
    expect(resolveImageUrl("javascript:alert(1)", "https://a.com")).toBeNull();
    expect(resolveImageUrl(null, "https://a.com")).toBeNull();
    expect(resolveImageUrl("img/a.jpg", "https://a.com/r/")).toBe("https://a.com/r/img/a.jpg");
  });
});
