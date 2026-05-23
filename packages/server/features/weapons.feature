Feature: Weapon damage
  Weapons damage any fish in range (player or AI, larger or smaller) and
  each hit shaves mass off the target so the fish visibly shrinks. HP no
  longer exists — weapons never kill; only being eaten kills. Mass floors
  at the starter mass so a heavily-shot fish becomes a small fish again.

  Background:
    Given a fresh world

  Scenario: A pulse weapon shrinks an AI fish smaller than the player
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "Minnow" at (4150, 4000) with mass 25
    When the world advances 1 tick
    Then "Minnow" is alive
    And "Minnow" has mass approximately 24

  Scenario: A pulse weapon chips a bigger AI fish (chip damage preserved)
    Given a player "Apex" at (4000, 4000) with mass 70
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "Chunky" at (4060, 4000) with mass 80
    When the world advances 1 tick
    Then "Chunky" is alive
    And "Chunky" has mass approximately 79

  Scenario: A weapon hit shrinks but never kills — fish floors at starter mass
    # Equal masses prevent the eat collision from firing while the pulse damages the fish.
    Given a player "Apex" at (4000, 4000) with mass 30
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "Wounded" at (4200, 4000) with mass 30
    When the world advances 30 ticks
    Then "Wounded" is alive
    And "Wounded" has at most mass 29.5

  Scenario: A pulse weapon out of range leaves the AI fish untouched
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "FarOff" at (4400, 4000) with mass 10
    When the world advances 1 tick
    Then "FarOff" is alive
    And "FarOff" has mass 10

  Scenario: A weapon hit credits the firer with a hit and damage
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "Minnow" at (4150, 4000) with mass 25
    When the world advances 1 tick
    Then "Minnow" has mass approximately 24
    And "Apex" has 1 weapon hit
    And "Apex" has dealt at least 1 damage

  Scenario: Each fish a single pulse strikes counts as its own hit
    # Targets sit ~180 units out — inside the 250 pulse radius but beyond Apex's
    # ~133 eat reach, so they're damaged (and counted) without being swallowed.
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 1
    And an AI fish "Left" at (3820, 4000) with mass 20
    And an AI fish "Up" at (4000, 4180) with mass 20
    When the world advances 1 tick
    Then "Apex" has 2 weapon hits
    And "Apex" has dealt at least 2 damage

  Scenario: Bubble Shot at L5 reaches targets a single L1 shot cannot
    # Apex is stationary; default heading (1,0) sends bubbles east.
    # Distant is 1000 units away — beyond a single L1 shot's travel (~836)
    # but within an L5 shot's travel (~1800). Both fish are players so neither
    # wanders, and the eat-cone can't reach across 1000 units.
    Given a player "Apex" at (4000, 4000) with mass 60
    And "Apex" has weapon "bubble" at level 5
    And a player "Distant" at (5000, 4000) with mass 30
    When the world advances 100 ticks
    Then "Distant" has at most mass 20

  Scenario: Projectiles hit a fish on its visible body, not just its center
    # Apex fires east; Big sits 400 units east but offset 50 units south.
    # fishRadius(100) ≈ 66, so Big's body extends ~66 units from its center —
    # the projectile path (y=4000) passes through Big's body (y=4050±66).
    # With the old hardcoded +6 hit pad the projectile would whiff entirely.
    Given a player "Apex" at (4000, 4000) with mass 60
    And "Apex" has weapon "bubble" at level 1
    And a player "Big" at (4400, 4050) with mass 100
    When the world advances 100 ticks
    Then "Big" has at most mass 99.5
