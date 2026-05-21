Feature: Pellet population maintenance
  Pellets are the resource floor of the game. Spawn rate and cap are part of
  the M2 contract.

  Scenario: A tick on a fresh world spawns up to spawnPerTick pellets
    Given a world with pellet auto-spawn enabled
    When the world advances 1 tick
    Then there are 4 pellets
    And all pellets are inside the arena
    And the pellet count grew by at most 4

  Scenario: Pellet count is capped at the target
    Given a world with pellet auto-spawn enabled
    When the world advances 200 ticks
    Then there are 600 pellets
