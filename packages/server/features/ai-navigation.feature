Feature: AI navigation hysteresis, stuck recovery, and separation
  Targeted nav fixes so AI fish don't spin between two prey, deadlock against
  walls, or clump and stop. Without these, players see the same handful of
  fish swim in circles forever.

  Background:
    Given a fresh world

  Scenario: A committed AI keeps its angered target instead of flipping to a closer one
    Given an AI fish "Hunter" at (4000, 4000) with mass 100 in "wander" mode
    And a player "PreyA" at (4200, 4000) with mass 10
    And "PreyA" has heading (-1, 0)
    And a player "PreyB" at (4300, 4000) with mass 10
    And "PreyB" has heading (-1, 0)
    And "Hunter" is angered at "PreyA"
    When the world advances 1 tick
    Then "Hunter" has target "PreyA"
    When "PreyB" is moved to (4170, 4000)
    And the world advances 1 tick
    Then "Hunter" has target "PreyA"

  Scenario: A stuck AI gives up its target and blacklists it
    Given an AI fish "Stuck" at (4000, 4000) with mass 100 in "chase" mode
    And a player "Bait" at (4200, 4000) with mass 10
    And "Bait" has heading (-1, 0)
    When "Stuck" is held at (4000, 4000) for 75 ticks
    Then "Stuck" has no target
    And "Stuck" is in "wander" mode
    And "Stuck" has blacklisted "Bait"

  Scenario: A blacklisted target is ignored even when in sight
    Given an AI fish "Stuck" at (4000, 4000) with mass 100 in "chase" mode
    And a player "Bait" at (4200, 4000) with mass 10
    And "Bait" has heading (-1, 0)
    When "Stuck" is held at (4000, 4000) for 75 ticks
    Then "Stuck" has no target
    When the world advances 1 tick
    Then "Stuck" has no target

  Scenario: Same-tier AI fish push apart instead of clustering
    Given an AI fish "Twin1" at (4000, 4000) with mass 20 in "wander" mode
    And an AI fish "Twin2" at (4001, 4000) with mass 20 in "wander" mode
    When the world advances 30 ticks
    Then "Twin1" and "Twin2" are more than 20 units apart

  Scenario: AI wandering toward the left wall is pushed back into the arena
    Given an AI fish "WallHugger" at (30, 4000) with mass 20 in "wander" mode
    And "WallHugger" has wander heading 3.14159
    When the world advances 40 ticks
    Then "WallHugger" is at least 200 units from the left wall

  Scenario: AI wandering into the top-left corner escapes both walls
    Given an AI fish "Cornered" at (30, 30) with mass 20 in "wander" mode
    And "Cornered" has wander heading -2.3562
    When the world advances 40 ticks
    Then "Cornered" is at least 150 units from the left wall
    And "Cornered" is at least 150 units from the top wall

  Scenario: AI wandering into the bottom-right corner escapes both walls
    Given an AI fish "Trapped" at (7970, 7970) with mass 20 in "wander" mode
    And "Trapped" has wander heading 0.7854
    When the world advances 40 ticks
    Then "Trapped" is at least 150 units from the right wall
    And "Trapped" is at least 150 units from the bottom wall

  Scenario: AI in open water is not affected by wall repulsion
    Given an AI fish "Roamer" at (4000, 4000) with mass 20 in "wander" mode
    And "Roamer" has wander heading 0
    And baseline position of "Roamer"
    When the world advances 40 ticks
    Then "Roamer" has moved at least 200 units

  Scenario: A wandering AI fish stuck against a wall recovers without a target
    Given an AI fish "NoTarget" at (20, 4000) with mass 20 in "wander" mode
    And "NoTarget" has wander heading 3.14159
    When the world advances 100 ticks
    Then "NoTarget" is at least 300 units from the left wall

  Scenario: AI fish heading rotates gradually instead of snapping
    # AI.maxTurnRateRadPerSec = 3.5; over 5 ticks (0.25s) the heading
    # cannot rotate more than ~0.875 rad even toward a 180° target.
    Given an AI fish "Pivot" at (4000, 4000) with mass 30 in "wander" mode
    And "Pivot" has heading (1, 0)
    And "Pivot" has wander heading 3.14159
    And baseline heading of "Pivot"
    When the world advances 5 ticks
    Then "Pivot" heading has rotated by at most 1.0 radians from baseline
