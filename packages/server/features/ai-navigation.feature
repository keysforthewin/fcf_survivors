Feature: AI navigation hysteresis, stuck recovery, and separation
  Targeted nav fixes so AI fish don't spin between two prey, deadlock against
  walls, or clump and stop. Without these, players see the same handful of
  fish swim in circles forever.

  Background:
    Given a fresh world

  Scenario: AI commits to its first prey instead of flipping each tick
    Given an AI fish "Hunter" at (4000, 4000) with mass 100 in "wander" mode
    And a player "PreyA" at (4200, 4000) with mass 10
    And a player "PreyB" at (4300, 4000) with mass 10
    When the world advances 1 tick
    Then "Hunter" has target "PreyA"
    When "PreyB" is moved to (4170, 4000)
    And the world advances 1 tick
    Then "Hunter" has target "PreyA"

  Scenario: A stuck AI gives up its target and blacklists it
    Given an AI fish "Stuck" at (4000, 4000) with mass 100 in "chase" mode
    And a player "Bait" at (4100, 4000) with mass 10
    When "Stuck" is held at (4000, 4000) for 75 ticks
    Then "Stuck" has no target
    And "Stuck" is in "wander" mode
    And "Stuck" has blacklisted "Bait"

  Scenario: A blacklisted target is ignored even when in sight
    Given an AI fish "Stuck" at (4000, 4000) with mass 100 in "chase" mode
    And a player "Bait" at (4100, 4000) with mass 10
    When "Stuck" is held at (4000, 4000) for 75 ticks
    Then "Stuck" has no target
    When the world advances 1 tick
    Then "Stuck" has no target

  Scenario: Same-tier AI fish push apart instead of clustering
    Given an AI fish "Twin1" at (4000, 4000) with mass 20 in "wander" mode
    And an AI fish "Twin2" at (4001, 4000) with mass 20 in "wander" mode
    When the world advances 30 ticks
    Then "Twin1" and "Twin2" are more than 20 units apart
