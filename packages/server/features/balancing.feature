Feature: Mass-based balancing
  Small fish are faster than large fish: an inverse power-law curve
  (refMass=100, exp=0.24) anchored so a mass-100 fish runs at base speed
  (320). The gentle exponent keeps a clear slowdown without a harsh early
  drop — tiny fish cap at 1.8x base, a fish at the 300 mass cap runs at
  ~77% base (~246). Boost duration also shrinks with mass (full 1.5s for
  small fish down to ~375ms at the 300 cap).

  Background:
    Given a fresh world

  Scenario: A small fish (mass 50) moves faster than base speed
    Given a player "Alpha" at (4000, 4000) with mass 50
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 378

  Scenario: A 100-mass fish runs at base speed (reference point)
    Given a player "Alpha" at (4000, 4000) with mass 100
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 320

  Scenario: A fish at the 300 mass cap has lost notable speed
    Given a player "Alpha" at (4000, 4000) with mass 300
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 246

  Scenario: A small fish outruns a large fish at the same input
    # Gap widened (20 vs 200) so the gentler curve still clears 1.5× — speed ratio ~1.74.
    Given a player "Small" at (2000, 2000) with mass 20
    And a player "Big" at (6000, 6000) with mass 200
    And baseline position of "Small"
    And baseline position of "Big"
    When "Small" sends input (1, 0)
    And "Big" sends input (1, 0)
    And the world advances 1 seconds
    Then "Small" has moved at least 1.5 times as far as "Big"

  Scenario: Boost duration shrinks at high mass
    Given a player "Alpha" at (4000, 4000) with mass 300
    When "Alpha" sends input (1, 0) with boost
    And the world advances 500 ms
    Then "Alpha" is not boosting

  Scenario: A small fish still boosts for the full 1500ms
    Given a player "Alpha" at (4000, 4000) with mass 10
    When "Alpha" sends input (1, 0) with boost
    And the world advances 1000 ms
    Then "Alpha" is boosting
