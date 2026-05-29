Feature: Mortal's Heli (minicopter weapon)
  Mortal's Heli summons a minicopter that loiters around the player for 8s, then
  flies off. It fires a lead-aimed AK at on-screen fish at ~2x the AK's rate. The
  body is a zero-damage projectile (harmless to touch); only its bullets deal damage.
  After the heli expires the next one only summons once the 20s cooldown has elapsed.

  Background:
    Given a fresh world

  Scenario: A minicopter is summoned on the first tick
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight

  Scenario: The minicopter flies off after its 8s uptime
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight
    When the world advances 8 seconds
    Then 0 heli bodies owned by "Pilot" are in flight

  Scenario: The next heli only summons after the cooldown
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight
    # 9s: past the 8s uptime but inside the 20s cooldown → still none.
    When the world advances 9 seconds
    Then 0 heli bodies owned by "Pilot" are in flight
    # ~21s total: cooldown elapsed → a fresh heli summons.
    When the world advances 12 seconds
    Then 1 heli bodies owned by "Pilot" are in flight

  Scenario: The heli's AK damages a nearby fish
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 5
    And a player "Prey" at (4300, 4000) with mass 20
    When the world advances 40 ticks
    Then "Pilot" has at least 1 weapon hits
    And "Pilot" has dealt at least 1 damage

  Scenario: The heli ignores fish far off the player's screen
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 5
    And an AI fish "Far" at (9000, 4000) with mass 20
    When the world advances 60 ticks
    Then "Far" has mass 20

  Scenario: Mortal's Heli maxed with Battle Comms maxed offers the Attack Helicopter
    Given a player "Ace" at (1000, 1000) with mass 10
    And "Ace" has weapon "heli" at level 5
    And "Ace" has passive "comms" at stack 5
    And "Ace" has accumulated 10 XP
    When level-ups are processed
    Then "Ace" is offered an evolution for "heli"

  Scenario: The Attack Helicopter is not offered until Battle Comms is maxed
    Given a player "Rook" at (1000, 1000) with mass 10
    And "Rook" has weapon "heli" at level 5
    And "Rook" has passive "comms" at stack 2
    And "Rook" has accumulated 10 XP
    When level-ups are processed
    Then "Rook" is not offered an evolution for "heli"
