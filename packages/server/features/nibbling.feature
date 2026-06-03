Feature: Nibbling a bigger fish
  A fish smaller than the one it is touching cannot swallow it, so instead it takes a bite out
  of it for damage equal to its level (drained from the target's mass, which is its health). A
  nibble lands from ANY angle but needs actual contact — the body-edge gap must be within the eat
  reach (~5px); there is no behind-approach bonus. The bite is rate-limited by the same cooldown as
  the bite lunge, so sustained contact can't machine-gun damage. Nibbling never eats the bigger
  fish — only being swallowed whole kills.

  Background:
    Given a fresh world

  Scenario: A smaller fish nibbles a bigger one from behind for level-based mass damage
    # Whale faces +x; Minnow sits behind it (outside the mouth cone) so it nibbles instead of
    # being swallowed. Minnow is level 1, so one nibble drains 1 damage → 0.8 mass.
    Given a player "Whale" at (1000, 1000) with mass 100
    And "Whale" has heading (1, 0)
    And a player "Minnow" at (980, 1000) with mass 20
    When the world advances 1 tick
    Then "Whale" is alive
    And "Whale" has at most mass 99.5
    And "Whale" has at least mass 99
    And "Minnow" is alive

  Scenario: Nibbles are rate-limited so sustained contact does not machine-gun damage
    # Five ticks (250ms) is inside the 320ms cooldown, so only the first nibble lands: Whale loses
    # ~0.8 (one nibble) plus ~0.13 of mass-scaled decay over 5 ticks → ~99.07. Five nibbles would
    # drop it below 96, so the band proves exactly one landed.
    Given a player "Whale" at (1000, 1000) with mass 100
    And "Whale" has heading (1, 0)
    And a player "Minnow" at (980, 1000) with mass 20
    When the world advances 5 ticks
    Then "Whale" has mass between 98.5 and 99.5

  Scenario: A nibble needs actual contact — no behind-reach bonus
    # Whale faces +x; Minnow chases 120px behind it (rA+rB ≈ 99, so a ~21px gap — well past the ~5px
    # eat reach). With the behind-approach bonus gone, the nibble does NOT land and Whale is unharmed.
    Given a player "Whale" at (1000, 1000) with mass 100
    And "Whale" has heading (1, 0)
    And a player "Minnow" at (880, 1000) with mass 20
    And "Minnow" has heading (1, 0)
    When the world advances 1 tick
    # Only one tick of mass-scaled decay (~0.5/s → ~0.025) shaves Whale → ~99.975.
    Then "Whale" has mass approximately 100

  Scenario: A bigger fish does not nibble the smaller fish it is touching
    # Only the smaller fish nibbles. Whale (bigger) touching Minnow from behind neither eats nor
    # nibbles it — Whale takes the bite damage, Minnow takes none.
    Given a player "Whale" at (1000, 1000) with mass 100
    And "Whale" has heading (1, 0)
    And a player "Minnow" at (980, 1000) with mass 20
    When the world advances 1 tick
    # Minnow takes no nibble damage — only one tick of mass-scaled decay (~0.005) → ~19.995.
    Then "Minnow" has mass approximately 20
