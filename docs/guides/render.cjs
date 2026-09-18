// Renders the two HTML guides to PDF with headless Chromium. Run from the repo root: node docs/guides/render.cjs
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const name of ["admin-dashboard-guide", "partner-dashboard-guide"]) {
    const file = path.resolve(__dirname, `${name}.html`);
    await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.pdf({ path: path.resolve(__dirname, `${name}.pdf`), format: "A4", printBackground: true, preferCSSPageSize: true });
    console.log("rendered", `${name}.pdf`);
  }
  await browser.close();
})();
