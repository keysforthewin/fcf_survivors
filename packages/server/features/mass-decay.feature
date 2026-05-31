Feature: Mass decay and 300 cap
  Player mass bleeds away in proportion to current mass (rate = mass · 0.005/s)
  once above startMass — so a fresh spawn barely leaks (~0.05/s) while a heavier
  fish bleeds proportionally faster (~1/s at mass 200, ~1.5/s at the 300 cap).
  Fresh spawns at/below startMass don't decay. The mass ceiling is 300; eating
  beyond that is clamped (XP/levels still grow). AI fish are exempt from decay
  and share the same 300 cap.

  Background:
    Given a fresh world

  Scenario: Fresh spawn does not decay below start mass
    Given a player "Alpha" at (1000, 1000) with mass 10
    When the world advances 10 seconds
    Then "Alpha" has mass 10

  Scenario: A small fish bleeds slowly (~0.5/s at mass 100)
    Given a player "Tiny" at (500, 500) with mass 100
    When the world advances 2 seconds
    Then "Tiny" has mass between 98.5 and 99.5

  Scenario: A heavier fish bleeds proportionally faster (~1/s at mass 200)
    Given a player "Mid" at (1500, 1500) with mass 200
    When the world advances 2 seconds
    Then "Mid" has mass between 197.5 and 198.5

  Scenario: A fish at the cap bleeds fastest (~1.5/s at mass 300)
    Given a player "Big" at (3000, 3000) with mass 300
    When the world advances 2 seconds
    Then "Big" has mass between 296.5 and 297.5

  Scenario: Mass cap clamps eating at 300
    Given a player "Glutton" at (1000, 1000) with mass 295
    And a chunk at (1000, 1000) with mass 500
    When the world advances 1 tick
    Then "Glutton" has at most mass 300
    And "Glutton" has at least mass 299

  Scenario: AI fish are exempt from decay
    Given an AI fish "Bob" at (1500, 1500) with mass 300
    When the world advances 5 seconds
    Then "Bob" has mass 300

  Scenario: Peak mass captures growth and survives later decay
    # Mass climbs to 101 from the pellet, then decays slightly. Peak holds the
    # high-water mark even though current mass dips back below it.
    Given a player "Peak" at (1000, 1000) with mass 100
    And a pellet at (1003, 1000)
    When the world advances 1 tick
    Then "Peak" has at most mass 101
    And "Peak" has peak mass at least 101
