Feature: Combined slot cap
  A fish can hold at most 4 total skills — any mix of weapons and passives.
  Once four slots are used, no new weapon and no new passive may be added;
  only owned ones may level up. When every slot is full and fully maxed,
  level-ups happen silently — XP is consumed and level ticks up, but no
  upgrade modal opens.

  Background:
    Given a fresh world

  Scenario: With 4 slots used, no new weapon is offered
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has weapon "bubble" at level 1
    And "Alpha" has weapon "spine" at level 1
    And "Alpha" has passive "fin" at stack 1
    And "Alpha" has passive "gulp" at stack 1
    And "Alpha" has accumulated 100 XP
    When level-ups are processed
    Then "Alpha" has a pending level-up modal
    And "Alpha"'s pending cards do not add a new weapon

  Scenario: With 4 slots used, no new passive is offered
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has weapon "bubble" at level 1
    And "Alpha" has weapon "spine" at level 1
    And "Alpha" has passive "fin" at stack 1
    And "Alpha" has passive "gulp" at stack 1
    And "Alpha" has accumulated 100 XP
    When level-ups are processed
    Then "Alpha"'s pending cards do not stack a new passive

  Scenario: Fully maxed 4-slot loadout levels silently with no modal
    Given a player "Maxed" at (1000, 1000) with mass 10
    And "Maxed" has weapon "bubble" at level 5
    And "Maxed" has weapon "spine" at level 5
    And "Maxed" has passive "fin" at stack 5
    And "Maxed" has passive "gulp" at stack 5
    And "Maxed" has accumulated 10 XP
    When level-ups are processed
    Then "Maxed" has level 2
    And "Maxed" has no pending level-up modal
