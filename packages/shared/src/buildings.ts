// Empire Reborn — Building Attributes & Helpers
// Phase 4: Construction & Buildings

import {
  BuildingType,
  DepositType,
  NUM_BUILDING_TYPES,
  NUM_RESOURCE_TYPES,
  CITY_UPGRADE_TYPES,
  MAX_CITY_UPGRADES,
  TechType,
  NUM_TECH_TYPES,
} from "./constants.js";

// ─── Building Attributes ─────────────────────────────────────────────────────

export interface BuildingAttributes {
  type: BuildingType;
  name: string;
  buildTime: number;          // turns to build at level 1
  cost: readonly [number, number, number]; // [ore, oil, textile]
  isDepositBuilding: boolean; // true for Mine/OilWell/TextileFarm
  isCityUpgrade: boolean;     // true for University/Hospital/etc.
  techOutput: TechType | null; // which tech track this generates points for (null if none)
  techPerTurn: number;        // base output per turn at level 1
}

export const BUILDING_ATTRIBUTES: readonly BuildingAttributes[] = [
  // Deposit buildings
  {
    type: BuildingType.Mine,
    name: "Mine",
    buildTime: 4,
    cost: [10, 0, 5],
    isDepositBuilding: true,
    isCityUpgrade: false,
    techOutput: null,
    techPerTurn: 0,
  },
  {
    type: BuildingType.OilWell,
    name: "Oil Well",
    buildTime: 4,
    cost: [5, 10, 0],
    isDepositBuilding: true,
    isCityUpgrade: false,
    techOutput: null,
    techPerTurn: 0,
  },
  {
    type: BuildingType.TextileFarm,
    name: "Textile Farm",
    buildTime: 4,
    cost: [5, 0, 10],
    isDepositBuilding: true,
    isCityUpgrade: false,
    techOutput: null,
    techPerTurn: 0,
  },
  // City upgrades
  {
    type: BuildingType.University,
    name: "University",
    buildTime: 8,
    cost: [30, 0, 20],
    isDepositBuilding: false,
    isCityUpgrade: true,
    techOutput: TechType.Science,
    techPerTurn: 1,
  },
  {
    type: BuildingType.Hospital,
    name: "Hospital",
    buildTime: 8,
    cost: [20, 0, 30],
    isDepositBuilding: false,
    isCityUpgrade: true,
    techOutput: TechType.Health,
    techPerTurn: 1,
  },
  {
    type: BuildingType.TechLab,
    name: "Tech Lab",
    buildTime: 10,
    cost: [40, 20, 0],
    isDepositBuilding: false,
    isCityUpgrade: true,
    techOutput: TechType.Electronics,
    techPerTurn: 1,
  },
  {
    type: BuildingType.MilitaryAcademy,
    name: "Military Academy",
    buildTime: 10,
    cost: [30, 30, 0],
    isDepositBuilding: false,
    isCityUpgrade: true,
    techOutput: TechType.War,
    techPerTurn: 1,
  },
  {
    type: BuildingType.Shipyard,
    name: "Shipyard",
    buildTime: 8,
    cost: [40, 20, 10],
    isDepositBuilding: false,
    isCityUpgrade: true,
    techOutput: null,
    techPerTurn: 0,
  },
  {
    type: BuildingType.Airfield,
    name: "Airfield",
    buildTime: 8,
    cost: [30, 20, 10],
    isDepositBuilding: false,
    isCityUpgrade: true,
    techOutput: null,
    techPerTurn: 0,
  },
] as const;

// ─── Upgrade Costs (Level 2 and Level 3) ────────────────────────────────────

/** Upgrade costs for city upgrades: [level2Cost, level3Cost] */
export const UPGRADE_COSTS: Partial<Record<BuildingType, readonly [
  { cost: readonly [number, number, number]; buildTime: number },
  { cost: readonly [number, number, number]; buildTime: number },
]>> = {
  [BuildingType.University]: [
    { cost: [60, 0, 40], buildTime: 6 },
    { cost: [120, 0, 80], buildTime: 8 },
  ],
  [BuildingType.Hospital]: [
    { cost: [40, 0, 60], buildTime: 6 },
    { cost: [80, 0, 120], buildTime: 8 },
  ],
  [BuildingType.TechLab]: [
    { cost: [80, 40, 0], buildTime: 8 },
    { cost: [160, 80, 0], buildTime: 10 },
  ],
  [BuildingType.MilitaryAcademy]: [
    { cost: [60, 60, 0], buildTime: 8 },
    { cost: [120, 120, 0], buildTime: 10 },
  ],
  [BuildingType.Shipyard]: [
    { cost: [80, 40, 20], buildTime: 6 },
    { cost: [160, 80, 40], buildTime: 8 },
  ],
  [BuildingType.Airfield]: [
    { cost: [60, 40, 20], buildTime: 6 },
    { cost: [120, 80, 40], buildTime: 8 },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get building attributes by type */
export function getBuildingAttributes(type: BuildingType): BuildingAttributes {
  return BUILDING_ATTRIBUTES[type];
}

/** Map deposit type to the corresponding building type */
export function depositToBuildingType(depositType: DepositType): BuildingType {
  return depositType as number as BuildingType; // Mine=0=OreVein, OilWell=1, TextileFarm=2
}

/** Check if a building type is a city upgrade */
export function isCityUpgradeType(type: BuildingType): boolean {
  return BUILDING_ATTRIBUTES[type].isCityUpgrade;
}

/** Get the cost for building at a given level (1=initial, 2=upgrade, 3=upgrade) */
export function getBuildingCost(type: BuildingType, level: number): readonly [number, number, number] {
  if (level <= 1) return BUILDING_ATTRIBUTES[type].cost;
  const upgrades = UPGRADE_COSTS[type];
  if (!upgrades) return BUILDING_ATTRIBUTES[type].cost;
  return upgrades[level - 2]?.cost ?? BUILDING_ATTRIBUTES[type].cost;
}

/** Get the build time for building at a given level */
export function getBuildingTime(type: BuildingType, level: number): number {
  if (level <= 1) return BUILDING_ATTRIBUTES[type].buildTime;
  const upgrades = UPGRADE_COSTS[type];
  if (!upgrades) return BUILDING_ATTRIBUTES[type].buildTime;
  return upgrades[level - 2]?.buildTime ?? BUILDING_ATTRIBUTES[type].buildTime;
}

/** Check if player can afford a building */
export function canAffordBuilding(resources: readonly number[], type: BuildingType, level: number): boolean {
  const cost = getBuildingCost(type, level);
  for (let i = 0; i < NUM_RESOURCE_TYPES; i++) {
    if (resources[i] < cost[i]) return false;
  }
  return true;
}

/** Get tech output per turn for a building at a given level */
export function getBuildingTechOutput(type: BuildingType, level: number): number {
  const attrs = BUILDING_ATTRIBUTES[type];
  if (attrs.techOutput === null) return 0;
  return level; // Level 1 = +1/turn, Level 2 = +2/turn, Level 3 = +3/turn
}

/** Check if a city has room for another upgrade */
export function cityHasUpgradeSlot(upgradeIds: readonly number[]): boolean {
  return upgradeIds.length < MAX_CITY_UPGRADES;
}

/** Check if a city already has a specific upgrade type */
export function cityHasUpgradeType(
  upgradeIds: readonly number[],
  buildings: readonly { id: number; type: BuildingType }[],
  buildingType: BuildingType,
): boolean {
  for (const bid of upgradeIds) {
    const b = buildings.find((building) => building.id === bid);
    if (b && b.type === buildingType) return true;
  }
  return false;
}
