// Copies @3d-dice/dice-box static assets (3D models, textures, ammo.wasm) into
// public/ so they're served as static files. Runs automatically via postinstall.
import { cpSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dest = join(root, "public/assets/dice-box");

mkdirSync(dest, { recursive: true });
cpSync(join(root, "node_modules/@3d-dice/dice-box/dist/assets"), dest, { recursive: true, force: true });
console.log("✓ dice-box assets copied to public/assets/dice-box/");

const themeSrc = join(root, "node_modules/@3d-dice/dice-themes/themes");
cpSync(themeSrc, join(dest, "themes"), { recursive: true, force: true });
console.log("✓ dice-themes copied to public/assets/dice-box/themes/");
