import { describe, expect, it } from "vitest";
import { cleanVideoTitle, isYouTubePlaylistPage, parseYouTubePlaylistId } from "./youtube-utils";

describe("cleanVideoTitle", () => {
  it("drops the channel suffix and turns an all-caps title into sentence case", () => {
    expect(cleanVideoTitle("CORAÇÃO DE BOI ACEBOLADO// receitas,casa e coisas.")).toBe("Coração de boi acebolado");
    expect(cleanVideoTitle("Bolo de cenoura fofinho | Canal da Ana")).toBe("Bolo de cenoura fofinho");
  });

  it("keeps the casing of a title that is not mostly capitals", () => {
    expect(cleanVideoTitle("Pão de queijo mineiro da Vó Maria")).toBe("Pão de queijo mineiro da Vó Maria");
    expect(cleanVideoTitle("Bolo de cenoura com cobertura de Nutella")).toBe("Bolo de cenoura com cobertura de Nutella");
  });

  it("keeps the whole title when nothing comes before the separator", () => {
    expect(cleanVideoTitle("| Receita rápida")).toBe("| Receita rápida");
  });

  it("returns an empty string for an empty title", () => {
    expect(cleanVideoTitle("")).toBe("");
  });
});

describe("parseYouTubePlaylistId / isYouTubePlaylistPage", () => {
  it.each([
    ["https://www.youtube.com/playlist?list=PLabc123_-x", "PLabc123_-x", true],
    ["https://youtube.com/playlist?list=PLabc123", "PLabc123", true],
    ["https://m.youtube.com/playlist?list=PLabc123", "PLabc123", true],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123&index=2", "PLabc123", false],
    ["https://youtu.be/dQw4w9WgXcQ?list=PLabc123", "PLabc123", false],
    // Mixes and private lists aren't playlists the API can list.
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ", null, false],
    ["https://www.youtube.com/playlist?list=WL", null, false],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", null, false],
    ["https://example.com/playlist?list=PLabc123", null, false],
    ["not a url", null, false],
  ])("%s", (url, id, isPage) => {
    expect(parseYouTubePlaylistId(url)).toBe(id);
    expect(isYouTubePlaylistPage(url)).toBe(isPage);
  });
});
