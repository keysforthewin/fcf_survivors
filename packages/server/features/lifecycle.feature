Feature: Player lifecycle over the wire
  End-to-end smoke for spawn → snapshot → death → score persistence, against a
  real Bun.serve with a mocked score store.

  Background:
    Given the server is running
    And client "alice" is connected

  Scenario: Hello returns a welcome with positive selfId and arena dimensions
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    And client "alice" receives a snapshot within 500ms

  Scenario: Welcome arrives with the initial leaderboard
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome

  Scenario: Disconnecting without dying records the score and announces a "left"
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    Given client "bob" is connected
    When client "bob" sends hello as "Bob" with color "#7fcfff"
    Then client "bob" receives a welcome
    When client "alice" disconnects
    Then the leaderboard mock recorded 1 write for "Alice"
    And the most recent write for "Alice" has killedBy "the void"
    And client "bob" receives a playerDied for "Alice" with byName "the void"

  Scenario: Disconnecting while never having spawned is a no-op
    When client "alice" disconnects
    Then the leaderboard mock recorded 0 writes
