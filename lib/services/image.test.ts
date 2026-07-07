import { readFileSync } from "fs";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { processAndStoreImage, UPLOADS_DIR } from "./image";

// Regression test for the HEIC upload bug (DECISIONS.md "HEIC upload support"): sharp's prebuilt
// binaries can't decode real (HEVC-encoded) .heic photos on their own, so processAndStoreImage
// pre-converts them via heic-convert first. fixtures/image/sample.heic is a real HEVC-encoded
// file (produced with macOS `sips -s format heic`), not a renamed JPEG — this only proves
// anything because the fixture is genuinely HEVC.
describe("processAndStoreImage HEIC support", () => {
  const testRelativeDir = path.posix.join("recipes", "image-test-heic-fixture");

  afterEach(async () => {
    await fs.rm(path.join(UPLOADS_DIR, testRelativeDir), { recursive: true, force: true });
  });

  it("decodes a real HEVC-encoded .heic file into a valid webp", async () => {
    const buffer = readFileSync(path.join(process.cwd(), "fixtures", "image", "sample.heic"));

    const { path: relativePath } = await processAndStoreImage(testRelativeDir, buffer, "image/heic");

    const absolutePath = path.join(UPLOADS_DIR, relativePath);
    const metadata = await sharp(absolutePath).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
  });
});
