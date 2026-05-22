Feature: Weapon damage
  Weapons damage any fish in range (player or AI, larger or smaller) and
  each hit shaves mass off the target so the fish visibly shrinks. Pins the
  fix for the regression where AI fish were invulnerable because the
  damage path silently skipped anything the attacker could eat.

  Background:
    Given a fresh world

  Scenario: A pulse weapon shrinks an AI fish smaller than the player
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "Minnow" at (4050, 4000) with mass 25
    When the world advances 1 tick
    Then "Minnow" is alive
    And "Minnow" has mass approximately 22

  Scenario: A pulse weapon chips a bigger AI fish (chip damage preserved)
    Given a player "Apex" at (4000, 4000) with mass 70
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "Chunky" at (4060, 4000) with mass 80
    When the world advances 1 tick
    Then "Chunky" is alive
    And "Chunky" has mass approximately 77

  Scenario: A pulse weapon kills an AI fish whose HP drops to zero
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "Wounded" at (4050, 4000) with mass 25
    And "Wounded" starts with HP 10
    When the world advances 1 tick
    Then "Wounded" is dead

  Scenario: A pulse weapon out of range leaves the AI fish untouched
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "FarOff" at (4400, 4000) with mass 10
    When the world advances 1 tick
    Then "FarOff" is alive
    And "FarOff" has mass 10
