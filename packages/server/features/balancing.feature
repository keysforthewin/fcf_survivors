Feature: Mass-based balancing
  Small fish are exponentially faster than large fish: an inverse power-law
  curve (refMass=100, exp=0.40) anchored so a mass-100 fish runs at base speed
  (320). Tiny fish are capped at 2x base; whales floor at 10%. Boost duration
  also shrinks with mass.

  Background:
    Given a fresh world

  Scenario: A small fish (mass 50) moves faster than base speed
    Given a player "Alpha" at (4000, 4000) with mass 50
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 420

  Scenario: A 100-mass fish runs at base speed (reference point)
    Given a player "Alpha" at (4000, 4000) with mass 100
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 320

  Scenario: A 1000-mass fish has lost notable speed
    Given a player "Alpha" at (4000, 4000) with mass 1000
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then "Alpha" has speed at most 160

  Scenario: A 2000-mass fish is meaningfully slower
    Given a player "Alpha" at (4000, 4000) with mass 2000
    And baseline position of "Alpha"
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then "Alpha" has moved at least 60 units
    And "Alpha" has speed at most 110

  Scenario: A 5000-mass fish is near the speed floor
    Given a player "Alpha" at (4000, 4000) with mass 5000
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 64

  Scenario: A small fish outruns a large fish at the same input
    Given a player "Small" at (2000, 2000) with mass 30
    And a player "Big" at (6000, 6000) with mass 120
    And baseline position of "Small"
    And baseline position of "Big"
    When "Small" sends input (1, 0)
    And "Big" sends input (1, 0)
    And the world advances 1 seconds
    Then "Small" has moved at least 1.5 times as far as "Big"

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
