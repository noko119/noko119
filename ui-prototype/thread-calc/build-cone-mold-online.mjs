/**
 * Build single-file cone-mold-online.html for htmlpreview / 双击打开.
 * Pre-injects default assembled SVG so the diagram is visible even if script is delayed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");

const { designConeMold } = await import(pathToFileURL(path.join(dir, "cone-mold-math.js")).href);
const { renderAssembledConeDiagram } = await import(
  pathToFileURL(path.join(dir, "cone-mold-diagram.js")).href
);
const defaultSvg = renderAssembledConeDiagram(designConeMold({}));

let html = read("cone-mold.html").replace("<!--DEFAULT_ASSY_SVG-->", defaultSvg);
const css = read("thread-calc.css");
const pipeMath = read("pipe-end-math.js").replace(/export\s+/g, "");
const coneMath = read("cone-mold-math.js")
  .replace(/import\s*\{[^}]+\}\s*from\s*["'][^"']+["']\s*;?\s*/g, "")
  .replace(/export\s+/g, "");
const coneDiagram = read("cone-mold-diagram.js").replace(/export\s+/g, "");
const app = read("cone-mold-app.js").replace(
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
  /<script type="module" src="\.\/cone-mold-app\.js"><\/script>/,
  `<script>\n${pipeMath}\n\n${coneMath}\n\n${coneDiagram}\n\n${app}\n</script>`
);

fs.writeFileSync(path.join(dir, "cone-mold-online.html"), html, "utf8");
fs.writeFileSync(path.join(dir, "锥管模具分段.html"), html, "utf8");
console.log("wrote cone-mold-online.html + 锥管模具分段.html", html.length, "svg", defaultSvg.length);
