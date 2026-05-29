Feature: Battle Comms (slow-on-damage passive)
  Any fish you damage with a weapon is slowed to half speed for a brief, level-scaled
  window (0.2s at stack 1, +0.1s per stack). The slow applies regardless of which weapon
  landed the hit. AI fish never apply it (they hold no passives).

  Background:
    Given a fresh world

  # Timing: stack 5 = 600ms slow (12 ticks). Prey sits 20 units ahead so the AK bullet
  # hits on tick 1 despite the AI fleeing (distance < bullet reach). At tick 10 (500ms)
  # the slow window (650ms from hit) is still active.
  Scenario: Damaging a fish with Battle Comms slows it
    Given a player "Gunner" at (4000, 4000) with mass 80
    And "Gunner" has weapon "bubble" at level 1
    And "Gunner" has passive "comms" at stack 5
    And "Gunner" has input (1, 0)
    And an AI fish "Prey" at (4020, 4000) with mass 30
    When the world advances 10 ticks
    Then "Gunner" has at least 1 weapon hits
    And "Prey" is slowed
    And "Prey" effective move speed is halved

  Scenario: Without Battle Comms there is no slow
    Given a player "Gunner" at (4000, 4000) with mass 80
    And "Gunner" has weapon "bubble" at level 1
    And "Gunner" has input (1, 0)
    And an AI fish "Prey" at (4020, 4000) with mass 30
    When the world advances 10 ticks
    Then "Gunner" has at least 1 weapon hits
    And "Prey" is not slowed

  # The slow must actually reduce AI movement — AI integrate on a separate path from
  # players. Two equal-mass AI fish far apart both wander at full mode speed; slowing
  # one halves its desired velocity, so its speed magnitude stays strictly lower.
  Scenario: A slowed AI fish moves slower than an un-slowed one
    Given an AI fish "Slowpoke" at (3000, 4000) with mass 50
    And an AI fish "Speedy" at (6000, 4000) with mass 50
    And "Slowpoke" is slowed for 5000 ms
    When the world advances 20 ticks
    Then "Slowpoke" moves slower than "Speedy"
