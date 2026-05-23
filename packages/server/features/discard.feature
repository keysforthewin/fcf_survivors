Feature: Discard weapons and passives
  Players can drop a weapon or passive to free up a slot. Discarding is
  free (no mass refund) and happens immediately.

  Background:
    Given a fresh world

  Scenario: Discarding a weapon frees the slot
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has weapon "bubble" at level 3
    And "Alpha" has weapon "spine" at level 1
    When "Alpha" discards weapon "bubble"
    Then "Alpha" has 1 weapon slot

  Scenario: Discarding a passive frees the slot
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has passive "scales" at stack 3
    And "Alpha" has passive "fin" at stack 1
    When "Alpha" discards passive "scales"
    Then "Alpha" has 1 passive slot

  Scenario: Discarding an unowned weapon is a no-op
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has weapon "bubble" at level 1
    When "Alpha" discards weapon "kraken"
    Then "Alpha" has 1 weapon slot
