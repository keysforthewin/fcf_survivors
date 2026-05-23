import { WEAPONS, getWeaponLevel, PASSIVES, stackedMult, isEvolutionWeapon } from "@fcf/shared";
import type { WeaponId, PassiveId } from "@fcf/shared";

export type SkillPanelTarget =
  | { kind: "weapon"; id: WeaponId; level: number }
  | { kind: "passive"; id: PassiveId; stack: number };

export interface SkillPanelOpts {
  target: SkillPanelTarget;
  onDiscard(): void;
  onClose?(): void;
}

export interface SkillPanelMount {
  teardown(): void;
}

export function mountSkillPanel(opts: SkillPanelOpts): SkillPanelMount {
  const overlay = document.createElement("div");
  overlay.className = "skill-panel-overlay";
  overlay.innerHTML = renderPanel(opts.target);
  document.body.appendChild(overlay);

  const close = () => {
    if (overlay.isConnected) overlay.remove();
    document.removeEventListener("keydown", onKey);
    opts.onClose?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener("keydown", onKey);

  overlay.querySelector(".skill-panel-close")!.addEventListener("click", close);
  overlay.querySelector(".skill-panel-discard")!.addEventListener("click", () => {
    opts.onDiscard();
    close();
  });
  // Click on backdrop closes.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  return {
    teardown() {
      if (overlay.isConnected) overlay.remove();
      document.removeEventListener("keydown", onKey);
    },
  };
}

function renderPanel(t: SkillPanelTarget): string {
  if (t.kind === "weapon") {
    const def = WEAPONS[t.id];
    if (!def) return emptyShell("Unknown weapon");
    const lvl = getWeaponLevel(t.id, t.level);
    const evolved = isEvolutionWeapon(t.id);
    const isMaxed = t.level >= 5;
    const kindLabel = evolved
      ? "WEAPON · EVOLVED"
      : `WEAPON · Lv ${t.level}${isMaxed ? " (MAX)" : ""}`;
    return `
      <div class="skill-panel-card kind-weapon">
        <div class="skill-panel-header">
          <div class="skill-panel-kind">${kindLabel}</div>
          <h2 class="skill-panel-title">${escapeHtml(def.name)}</h2>
          <p class="skill-panel-desc">${escapeHtml(def.description)}</p>
        </div>
        <div class="skill-panel-stats">
          ${weaponStatRows(lvl)}
        </div>
        <div class="skill-panel-actions">
          <button type="button" class="skill-panel-close">Close</button>
          <button type="button" class="skill-panel-discard">Discard</button>
        </div>
      </div>
    `;
  }
  const def = PASSIVES[t.id];
  if (!def) return emptyShell("Unknown passive");
  const total = stackedMult(def.perStack, t.stack);
  const pctText = formatMultiplier(total);
  return `
    <div class="skill-panel-card kind-passive">
      <div class="skill-panel-header">
        <div class="skill-panel-kind">PASSIVE · ${t.stack}/${def.maxStack}</div>
        <h2 class="skill-panel-title">${escapeHtml(def.name)}</h2>
        <p class="skill-panel-desc">${escapeHtml(def.description)}</p>
      </div>
      <div class="skill-panel-stats">
        <div class="skill-panel-stat"><span>Per stack</span><b>${formatMultiplier(def.perStack)}</b></div>
        <div class="skill-panel-stat"><span>Current effect</span><b>${pctText}</b></div>
        <div class="skill-panel-stat"><span>Affects</span><b>${escapeHtml(humanEffect(def.effect))}</b></div>
      </div>
      <div class="skill-panel-actions">
        <button type="button" class="skill-panel-close">Close</button>
        <button type="button" class="skill-panel-discard">Discard</button>
      </div>
    </div>
  `;
}

function emptyShell(message: string): string {
  return `
    <div class="skill-panel-card">
      <div class="skill-panel-header">
        <h2 class="skill-panel-title">${escapeHtml(message)}</h2>
      </div>
      <div class="skill-panel-actions">
        <button type="button" class="skill-panel-close">Close</button>
        <button type="button" class="skill-panel-discard" hidden></button>
      </div>
    </div>
  `;
}

function weaponStatRows(lvl: ReturnType<typeof getWeaponLevel>): string {
  const rows: Array<[string, string]> = [];
  rows.push(["Damage", String(lvl.damage)]);
  if (lvl.cooldownMs > 0) rows.push(["Cooldown", `${(lvl.cooldownMs / 1000).toFixed(2)}s`]);
  if (lvl.count !== undefined) rows.push(["Count", String(lvl.count)]);
  if (lvl.range !== undefined) rows.push(["Range", String(lvl.range)]);
  if (lvl.speed !== undefined) rows.push(["Projectile speed", String(lvl.speed)]);
  if (lvl.radius !== undefined) rows.push(["Radius", String(lvl.radius)]);
  if (lvl.pulseRadius !== undefined) rows.push(["Pulse radius", String(lvl.pulseRadius)]);
  if (lvl.lifetimeMs !== undefined) rows.push(["Lifetime", `${(lvl.lifetimeMs / 1000).toFixed(2)}s`]);
  if (lvl.intervalMs !== undefined) rows.push(["Interval", String(lvl.intervalMs)]);
  if (lvl.reHitMs !== undefined) rows.push(["Re-hit cooldown", `${lvl.reHitMs}ms`]);
  if (lvl.spread !== undefined) rows.push(["Spread", lvl.spread.toFixed(2)]);
  return rows.map(([k, v]) =>
    `<div class="skill-panel-stat"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`,
  ).join("");
}

function formatMultiplier(m: number): string {
  // 1.10 -> "+10%", 0.92 -> "-8%"
  const pct = (m - 1) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function humanEffect(effect: string): string {
  switch (effect) {
    case "moveSpeedMult": return "Move speed";
    case "pelletXpMult": return "Pellet XP";
    case "damageTakenMult": return "Damage taken";
    case "weaponDmgMult": return "Weapon damage";
    case "weaponCdMult": return "Weapon cooldown";
    case "pickupMult": return "Pickup radius";
    case "boostCdMult": return "Boost cooldown";
    case "fishEatMassMult": return "Mass per fish eaten";
    default: return effect;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
