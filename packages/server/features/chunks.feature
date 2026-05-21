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
