Feature: Nitro's Customs (vehicle weapon)
  Nitro's Customs launches a single large Rust-style car that sweeps across the player's screen
  in a straight line, piercing every fish in its lane for damage. Every level fires one car;
  leveling raises damage and shortens the cooldown. Its evolution, Nitro's Dealership, fields three
  cars at once and is gated behind Nitro's Customs at Lv5 plus Subversive Sybex at max stack.

  Background:
    Given a fresh world

  Scenario: A car wave launches on the first tick
    Given a player "Driver" at (4000, 4000) with mass 50
    And "Driver" has weapon "nitros" at level 1
    When the world advances 1 tick
    Then 1 vehicle bodies owned by "Driver" are in flight

  Scenario: Every level still launches a single car
    Given a player "Driver" at (4000, 4000) with mass 50
    And "Driver" has weapon "nitros" at level 5
    When the world advances 1 tick
    Then 1 vehicle bodies owned by "Driver" are in flight

  Scenario: Nitro's Dealership fields three cars at once
    Given a player "Baller" at (4000, 4000) with mass 50
    And "Baller" has weapon "dealership" at level 1
    When the world advances 1 tick
    Then 3 vehicle bodies owned by "Baller" are in flight

  Scenario: Cars sweep across and despawn within their lifetime
    Given a player "Driver" at (4000, 4000) with mass 50
    And "Driver" has weapon "nitros" at level 1
    When the world advances 1 tick
    Then 1 vehicle bodies owned by "Driver" are in flight
    # lifetime 7.6s < 8s, comfortably inside the 14s cooldown.
    When the world advances 8 seconds
    Then 0 vehicle bodies owned by "Driver" are in flight

  Scenario: The next wave only launches after the cooldown
    Given a player "Driver" at (4000, 4000) with mass 50
    And "Driver" has weapon "nitros" at level 5
    When the world advances 1 tick
    Then 1 vehicle bodies owned by "Driver" are in flight
    # past the car's 7.6s lifetime but inside the 10s cooldown → none in flight.
    When the world advances 8 seconds
    Then 0 vehicle bodies owned by "Driver" are in flight
    # past the 10s cooldown → a fresh wave summons.
    When the world advances 6 seconds
    Then 1 vehicle bodies owned by "Driver" are in flight

  # A single level-1 car runs its lane through the owner; two stationary fish flanking the owner
  # (150px out — too far to be eaten, well inside the car's ~272px reach) are BOTH struck by the
  # same car. Two hits from one projectile proves it pierces (a normal linear bullet dies on hit 1).
  # The slowed car crosses the owner's center at ~half its lifetime (~3.8s), so give it 5s to reach
  # and pass the flanking fish.
  Scenario: A single car plows through multiple fish in its lane
    Given a player "Driver" at (4000, 4000) with mass 100
    And "Driver" has weapon "nitros" at level 1
    And a player "A" at (4150, 4000) with mass 20
    And a player "B" at (3850, 4000) with mass 20
    When the world advances 5 seconds
    Then "Driver" has at least 2 weapon hits
    And "Driver" has dealt at least 2 damage

  Scenario: Nitro's Customs maxed with Subversive Sybex maxed offers Nitro's Dealership
    Given a player "Ace" at (1000, 1000) with mass 10
    And "Ace" has weapon "nitros" at level 5
    And "Ace" has passive "sybex" at stack 5
    And "Ace" has accumulated 10 XP
    When level-ups are processed
    Then "Ace" is offered an evolution for "nitros"

  Scenario: Nitro's Dealership is not offered until Subversive Sybex is maxed
    Given a player "Rook" at (1000, 1000) with mass 10
    And "Rook" has weapon "nitros" at level 5
    And "Rook" has passive "sybex" at stack 2
    And "Rook" has accumulated 10 XP
    When level-ups are processed
    Then "Rook" is not offered an evolution for "nitros"
