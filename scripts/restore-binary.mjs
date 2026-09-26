import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(path));
    else if (name.name.endsWith(".b64")) out.push(path);
  }
  return out;
}

const files = walk("public");
for (const b64Path of files) {
  const dest = b64Path.slice(0, -4);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(readFileSync(b64Path, "utf8"), "base64"));
}
console.log("restored", files.length, "images");
