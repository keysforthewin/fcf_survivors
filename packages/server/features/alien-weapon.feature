Feature: Alien Friends (flyby weapon)
  Alien Friends summons a friendly UFO that flies a straight line across the
  player's view, crossing over them and sniping one on-screen fish with a laser
  beam each second (the nearest visible target). The UFO body is a zero-damage
  projectile (it never collides); only the laser deals damage. After the wave's
  ships expire, the next wave only summons once the cooldown has elapsed. The UFO
  never harms its owner.

  Background:
    Given a fresh world

  Scenario: A UFO is summoned on the first tick
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "alien" at level 1
    When the world advances 1 tick
    Then 1 flyby ships owned by "Pilot" are in flight

  Scenario: The UFO snipes an on-screen fish with a laser
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "alien" at level 1
    And a player "Target" at (4300, 4000) with mass 50
    When the world advances 100 ticks
    Then "Pilot" has at least 1 weapon hit
    And "Pilot" has dealt at least 1 damage
    And the latest zap used weapon "alien"
    And the latest zap strikes "Target"

  Scenario: The UFO ignores fish far outside its flight
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "alien" at level 1
    And a player "Far" at (7500, 4000) with mass 10
    When the world advances 110 ticks
    Then "Far" has mass 10

  Scenario: The next wave only summons after the cooldown
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "alien" at level 1
    When the world advances 1 tick
    Then 1 flyby ships owned by "Pilot" are in flight
    # 5.5s in: the first UFO (5s life) is gone, but the 10s cooldown hasn't elapsed.
    When the world advances 110 ticks
    Then 0 flyby ships owned by "Pilot" are in flight
    # ~10.5s total: past the cooldown, a fresh UFO is summoned.
    When the world advances 100 ticks
    Then 1 flyby ships owned by "Pilot" are in flight

  Scenario: Alien Overlord summons three UFOs at once
    Given a player "Pilot" at (4000, 4000) with mass 50
    And "Pilot" has weapon "overlord" at level 1
    When the world advances 1 tick
    Then 3 flyby ships owned by "Pilot" are in flight
