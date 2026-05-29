Feature: Flat damage passives
  Mmiguel's Aim (teeth) and Full Metal (scales) are flat integer modifiers, not
  percentages: each Mmiguel's Aim stack adds +1 to a weapon's damage, and each
  Full Metal stack subtracts 1 from incoming damage — floored so every hit still
  lands at least 1 damage. This keeps damage legible now that weapons cap at 5.

  Background:
    Given a fresh world

  Scenario: Mmiguel's Aim adds a flat +1 weapon damage per stack
    # ESP base damage at Lv1 is 1; three stacks of Mmiguel's Aim make it 1 + 3 = 4.
    # Minnow (AI, no armor) sits 150 units out — inside the pulse, beyond Apex's eat reach.
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 1
    And "Apex" has passive "teeth" at stack 3
    And an AI fish "Minnow" at (4150, 4000) with mass 25
    When the world advances 1 tick
    Then "Apex" has dealt at least 4 damage
    And "Minnow" has mass approximately 21.8

  Scenario: Full Metal reduces incoming damage by a flat 1 per stack
    # ESP Lv5 deals 5; three stacks of Full Metal cut it to 5 - 3 = 2 damage (1.6 mass).
    # Victim sits 300 units out — damaged by the pulse, far outside the eat reach, and
    # equal mass so no eat/nibble collision fires.
    Given a player "Sniper" at (4000, 4000) with mass 50
    And "Sniper" has weapon "pulse" at level 5
    And a player "Victim" at (4000, 4300) with mass 50
    And "Victim" has passive "scales" at stack 3
    When the world advances 1 tick
    Then "Victim" has mass approximately 48.4

  Scenario: Full Metal cannot reduce a hit below 1 (floor)
    # ESP Lv5 deals 5; five stacks of Full Metal would zero it, but the floor keeps it
    # at 1 damage (0.8 mass) so armor never grants full immunity.
    Given a player "Sniper" at (4000, 4000) with mass 50
    And "Sniper" has weapon "pulse" at level 5
    And a player "Victim" at (4000, 4300) with mass 50
    And "Victim" has passive "scales" at stack 5
    When the world advances 1 tick
    Then "Victim" has mass approximately 49.2
