Feature: Turret sequential fire
  The Turret (weapon id "spine") no longer fires its whole ring of bullets in a
  single tick. Instead it sweeps a full circle, emitting one bullet after
  another so the complete ring is fired over roughly one second.

  Background:
    Given a fresh world

  Scenario: Turret fires its ring one bullet at a time over ~1 second
    # Alone in open water so bullets never hit anything and only the firing
    # cadence — not collisions — controls the live projectile count. Level-1
    # bullets live 1200ms, so by the time the 1s sweep finishes all 8 are still
    # in flight.
    Given a player "Gunner" at (4000, 4000) with mass 50
    And "Gunner" has weapon "spine" at level 1
    When the world advances 1 tick
    Then there are 1 projectile
    When the world advances 9 ticks
    Then there are at most 6 projectiles
    When the world advances 10 ticks
    Then there are 8 projectiles
