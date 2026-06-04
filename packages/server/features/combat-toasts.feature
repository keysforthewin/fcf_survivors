Feature: Eating attribution and the "bitten by the void" regression
  Swallowing prey credits the eater explicitly (so the personal "You ate X" toast and the global
  "X was eaten by <exact eater>" line are accurate), and — the bug this guards — eating prey must
  never enqueue a "bitten" warning for the EATER, even though the prey nibbles it on the way in.

  Background:
    Given a fresh world

  Scenario: Swallowing prey credits the eater and never warns the eater it was bitten
    # Prey (10) overlaps Pred (100): Pred swallows it (100 >= 10 x 1.25) and Prey, being smaller,
    # also nibbles Pred. The eater must get ZERO "bitten" warnings.
    Given a player "Pred" at (1000, 1000) with mass 100
    And "Pred" has heading (1, 0)
    And a player "Prey" at (1000, 1000) with mass 10
    When the world advances 1 tick
    Then "Prey" was swallowed whole
    And "Prey" was killed by "Pred"
    And there are 0 bite toasts for "Pred"
