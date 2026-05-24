Feature: Fruit pickups grant re-roll / banish tokens
  Fruit are rarer, bigger "super pellets" that also drop a level-up token.
  They spawn on the same background switch as pellets, are capped, and only
  players collect them (AI ignore fruit so the tokens stay on the map).

  Scenario: A tick on a fresh world spawns up to spawnPerTick fruit
    Given a world with fruit auto-spawn enabled
    When the world advances 1 tick
    Then there are 1 fruit
    And all fruit are inside the arena

  Scenario: Fruit count is capped at 2
    Given a world with fruit auto-spawn enabled
    When the world advances 200 ticks
    Then there are 2 fruit

  Scenario: Eating a re-roll fruit grants mass, XP and a re-roll token
    Given a fresh world
    And a player "Alpha" at (1000, 1000) with mass 10
    And a reroll fruit at (1003, 1000)
    When the world advances 1 tick
    Then "Alpha" has 1 re-roll token
    And "Alpha" has 0 banish tokens
    And "Alpha" has mass between 19.9 and 20.1
    And there are 0 fruit

  Scenario: Eating a fruit immediately respawns a replacement (map stays at the cap)
    Given a world with fruit auto-spawn enabled
    And a player "Alpha" at (1000, 1000) with mass 10
    And a reroll fruit at (1003, 1000)
    When the world advances 1 tick
    Then "Alpha" has 1 re-roll token
    And there are 2 fruit

  Scenario: Eating a banish fruit grants a banish token
    Given a fresh world
    And a player "Alpha" at (1000, 1000) with mass 10
    And a banish fruit at (1003, 1000)
    When the world advances 1 tick
    Then "Alpha" has 1 banish token
    And "Alpha" has 0 re-roll tokens

  Scenario: AI fish ignore fruit
    Given a fresh world
    And an AI fish "Bob" at (1000, 1000) with mass 50
    And a reroll fruit at (1003, 1000)
    When the world advances 1 tick
    Then there are 1 fruit
