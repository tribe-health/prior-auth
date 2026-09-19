import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";

const webRoot = resolve(import.meta.dirname, "..");
const output = resolve(webRoot, "public/pglite-base.tgz");
const scratch = resolve(webRoot, "../.runtime/pglite-base-generation");

await rm(scratch, { recursive: true, force: true });
await mkdir(dirname(output), { recursive: true });
const database = await PGlite.create(scratch);
try {
  const archive = await database.dumpDataDir("gzip");
  await writeFile(output, new Uint8Array(await archive.arrayBuffer()));
} finally {
  await database.close();
  await rm(scratch, { recursive: true, force: true });
}
