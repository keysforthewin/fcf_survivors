Feature: Death drops XP balls — earn XP by pickup, not by the kill
  Killing a fish no longer hands the killer XP. A DAMAGE death scatters a swarm of cheap gold XP
  balls at the body that ANYONE can collect, turning a kill into a contested scrum. Swallowing a
  fish whole still burps one big gold ball, now locked (uncollectable by anyone) for 2 seconds so
  others get a chance to swim in before it's a free-for-all.

  Background:
    Given a fresh world

  Scenario: A damage death scatters a swarm of XP balls summing to the kill's value
    # A level-5 fish is worth xpDroppedOnDeath(5, 0) = 5 + 4*25 = 105 XP, split across the swarm.
    # ~1 XP each now (≈3× the old ball count → a bigger gold shower), so 105 balls summing to 105.
    Given a fish dies from damage at (4000, 4000) with mass 0 and level 5
    Then there are 105 chunks in the world
    And the total burp XP in the world is 105

  Scenario: Collecting a dropped XP ball grants XP and no mass
    Given a player "Scavenger" at (4000, 4000) with mass 20
    And an XP ball at (4000, 4000) worth 7 xp
    When the world advances 1 tick
    Then "Scavenger" has XP 7
    And "Scavenger" has mass approximately 20

  Scenario: The swallow ball is locked for 2 seconds, then anyone can collect it
    Given a player "Eater" at (4000, 4000) with mass 50
    And a locked XP ball at (4000, 4000) worth 30 xp, unlockable in 2000 ms
    # Still locked at 1.5s — uncollectable even though the fish is sitting right on it.
    When the world advances 30 ticks
    Then "Eater" has XP 0
    And there is at least 1 chunk in the world
    # Past 2s — now anyone (including the fish on top) can scoop it.
    When the world advances 20 ticks
    Then "Eater" has at least XP 30
