Feature: Mortal's Heli (minicopter weapon)
  Mortal's Heli summons a minicopter that streaks in from a screen edge, loiters around
  the player on station for ~8s while turning its nose onto enemies and firing a lead-aimed
  AK (only along its nose, at ~2x the AK's rate), then peels off and leaves through an edge.
  The body is a zero-damage projectile (harmless to touch); only its bullets deal damage.
  After the heli leaves the next one only summons once the 20s cooldown has elapsed.

  Background:
    Given a fresh world

  Scenario: A minicopter is summoned on the first tick
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight

  Scenario: The minicopter flies off after its patrol (enter + ~8s on station + exit)
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight
    # 15s covers fly-in + 8s on station + fly-out, but stays inside the 20s summon cooldown.
    When the world advances 15 seconds
    Then 0 heli bodies owned by "Pilot" are in flight

  Scenario: The next heli only summons after the cooldown
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight
    # 15s: the patrol is over but the 20s summon cooldown hasn't elapsed → still none.
    When the world advances 15 seconds
    Then 0 heli bodies owned by "Pilot" are in flight
    # ~25s total: cooldown elapsed → a fresh heli summons (and is mid-patrol).
    When the world advances 10 seconds
    Then 1 heli bodies owned by "Pilot" are in flight

  Scenario: The heli reaches its attack phase even while the player is moving
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    # Continuous input → the server keeps integrating the player away from the summon spot.
    And "Pilot" has input (1, 0)
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight
    # Fly-in is fast (1200 u/s); 3s is ample to reach the loiter ring and begin attacking.
    When the world advances 3 seconds
    Then "Pilot"'s heli has reached the attack phase

  Scenario: A heli the player tails as it leaves still flies off and despawns
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight
    # Tail it through its whole patrol into the exit. Even glued to its tail, the player must not be
    # able to keep it on screen — it should streak out and be gone before the 16s expiry backstop.
    When "Pilot" tails their heli for 14 seconds
    Then 0 heli bodies owned by "Pilot" are in flight

  Scenario: Sky King's Apache flies a shorter patrol
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "gunship" at level 1
    When the world advances 1 tick
    Then 1 heli bodies owned by "Pilot" are in flight
    # 5s uptime → fly-in + ~5s on station + fly-out is done well before the 16s summon cooldown.
    When the world advances 12 seconds
    Then 0 heli bodies owned by "Pilot" are in flight

  Scenario: The heli's AK damages a nearby fish
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "heli" at level 5
    And a player "Prey" at (4300, 4000) with mass 20
    # Enough ticks to cover the fly-in plus several aligned bursts on station.
    When the world advances 120 ticks
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
