Feature: Omnidirectional contact eating with front suction
  Eating is any-contact: the moment two hitboxes overlap (from any angle) the bigger
  fish eats the smaller, exactly like eating a pellet. The forward mouth cone is now
  only a SUCTION BONUS that vacuums prey toward a moving fish from in front — it no
  longer gates the eat, so flank and rear contact count too. Smaller fish must keep
  their distance, not merely stay behind.

  Background:
    Given a fresh world

  Scenario: Prey touching the front of a predator is eaten
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 2 ticks
    Then "Beta" is dead

  Scenario: Prey touching a moving predator from BEHIND is now eaten
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (988, 1000) with mass 10
    When the world advances 2 ticks
    Then "Beta" is dead

  Scenario: Prey touching a moving predator on its FLANK is now eaten
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1000, 988) with mass 10
    When the world advances 2 ticks
    Then "Beta" is dead

  Scenario: A stationary predator eats prey touching it from any angle
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
