Feature: Biting prey you cannot yet swallow
  When a fish faces another fish it is touching but is NOT 15% bigger than (the "between zone",
  or an equal-size fish), it cannot swallow it whole — instead it takes a light bite for damage
  = its level * BITE.biteDamagePerLevel, drained from the target's mass (its health). The bite
  requires front-of-face contact (the same mouth cone as eating) and is rate-limited by its own
  cooldown. Repeated bites soften prey until the predator is 15% bigger, at which point the next
  contact swallows it whole. Swallowing whole burps the kill's XP forward as a single large orb
  worth BURP.eatXpMult x a damage-kill.

  Background:
    Given a fresh world

  Scenario: A fish bites prey in front it is too small to swallow (between zone)
    # Alpha (11) is bigger than Beta (10) but under the 1.15x swallow ratio, so it bites instead
    # of eating. One bite = level(1) * 2 damage = 1.6 mass off Beta. Alpha does NOT gain Beta's
    # mass (no swallow). Beta, being smaller, nibbles Alpha back.
    Given a player "Alpha" at (1000, 1000) with mass 11
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is alive
    And "Beta" has at most mass 9
    And "Beta" has at least mass 8
    And "Alpha" is alive
    And "Alpha" has kill count 0
    And "Alpha" has at most mass 11

  Scenario: A bite requires facing the prey (no bite from behind)
    # Beta sits behind Alpha, outside Alpha's mouth cone, so Alpha does not bite it. (Beta, being
    # smaller, still nibbles Alpha from any angle — but Beta itself takes no damage.)
    Given a player "Alpha" at (1000, 1000) with mass 11
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (985, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" has mass 10
    And "Beta" is alive

  Scenario: Bites are rate-limited so sustained contact does not machine-gun damage
    # Alpha (100) vs Beta (95) is in the between zone (100 < 95 * 1.15), so Alpha bites. Five ticks
    # (250ms) is inside the 320ms cooldown, so only the FIRST bite lands (1.6 mass off Beta).
    # Masses are large enough that one bite does not drop Beta into swallow range.
    Given a player "Alpha" at (1000, 1000) with mass 100
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1130, 1000) with mass 95
    When the world advances 5 ticks
    Then "Beta" is alive
    And "Beta" has at most mass 94
    And "Beta" has at least mass 92

  Scenario: Two near-equal fish facing each other both take bite damage
    # Equal mass: neither can swallow, so both chew each other on contact (instead of ignoring).
    # Neither is swallowed; both survive one exchange with reduced mass.
    Given a player "Alpha" at (1000, 1000) with mass 20
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1030, 1000) with mass 20
    And "Beta" has heading (-1, 0)
    When the world advances 1 tick
    Then "Alpha" is alive
    And "Beta" is alive
    And "Alpha" has at most mass 19.8
    And "Beta" has at most mass 19.5
    And "Alpha" has at least mass 17
    And "Beta" has at least mass 17

  Scenario: Biting softens prey until it can be swallowed whole
    # Tick 1: Alpha (13) bites Beta (11) down to ~9.4 (and takes a small nibble back to ~12.2).
    # Now Alpha is >1.25x bigger, so tick 2 it swallows Beta whole — Beta dies, Alpha grows by
    # Beta's mass, and a burp chunk is dropped.
    Given a player "Alpha" at (1000, 1000) with mass 13
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 11
    When the world advances 2 ticks
    Then "Beta" is dead
    And "Alpha" has kill count 1
    And "Alpha" has at least mass 15
    And there is at least 1 chunk in the world

  Scenario: Swallowing whole burps a single XP orb worth 4x a damage-kill
    # Alpha (50) swallows Beta (10) whole on contact. The kill's XP (xpDroppedOnDeath = 15 for a
    # level-1 mass-10 fish) is burped as ONE orb worth 4x = 60 XP.
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 1 tick
    Then "Beta" is dead
    And there are 1 chunk in the world
    And the total burp XP in the world is 60
