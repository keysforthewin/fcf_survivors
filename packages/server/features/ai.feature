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
