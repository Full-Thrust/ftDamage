const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const generatedDir = path.join(repoRoot, "generated");
const outputFile = path.join(__dirname, "fleet.html");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function walkJsonFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(full));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(full);
    }
  }

  return files;
}

function statusLabel(status) {
  if (status === 0) return "Destroyed";
  if (status === 1) return "Operational";
  if (status === 2) return "Damaged";
  return String(status);
}

function countDestroyedBoxes(tracks) {
  if (!Array.isArray(tracks)) return 0;
  let count = 0;
  for (const row of tracks) {
    if (!Array.isArray(row)) continue;
    for (const box of row) {
      if (box === 0) count += 1;
    }
  }
  return count;
}

function renderField(label, value) {
  return `<div class=\"field\"><span class=\"label\">${escapeHtml(label)}:</span> <span>${escapeHtml(value)}</span></div>`;
}

function isShipInstance(value) {
  return Boolean(value && typeof value === "object" && value.classKey && value.position && value.damage);
}

function isFleetRecord(value) {
  return Boolean(value && typeof value === "object" && Array.isArray(value.ships));
}

function renderShipContent(ship) {
  const position = ship.position || {};
  const drive = ship.drive || {};
  const damage = ship.damage || {};
  const firecons = Array.isArray(ship.firecons) ? ship.firecons : [];
  const weapons = Array.isArray(ship.weapons) ? ship.weapons : [];

  const destroyed = countDestroyedBoxes(damage.tracks);
  const total = Number.isFinite(damage.total) ? damage.total : "?";

  const weaponRows = weapons.length
    ? weapons
        .map((w, i) => {
          const arcs = Array.isArray(w.arcs) ? w.arcs.join(", ") : "-";
          return [
            "<tr>",
            `  <td>${i + 1}</td>`,
            `  <td>${escapeHtml(w.type || "-")}</td>`,
            `  <td>${escapeHtml(w.class || "-")}</td>`,
            `  <td>${escapeHtml(arcs)}</td>`,
            `  <td>${escapeHtml(statusLabel(w.status))}</td>`,
            "</tr>"
          ].join("\n");
        })
        .join("\n")
    : "<tr><td colspan=\"5\">No weapons listed</td></tr>";

  return [
    "  <section class=\"grid\">",
    renderField("Name", ship.name || "-"),
    renderField("Class", ship.classKey || "-"),
    renderField("Ship Status", statusLabel(ship.status)),
    renderField("Position", `x=${position.x ?? "-"}, y=${position.y ?? "-"}`),
    renderField("Heading", ship.heading ?? "-"),
    renderField("Speed", ship.speed ?? "-"),
    renderField("Drive Thrust", drive.thrust ?? "-"),
    renderField("Drive Status", statusLabel(drive.status)),
    renderField("Damage", `${destroyed}/${total} boxes destroyed`),
    renderField("Fire Controls", firecons.length),
    "  </section>",
    "  <section>",
    "    <h3>Weapons</h3>",
    "    <table>",
    "      <thead><tr><th>#</th><th>Type</th><th>Class</th><th>Arcs</th><th>Status</th></tr></thead>",
    `      <tbody>${weaponRows}</tbody>`,
    "    </table>",
    "  </section>"
  ].join("\n");
}

function renderShipCard(filePath, ship) {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");

  return [
    "<details>",
    `  <summary>${escapeHtml(ship.name || "Unnamed Ship")} (${escapeHtml(ship.classKey || "Unknown")})</summary>`,
    "  <div class=\"path\">",
    `    Source: ${escapeHtml(rel)}`,
    "  </div>",
    renderShipContent(ship),
    "</details>"
  ].join("\n");
}

function renderFleetRecord(filePath, fleet) {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  const ships = Array.isArray(fleet.ships) ? fleet.ships : [];

  const shipList = ships
    .map((ship) => {
      return [
        "<details class=\"fleet-ship\">",
        `  <summary>${escapeHtml(ship.name || "Unnamed Ship")} (${escapeHtml(ship.classKey || "Unknown")})</summary>`,
        renderShipContent(ship),
        "</details>"
      ].join("\n");
    })
    .join("\n\n");

  return [
    "<details>",
    `  <summary>Fleet ${escapeHtml(fleet.name || "Unknown")} (${ships.length} ships)</summary>`,
    "  <div class=\"path\">",
    `    Source: ${escapeHtml(rel)}`,
    "  </div>",
    "  <section class=\"grid\">",
    renderField("Fleet Name", fleet.name || "-"),
    renderField("Source Fleet File", fleet.sourceFleetFile || "-"),
    renderField("Ship Count", ships.length),
    "  </section>",
    shipList || "  <div class=\"meta\">No ships listed.</div>",
    "</details>"
  ].join("\n");
}

const jsonFiles = walkJsonFiles(generatedDir).sort((a, b) => a.localeCompare(b));

let shipCount = 0;
let fleetCount = 0;

const sections = jsonFiles
  .map((filePath) => {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);

      if (isFleetRecord(parsed)) {
        fleetCount += 1;
        shipCount += Array.isArray(parsed.ships) ? parsed.ships.length : 0;
        return renderFleetRecord(filePath, parsed);
      }

      if (isShipInstance(parsed)) {
        shipCount += 1;
        return renderShipCard(filePath, parsed);
      }

      const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
      return `<details><summary>${escapeHtml(rel)}</summary><div class=\"error\">JSON format not recognized as ship or fleet record.</div></details>`;
    } catch (err) {
      const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
      return `<details><summary>${escapeHtml(rel)}</summary><div class=\"error\">Failed to read JSON: ${escapeHtml(err.message || String(err))}</div></details>`;
    }
  })
  .join("\n\n");

const generatedAt = new Date().toISOString();
const html = [
  "<!doctype html>",
  "<html lang=\"en\">",
  "<head>",
  "  <meta charset=\"utf-8\" />",
  "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
  "  <title>Fleet Browser View</title>",
  "  <style>",
  "    body { font-family: Segoe UI, Arial, sans-serif; margin: 20px; background: #f4f6f8; color: #1f2937; }",
  "    h1 { margin: 0 0 8px; }",
  "    .meta { margin: 0 0 16px; color: #374151; }",
  "    details { background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }",
  "    details.fleet-ship { margin: 10px 0 0; background: #fbfdff; }",
  "    summary { cursor: pointer; font-weight: 700; color: #111827; }",
  "    .path { margin-top: 8px; font-size: 12px; color: #6b7280; }",
  "    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 14px; margin-top: 10px; }",
  "    .field { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; }",
  "    .label { font-weight: 700; color: #111827; }",
  "    h3 { margin: 12px 0 8px; font-size: 14px; }",
  "    table { width: 100%; border-collapse: collapse; font-size: 13px; }",
  "    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }",
  "    th { background: #eef2f7; }",
  "    .error { margin-top: 8px; color: #991b1b; font-weight: 600; }",
  "  </style>",
  "</head>",
  "<body>",
  "  <h1>Generated Fleet Instances</h1>",
  `  <p class=\"meta\">JSON files: ${jsonFiles.length} | Fleet records: ${fleetCount} | Ship records shown: ${shipCount} | Generated at: ${generatedAt}</p>`,
  sections || "  <p class=\"meta\">No JSON files found under generated/.</p>",
  "</body>",
  "</html>",
  ""
].join("\n");

fs.writeFileSync(outputFile, html, "utf8");
console.log(`Wrote ${outputFile} from ${jsonFiles.length} JSON file(s).`);
