const fs = require("fs");
const path = require("path");
const http = require("http");

const repoRoot = path.resolve(__dirname, "..");
const generatedDir = path.join(repoRoot, "generated");
const outputFile = path.join(__dirname, "fleet.html");
const defaultPort = 4173;

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

function buildFleetSections(jsonFiles) {
  let shipCount = 0;
  const shipsByFleet = new Map();
  const errors = [];

  for (const filePath of jsonFiles) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);

      if (!isShipInstance(parsed)) {
        continue;
      }

      const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
      const parts = rel.split("/");
      if (parts.length < 3 || parts[0] !== "generated") {
        continue;
      }

      const fleetFolder = parts[1];
      if (!fleetFolder) {
        continue;
      }

      if (!shipsByFleet.has(fleetFolder)) {
        shipsByFleet.set(fleetFolder, []);
      }

      shipsByFleet.get(fleetFolder).push({ filePath, ship: parsed });
      shipCount += 1;
    } catch (err) {
      const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
      errors.push(
        `<details><summary>${escapeHtml(rel)}</summary><div class=\"error\">Failed to read JSON: ${escapeHtml(err.message || String(err))}</div></details>`
      );
    }
  }

  const fleetSections = Array.from(shipsByFleet.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fleetFolder, entries]) => {
      const shipList = entries
        .sort((a, b) => a.filePath.localeCompare(b.filePath))
        .map((entry) => renderShipCard(entry.filePath, entry.ship))
        .join("\n\n");

      return [
        "<section class=\"fleet-block\">",
        `  <h2>Fleet ${escapeHtml(String(fleetFolder).toUpperCase())} (${entries.length} ships)</h2>`,
        shipList || "  <div class=\"meta\">No ships listed.</div>",
        "</section>"
      ].join("\n");
    });

  return {
    sections: [...fleetSections, ...errors].join("\n\n"),
    fleetCount: shipsByFleet.size,
    shipCount,
  };
}

function buildFleetHtml() {
  const jsonFiles = walkJsonFiles(generatedDir).sort((a, b) => a.localeCompare(b));
  const fleetView = buildFleetSections(jsonFiles);
  const generatedAt = new Date().toISOString();

  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    "  <title>Fleet Browser View</title>",
    "  <style>",
    "    body { font-family: Segoe UI, Arial, sans-serif; margin: 20px; background: #f4f6f8; color: #1f2937; }",
    "    h1 { margin: 0 0 8px; }",
    "    h2 { margin: 16px 0 8px; font-size: 20px; color: #111827; }",
    "    .meta { margin: 0 0 16px; color: #374151; }",
    "    details { background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }",
    "    details.fleet-ship { margin: 10px 0 0; background: #fbfdff; }",
    "    .fleet-block { margin: 0 0 16px; }",
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
    `  <p class=\"meta\">JSON files: ${jsonFiles.length} | Fleet records: ${fleetView.fleetCount} | Ship records shown: ${fleetView.shipCount} | Generated at: ${generatedAt}</p>`,
    fleetView.sections || "  <p class=\"meta\">No JSON files found under generated/.</p>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

function writeStaticFile() {
  const html = buildFleetHtml();
  fs.writeFileSync(outputFile, html, "utf8");
  console.log(`Wrote ${outputFile} from generated/ data.`);
}

function startServer(port) {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || "/").split("?")[0];

    if (urlPath !== "/" && urlPath !== "/fleet") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const html = buildFleetHtml();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Fleet page server running at http://127.0.0.1:${port}/fleet`);
    console.log("Refresh the browser after editing generated ship JSON files.");
  });
}

const args = process.argv.slice(2);
if (args.includes("--serve")) {
  const portArg = args.find((arg) => arg.startsWith("--port="));
  const parsedPort = portArg ? Number(portArg.split("=")[1]) : defaultPort;
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : defaultPort;
  startServer(port);
} else {
  writeStaticFile();
}
