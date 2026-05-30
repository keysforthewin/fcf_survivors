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
    Then the speed of "Alpha" is approximately 556

  Scenario: Boost triples speed while the boost window is active
    Given a player "Alpha" at (4000, 4000) with mass 10
    When "Alpha" sends input (1, 0) with boost
    And the world advances 500 ms
    Then the speed of "Alpha" is approximately 1668

  Scenario: After the boost window, speed reverts to base
    Given a player "Alpha" at (4000, 4000) with mass 10
    When "Alpha" sends input (1, 0) with boost
    And the world advances 2000 ms
    Then the speed of "Alpha" is approximately 556

  Scenario: Player is clamped to the arena boundary
    Given a player "Alpha" at (50, 4000) with mass 10
    When "Alpha" sends input (-1, 0)
    And the world advances 2 seconds
    Then "Alpha" is inside the arena

  Scenario: Client-authoritative state is trusted verbatim, not integrated
    # The client owns its own fish: the server writes the reported kinematics and
    # then leaves them alone — advancing the world must not move the fish from intent.
    Given a player "Alpha" at (4000, 4000) with mass 10
    When "Alpha" reports client position (4500, 4200) velocity (300, 0)
    Then "Alpha" is at approximately (4500, 4200)
    When the world advances 1 seconds
    Then "Alpha" is at approximately (4500, 4200)

  Scenario: Client-authoritative position is clamped to the arena
    Given a player "Alpha" at (4000, 4000) with mass 10
    When "Alpha" reports client position (-500, 4000) velocity (-300, 0)
    Then "Alpha" is inside the arena
