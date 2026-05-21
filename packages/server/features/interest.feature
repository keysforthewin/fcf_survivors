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

  Scenario: A friend that moves out of view appears in removed exactly once
    Given a player "Self" at (4000, 4000) with mass 10
    And a player "Friend" at (5800, 4000) with mass 10
    When "Self" builds a snapshot
    And "Friend" sends input (1, 0)
    And the world advances 60 ticks
    And "Self" builds a snapshot
    Then "Self"'s snapshot lists "Friend" as removed

  Scenario: After being reported removed, a friend is not re-reported
    Given a player "Self" at (4000, 4000) with mass 10
    And a player "Friend" at (5800, 4000) with mass 10
    When "Self" builds a snapshot
    And "Friend" sends input (1, 0)
    And the world advances 60 ticks
    And "Self" builds a snapshot
    And "Self" builds a snapshot
    Then "Self"'s snapshot does not list "Friend" as removed
