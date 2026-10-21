import { describe, expect, it, vi } from "vitest";
import { absoluteImageUrl, chooserScreen, formatMinutesShort, homeScreen, ingredientsScreen, stepScreen } from "./apl";

describe("absoluteImageUrl", () => {
  it("serves uploads' thumbnails from the public app URL", () => {
    expect(absoluteImageUrl("recipes/r1/photo.webp", "https://receitas.example.com/")).toBe(
      "https://receitas.example.com/api/uploads/recipes/r1/photo-thumb.webp?format=jpeg",
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
      steps: [{ text: "Misture ${tudo}." }, { text: "Asse." }],
      rows: [{ kind: "item", text: "1 ovo", name: "ovo" }],
    });
    expect(JSON.stringify(screen.document)).not.toContain("perigo");
    expect(JSON.stringify(screen.document)).not.toContain("tudo");
    expect(screen.datasources.data.steps).toContainEqual(expect.objectContaining({ text: "Misture ${tudo}." }));
  });

  it("lists the current step first, highlighted, then the ones still to come", () => {
    const steps = [{ text: "a" }, { text: "b", durationMinutes: 90 }, { text: "c" }, { text: "d" }];
    const data = stepScreen({ title: "Bolo", stepIndex: 1, steps, rows: [] }).datasources.data;
    expect(data.steps).toEqual([
      { number: 2, text: "b", durationLabel: "1 h 30 min", current: true },
      { number: 3, text: "c", durationLabel: "", current: false },
      { number: 4, text: "d", durationLabel: "", current: false },
    ]);
    expect(data).toMatchObject({ stepNumber: 2, totalSteps: 4, progress: "50%", nextLabel: "Próximo" });
  });

  it("labels the last step's button", () => {
    const data = stepScreen({ title: "Bolo", stepIndex: 1, steps: [{ text: "a" }, { text: "b" }], rows: [] }).datasources.data;
    expect(data).toMatchObject({ progress: "100%", nextLabel: "Concluir" });
  });

  it("shows a callout only when there is one", () => {
    const base = { title: "Bolo", servingsLabel: "", imageUrl: "", rows: [], hasSteps: true };
    expect(ingredientsScreen(base).datasources.data.hasCallout).toBe(false);
    expect(
      ingredientsScreen({ ...base, callout: { title: "No lugar de ovo", lines: ["banana"] } }).datasources.data,
    ).toMatchObject({ hasCallout: true, callout: { lines: ["banana"] } });
  });

  it("numbers chooser rows from the data, for both the label and the touch", () => {
    const screen = chooserScreen([
      { title: "A", imageUrl: "", note: "" },
      { title: "B", imageUrl: "https://x/b.jpg", note: "" },
    ]);
    expect(screen.datasources.data.options).toEqual([
      { title: "A", imageUrl: "", note: "", number: 1 },
      { title: "B", imageUrl: "https://x/b.jpg", note: "", number: 2 },
    ]);
    // `${index}` inside a row is the row's own child index: every card read "2." (bug).
    expect(JSON.stringify(screen.document)).not.toContain("index");
    expect(JSON.stringify(screen.document)).toContain('"arguments":["select","${data.number}"]');
  });

  it("offers a search box that sends what was typed, and 'Continuar' only with a recipe in progress", () => {
    const fresh = homeScreen({ subtitle: "Qual receita?", hint: "" });
    const doc = JSON.stringify(fresh.document);
    expect(doc).toContain('"type":"EditText"');
    expect(doc).toContain('"arguments":["search","${event.source.value}"]');
    expect(doc).toContain('"arguments":["search","${query}"]');
    expect(fresh.datasources.data.resumeTitle).toBe("");
    expect(homeScreen({ subtitle: "", hint: "", resumeTitle: "Bobó" }).datasources.data.resumeTitle).toBe("Bobó");
  });
});

describe("formatMinutesShort", () => {
  it("formats minutes and hours", () => {
    expect(formatMinutesShort(40)).toBe("40 min");
    expect(formatMinutesShort(60)).toBe("1 h");
    expect(formatMinutesShort(75)).toBe("1 h 15 min");
  });
});
