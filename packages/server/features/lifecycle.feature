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
