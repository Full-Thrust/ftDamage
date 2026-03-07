import { promises as fs } from "fs";
import path from "path";
import { Ship } from "./model/Ship";
import { GenericShipClassJson, ShipInstanceJson } from "./model/types";

interface FleetShipRef {
  classKey: string;
  name: string;
  position: {
    x: number;
    y: number;
  };
  heading: number;
  speed: number;
  status: 0 | 1 | 2;
}

interface FleetFile {
  $schema?: string;
  name: string;
  ships: FleetShipRef[];
}

interface FleetInstancesFile {
  name: string;
  sourceFleetFile: string;
  ships: ShipInstanceJson[];
}

interface ScenarioInput {
  title: string;
  boardSize: number;
  fleets: Array<{
    name: string;
    file: string;
  }>;
}

const INPUT_DIR = "game";
const GENERATED_DIR = "generated";
const SCENARIO_FILE = "scenario.json";

function deepClone<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf-8");
  const normalized = content.replace(/^\uFEFF/, "");
  return JSON.parse(normalized) as T;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function sanitizeFileName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toFleetFileName(fleetName: string): string {
  return `${sanitizeFileName(fleetName)}.json`;
}

function toFleetSpecificShipName(originalShipName: string, classKey: string): string {
  const stripped = originalShipName.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return stripped.length > 0 ? stripped : classKey;
}

function toInstanceShip(fleetShip: FleetShipRef, def: GenericShipClassJson): ShipInstanceJson {
  const generatedName = toFleetSpecificShipName(fleetShip.name, fleetShip.classKey);
  const ship = new Ship(def, {
    name: generatedName,
    position: deepClone(fleetShip.position),
    heading: fleetShip.heading,
    speed: fleetShip.speed,
    status: fleetShip.status,
  });

  return ship.toJson();
}

async function readGenericShipClasses(genericDir: string): Promise<Map<string, GenericShipClassJson>> {
  const entries = await fs.readdir(genericDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".shipclass.json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const defs = new Map<string, GenericShipClassJson>();
  for (const fileName of files) {
    const fullPath = path.join(genericDir, fileName);
    const shipClass = await readJsonFile<GenericShipClassJson>(fullPath);
    defs.set(shipClass.classKey, shipClass);
  }

  return defs;
}

function assertFleetInput(fleet: FleetFile, scenarioFleetName: string, fileName: string): void {
  if (!fleet.name || !Array.isArray(fleet.ships)) {
    throw new Error(`Invalid fleet file structure: ${fileName}`);
  }
  if (fleet.name !== scenarioFleetName) {
    throw new Error(`Fleet name mismatch: scenario='${scenarioFleetName}', file='${fleet.name}'`);
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const inputDir = path.join(root, INPUT_DIR);
  const outputDir = path.join(root, GENERATED_DIR);
  const scenarioPath = path.join(inputDir, SCENARIO_FILE);
  const scenario = await readJsonFile<ScenarioInput>(scenarioPath);

  if (!Array.isArray(scenario.fleets) || scenario.fleets.length === 0) {
    throw new Error("scenario.json must define at least one fleet");
  }

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const genericDir = path.join(root, "generic");
  const defs = await readGenericShipClasses(genericDir);

  for (const fleetCfg of scenario.fleets) {
    const fleetPath = path.resolve(inputDir, fleetCfg.file);
    const fleetFromJson = await readJsonFile<FleetFile>(fleetPath);
    assertFleetInput(fleetFromJson, fleetCfg.name, fleetCfg.file);

    const instanceShips = fleetFromJson.ships.map((shipRef) => {
      const def = defs.get(shipRef.classKey);
      if (!def) {
        throw new Error(`Missing generic ship definition for classKey '${shipRef.classKey}' in fleet '${fleetCfg.name}'`);
      }
      return toInstanceShip(shipRef, def);
    });

    const fleetInstances: FleetInstancesFile = {
      name: fleetFromJson.name,
      sourceFleetFile: fleetCfg.file,
      ships: instanceShips,
    };

    const fleetFileName = toFleetFileName(fleetCfg.name);
    await writeJson(path.join(outputDir, fleetFileName), fleetInstances);

    const perShipDir = path.join(outputDir, sanitizeFileName(fleetCfg.name));
    await fs.mkdir(perShipDir, { recursive: true });

    for (const ship of fleetInstances.ships) {
      const baseName = ship.name.replace(/\s*\([^)]*\)\s*$/, "").trim();
      const shipFile = `${sanitizeFileName(baseName)}_${sanitizeFileName(ship.classKey)}.json`;
      await writeJson(path.join(perShipDir, shipFile), ship);
    }
  }

  console.log(`Generated fleet instances from scenario: ${scenarioPath}`);
  console.log(`Immutable input files are loaded from: ${inputDir}`);
  console.log(`Generated files are written to: ${outputDir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
