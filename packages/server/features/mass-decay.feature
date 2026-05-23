Feature: Mass decay and 5000 cap
  Player mass bleeds away every tick on a power-law curve in current mass —
  fresh spawns barely lose anything (~0.03/s near startMass), a 100-mass
  fish loses ~0.5/s, a 1000-mass fish ~8/s, and a 5000-mass leviathan
  hemorrhages ~55/s. The mass ceiling is 5000; eating beyond that is
  clamped. AI fish are exempt.

  Background:
    Given a fresh world

  Scenario: Fresh spawn does not decay below start mass
    Given a player "Alpha" at (1000, 1000) with mass 10
    When the world advances 10 seconds
    Then "Alpha" has mass 10

  Scenario: Light fish lose mass slowly
    Given a player "Tiny" at (500, 500) with mass 100
    When the world advances 2 seconds
    Then "Tiny" has mass between 98 and 100

  Scenario: Mid-mass fish lose mass noticeably
    Given a player "Mid" at (1500, 1500) with mass 1000
    When the world advances 2 seconds
    Then "Mid" has mass between 981 and 988

  Scenario: Heavy fish hemorrhage mass
    Given a player "Big" at (3000, 3000) with mass 5000
    When the world advances 2 seconds
    Then "Big" has mass between 4887 and 4897

  Scenario: Mass cap clamps eating at 5000
    Given a player "Glutton" at (1000, 1000) with mass 4990
    And a chunk at (1000, 1000) with mass 500
    When the world advances 1 tick
    Then "Glutton" has at most mass 5000

  Scenario: AI fish are exempt from decay
    Given an AI fish "Bob" at (1500, 1500) with mass 1000
    When the world advances 5 seconds
    Then "Bob" has mass 1000

  Scenario: Peak mass captures growth and survives later decay
    # Mass climbs to 101 from the pellet, then decays slightly. Peak holds the
    # high-water mark even though current mass dips back below it.
    Given a player "Peak" at (1000, 1000) with mass 100
    And a pellet at (1003, 1000)
    When the world advances 1 tick
    Then "Peak" has at most mass 101
    And "Peak" has peak mass at least 101
