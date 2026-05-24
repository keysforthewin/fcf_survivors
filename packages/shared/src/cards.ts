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

/**
 * The "subject" a card relates to — used as the key for per-life banishing.
 * weapon-add / weapon-upgrade collapse to the same weapon line so banishing any
 * bubble card bans the whole bubble line. Evolutions key separately (`evo:`) so
 * banishing an evolution doesn't ban/strip the still-useful Lv5 base weapon.
 */
export function cardSubject(card: ParsedCardId): string {
  switch (card.kind) {
    case "weapon-add":
    case "weapon-upgrade": return `weapon:${card.weaponId}`;
    case "evolution":      return `evo:${card.baseId}`;
    case "passive-stack":  return `passive:${card.passiveId}`;
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
