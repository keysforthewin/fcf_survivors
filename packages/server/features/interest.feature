Feature: Snapshot interest management
  Each client only sees entities within their view radius. Deltas avoid
  resending unchanged state, and entities that leave the view are reported in
  the removed list once.

  Background:
    Given a fresh world

  Scenario: A nearby fish is included in the snapshot
    Given a player "Self" at (4000, 4000) with mass 10
    And a player "Friend" at (4500, 4000) with mass 10
    When "Self" builds a snapshot
    Then "Self"'s snapshot includes "Friend"

  Scenario: A fish far away is omitted from the snapshot
    Given a player "Self" at (4000, 4000) with mass 10
    And a player "Stranger" at (7000, 4000) with mass 10
    When "Self" builds a snapshot
    Then "Self"'s snapshot omits "Stranger"

  Scenario: View radius grows with the player's mass
    Given a player "Whale" at (4000, 4000) with mass 5000
    Then "Whale"'s view radius is greater than 3000

  Scenario: The you-block carries velocity and move speed for client prediction
    # The client predictor seeds reconciliation from you.{vx,vy} and computes desired
    # velocity from you.moveSpeed (base speed after passive + mass multipliers).
    # mass 10, no passives → 320 * massSpeedMult(10) capped at 2.0 = 640.
    Given a player "Self" at (4000, 4000) with mass 10
    When "Self" sends input (1, 0)
    And the world advances 30 ticks
    And "Self" builds a snapshot
    Then "Self"'s snapshot self moveSpeed is 640
    And "Self"'s snapshot self velocity points in +X

  Scenario: A friend that moves out of view appears in removed exactly once
    Given a player "Self" at (4000, 4000) with mass 10
    And a player "Friend" at (5800, 4000) with mass 10
    When "Self" builds a snapshot
    And "Friend" sends input (1, 0)
    And the world advances 60 ticks
    And "Self" builds a snapshot
    Then "Self"'s snapshot lists "Friend" as removed

  Scenario: A wide projectile centered beyond view but reaching into it is still shown
    # viewRadius(10) ~= 1960; ring center sits 2200 away (outside view) but its 400-radius
    # body reaches to ~1800 from Self, so it must be included — and it only survives the
    # spatial-hash interest query because that query is padded by the max projectile radius.
    Given a player "Self" at (4000, 4000) with mass 10
    And a projectile at (6200, 4000) with radius 400
    When "Self" builds a snapshot
    Then "Self"'s snapshot includes a projectile

  Scenario: A small projectile well outside view is omitted
    Given a player "Self" at (4000, 4000) with mass 10
    And a projectile at (7000, 4000) with radius 8
    When "Self" builds a snapshot
    Then "Self"'s snapshot omits all projectiles

  Scenario: After being reported removed, a friend is not re-reported
    Given a player "Self" at (4000, 4000) with mass 10
    And a player "Friend" at (5800, 4000) with mass 10
    When "Self" builds a snapshot
    And "Friend" sends input (1, 0)
    And the world advances 60 ticks
    And "Self" builds a snapshot
    And "Self" builds a snapshot
    Then "Self"'s snapshot does not list "Friend" as removed
