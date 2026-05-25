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

  Scenario: No pellets spawn while no human is connected
    Given a world with pellet auto-spawn enabled but no humans connected
    When the world advances 10 ticks
    Then there are 0 pellets

  Scenario: AI fish do not graze pellets while no human is connected
    Given a fresh world
    And no humans are connected
    And an AI fish "Gobble" at (1000, 1000) with mass 50
    And a pellet at (1000, 1000)
    When the world advances 1 tick
    Then there are 1 pellet remaining

  Scenario: AI fish graze pellets while a human is connected
    Given a fresh world
    And a human is connected
    And an AI fish "Gobble" at (1000, 1000) with mass 50
    And a pellet at (1000, 1000)
    When the world advances 1 tick
    Then there are 0 pellets remaining
