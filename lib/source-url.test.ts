import { describe, expect, it } from "vitest";
import { sourceKey } from "./source-url";

describe("sourceKey", () => {
  it("gives every way of writing a YouTube video the same key", () => {
    const keys = [
      "https://www.youtube.com/watch?v=SK38W29zHm8",
      "https://youtu.be/SK38W29zHm8?si=abc",
      "https://m.youtube.com/watch?v=SK38W29zHm8&t=30s",
      "https://www.youtube.com/shorts/SK38W29zHm8",
      "https://www.youtube.com/watch?v=SK38W29zHm8&list=PLabc&index=3",
    ].map(sourceKey);
    expect(new Set(keys)).toEqual(new Set(["yt:SK38W29zHm8"]));
  });

  it("ignores protocol, www, trailing slash, hash and tracking parameters on a page", () => {
    const keys = [
      "https://www.tudogostoso.com.br/receita/23-bolo-de-cenoura.html",
      "http://tudogostoso.com.br/receita/23-bolo-de-cenoura.html#comentarios",
      "https://www.tudogostoso.com.br/receita/23-bolo-de-cenoura.html?utm_source=whatsapp&fbclid=x",
    ].map(sourceKey);
    expect(new Set(keys)).toEqual(new Set(["tudogostoso.com.br/receita/23-bolo-de-cenoura.html"]));
    expect(sourceKey("https://site.com/receita/pudim/")).toBe(sourceKey("https://site.com/receita/pudim"));
  });

  it("keeps parameters that pick the page, and tells different pages apart", () => {
    expect(sourceKey("https://site.com/r.php?id=2&utm_medium=x")).toBe("site.com/r.php?id=2");
    expect(sourceKey("https://site.com/r.php?id=2")).not.toBe(sourceKey("https://site.com/r.php?id=3"));
    expect(sourceKey("https://youtube.com/watch?v=aaaaaaaaaaa")).not.toBe(sourceKey("https://youtube.com/watch?v=bbbbbbbbbbb"));
  });

  it("is null for something that isn't a web link", () => {
    expect(sourceKey(null)).toBeNull();
    expect(sourceKey("")).toBeNull();
    expect(sourceKey("bolo de cenoura")).toBeNull();
    expect(sourceKey("mailto:a@b.com")).toBeNull();
  });
});
