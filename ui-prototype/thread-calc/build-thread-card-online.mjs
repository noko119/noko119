/**
 * Build single-file thread-card-online.html for htmlpreview / 双击打开.
 * Uses string replace (not regex on script body) to avoid \\n corruption.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");

let html = read("thread-card.html");
const css = read("thread-calc.css");
const math = read("pipe-end-math.js").replace(/export\s+/g, "");
const app = read("thread-card-app.js").replace(
  /import\s*\{[^}]+\}\s*from\s*["'][^"']+["']\s*;?\s*/g,
  ""
);

const pageStyleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const pageStyle = pageStyleMatch ? pageStyleMatch[1] : "";

html = html.replace(
  /<link rel="stylesheet" href="\.\/thread-calc\.css" \/>\s*<style>[\s\S]*?<\/style>/,
  `<style>\n${css}\n${pageStyle}\n</style>`
);

html = html.replace(
  /<script type="module" src="\.\/thread-card-app\.js"><\/script>/,
  `<script>\n${math}\n\n${app}\n</script>`
);

fs.writeFileSync(path.join(dir, "thread-card-online.html"), html, "utf8");
fs.writeFileSync(path.join(dir, "螺纹端头结构表.html"), html, "utf8");
console.log("wrote thread-card-online.html + 螺纹端头结构表.html", html.length);
