Feature: Subversive Sybex (proximity slow aura)
  Subversive Sybex slows every fish standing within N×100px of the owner by N×10% (N = stack),
  so the owner can run prey down and eat it. The aura affects AI and rival players alike; the
  owner is never slowed by its own aura, and AI carry no passives so they project nothing. The
  aura is recomputed every tick from the previous tick's spatial hash, so scenarios advance a
  couple of ticks before checking the slow (the very first tick's hash is still empty).

  Background:
    Given a fresh world

  # Stack 5 → 500px radius, 50% slow. "Near" sits 300px out, well inside the aura.
  Scenario: A fish inside the aura is slowed
    Given a player "Slower" at (4000, 4000) with mass 80
    And "Slower" has passive "sybex" at stack 5
    And an AI fish "Near" at (4300, 4000) with mass 50
    When the world advances 3 ticks
    Then "Near" has aura slow applied
    And "Near" effective move speed is halved

  Scenario: A fish outside the aura is unaffected
    Given a player "Slower" at (4000, 4000) with mass 80
    And "Slower" has passive "sybex" at stack 5
    And an AI fish "Far" at (4700, 4000) with mass 50
    When the world advances 3 ticks
    Then "Far" has no aura slow

  # The slow must actually reduce AI movement (ai.ts path), not just the speed getter. Both AI flee
  # an equal-threat player so they share the same flee mode/desired speed — the ONLY difference is
  # that "Inside" sits in a Sybex aura and "Outside" does not. So Inside ends up strictly slower.
  Scenario: A slowed AI inside the aura moves slower than an equally-spooked AI outside it
    Given a player "Slower" at (2000, 2000) with mass 80
    And "Slower" has passive "sybex" at stack 5
    And a player "Plain" at (6000, 6000) with mass 80
    And an AI fish "Inside" at (2250, 2000) with mass 50
    And an AI fish "Outside" at (6250, 6000) with mass 50
    When the world advances 10 ticks
    Then "Inside" moves slower than "Outside"

  # The same for the player movement path (world.step). Two players given identical input — the one
  # inside the aura reaches a lower terminal speed than the one outside.
  Scenario: A slowed player inside the aura moves slower than one outside on the same input
    Given a player "Slower" at (2000, 2000) with mass 80
    And "Slower" has passive "sybex" at stack 5
    And a player "Inside" at (2300, 2000) with mass 50
    And a player "Outside" at (6000, 6000) with mass 50
    And "Inside" has input (1, 0)
    And "Outside" has input (1, 0)
    When the world advances 10 ticks
    Then "Inside" moves slower than "Outside"

  # The aura affects rival players too (not just AI). "Rival" is a server-integrated player, so its
  # effective move speed reflects the aura directly.
  Scenario: Subversive Sybex slows a rival player too
    Given a player "Slower" at (4000, 4000) with mass 80
    And "Slower" has passive "sybex" at stack 5
    And a player "Rival" at (4300, 4000) with mass 50
    When the world advances 3 ticks
    Then "Rival" has aura slow applied
    And "Rival" effective move speed is halved

  Scenario: The owner is not slowed by its own aura
    Given a player "Slower" at (4000, 4000) with mass 80
    And "Slower" has passive "sybex" at stack 5
    And an AI fish "Near" at (4300, 4000) with mass 50
    When the world advances 3 ticks
    Then "Slower" has no aura slow

  Scenario: Without the passive there is no aura
    Given a player "Plain" at (4000, 4000) with mass 80
    And an AI fish "Near" at (4100, 4000) with mass 50
    When the world advances 3 ticks
    Then "Near" has no aura slow
