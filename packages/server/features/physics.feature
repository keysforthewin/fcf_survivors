Feature: Player movement physics
  Steering, normalisation, boost, and arena clamping. M3 weapons sit on top of
  this layer — these scenarios keep the swim behaviour rock-solid.

  Background:
    Given a fresh world

  Scenario: Pure rightward input moves the player toward +X
    Given a player "Alpha" at (4000, 4000) with mass 10
    And baseline position of "Alpha"
    When "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then "Alpha" has moved at least 200 units

  Scenario: Diagonal input is normalised — no speed exploit at mag √2
    Given a player "Alpha" at (4000, 4000) with mass 10
    When "Alpha" sends input (1, 1)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 640

  Scenario: Boost triples speed while the boost window is active
    Given a player "Alpha" at (4000, 4000) with mass 10
    When "Alpha" sends input (1, 0) with boost
    And the world advances 500 ms
    Then the speed of "Alpha" is approximately 1920

  Scenario: After the boost window, speed reverts to base
    Given a player "Alpha" at (4000, 4000) with mass 10
    When "Alpha" sends input (1, 0) with boost
    And the world advances 2000 ms
    Then the speed of "Alpha" is approximately 640

  Scenario: Player is clamped to the arena boundary
    Given a player "Alpha" at (50, 4000) with mass 10
    When "Alpha" sends input (-1, 0)
    And the world advances 2 seconds
    Then "Alpha" is inside the arena
