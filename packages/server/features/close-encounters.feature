Feature: Close Encounters eating range
  The Close Encounters passive pushes the mouth point farther forward and widens
  the bite zone, so you can vacuum prey from farther in front. It only affects the
  forward grab distance — the front-cone gate is untouched, so it stays directional
  — and AI fish (which carry no passives) are unaffected.

  Background:
    Given a fresh world

  Scenario: Close Encounters lets you eat prey beyond your normal reach
    # Prey faces the Pilot (a head-on approach) so this isolates the FRONT grab — the behind-approach
    # reach is tested separately below.
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has heading (1, 0)
    And "Pilot" has passive "closeEncounters" at stack 5
    And a player "Prey" at (4200, 4000) with mass 10
    And "Prey" has heading (-1, 0)
    When the world advances 3 ticks
    Then "Prey" is dead

  Scenario: Without Close Encounters the same prey is out of reach
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has heading (1, 0)
    And a player "Prey" at (4200, 4000) with mass 10
    And "Prey" has heading (-1, 0)
    When the world advances 3 ticks
    Then "Prey" is alive

  Scenario: Close Encounters does not let you eat prey behind you
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has heading (1, 0)
    And "Pilot" has passive "closeEncounters" at stack 5
    And a player "Prey" at (3800, 4000) with mass 10
    When the world advances 3 ticks
    Then "Prey" is alive

  Scenario: Close Encounters also scales the behind-approach reach
    # Prey swims +x; Pilot chases 300px behind it. The base behind reach (~219px engage for these
    # masses) would miss at 300px — stacked Close Encounters extends it enough to land the pounce.
    Given a player "Prey" at (4000, 4000) with mass 10
    And "Prey" has heading (1, 0)
    And a player "Pilot" at (3700, 4000) with mass 50
    And "Pilot" has heading (1, 0)
    And "Pilot" has passive "closeEncounters" at stack 5
    When the world advances 2 ticks
    Then "Prey" is dead

  Scenario: Without Close Encounters the 300px behind chase falls short
    Given a player "Prey" at (4000, 4000) with mass 10
    And "Prey" has heading (1, 0)
    And a player "Pilot" at (3700, 4000) with mass 50
    And "Pilot" has heading (1, 0)
    When the world advances 2 ticks
    Then "Prey" is alive
