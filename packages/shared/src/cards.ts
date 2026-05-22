import type { WeaponId } from "./weapons.js";
import type { PassiveId } from "./passives.js";

export type ParsedCardId =
  | { kind: "weapon-add"; weaponId: WeaponId }
  | { kind: "weapon-upgrade"; weaponId: WeaponId; level: number }
  | { kind: "passive-stack"; passiveId: PassiveId; stack: number }
  | { kind: "evolution"; baseId: WeaponId };

export function serializeCardId(card: ParsedCardId): string {
  switch (card.kind) {
    case "weapon-add":      return `weapon:${card.weaponId}:add`;
    case "weapon-upgrade":  return `weapon:${card.weaponId}:upgrade:${card.level}`;
    case "passive-stack":   return `passive:${card.passiveId}:stack:${card.stack}`;
    case "evolution":       return `evolution:${card.baseId}`;
  }
}

export function parseCardId(id: string): ParsedCardId | null {
  const parts = id.split(":");
  if (parts.length < 2) return null;
  const [head, second, third, fourth] = parts;
  if (head === "weapon" && third === "add") {
    return { kind: "weapon-add", weaponId: second as WeaponId };
  }
  if (head === "weapon" && third === "upgrade" && fourth) {
    const lvl = parseInt(fourth, 10);
    if (!Number.isFinite(lvl)) return null;
    return { kind: "weapon-upgrade", weaponId: second as WeaponId, level: lvl };
  }
  if (head === "passive" && third === "stack" && fourth) {
    const stack = parseInt(fourth, 10);
    if (!Number.isFinite(stack)) return null;
    return { kind: "passive-stack", passiveId: second as PassiveId, stack };
  }
  if (head === "evolution") {
    return { kind: "evolution", baseId: second as WeaponId };
  }
  return null;
}
