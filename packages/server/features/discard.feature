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

  Scenario: Discard works while a level-up pick is queued but dismissed
    # ESC/skip leaves a pending pick while you keep playing — discard must still work.
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has weapon "bubble" at level 3
    And "Alpha" has weapon "spine" at level 1
    And "Alpha" has accumulated 10 XP
    When level-ups are processed
    And "Alpha" dismisses the level-up modal
    And "Alpha" discards weapon "spine"
    Then "Alpha" has 1 weapon slot

  Scenario: Discard is refused while the level-up modal is open
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has weapon "bubble" at level 3
    And "Alpha" has weapon "spine" at level 1
    And "Alpha" has accumulated 10 XP
    When level-ups are processed
    And "Alpha" discards weapon "spine"
    Then "Alpha" has 2 weapon slots

  Scenario: Discarding a weapon drops its now-dead pending cards
    # The only offerable card is the bubble upgrade (slots full, others maxed).
    # Discarding bubble must prune that stale card so the modal isn't left stuck.
    Given a player "Alpha" at (1000, 1000) with mass 50
    And "Alpha" has weapon "bubble" at level 3
    And "Alpha" has weapon "spine" at level 5
    And "Alpha" has weapon "pulse" at level 5
    And "Alpha" has weapon "ink" at level 5
    And "Alpha" has accumulated 10 XP
    When level-ups are processed
    And "Alpha" dismisses the level-up modal
    And "Alpha" discards weapon "bubble"
    Then "Alpha" has no pending level-up modal
