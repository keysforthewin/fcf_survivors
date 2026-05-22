import type { WeaponId } from "./weapons.js";
import type { PassiveId } from "./passives.js";

export interface EvolutionDef {
  /** Required base weapon. */
  base: WeaponId;
  /** Required passive at max stack. */
  passive: PassiveId;
  /** Replacement weapon id. */
  evolutionId: WeaponId;
}

/** Map: base weapon id → evolution requirements + result. */
export const EVOLUTIONS: Record<string, EvolutionDef> = {
  bubble:  { base: "bubble",  passive: "magnet",   evolutionId: "tidal"  },
  spine:   { base: "spine",   passive: "scales",   evolutionId: "puffer" },
  pulse:   { base: "pulse",   passive: "reflex",   evolutionId: "eel"    },
  ink:     { base: "ink",     passive: "teeth",    evolutionId: "kraken" },
  piranha: { base: "piranha", passive: "hungry",   evolutionId: "school" },
};

export const BASE_WEAPONS: WeaponId[] = ["bubble", "spine", "pulse", "ink", "piranha"];
export const EVOLUTION_WEAPONS: WeaponId[] = ["tidal", "puffer", "eel", "kraken", "school"];

export function isEvolutionWeapon(id: WeaponId): boolean {
  return EVOLUTION_WEAPONS.includes(id);
}
