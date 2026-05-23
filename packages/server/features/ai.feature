Feature: AI fish behaviour
  The wander/flee/chase state machine drives ambient fish life. Pinning the
  transitions keeps the world reactive when weapons land in M3.

  Background:
    Given a fresh world

  Scenario: An AI in wander mode flees when a much larger fish enters sight
    Given an AI fish "Bob" at (4000, 4000) with mass 10 in "wander" mode
    And a player "Apex" at (4200, 4000) with mass 100
    When the world advances 1 tick
    Then "Bob" is in "flee" mode

  Scenario: An AI in wander mode chases an edible smaller fish
    Given an AI fish "Big" at (4000, 4000) with mass 100 in "wander" mode
    And a player "Tiny" at (4200, 4000) with mass 10
    When the world advances 1 tick
    Then "Big" is in "chase" mode

  Scenario: An AI ignores fish outside its sight radius
    Given an AI fish "Bob" at (4000, 4000) with mass 10 in "wander" mode
    And a player "Apex" at (6000, 4000) with mass 100
    When the world advances 1 tick
    Then "Bob" is in "wander" mode

  Scenario: A fleeing AI does not leave the arena
    Given an AI fish "Edge" at (100, 4000) with mass 10 in "wander" mode
    When the world advances 200 ticks
    Then "Edge" is inside the arena

  Scenario: An AI flees from a similarly-sized player, not just outright predators
    # threatRatio = 0.95 — anything ≥ 0.95 × AI mass scares the AI, even if it
    # isn't yet eat-eligible (which requires 1.15×). Eliminates the loiter-near-
    # player stuck pattern.
    Given an AI fish "Wary" at (4000, 4000) with mass 10 in "wander" mode
    And a player "PeerPlus" at (4200, 4000) with mass 11
    When the world advances 1 tick
    Then "Wary" is in "flee" mode

  Scenario: A fleeing AI stays committed after losing sight of the predator
    # fleeMinDurationMs = 2500 — once flee starts, the fish runs for at least
    # 2.5s even if the predator leaves sight, so it doesn't immediately drift back.
    Given an AI fish "Runner" at (4000, 4000) with mass 10 in "wander" mode
    And a player "Apex" at (4200, 4000) with mass 100
    When the world advances 1 tick
    Then "Runner" is in "flee" mode
    When "Apex" is moved to (10000, 10000)
    And the world advances 30 ticks
    Then "Runner" is in "flee" mode

  Scenario: A fleeing AI puts distance between itself and the predator
    Given an AI fish "Sprinter" at (4000, 4000) with mass 10 in "wander" mode
    And a player "Apex" at (4200, 4000) with mass 100
    And baseline position of "Sprinter"
    When the world advances 12 ticks
    Then "Sprinter" has moved at least 150 units

  Scenario: After a flee ends, an AI does not drift back toward the predator
    # fleeMemoryUntil keeps the wander heading biased away from the last-known
    # predator location even after the commitment window expires.
    Given an AI fish "Survivor" at (4000, 4000) with mass 10 in "wander" mode
    And a player "Apex" at (4200, 4000) with mass 100
    When the world advances 60 ticks
    And "Apex" is moved to (10000, 10000)
    And the world advances 80 ticks
    Then "Survivor" is at least 600 units from (4200, 4000)

  # AI fish never shrink (they're exempt from mass decay), so an uncapped AI
  # would grow without bound. AI.maxMass caps them at 200 across every way a
  # fish gains mass: pellets, chunks, and eating other fish.

  Scenario: Eating a fish cannot push an AI past the mass cap
    Given an AI fish "Shark" at (1000, 1000) with mass 199 in "wander" mode
    And a player "Snack" at (1000, 1000) with mass 100
    When the world advances 1 tick
    Then "Snack" is dead
    And "Shark" has mass 200

  Scenario: Gorging on a pellet cannot push an AI past the mass cap
    Given an AI fish "Glutton" at (1000, 1000) with mass 200 in "wander" mode
    And a pellet at (1005, 1000)
    When the world advances 1 tick
    Then "Glutton" has mass 200

  Scenario: Eating a chunk cannot push an AI past the mass cap
    Given an AI fish "Muncher" at (1000, 1000) with mass 195 in "wander" mode
    And a chunk at (1003, 1000) with mass 50
    When the world advances 1 tick
    Then "Muncher" has mass 200

  Scenario: An AI below the cap still grows normally from eating
    Given an AI fish "Grower" at (1000, 1000) with mass 50 in "wander" mode
    And a pellet at (1005, 1000)
    When the world advances 1 tick
    Then "Grower" has mass 51
