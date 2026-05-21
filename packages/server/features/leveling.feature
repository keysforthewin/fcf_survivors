Feature: XP and level progression
  XP accumulates from eating; crossing the xpForLevel curve promotes the
  player. The M4 card system will replace the placeholder +3 mass / +6 maxHp
  reward — these scenarios pin it so the swap is intentional.

  Background:
    Given a fresh world

  Scenario: Eating pellets accumulates XP
    Given a player "Alpha" at (1000, 1000) with mass 10
    And a pellet at (1003, 1000)
    And a pellet at (1003, 1002)
    When the world advances 1 tick
    Then "Alpha" has XP 2

  Scenario: 100 XP promotes the player from level 1 to level 5
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 100 XP
    When level-ups are processed
    Then "Alpha" has level 5
    And "Alpha" has XP 12
    And "Alpha" has mass 22

  Scenario: AI fish do not level up
    Given an AI fish "Bob" at (1000, 1000) with mass 50
    And "Bob" has accumulated 100 XP
    When level-ups are processed
    Then "Bob" has level 1

  Scenario: The xpForLevel curve is preserved
    Then the XP threshold for level 1 is 13
    And the XP threshold for level 2 is 18
    And the XP threshold for level 5 is 44
