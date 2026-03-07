import assert from "assert";
import { promises as fs } from "fs";
import path from "path";
import { Ship } from "./model/Ship";
import { GenericShipClassJson } from "./model/types";
import { Ft1eDamageEngine } from "./damage/Ft1eDamageEngine";

const OUTPUT_DIR = path.join(process.cwd(), "test-output", "ship-damage-sim");

async function readGenericShipClasses(): Promise<Array<{ fileName: string; json: GenericShipClassJson }>> {
  const genericDir = path.join(process.cwd(), "generic");
  const entries = await fs.readdir(genericDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".shipclass.json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const result: Array<{ fileName: string; json: GenericShipClassJson }> = [];
  for (const fileName of files) {
    const fullPath = path.join(genericDir, fileName);
    const content = await fs.readFile(fullPath, "utf-8");
    result.push({ fileName, json: JSON.parse(content.replace(/^\uFEFF/, "")) as GenericShipClassJson });
  }

  return result;
}

function randomTenPercentStep(): number {
  return (Math.floor(Math.random() * 10) + 1) * 10;
}

function toRoundFilePrefix(round: number): string {
  return `round_${String(round).padStart(2, "0")}`;
}

async function writeRoundArtifacts(
  outputDir: string,
  round: number,
  ship: Ship,
  stepPercent: number,
  reportText: string
): Promise<void> {
  const prefix = toRoundFilePrefix(round);
  const jsonPath = path.join(outputDir, `${prefix}.json`);
  const htmlPath = path.join(outputDir, `${prefix}.html`);

  await fs.writeFile(jsonPath, ship.toJsonString(), "utf-8");

  const html = [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `<title>${ship.getClassKey()} ${prefix}</title>`,
    "<style>body{font-family:Segoe UI,Arial,sans-serif;margin:20px;background:#f4f6f8;color:#111827}.meta{background:#fff;border:1px solid #d1d5db;border-radius:8px;padding:10px;margin-bottom:12px}</style>",
    "</head>",
    "<body>",
    `<div class=\"meta\"><strong>Round:</strong> ${round} | <strong>Step:</strong> ${stepPercent}% | <strong>Summary:</strong> ${reportText}</div>`,
    ship.toHtmlReport(),
    "</body>",
    "</html>",
  ].join("\n");

  await fs.writeFile(htmlPath, html, "utf-8");
}

async function main(): Promise<void> {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const genericClasses = await readGenericShipClasses();
  const engine = new Ft1eDamageEngine();
  const indexRows: string[] = [];

  for (const item of genericClasses) {
    const classDir = path.join(OUTPUT_DIR, item.json.classKey.toLowerCase());
    await fs.mkdir(classDir, { recursive: true });

    const ship = new Ship(item.json);
    let round = 0;

    await writeRoundArtifacts(classDir, round, ship, 0, "Initial pristine state");

    while (ship.getStatus() !== 0) {
      round += 1;
      if (round > 50) {
        throw new Error(`Safety stop reached for ${item.json.classKey} (not destroyed after 50 rounds)`);
      }

      const stepPercent = randomTenPercentStep();
      const hits = Math.max(1, Math.round(ship.getDamageTotal() * (stepPercent / 100)));
      const report = engine.applyHits(ship, hits);

      assert(report.nextHits <= report.total, `${item.json.classKey}: hits exceeded total`);
      assert(ship.getDamageHits() <= ship.getDamageTotal(), `${item.json.classKey}: ship hit count exceeded total`);

      const reportText = [
        `requestedHits=${report.requestedHits}`,
        `appliedHits=${report.appliedHits}`,
        `damage=${report.previousHits}->${report.nextHits}/${report.total}`,
        `thresholds=${report.crossedThresholds.length ? report.crossedThresholds.join(",") : "none"}`,
      ].join(" | ");

      await writeRoundArtifacts(classDir, round, ship, stepPercent, reportText);
    }

    assert(ship.getStatus() === 0, `${item.json.classKey}: expected ship destroyed at end of simulation`);

    indexRows.push(
      `<tr><td>${item.json.classKey}</td><td>${round}</td><td><a href=\"./${item.json.classKey.toLowerCase()}/round_00.html\">initial</a></td><td><a href=\"./${item.json.classKey.toLowerCase()}/${toRoundFilePrefix(round)}.html\">final</a></td><td><a href=\"./${item.json.classKey.toLowerCase()}/\">folder</a></td></tr>`
    );
  }

  const indexHtml = [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "  <title>Ship Damage Simulation Test Output</title>",
    "  <style>body{font-family:Segoe UI,Arial,sans-serif;margin:20px;background:#f4f6f8;color:#111827}table{width:100%;border-collapse:collapse;background:#fff}th,td{border:1px solid #d1d5db;padding:8px}th{background:#eef2f7}</style>",
    "</head>",
    "<body>",
    "  <h1>Ship Damage Simulation Output</h1>",
    "  <p>Each class was instantiated from <code>generic/*.shipclass.json</code>, then damaged in random 10% increments until destroyed.</p>",
    "  <table>",
    "    <thead><tr><th>Class</th><th>Rounds To Destroy</th><th>Initial HTML</th><th>Final HTML</th><th>All Rounds</th></tr></thead>",
    `    <tbody>${indexRows.join("\n")}</tbody>`,
    "  </table>",
    "</body>",
    "</html>",
  ].join("\n");

  const indexPath = path.join(OUTPUT_DIR, "index.html");
  await fs.writeFile(indexPath, indexHtml, "utf-8");

  console.log(`Ship damage simulation completed for ${genericClasses.length} classes.`);
  console.log(`Open: ${indexPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
