Feature: Weapons can kill
  Weapon damage drains mass, and a fish whose mass is drained to zero dies —
  eating is no longer the only way to kill. The fish that landed the lethal hit
  is credited with the kill (so ranged kills attribute correctly instead of
  reading "the void"). Mass is never healed back up above where weapons left it,
  so sustained fire can finish a target.

  Background:
    Given a fresh world

  # ESP (pulse) is a 360° AoE, so the cone/heading doesn't matter; placing the
  # victim ~300 units to the side keeps it well inside the pulse radius but far
  # outside the mass-50 eat reach (~133), so the kill is purely from damage.
  Scenario: Sustained ESP drains a small fish to zero and kills it
    Given a player "Sniper" at (4000, 4000) with mass 50
    And "Sniper" has weapon "pulse" at level 5
    And a player "Victim" at (4000, 4300) with mass 10
    # Pulse Lv5 deals 5 (4 mass/hit) on a ~4.2s cooldown, so it takes three pulses
    # (~8.5s) to drain a mass-10 fish to zero.
    When the world advances 200 ticks
    Then "Victim" is dead
    And "Sniper" has kill count 1
    # Killing grants NO automatic XP — the victim's XP scatters as collectable balls (see
    # death-drops.feature); the killer must swim over and pick it up like everyone else.
    And "Sniper" has XP 0

  Scenario: A single pulse wounds below spawn mass without killing or healing back
    Given a player "Sniper" at (4000, 4000) with mass 50
    And "Sniper" has weapon "pulse" at level 5
    And a player "Victim" at (4000, 4300) with mass 10
    # Only one pulse lands before the ~4.2s cooldown (5 damage → 4 mass), leaving
    # Victim at 6; mass-decay must not heal the wound back up to spawn mass (10).
    When the world advances 50 ticks
    Then "Victim" is alive
    And "Victim" has at most mass 6
