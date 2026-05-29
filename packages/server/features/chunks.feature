Feature: Chunks dropped on death
  When a fish dies the server drops mass chunks. Decay and expiry are the
  invariants tested here; the eating-side is in eating.feature.

  Background:
    Given a fresh world

  Scenario: A chunk's velocity decays each tick
    Given a chunk at (4000, 4000) with mass 5
    When the world advances 50 ticks
    Then the chunk speed has decayed below 10.0

  Scenario: Chunks expire 15 seconds after being spawned
    Given a chunk at (4000, 4000) with mass 5
    When the world advances 16 seconds
    Then there are 0 chunks in the world

  Scenario: A chunk just under 15 seconds old is still present
    Given a chunk at (4000, 4000) with mass 5
    When the world advances 14 seconds
    Then there is at least 1 chunk in the world

  Scenario: An XP ball driven at a wall is pinned inside the arena
    # A big swallow ball (mass 60) spawned at the edge with strong outward velocity
    # must not escape — it brakes against the wall and stays in bounds.
    Given a chunk at (20, 4000) with mass 60 moving (-800, 0)
    When the world advances 50 ticks
    Then there is at least 1 chunk in the world
    And all chunks are within the arena bounds

  Scenario: Death-drop XP balls stay inside when a fish dies at the corner
    # The kill scatter sprays balls in every direction; those aimed out of bounds
    # are brought back rather than leaving the arena.
    Given a fish dies from damage at (10, 10) with mass 60 and level 5
    When the world advances 40 ticks
    Then there is at least 1 chunk in the world
    And all chunks are within the arena bounds
