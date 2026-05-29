Feature: Eating mechanics
  Fish eat pellets, chunks, and smaller fish. The eating loop is the core of
  the game and these scenarios pin its current invariants so M3/M4 changes
  cannot regress them.

  Background:
    Given a fresh world

  Scenario: A pellet next to a fish is eaten and grants mass + XP
    Given a player "Alpha" at (1000, 1000) with mass 10
    And a pellet at (1005, 1000)
    When the world advances 1 tick
    Then "Alpha" has mass 11
    And "Alpha" has XP 1
    And there are 0 pellets remaining

  Scenario: Pellets outside the fish radius are not eaten
    Given a player "Alpha" at (1000, 1000) with mass 10
    And a pellet at (1200, 1000)
    When the world advances 1 tick
    Then "Alpha" has mass 10
    And there are 1 pellet remaining

  Scenario: A clearly larger fish swallows a smaller one whole within hitbox overlap
    # Swallowing grows the eater instantly but grants NO instant XP — the kill's XP is burped
    # forward as collectable chunks (which the eater hasn't reached yet on this tick).
    Given a player "Alpha" at (1000, 1000) with mass 50
    And a player "Beta" at (1000, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is dead
    And "Alpha" has at least mass 57
    And "Alpha" has at most mass 60
    And "Alpha" has kill count 1
    And "Alpha" has XP 0
    And there is at least 1 chunk in the world

  Scenario: Fish at the same mass cannot swallow each other (they bite instead)
    # Neither is 1.15× bigger, so neither can swallow whole — but facing each other in contact they
    # now take light bites, so both lose a little mass while both stay alive.
    Given a player "Alpha" at (1000, 1000) with mass 20
    And a player "Beta" at (1000, 1000) with mass 20
    When the world advances 1 tick
    Then "Alpha" is alive
    And "Beta" is alive
    And "Alpha" has at most mass 19.8
    And "Beta" has at most mass 19.8

  Scenario: A predator just below the 1.15× ratio cannot swallow its target (it bites instead)
    # 11 vs 10 is under the swallow ratio, so Alpha cannot eat Beta whole on this tick — it bites
    # Beta for chip damage instead (and would swallow once Beta is softened below the ratio).
    Given a player "Alpha" at (1000, 1000) with mass 11
    And a player "Beta" at (1000, 1000) with mass 10
    When the world advances 1 tick
    Then "Alpha" is alive
    And "Beta" is alive
    And "Beta" has at most mass 9

  Scenario: A predator exactly at the 1.15× ratio CAN eat (boundary)
    Given a player "Alpha" at (1000, 1000) with mass 11.5
    And a player "Beta" at (1000, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is dead

  Scenario: A predator at 1.2× ratio CAN eat (drift sentinel)
    Given a player "Alpha" at (1000, 1000) with mass 12
    And a player "Beta" at (1000, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is dead

  Scenario: A moving predator does NOT eat a fish on its flank (front-of-face required)
    # Eating now requires front-of-face contact. Alpha faces up (0,1); Beta is on its right flank,
    # outside the mouth cone, so it is not swallowed — it merely nibbles the bigger Alpha.
    Given a player "Alpha" at (1000, 1000) with mass 100
    And "Alpha" has heading (0, 1)
    And a player "Beta" at (1020, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is alive

  Scenario: Eating a chunk grants taxed mass + XP
    Given a player "Alpha" at (1000, 1000) with mass 20
    And a chunk at (1003, 1000) with mass 10
    When the world advances 1 tick
    Then "Alpha" has at least XP 5
    And "Alpha" has at least mass 27
    And "Alpha" has at most mass 30
