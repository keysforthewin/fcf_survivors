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

  Scenario: An AI does not chase edible prey on the very first tick (aggro ramps up)
    # Fish no longer turn and hunt the instant prey is in range — aggro accumulates first.
    Given an AI fish "Big" at (4000, 4000) with mass 100 in "wander" mode
    And a player "Tiny" at (4200, 4000) with mass 10
    When the world advances 1 tick
    Then "Big" is in "wander" mode

  Scenario: An AI commits to chasing edible prey that loiters in its aggro radius
    Given an AI fish "Big" at (4000, 4000) with mass 100 in "wander" mode
    And a player "Tiny" at (4200, 4000) with mass 10
    And "Tiny" has heading (-1, 0)
    When "Big" is held at (4000, 4000) for 25 ticks
    Then "Big" is in "chase" mode
    And "Big" has target "Tiny"

  Scenario: A committed AI chases its target beyond its normal sight radius
    # Once angered, an AI pursues out to AGGRO.leashRadius (1200) — far past the 400-unit sight —
    # so it's much harder to shake than the old "leave the 400 radius and it forgets you".
    Given an AI fish "Hunter" at (4000, 4000) with mass 100 in "wander" mode
    And a player "Runner" at (4500, 4000) with mass 10
    And "Hunter" is angered at "Runner"
    And baseline position of "Hunter"
    When the world advances 20 ticks
    Then "Hunter" is in "chase" mode
    And "Hunter" has moved at least 100 units

  # --- Larger AI fish are more aggressive: detection radius, lock-on speed, and chase leash all
  # scale with the hunter's mass. Small fish keep the old fixed-radius behaviour. ---

  Scenario: A large AI hunts prey from far outside a small fish's sight range
    # aiHuntRadius scales with mass: a mass-200 AI detects + commits to prey at 800 units, well
    # past the fixed 400 sight a small fish has.
    Given an AI fish "Leviathan" at (4000, 4000) with mass 200 in "wander" mode
    And a player "Snack" at (4800, 4000) with mass 10
    When "Leviathan" is held at (4000, 4000) for 10 ticks
    Then "Leviathan" is in "chase" mode
    And "Leviathan" has target "Snack"

  Scenario: A small AI ignores prey at that same range (scaling, not a blanket increase)
    Given an AI fish "Minnow" at (4000, 4000) with mass 30 in "wander" mode
    And a player "Snack" at (4800, 4000) with mass 10
    When "Minnow" is held at (4000, 4000) for 10 ticks
    Then "Minnow" is in "wander" mode

  Scenario: A large AI locks on faster than a small fish would
    # Faster lock-on: at mass 200 the aggro ramp is ~3/s, so a loitering target commits within ~7
    # ticks (within the old 320 aggro radius, so detection isn't the variable — ramp speed is) — vs
    # ~20 ticks on the old fixed 1/s ramp. Snack sits 250 units to the SIDE (perpendicular to the
    # fish's default +x facing) so the front mouth-suction can't vacuum it in before the assertion.
    Given an AI fish "Leviathan" at (4000, 4000) with mass 200 in "wander" mode
    And a player "Snack" at (4000, 4250) with mass 10
    When "Leviathan" is held at (4000, 4000) for 10 ticks
    Then "Leviathan" is in "chase" mode

  Scenario: A large angered AI pursues prey past the old leash distance
    # Leash scales with mass (≈2000 at the cap). A mass-200 fish chases prey 1400 units away — past
    # the old fixed 1200 leash — steering straight at it rather than giving up.
    Given an AI fish "Leviathan" at (4000, 4000) with mass 200 in "wander" mode
    And a player "Runner" at (5400, 4000) with mass 10
    And "Leviathan" is angered at "Runner"
    And baseline position of "Leviathan"
    When the world advances 20 ticks
    Then "Leviathan" is in "chase" mode
    And "Leviathan" is steering toward (5400, 4000)
    And "Leviathan" has moved at least 100 units

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

  # --- Vehicle (car) avoidance. A Nitro's car pierces every fish in its lane, so an AI treats an
  # oncoming car as a lethal threat and dodges it like a predator — even with no predator fish
  # nearby. Triggers within AI.carAvoidRadius (750), regardless of the fish's size. ---

  Scenario: An AI flees an oncoming car within avoidance range
    Given an AI fish "Dodger" at (4000, 4000) with mass 10 in "wander" mode
    And a car at (4000, 3500) moving (0, 400)
    When the world advances 1 tick
    Then "Dodger" is in "flee" mode

  Scenario: An AI ignores a car far outside avoidance range
    Given an AI fish "Calm" at (4000, 4000) with mass 10 in "wander" mode
    And a car at (4000, 1000) moving (0, 400)
    When the world advances 1 tick
    Then "Calm" is in "wander" mode

  Scenario: A big AI still dodges a car (it pierces every fish, size doesn't matter)
    Given an AI fish "Whale" at (4000, 4000) with mass 200 in "wander" mode
    And a car at (4000, 3500) moving (0, 400)
    When the world advances 1 tick
    Then "Whale" is in "flee" mode

  Scenario: A car-dodging AI actively clears the lane
    Given an AI fish "Sprinter" at (4000, 4000) with mass 10 in "wander" mode
    And a car at (4000, 3500) moving (0, 400)
    And baseline position of "Sprinter"
    When the world advances 12 ticks
    Then "Sprinter" has moved at least 150 units

  # AI fish never shrink (they're exempt from mass decay), so an uncapped AI
  # would grow without bound. AI.maxMass caps them at 200 across every way a
  # fish gains mass: pellets, chunks, and eating other fish.

  Scenario: Eating a fish cannot push an AI past the mass cap
    # Snack sits just in front of Shark (which faces +x by default) so the front-of-face eat fires.
    Given an AI fish "Shark" at (1000, 1000) with mass 199 in "wander" mode
    And a player "Snack" at (1040, 1000) with mass 100
    When the world advances 2 ticks
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
