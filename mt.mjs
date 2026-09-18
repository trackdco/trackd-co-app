import { webkit } from "playwright";
const b = await webkit.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4 });
await pg.goto("https://trackdco.app/", { waitUntil: "networkidle" });
for (const [sel, name] of [["#movement-title", "mv"], ["#close-title", "cl"]]) {
  await pg.locator(sel).first().scrollIntoViewIfNeeded();
  await pg.waitForTimeout(3000);
  const painted = await pg.evaluate((s) => {
    const svg = document.querySelector(s + " .lp-ink");
    const ps = [...svg.querySelectorAll("path")].filter((p) => !p.closest("mask"));
    return { strokes: ps.length, transforms: ps.filter((p) => p.getAttribute("transform")).length };
  }, sel);
  const r = await pg.evaluate((s) => { const v = document.querySelector(s + " .lp-ink").getBoundingClientRect(); return { x: v.left - 6, y: v.top - 8, width: v.width + 12, height: 34 }; }, sel);
  await pg.screenshot({ path: `/tmp/lp2/prod-${name}.png`, clip: r });
  console.log(name + " " + JSON.stringify(painted));
}
await b.close();
