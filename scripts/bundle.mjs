// Bundles the plain scripts that run INSIDE the production container (the entrypoint's migrate and
// seed, and the operator's create-invite) into self-contained files, so the image doesn't need a
// node_modules tree for them. Output: dist-scripts/<name>.mjs. Run in the Docker builder stage:
//
//   npm run scripts:bundle
//
// upload-photos-to-s3.mjs is not bundled: it needs sharp's native binaries and is run from a
// development machine (see DEPLOY.md), not in the container.
import { build } from "esbuild";

await build({
  entryPoints: ["scripts/migrate.mjs", "scripts/seed.mjs", "scripts/create-invite.mjs"],
  outdir: "dist-scripts",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  // pg's optional native binding: absent on purpose, pg falls back to pure JS when it can't load.
  external: ["pg-native"],
  // pg and drizzle ship CommonJS with dynamic require()s, which an ES module bundle needs a shim for.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});
