// Empire Reborn — Building Attributes & Helpers
// Phase 4: Construction & Buildings + Phase 7B: Defensive & Naval Structures

import {
  BuildingType,
  DepositType,
  NUM_BUILDING_TYPES,
  NUM_RESOURCE_TYPES,
  CITY_UPGRADE_TYPES,
  DEFENSIVE_STRUCTURE_TYPES,
  NAVAL_STRUCTURE_TYPES,
  MAX_CITY_UPGRADES,
  TechType,
  NUM_TECH_TYPES,
  UnitType,
  TerrainType,
} from "./constants.js";

// ─── Building Attributes ─────────────────────────────────────────────────────

export interface BuildingAttributes {
  type: BuildingType;
  name: string;
  buildTime: number;          // turns to build at level 1
  cost: readonly [number, number, number]; // [ore, oil, textile]
  isDepositBuilding: boolean; // true for Mine/OilWell/TextileFarm
  isCityUpgrade: boolean;     // true for University/Hospital/etc.
  isDefensiveStructure: boolean; // true for Bunker/AntiAir/etc.
  isNavalStructure: boolean;  // true for Bridge/SeaMine/OffshorePlatform
  techOutput: TechType | null; // which tech track this generates points for (null if none)
  techPerTurn: number;        // base output per turn at level 1
  // Structure combat fields (only for defensive/naval structures)
  maxHp: number;              // structure hit points (0 for non-combat buildings)
  strength: number;           // auto-attack damage (0 = no attack)
  attackRange: number;        // auto-attack range in Chebyshev distance (0 = adjacent only)
  invisible: boolean;         // true for mines/sea mines (hidden on enemy viewMap)
  singleUse: boolean;         // true for mines (destroyed after triggering)
  visionRadius: number;       // extra permanent vision range (0 = none, 5 for Radar)
  targetAir: boolean;         // can target air units (fighters, AWACS)
  targetSea: boolean;         // can target sea units (ships)
  targetLand: boolean;        // can target land units
}

export const BUILDING_ATTRIBUTES: readonly BuildingAttributes[] = [
  // Deposit buildings
  {
    type: BuildingType.Mine, name: "Mine", buildTime: 4, cost: [10, 0, 5],
    isDepositBuilding: true, isCityUpgrade: false, isDefensiveStructure: false, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 0, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.OilWell, name: "Oil Well", buildTime: 4, cost: [5, 10, 0],
    isDepositBuilding: true, isCityUpgrade: false, isDefensiveStructure: false, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 0, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.TextileFarm, name: "Textile Farm", buildTime: 4, cost: [5, 0, 10],
    isDepositBuilding: true, isCityUpgrade: false, isDefensiveStructure: false, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 0, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  // City upgrades
  {
    type: BuildingType.University, name: "University", buildTime: 8, cost: [30, 0, 20],
    isDepositBuilding: false, isCityUpgrade: true, isDefensiveStructure: false, isNavalStructure: false,
    techOutput: TechType.Science, techPerTurn: 1,
    maxHp: 0, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.Hospital, name: "Hospital", buildTime: 8, cost: [20, 0, 30],
    isDepositBuilding: false, isCityUpgrade: true, isDefensiveStructure: false, isNavalStructure: false,
    techOutput: TechType.Health, techPerTurn: 1,
    maxHp: 0, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.TechLab, name: "Tech Lab", buildTime: 10, cost: [40, 20, 0],
    isDepositBuilding: false, isCityUpgrade: true, isDefensiveStructure: false, isNavalStructure: false,
    techOutput: TechType.Electronics, techPerTurn: 1,
    maxHp: 0, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.MilitaryAcademy, name: "Military Academy", buildTime: 10, cost: [30, 30, 0],
    isDepositBuilding: false, isCityUpgrade: true, isDefensiveStructure: false, isNavalStructure: false,
    techOutput: TechType.War, techPerTurn: 1,
    maxHp: 0, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.Shipyard, name: "Shipyard", buildTime: 8, cost: [40, 20, 10],
    isDepositBuilding: false, isCityUpgrade: true, isDefensiveStructure: false, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 0, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.Airfield, name: "Airfield", buildTime: 8, cost: [30, 20, 10],
    isDepositBuilding: false, isCityUpgrade: true, isDefensiveStructure: false, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 0, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  // ─── Defensive Structures (built by Construction unit on land) ─────────────
  {
    type: BuildingType.Bunker, name: "Bunker", buildTime: 4, cost: [15, 0, 5],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: true, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 5, strength: 2, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: true,
  },
  {
    type: BuildingType.AntiAir, name: "Anti-Air Battery", buildTime: 6, cost: [40, 30, 0],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: true, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 5, strength: 3, attackRange: 2, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: true, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.CoastalBattery, name: "Coastal Battery", buildTime: 8, cost: [50, 40, 0],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: true, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 8, strength: 4, attackRange: 2, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: true, targetLand: false,
  },
  {
    type: BuildingType.RadarStation, name: "Radar Station", buildTime: 6, cost: [30, 20, 0],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: true, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 3, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 5,
    targetAir: false, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.ArtilleryFort, name: "Artillery Fort", buildTime: 10, cost: [60, 30, 0],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: true, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 10, strength: 5, attackRange: 3, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: true,
  },
  {
    type: BuildingType.Minefield, name: "Minefield", buildTime: 3, cost: [10, 5, 0],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: true, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 1, strength: 2, attackRange: 0, invisible: true, singleUse: true, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: true,
  },
  {
    type: BuildingType.SAMSite, name: "SAM Site", buildTime: 8, cost: [50, 40, 10],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: true, isNavalStructure: false,
    techOutput: null, techPerTurn: 0,
    maxHp: 6, strength: 5, attackRange: 3, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: true, targetSea: false, targetLand: false,
  },
  // ─── Naval Structures (built by Engineer Boat on water) ────────────────────
  {
    type: BuildingType.Bridge, name: "Bridge", buildTime: 6, cost: [30, 10, 10],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: false, isNavalStructure: true,
    techOutput: null, techPerTurn: 0,
    maxHp: 5, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
  {
    type: BuildingType.SeaMine, name: "Sea Mine", buildTime: 2, cost: [10, 5, 0],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: false, isNavalStructure: true,
    techOutput: null, techPerTurn: 0,
    maxHp: 1, strength: 3, attackRange: 0, invisible: true, singleUse: true, visionRadius: 0,
    targetAir: false, targetSea: true, targetLand: false,
  },
  {
    type: BuildingType.OffshorePlatform, name: "Offshore Platform", buildTime: 8, cost: [40, 20, 0],
    isDepositBuilding: false, isCityUpgrade: false, isDefensiveStructure: false, isNavalStructure: true,
    techOutput: null, techPerTurn: 0,
    maxHp: 4, strength: 0, attackRange: 0, invisible: false, singleUse: false, visionRadius: 0,
    targetAir: false, targetSea: false, targetLand: false,
  },
] as const;

// ─── Structure Tech Requirements ────────────────────────────────────────────

/** Tech requirements for building structures. Only structures that require tech. */
export const STRUCTURE_TECH_REQUIREMENTS: Partial<Record<BuildingType, { track: TechType; level: number }[]>> = {
  [BuildingType.AntiAir]: [{ track: TechType.Science, level: 3 }],
  [BuildingType.CoastalBattery]: [{ track: TechType.Science, level: 4 }],
  [BuildingType.RadarStation]: [{ track: TechType.Electronics, level: 2 }],
  [BuildingType.ArtilleryFort]: [{ track: TechType.War, level: 3 }],
  [BuildingType.Minefield]: [{ track: TechType.War, level: 1 }],
  [BuildingType.SAMSite]: [{ track: TechType.Electronics, level: 4 }],
  [BuildingType.Bridge]: [{ track: TechType.Science, level: 2 }],
  [BuildingType.SeaMine]: [{ track: TechType.War, level: 1 }],
  [BuildingType.OffshorePlatform]: [{ track: TechType.Science, level: 3 }],
};

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

/** Check if a building type is a defensive structure */
export function isDefensiveStructureType(type: BuildingType): boolean {
  return BUILDING_ATTRIBUTES[type].isDefensiveStructure;
}

/** Check if a building type is a naval structure */
export function isNavalStructureType(type: BuildingType): boolean {
  return BUILDING_ATTRIBUTES[type].isNavalStructure;
}

/** Check if a building type is any kind of structure (defensive or naval) */
export function isStructureType(type: BuildingType): boolean {
  return BUILDING_ATTRIBUTES[type].isDefensiveStructure || BUILDING_ATTRIBUTES[type].isNavalStructure;
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

/** Check if a unit type counts as air (for anti-air targeting) */
export function isAirUnit(unitType: UnitType): boolean {
  return unitType === UnitType.Fighter || unitType === UnitType.AWACS;
}

/** Check if a unit type counts as sea (for coastal battery targeting) */
export function isSeaUnit(unitType: UnitType): boolean {
  const seaTypes = [
    UnitType.Patrol, UnitType.Destroyer, UnitType.Submarine,
    UnitType.Transport, UnitType.Carrier, UnitType.Battleship,
    UnitType.MissileCruiser, UnitType.EngineerBoat,
  ];
  return seaTypes.includes(unitType);
}

/** Check if a unit type counts as land (for bunker/artillery fort targeting) */
export function isLandUnit(unitType: UnitType): boolean {
  return unitType === UnitType.Army || unitType === UnitType.Construction ||
    unitType === UnitType.Artillery || unitType === UnitType.SpecialForces;
}

/** Check if a structure can target a given unit type */
export function canStructureTarget(buildingType: BuildingType, unitType: UnitType): boolean {
  const attrs = BUILDING_ATTRIBUTES[buildingType];
  if (attrs.targetAir && isAirUnit(unitType)) return true;
  if (attrs.targetSea && isSeaUnit(unitType)) return true;
  if (attrs.targetLand && isLandUnit(unitType)) return true;
  return false;
}
