import { readFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { deleteImageFiles, processImage } from "./image";

// Regression test for the HEIC upload bug (DECISIONS.md "HEIC upload support"): sharp's prebuilt
// binaries can't decode real (HEVC-encoded) .heic photos on their own, so processAndStoreImage
// pre-converts them via heic-convert first (in processImage, before anything reaches S3). fixtures/image/sample.heic is a real HEVC-encoded
// file (produced with macOS `sips -s format heic`), not a renamed JPEG — this only proves
// anything because the fixture is genuinely HEVC.
describe("processImage HEIC support", () => {
  it("decodes a real HEVC-encoded .heic file into a valid webp and thumbnail", async () => {
    const buffer = readFileSync(path.join(process.cwd(), "fixtures", "image", "sample.heic"));

    const { full, thumb } = await processImage(buffer, "image/heic");

    for (const output of [full, thumb]) {
      const metadata = await sharp(output).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
    }
  });
});

// Regression test for DECISIONS.md "Fix: YouTube import uses the video thumbnail URL directly" —
// an external-URL recipeImage.path has no object of ours, so deleting it must not throw or send
// a delete for a nonsense key built from the URL (no S3 is configured in tests: it would throw).
describe("deleteImageFiles with an external URL", () => {
  it("is a no-op and does not throw", async () => {
    await expect(deleteImageFiles("https://i.ytimg.com/vi/abc123/hqdefault.jpg")).resolves.toBeUndefined();
  });
});
