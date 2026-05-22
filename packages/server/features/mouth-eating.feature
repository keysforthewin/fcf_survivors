Feature: Directional mouth eating
  Big fish only eat prey that enters their forward mouth cone — smaller fish
  can swim alongside or behind without being chomped. Stationary fish fall
  back to omni-directional defense (so you can't grief a still giant).

  Background:
    Given a fresh world

  Scenario: Prey directly in front of a moving predator is eaten
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 2 ticks
    Then "Beta" is dead

  Scenario: Prey behind a moving predator is NOT eaten (nibble zone)
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (988, 1000) with mass 10
    When the world advances 2 ticks
    Then "Beta" is alive

  Scenario: Prey directly to the side of a moving predator is NOT eaten
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1000, 988) with mass 10
    When the world advances 2 ticks
    Then "Beta" is alive

  Scenario: A stationary predator (zero heading) eats prey from any angle
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (0, 0)
    And a player "Beta" at (995, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is dead

  Scenario: Predator with prey just in front of the suction buffer pulls them in and eats
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1040, 1000) with mass 10
    When the world advances 3 ticks
    Then "Beta" is dead
