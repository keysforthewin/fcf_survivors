Feature: Front-of-face eating with front suction
  Eating another fish requires FRONT-OF-FACE contact: a moving fish only swallows prey inside
  its forward mouth cone, and the cone-gated suction reels in-cone prey toward the mouth. Contact
  from the flank or rear does NOT eat (the smaller fish nibbles instead). A truly stationary fish
  (zero heading vector) has no cone, so it eats on contact from any angle.

  Background:
    Given a fresh world

  Scenario: Prey touching the front of a predator is eaten
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 2 ticks
    Then "Beta" is dead

  Scenario: Prey touching a moving predator from BEHIND is safe (front-of-face)
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (988, 1000) with mass 10
    When the world advances 2 ticks
    Then "Beta" is alive

  Scenario: Prey touching a moving predator on its FLANK is safe (front-of-face)
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1000, 988) with mass 10
    When the world advances 2 ticks
    Then "Beta" is alive

  Scenario: A stationary predator (no heading) eats prey touching it from any angle
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (0, 0)
    And a player "Beta" at (995, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is dead

  Scenario: Front suction vacuums in prey that starts beyond contact range
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1095, 1000) with mass 10
    When the world advances 4 ticks
    Then "Beta" is dead

  Scenario: Prey beyond contact range and outside the front cone is safe
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (905, 1000) with mass 10
    When the world advances 4 ticks
    Then "Beta" is alive
