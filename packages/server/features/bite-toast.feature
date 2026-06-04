Feature: Melee combat toasts
  Melee bites drive a PERSONAL combat feed. The attacker (when human) gets a "You hit X" toast; a
  human victim gets a "You were bitten by X" warning ONLY when the attacker is a genuine threat — a
  bigger fish biting in the between-zone. A smaller fish nibbling its predator is not a threat, so
  eating prey never tells the eater it was bitten. Both sides fire once per attacker→victim
  engagement (no spam), and AI victims are never warned.

  Background:
    Given a fresh world

  Scenario: A between-zone bite on a human warns the victim AND credits the attacker
    # Alpha (11) is bigger than Beta (10) but under the swallow ratio, so it bites instead of eating.
    Given a player "Alpha" at (1000, 1000) with mass 11
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 1 tick
    Then a bite toast was emitted for "Beta" by "Alpha"
    And a hit toast was emitted for "Alpha" hitting "Beta"

  Scenario: A smaller fish nibbling a human does NOT warn the victim, but credits the nibbler
    # Minnow (smaller) nibbles the human Whale from BEHIND (Whale faces +x, Minnow is at -x), so
    # Whale never swallows it. Under aggressor framing the victim is NOT warned about prey nibbles;
    # the nibbler still gets a "You hit" toast.
    Given a player "Whale" at (1000, 1000) with mass 100
    And "Whale" has heading (1, 0)
    And a player "Minnow" at (980, 1000) with mass 20
    When the world advances 1 tick
    Then there are 0 bite toasts for "Whale"
    And a hit toast was emitted for "Minnow" hitting "Whale"

  Scenario: Sustained biting warns the victim only once per engagement
    Given a player "Alpha" at (1000, 1000) with mass 100
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1130, 1000) with mass 95
    When the world advances 20 ticks
    Then there are 1 bite toasts for "Beta"

  Scenario: Two bigger attackers ganging up each warn the victim once
    Given a player "Beta" at (1000, 1000) with mass 200
    And a player "Alpha" at (1203, 1000) with mass 220
    And "Alpha" has heading (-1, 0)
    And a player "Gamma" at (797, 1000) with mass 220
    And "Gamma" has heading (1, 0)
    When the world advances 20 ticks
    Then there are 2 bite toasts for "Beta"

  Scenario: Biting an AI fish warns no one
    Given a player "Alpha" at (1000, 1000) with mass 11
    And "Alpha" has heading (1, 0)
    And an AI fish "Beta" at (1015, 1000) with mass 10
    When the world advances 1 tick
    Then there are 0 bite toasts for "Beta"
