import { describe, expect, it, vi } from "vitest";
import { absoluteImageUrl, chooserScreen, formatMinutesShort, ingredientsScreen, stepScreen } from "./apl";

describe("absoluteImageUrl", () => {
  it("serves uploads' thumbnails from the public app URL", () => {
    expect(absoluteImageUrl("recipes/r1/photo.webp", "https://receitas.example.com/")).toBe(
      "https://receitas.example.com/api/uploads/recipes/r1/photo-thumb.webp",
    );
  });

  it("keeps external URLs and has nothing for no photo", () => {
    expect(absoluteImageUrl("https://i.ytimg.com/vi/x/hq.jpg", "https://a.b")).toBe("https://i.ytimg.com/vi/x/hq.jpg");
    expect(absoluteImageUrl(null, "https://a.b")).toBe("");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(absoluteImageUrl("recipes/r1/photo.webp")).toBe("");
    vi.unstubAllEnvs();
  });
});

describe("screens", () => {
  it("keeps recipe text in the datasource, never in the document", () => {
    const screen = stepScreen({
      title: "Bolo ${perigo}",
      stepIndex: 0,
      totalSteps: 2,
      text: "Misture ${tudo}.",
      rows: [{ kind: "item", text: "1 ovo", name: "ovo" }],
    });
    expect(JSON.stringify(screen.document)).not.toContain("perigo");
    expect(JSON.stringify(screen.document)).not.toContain("tudo");
    expect(screen.datasources.data.text).toBe("Misture ${tudo}.");
  });

  it("tracks progress and labels the last step's button", () => {
    const base = { title: "Bolo", text: "x", rows: [] };
    expect(stepScreen({ ...base, stepIndex: 0, totalSteps: 4 }).datasources.data).toMatchObject({
      progress: "25%",
      nextLabel: "Próximo",
      hasDuration: false,
    });
    expect(stepScreen({ ...base, stepIndex: 3, totalSteps: 4, durationMinutes: 90 }).datasources.data).toMatchObject({
      progress: "100%",
      nextLabel: "Concluir",
      hasDuration: true,
      durationLabel: "1 h 30 min",
    });
  });

  it("shows a callout only when there is one", () => {
    const base = { title: "Bolo", servingsLabel: "", imageUrl: "", rows: [], hasSteps: true };
    expect(ingredientsScreen(base).datasources.data.hasCallout).toBe(false);
    expect(
      ingredientsScreen({ ...base, callout: { title: "No lugar de ovo", lines: ["banana"] } }).datasources.data,
    ).toMatchObject({ hasCallout: true, callout: { lines: ["banana"] } });
  });

  it("numbers chooser cards for touch selection", () => {
    const screen = chooserScreen([{ title: "A", imageUrl: "", note: "" }]);
    expect(JSON.stringify(screen.document)).toContain('"arguments":["select","${index + 1}"]');
  });
});

describe("formatMinutesShort", () => {
  it("formats minutes and hours", () => {
    expect(formatMinutesShort(40)).toBe("40 min");
    expect(formatMinutesShort(60)).toBe("1 h");
    expect(formatMinutesShort(75)).toBe("1 h 15 min");
  });
});
