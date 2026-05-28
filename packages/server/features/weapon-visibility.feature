Feature: Weapons only strike fish on the owner's screen
  An auto-firing weapon may only damage fish its owner can actually see — fish
  within the owner's view radius (viewRadius(mass), the same interest sphere the
  snapshot filter uses to decide what a client receives). A pulse's oversized AoE
  no longer nukes fish off-screen: its effective reach is clamped to the owner's
  view and grows with that view as the owner gains mass. (The Alien Friends UFO
  already obeys this rule — see alien-weapon.feature.)

  Background:
    Given a fresh world

  Scenario: A pulse does not strike a fish off the owner's screen
    # Apex mass 50 → viewRadius ≈ 2282. The L5 pulse radius is 3800, but the
    # target sits 2500 units east — inside the pulse radius yet off Apex's screen,
    # so it must take no damage and draw no bolt. (AI mass is decay-exempt, so the
    # mass assertion is exact.)
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 5
    And an AI fish "OffScreen" at (6500, 4000) with mass 10
    When the world advances 1 tick
    Then "OffScreen" has mass 10
    And no zap event was emitted

  Scenario: A pulse still strikes a fish on the owner's screen
    # Same Apex; target 2000 units east — inside both the pulse radius and the
    # ~2282 view, so the pulse damages it as before (guards against over-clamping).
    Given a player "Apex" at (4000, 4000) with mass 50
    And "Apex" has weapon "pulse" at level 5
    And an AI fish "OnScreen" at (6000, 4000) with mass 50
    When the world advances 1 tick
    Then "OnScreen" has at most mass 49.5
    And a zap event was emitted by "Apex"

  Scenario: A bigger fish sees — and so strikes — farther
    # Whale mass 1000 → viewRadius ≈ 2881. The same 2500-unit target a mass-50
    # fish can't see is now on-screen, so the pulse reaches it. The on-screen gate
    # tracks the player's growing view.
    Given a player "Whale" at (4000, 4000) with mass 1000
    And "Whale" has weapon "pulse" at level 5
    And an AI fish "Edge" at (6500, 4000) with mass 50
    When the world advances 1 tick
    Then "Edge" has at most mass 49.5
    And a zap event was emitted by "Whale"
