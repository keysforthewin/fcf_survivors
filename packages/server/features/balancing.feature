Feature: Mass-based balancing
  Big fish are slower and lunge for shorter periods. Speed scales down toward
  ~15% of base by 5000 mass and the boost (burst) duration shrinks with mass.

  Background:
    Given a fresh world

  Scenario: A small fish (mass 50) moves at full base speed
    Given a player "Alpha" at (4000, 4000) with mass 50
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 280

  Scenario: A 500-mass fish is still at full speed (start of the curve)
    Given a player "Alpha" at (4000, 4000) with mass 500
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 280

  Scenario: A 3000-mass fish is meaningfully slower
    Given a player "Alpha" at (4000, 4000) with mass 3000
    And baseline position of "Alpha"
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then "Alpha" has moved at least 100 units
    And "Alpha" has speed at most 220

  Scenario: A 5000-mass fish is very slow (~15% of base)
    Given a player "Alpha" at (4000, 4000) with mass 5000
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 42

  Scenario: Boost duration shrinks at high mass
    Given a player "Alpha" at (4000, 4000) with mass 5000
    When "Alpha" sends input (1, 0) with boost
    And the world advances 500 ms
    Then "Alpha" is not boosting

  Scenario: A small fish still boosts for the full 1500ms
    Given a player "Alpha" at (4000, 4000) with mass 10
    When "Alpha" sends input (1, 0) with boost
    And the world advances 1000 ms
    Then "Alpha" is boosting
