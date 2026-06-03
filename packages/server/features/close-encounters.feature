Feature: Close Encounters eating range
  The Close Encounters passive multiplies MOUTH.eatReach, so you can swallow prey from a little
  farther in front (and the bite-animation wind-up reach grows proportionally). It only extends the
  FORWARD reach — the front-cone gate is untouched, so it stays directional and never helps from
  behind — and AI fish (which carry no passives) are unaffected.

  Background:
    Given a fresh world

  Scenario: Close Encounters lets you eat prey just beyond your normal reach
    # rA+rB ≈ 73; at dist 83 the gap is ≈ 10px. The base eat reach is ~5px, but 5 stacks of Close
    # Encounters extend it to ~12px, so the swallow lands. Prey faces the Pilot (head-on) to isolate
    # the FRONT reach.
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has heading (1, 0)
    And "Pilot" has passive "closeEncounters" at stack 5
    And a player "Prey" at (4083, 4000) with mass 10
    And "Prey" has heading (-1, 0)
    When the world advances 2 ticks
    Then "Prey" is dead

  Scenario: Without Close Encounters the same prey is out of reach
    # Same ≈10px gap, but the base ~5px reach can't swallow it — the Pilot only winds up a bite.
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has heading (1, 0)
    And a player "Prey" at (4083, 4000) with mass 10
    And "Prey" has heading (-1, 0)
    When the world advances 2 ticks
    Then "Prey" is alive

  Scenario: Close Encounters does not let you eat prey behind you
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has heading (1, 0)
    And "Pilot" has passive "closeEncounters" at stack 5
    And a player "Prey" at (3800, 4000) with mass 10
    When the world advances 3 ticks
    Then "Prey" is alive
