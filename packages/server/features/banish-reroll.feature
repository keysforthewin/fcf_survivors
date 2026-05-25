Feature: Re-rolling and banishing level-up cards
  Tokens collected from fruit let a player re-roll a single offered card or
  banish a card's subject for the rest of the life. Banishing also strips the
  matching weapon/passive from the loadout (a hard purge).

  Background:
    Given a fresh world with seed 7

  Scenario: Re-rolling replaces one card and spends one token
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" holds 2 re-roll tokens
    And "Alpha" has accumulated 10 XP
    When level-ups are processed
    And remember the first offered card of "Alpha"
    And "Alpha" re-rolls the first offered card
    Then "Alpha" has 1 re-roll token
    And the first offered card of "Alpha" differs from remembered
    And "Alpha" is offered no duplicate cards

  Scenario: Re-rolling with no tokens does nothing
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 10 XP
    When level-ups are processed
    And remember the first offered card of "Alpha"
    And "Alpha" re-rolls the first offered card
    Then "Alpha" has 0 re-roll tokens
    And the first offered card of "Alpha" matches remembered

  Scenario: Banishing strips the owned weapon and bans it for the life
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has weapon "bubble" at level 2
    And "Alpha" has passive "fin" at stack 5
    And "Alpha" has passive "gulp" at stack 5
    And "Alpha" has passive "scales" at stack 5
    And "Alpha" holds 1 banish token
    And "Alpha" has accumulated 10 XP
    When level-ups are processed
    Then "Alpha" has a pending level-up modal
    When "Alpha" banishes the first offered card
    Then "Alpha" has 0 banish tokens
    And "Alpha" has 0 weapon slots
    And "Alpha" has banished subject "weapon:bubble"
    And "Alpha" has a pending level-up modal
    And "Alpha" is not offered a card for weapon "bubble"
    When "Alpha" has accumulated 10 XP
    And level-ups are processed
    Then "Alpha" has a pending level-up modal
    And "Alpha" is not offered a card for weapon "bubble"

  Scenario: Banishing draws a replacement so the modal stays full
    Given a player "Beta" at (1000, 1000) with mass 10
    And "Beta" holds 1 banish token
    And "Beta" has accumulated 10 XP
    When level-ups are processed
    Then "Beta" has a pending level-up modal
    And "Beta" is offered 3 cards
    When "Beta" banishes the first offered card
    Then "Beta" has 0 banish tokens
    And "Beta" is offered 3 cards
    And "Beta" is offered no duplicate cards

  Scenario: Banishing with no tokens does nothing
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 10 XP
    When level-ups are processed
    And remember the first offered card of "Alpha"
    And "Alpha" banishes the first offered card
    Then the first offered card of "Alpha" matches remembered
