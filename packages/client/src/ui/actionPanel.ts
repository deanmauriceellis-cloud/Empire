// Empire Reborn — Action Panel
// Shows available actions based on selection state.

import {
  UNIT_ATTRIBUTES, Owner, UnitType, UnitBehavior,
  objMoves, BuildingType, BUILDING_NAMES,
  CITY_UPGRADE_TYPES, MAX_CITY_UPGRADES,
  BUILDING_ATTRIBUTES, DepositType, TerrainType,
  DEFENSIVE_STRUCTURE_TYPES, NAVAL_STRUCTURE_TYPES,
  isStructureType, canBuildStructure,
} from "@empire/shared";
import type { UnitState, GameState } from "@empire/shared";

export interface ActionPanel {
  readonly element: HTMLDivElement;
  update(
    selectedUnit: UnitState | null,
    selectedCityId: number | null,
    gameState: GameState,
    hasHighlights: boolean,
    playerOwner?: Owner,
  ): void;
  /** Returns the action key if a panel button was clicked, or null. */
  consumeClick(): string | null;
}

export function createActionPanel(): ActionPanel {
  const element = document.createElement("div");
  element.id = "action-panel";

  let pendingClick: string | null = null;

  function btn(label: string, hotkey: string, action: string, disabled = false, active = false): string {
    let cls = "action-btn";
    if (disabled) cls += " disabled";
    if (active) cls += " active";
    return `<button class="${cls}" data-action="${action}">` +
      `<span>${label}</span><span class="hotkey">${hotkey}</span></button>`;
  }

  element.addEventListener("pointerdown", (e) => {
    const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (target && !target.classList.contains("disabled")) {
      e.preventDefault(); // prevent button from stealing keyboard focus
      pendingClick = target.dataset.action!;
    }
  });

  return {
    element,

    update(selectedUnit, selectedCityId, gameState, hasHighlights, playerOwner: Owner = Owner.Player1): void {
      if (!selectedUnit && selectedCityId === null) {
        element.innerHTML = `<div class="section-label">No selection</div>` +
          `<div style="color:#555;font-size:11px;margin-top:4px">Click a unit or city</div>`;
        return;
      }

      const parts: string[] = [];

      if (selectedUnit) {
        const u = selectedUnit;
        const attrs = UNIT_ATTRIBUTES[u.type];
        const movesLeft = attrs.speed - u.moved;
        const canMove = movesLeft > 0;

        if (hasHighlights) {
          parts.push(`<div class="section-label">Movement</div>`);
          parts.push(`<div style="color:#4c8;font-size:11px;margin-bottom:4px">` +
            `Click highlighted tiles to move/attack</div>`);
        } else if (!canMove) {
          parts.push(`<div style="color:#888;font-size:11px;margin-bottom:4px">` +
            `No moves remaining</div>`);
        }

        // Show current behavior if set
        if (u.func !== UnitBehavior.None) {
          const behaviorNames: Record<number, string> = {
            [UnitBehavior.Sentry]: "Sentry",
            [UnitBehavior.Explore]: "Exploring",
            [UnitBehavior.GoTo]: "Navigating",
            [UnitBehavior.Aggressive]: "Aggressive",
            [UnitBehavior.Cautious]: "Cautious",
            [UnitBehavior.WaitForTransport]: "Waiting",
          };
          const name = behaviorNames[u.func] ?? "Orders";
          parts.push(`<div style="color:#fa4;font-size:11px;margin-bottom:4px">` +
            `Mode: ${name}</div>`);
        }

        parts.push(`<div class="section-label">Orders</div>`);
        parts.push(btn("Skip Unit", "Space", "skip"));
        parts.push(btn("Sentry", "G", "sentry", !canMove, u.func === UnitBehavior.Sentry));
        parts.push(btn("Explore", "F", "explore", !canMove, u.func === UnitBehavior.Explore));
        parts.push(btn("Aggressive", "A", "aggressive", !canMove, u.func === UnitBehavior.Aggressive));
        parts.push(btn("Cautious", "D", "cautious", !canMove, u.func === UnitBehavior.Cautious));

        if (u.type === UnitType.Army || u.type === UnitType.SpecialForces) {
          parts.push(btn("Wait for Transport", "T", "wait-transport", !canMove, u.func === UnitBehavior.WaitForTransport));
        }

        // Bombard info for ranged units
        const attackRange = UNIT_ATTRIBUTES[u.type].attackRange;
        if (attackRange > 0) {
          parts.push(`<div class="section-label">Bombard</div>`);
          parts.push(`<div style="color:#f84;font-size:11px;margin-bottom:4px">` +
            `Range: ${attackRange} tiles (click target to fire)</div>`);
        }

        if (u.shipId !== null) {
          parts.push(btn("Disembark", "U", "disembark"));
        }

        // Construction unit context actions
        if (u.type === UnitType.Construction) {
          const isBuilding = gameState.buildings.some(
            (b) => b.constructorId === u.id && !b.complete,
          );
          if (isBuilding) {
            const building = gameState.buildings.find((b) => b.constructorId === u.id && !b.complete)!;
            const pct = Math.floor((building.work / building.buildTime) * 100);
            parts.push(`<div class="section-label">Building</div>`);
            parts.push(`<div style="color:#4c8;font-size:11px;margin-bottom:4px">` +
              `${BUILDING_NAMES[building.type]} — ${pct}%</div>`);
          } else {
            parts.push(`<div class="section-label">Build</div>`);
            // Check if on a deposit
            const cell = gameState.map[u.loc];
            if (cell.depositId !== null) {
              const dep = gameState.deposits[cell.depositId];
              if (!dep.buildingComplete && dep.buildingId === null) {
                const bType = dep.type as number as BuildingType;
                parts.push(btn(`Build ${BUILDING_NAMES[bType]}`, "B", "build-on-deposit"));
              }
            }
            // Check if on own city
            if (cell.cityId !== null) {
              const city = gameState.cities[cell.cityId];
              if (city.owner === u.owner && city.upgradeIds.length < MAX_CITY_UPGRADES) {
                for (const upgradeType of CITY_UPGRADE_TYPES) {
                  const hasIt = city.upgradeIds.some((bid) => {
                    const b = gameState.buildings.find((building) => building.id === bid);
                    return b && b.type === upgradeType;
                  });
                  if (!hasIt) {
                    parts.push(btn(
                      `Build ${BUILDING_NAMES[upgradeType]}`,
                      "",
                      `build-upgrade-${upgradeType}`,
                    ));
                  }
                }
                // Show upgrade options for existing buildings
                for (const bid of city.upgradeIds) {
                  const b = gameState.buildings.find((building) => building.id === bid);
                  if (b && b.complete && b.level < 3) {
                    parts.push(btn(
                      `Upgrade ${BUILDING_NAMES[b.type]} Lv${b.level + 1}`,
                      "",
                      `build-upgrade-${b.type}`,
                    ));
                  }
                }
              }
            }
            // Defensive structures on land tiles (not city, not deposit)
            if (cell.terrain === TerrainType.Land && cell.cityId === null) {
              const hasStructureHere = gameState.buildings.some(
                (b) => b.loc === u.loc && isStructureType(b.type),
              );
              if (!hasStructureHere) {
                for (const sType of DEFENSIVE_STRUCTURE_TYPES) {
                  if (canBuildStructure(gameState, u.owner, sType)) {
                    parts.push(btn(
                      `Build ${BUILDING_NAMES[sType]}`,
                      "",
                      `build-structure-${sType}`,
                    ));
                  }
                }
              }
            }
          }
        }

        // Engineer Boat context actions
        if (u.type === UnitType.EngineerBoat) {
          const isBuilding = gameState.buildings.some(
            (b) => b.constructorId === u.id && !b.complete,
          );
          if (isBuilding) {
            const building = gameState.buildings.find((b) => b.constructorId === u.id && !b.complete)!;
            const pct = Math.floor((building.work / building.buildTime) * 100);
            parts.push(`<div class="section-label">Building</div>`);
            parts.push(`<div style="color:#4c8;font-size:11px;margin-bottom:4px">` +
              `${BUILDING_NAMES[building.type]} — ${pct}%</div>`);
          } else {
            const cell = gameState.map[u.loc];
            if (cell.terrain === TerrainType.Sea) {
              const hasStructureHere = gameState.buildings.some(
                (b) => b.loc === u.loc && isStructureType(b.type),
              );
              if (!hasStructureHere) {
                parts.push(`<div class="section-label">Build</div>`);
                for (const sType of NAVAL_STRUCTURE_TYPES) {
                  if (canBuildStructure(gameState, u.owner, sType)) {
                    parts.push(btn(
                      `Build ${BUILDING_NAMES[sType]}`,
                      "",
                      `build-structure-${sType}`,
                    ));
                  }
                }
              }
            }
          }
        }

        parts.push(`<div style="color:#555;font-size:10px;margin-top:2px">` +
          `Right-click tile to navigate</div>`);
      }

      if (selectedCityId !== null) {
        const city = gameState.cities.find((c) => c.id === selectedCityId);
        if (city && city.owner === playerOwner) {
          parts.push(`<div class="section-label">City</div>`);
          parts.push(btn("Change Production", "P", "open-city-panel"));
        }
      }

      // Turn actions (always shown)
      parts.push(`<div class="section-label" style="margin-top:auto">Turn</div>`);
      parts.push(btn("Next Unit", "N", "next-unit"));
      parts.push(`<button class="action-btn end-turn" data-action="end-turn">` +
        `<span>End Turn</span><span class="hotkey">Enter</span></button>`);

      element.innerHTML = parts.join("");
    },

    consumeClick(): string | null {
      const click = pendingClick;
      pendingClick = null;
      return click;
    },
  };
}
