Feature: AI feeding frenzy on dropped XP balls
  A killed fish scatters gold XP balls. Every AI fish within screen range
  immediately rushes the nearest ball in a feeding frenzy — unless a bigger fish
  scares it off, because flee always wins (so small fish don't suicide chasing
  food). Only the dropped XP balls (xp-bearing chunks) trigger it; ordinary
  corpse chunks do not. Note: chunks enter the spatial hash at the end of a step,
  so feed mode first appears on the 2nd tick after a ball is seeded.

  Background:
    Given a fresh world

  Scenario: An AI fish rushes a nearby dropped XP ball
    Given an AI fish "Greedy" at (4000, 4000) with mass 20
    And an XP ball at (4000, 4600) worth 30 xp
    And baseline position of "Greedy"
    When the world advances 5 ticks
    Then "Greedy" is in "feed" mode
    And "Greedy" is steering toward (4000, 4600)
    And "Greedy" has moved at least 30 units

  Scenario: A bigger fish scares a feeding fish off (flee beats feed)
    Given an AI fish "Timid" at (4000, 4000) with mass 10
    And an XP ball at (4600, 4000) worth 30 xp
    And a player "Apex" at (4000, 3700) with mass 100
    When the world advances 3 ticks
    Then "Timid" is in "flee" mode

  Scenario: A frenzying fish goes for the closest of two balls
    Given an AI fish "Picky" at (4000, 4000) with mass 20
    And an XP ball at (4000, 4300) worth 30 xp
    And an XP ball at (4700, 4000) worth 30 xp
    When the world advances 4 ticks
    Then "Picky" is in "feed" mode
    And "Picky" is steering toward (4000, 4300)

  Scenario: A ball beyond screen range is ignored
    Given an AI fish "Distant" at (4000, 4000) with mass 20
    And an XP ball at (4000, 5700) worth 30 xp
    When the world advances 5 ticks
    Then "Distant" is in "wander" mode

  Scenario: A non-XP corpse chunk does not trigger a frenzy
    Given an AI fish "Choosy" at (4000, 4000) with mass 20
    And a chunk at (4000, 4300) with mass 50
    When the world advances 5 ticks
    Then "Choosy" is in "wander" mode
