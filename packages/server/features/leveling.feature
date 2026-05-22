Feature: XP and level progression
  XP accumulates from eating; crossing the xpForLevel curve promotes the
  player and queues a level-up card modal. Only one level-up fires per
  processLevelUps call — further levels wait until the player picks a card.

  Background:
    Given a fresh world

  Scenario: Eating pellets accumulates XP
    Given a player "Alpha" at (1000, 1000) with mass 10
    And a pellet at (1003, 1000)
    And a pellet at (1003, 1002)
    When the world advances 1 tick
    Then "Alpha" has XP 2

  Scenario: Crossing the XP threshold promotes one level and queues a card modal
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 100 XP
    When level-ups are processed
    Then "Alpha" has level 2
    And "Alpha" has XP 98
    And "Alpha" has a pending level-up modal

  Scenario: Level-ups do not cascade while a card modal is pending
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 100 XP
    When level-ups are processed
    And level-ups are processed
    Then "Alpha" has level 2
    And "Alpha" has XP 98

  Scenario: AI fish do not level up
    Given an AI fish "Bob" at (1000, 1000) with mass 50
    And "Bob" has accumulated 100 XP
    When level-ups are processed
    Then "Bob" has level 1

  Scenario: The xpForLevel curve is preserved
    Then the XP threshold for level 1 is 2
    And the XP threshold for level 2 is 2
    And the XP threshold for level 5 is 3
