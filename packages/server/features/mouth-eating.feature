Feature: Eating within mouth reach (front-cone, ~5px)
  A fish swallows edible prey only when its mouth is on the prey: the body-edge gap in front of its
  face is within MOUTH.eatReach (~5px, flat — it does NOT scale with size) AND the prey sits inside
  the forward mouth cone. There is no suction and no behind-approach bonus — a chase lands only by
  closing to within the eat reach. While a predator is still closing in (gap within the larger
  bite-animation reach = eatReach × biteReachMult ≈ 20px) it plays a cosmetic bite WIND-UP so prey
  can see it coming. A truly stationary fish (no heading) has no cone and eats on contact from any
  angle.

  Background:
    Given a fresh world

  Scenario: Prey overlapping the front of a predator is eaten
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is dead

  Scenario: Prey just past the eat reach is NOT eaten, but the predator winds up a bite
    # rA+rB ≈ 73; at dist 85 the gap is ≈ 12px — beyond the ~5px eat reach but inside the ~20px bite
    # reach, so Alpha gnashes (visible chomp) without swallowing.
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1085, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is alive
    And "Alpha" is biting

  Scenario: Prey beyond the bite-animation reach gets no chomp
    # At dist 100 the gap is ≈ 27px — past the ~20px bite reach, so no eat and no wind-up.
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1100, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is alive
    And "Alpha" is not biting

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

  Scenario: Chasing prey from behind only winds up until you close your mouth onto it
    # Beta is ahead of Alpha (both face +x). At dist 80 the gap is ≈ 7px — Alpha is still winding up,
    # not yet eating. (With the old behind-approach bonus this 80px gap would have been an instant kill.)
    Given a player "Beta" at (1000, 1000) with mass 10
    And "Beta" has heading (1, 0)
    And a player "Alpha" at (920, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    When the world advances 1 tick
    Then "Beta" is alive
    And "Alpha" is biting

  Scenario: Closing to within the eat reach lands the chase
    # Same chase, but Alpha is close enough that the gap (≈ 2px) is within the eat reach.
    Given a player "Beta" at (1000, 1000) with mass 10
    And "Beta" has heading (1, 0)
    And a player "Alpha" at (925, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    When the world advances 1 tick
    Then "Beta" is dead
