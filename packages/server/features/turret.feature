Feature: Turret sequential fire
  The Turret (weapon id "spine") sweeps a stream of bullets rather than firing its
  whole ring in one tick. It emits a dense spray — many more bullets than before —
  that spirals three full revolutions over roughly one second, made of larger,
  longer-range bullets so the weapon actually threatens at range.

  Background:
    Given a fresh world

  Scenario: Turret sprays its full burst over ~1 second
    # Alone in open water so bullets never hit anything and only the firing cadence —
    # not collisions — controls the live projectile count. Level-1 fires 24 bullets and
    # they live 2000ms, so by the time the 1s sweep finishes all 24 are still in flight.
    Given a player "Gunner" at (4000, 4000) with mass 50
    And "Gunner" has weapon "spine" at level 1
    When the world advances 1 tick
    Then there are 1 projectile
    When the world advances 10 ticks
    Then there are 13 projectiles
    When the world advances 10 ticks
    Then there are 24 projectiles
