Feature: Bitten toast events
  When a human player TAKES a bite (a nibble, or a between-zone chip bite), the world enqueues a
  "bitten" event that the tick loop broadcasts as a toast. It fires once per attacker→victim
  engagement — sustained chewing does not spam — and never fires for AI victims.

  Background:
    Given a fresh world

  Scenario: A between-zone bite on a human player emits a bitten toast
    # Alpha (11) is bigger than Beta (10) but under the swallow ratio, so it bites instead of eating.
    Given a player "Alpha" at (1000, 1000) with mass 11
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1015, 1000) with mass 10
    When the world advances 1 tick
    Then a bite toast was emitted for "Beta" by "Alpha"

  Scenario: A nibble on a human player emits a bitten toast
    # Minnow (smaller) nibbles the human Whale from behind — a bite the victim should be told about.
    Given a player "Whale" at (1000, 1000) with mass 100
    And "Whale" has heading (1, 0)
    And a player "Minnow" at (980, 1000) with mass 20
    When the world advances 1 tick
    Then a bite toast was emitted for "Whale" by "Minnow"

  Scenario: Sustained biting toasts only once per engagement
    # Alpha (100) vs Beta (95) is the between zone; Alpha bites every 320ms. Over 20 ticks (1s) only
    # the first bite of the engagement toasts.
    Given a player "Alpha" at (1000, 1000) with mass 100
    And "Alpha" has heading (1, 0)
    And a player "Beta" at (1130, 1000) with mass 95
    When the world advances 20 ticks
    Then there are 1 bite toasts for "Beta"

  Scenario: Two attackers ganging up each toast once (per-attacker engagement)
    # Alpha and Gamma both chew the human Beta from opposite sides (between zone, gap ≈ 2px). Each
    # attacker's engagement toasts exactly once — the alternating attacker ids must NOT each re-trigger
    # a toast every bite (the bug a single per-victim slot would have).
    Given a player "Beta" at (1000, 1000) with mass 200
    And a player "Alpha" at (1203, 1000) with mass 220
    And "Alpha" has heading (-1, 0)
    And a player "Gamma" at (797, 1000) with mass 220
    And "Gamma" has heading (1, 0)
    When the world advances 20 ticks
    Then there are 2 bite toasts for "Beta"

  Scenario: Biting an AI fish emits no toast
    Given a player "Alpha" at (1000, 1000) with mass 11
    And "Alpha" has heading (1, 0)
    And an AI fish "Beta" at (1015, 1000) with mass 10
    When the world advances 1 tick
    Then there are 0 bite toasts for "Beta"
