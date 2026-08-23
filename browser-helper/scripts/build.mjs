import { cp, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist");
for (const file of ["src/content.js", "src/popup.js"]) {
  const checked = spawnSync(
    process.execPath,
    ["--check", path.join(root, file)],
    {
      encoding: "utf8",
    },
  );
  if (checked.status !== 0)
    throw new Error(checked.stderr || `Syntax validation failed for ${file}`);
}
await mkdir(path.join(output, "src"), { recursive: true });
await cp(path.join(root, "manifest.json"), path.join(output, "manifest.json"));
await cp(path.join(root, "popup.html"), path.join(output, "popup.html"));
await cp(
  path.join(root, "src/content.js"),
  path.join(output, "src/content.js"),
);
await cp(path.join(root, "src/popup.js"), path.join(output, "src/popup.js"));
console.log(`RoleProwl browser helper built at ${output}`);
