Feature: XP and level progression
  XP accumulates from eating; crossing the xpForLevel curve promotes the
  player. Each promotion that crosses a threshold queues a card pick. While
  one pick is active the player can keep playing AND keep leveling up — the
  extra picks accumulate behind the active one and are drawn fresh after each
  pickCard so options reflect the just-updated loadout.

  Background:
    Given a fresh world

  Scenario: Eating pellets accumulates XP
    Given a player "Alpha" at (1000, 1000) with mass 10
    And a pellet at (1003, 1000)
    And a pellet at (1003, 1002)
    When the world advances 1 tick
    Then "Alpha" has XP 2

  Scenario: A single level threshold queues exactly one pick
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 6 XP
    When level-ups are processed
    Then "Alpha" has level 2
    And "Alpha" has XP 0
    And "Alpha" has a pending level-up modal
    And "Alpha" has 0 queued picks

  Scenario: A big XP burst cascades through multiple levels and queues picks
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 100 XP
    When level-ups are processed
    Then "Alpha" has at least level 5
    And "Alpha" has a pending level-up modal
    And "Alpha" has at least 3 queued picks

  Scenario: AI fish do not level up
    Given an AI fish "Bob" at (1000, 1000) with mass 50
    And "Bob" has accumulated 100 XP
    When level-ups are processed
    Then "Bob" has level 1

  Scenario: The xpForLevel curve is preserved
    Then the XP threshold for level 1 is 6
    And the XP threshold for level 2 is 6
    And the XP threshold for level 5 is 8

  Scenario: Dismissing the level-up modal unfreezes input
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 6 XP
    When level-ups are processed
    And "Alpha" dismisses the level-up modal
    And "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then "Alpha" has a pending level-up modal
    And the speed of "Alpha" is approximately 640

  Scenario: Restoring the modal re-freezes input
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 6 XP
    When level-ups are processed
    And "Alpha" dismisses the level-up modal
    And "Alpha" restores the level-up modal
    And "Alpha" sends input (1, 0)
    And the world advances 1 seconds
    Then the speed of "Alpha" is approximately 0
    And "Alpha" has a pending level-up modal

  Scenario: Picking the only pending card clears everything
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 6 XP
    When level-ups are processed
    And "Alpha" dismisses the level-up modal
    And "Alpha" picks the first offered card
    Then "Alpha" has no pending level-up modal
    And "Alpha" has 0 queued picks
    And "Alpha" is not in dismissed state

  Scenario: Picking with queued picks draws the next pick and preserves dismissed
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has accumulated 100 XP
    When level-ups are processed
    And "Alpha" dismisses the level-up modal
    And "Alpha" picks the first offered card
    Then "Alpha" has a pending level-up modal
    And "Alpha" is in dismissed state

  Scenario: A single maxed weapon offers its evolution
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has weapon "bubble" at level 5
    And "Alpha" has passive "magnet" at stack 3
    And "Alpha" has accumulated 6 XP
    When level-ups are processed
    Then "Alpha" is offered an evolution for "bubble"

  Scenario: Each maxed weapon with its paired passive offers an evolution
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has weapon "bubble" at level 5
    And "Alpha" has weapon "spine" at level 5
    And "Alpha" has passive "magnet" at stack 3
    And "Alpha" has passive "scales" at stack 5
    And "Alpha" has accumulated 6 XP
    When level-ups are processed
    Then "Alpha" is offered an evolution for "bubble"
    And "Alpha" is offered an evolution for "spine"

  Scenario: Two ready evolutions are both shown with no duplicate cards
    Given a player "Alpha" at (1000, 1000) with mass 10
    And "Alpha" has weapon "bubble" at level 5
    And "Alpha" has weapon "spine" at level 5
    And "Alpha" has passive "magnet" at stack 3
    And "Alpha" has passive "scales" at stack 5
    And "Alpha" has passive "teeth" at stack 5
    And "Alpha" has accumulated 6 XP
    When level-ups are processed
    Then "Alpha" is offered an evolution for "bubble"
    And "Alpha" is offered an evolution for "spine"
    And "Alpha" is offered no duplicate cards
