Feature: Eating mechanics
  Fish eat pellets, chunks, and smaller fish. The eating loop is the core of
  the game and these scenarios pin its current invariants so M3/M4 changes
  cannot regress them.

  Background:
    Given a fresh world

  Scenario: A pellet next to a fish is eaten and grants mass + XP + HP
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

  Scenario: A clearly larger fish eats a smaller one within hitbox overlap
    Given a player "Alpha" at (1000, 1000) with mass 50
    And a player "Beta" at (1000, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is dead
    And "Alpha" has at least mass 57
    And "Alpha" has at most mass 60
    And "Alpha" has kill count 1
    And "Alpha" has at least XP 15

  Scenario: Fish at the same mass cannot eat each other
    Given a player "Alpha" at (1000, 1000) with mass 20
    And a player "Beta" at (1000, 1000) with mass 20
    When the world advances 1 tick
    Then "Alpha" is alive
    And "Beta" is alive

  Scenario: A predator just below the 1.15× ratio cannot eat its target
    Given a player "Alpha" at (1000, 1000) with mass 11
    And a player "Beta" at (1000, 1000) with mass 10
    When the world advances 1 tick
    Then "Alpha" is alive
    And "Beta" is alive

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

  Scenario: A predator that only grazes the edge of a smaller fish does not eat it
    Given a player "Alpha" at (1000, 1000) with mass 100
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
