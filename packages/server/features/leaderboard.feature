Feature: Leaderboard persistence and broadcast
  ScoreDocs are written on death; topLeaderboard returns by finalMass DESC.
  The score module is mocked at module-boundary level — no Mongo required.

  Background:
    Given the server is running
    And client "alice" is connected

  Scenario: Joining the room receives the current leaderboard
    Given the leaderboard contains:
      | name   | color    | finalMass | level |
      | Mega   | #ff85a1  | 500       | 7     |
      | Mini   | #7fcfff  | 30        | 1     |
    And client "bob" is connected
    Then client "bob" receives a leaderboard with 2 entries
    And client "bob" receives a leaderboard whose top name is "Mega"

  Scenario: An empty leaderboard still arrives as an empty broadcast
    Then client "alice" receives a leaderboard with 0 entries

  Scenario: A player's better second run replaces their first
    When the leaderboard records a death for "Steve" with finalMass 100
    And the leaderboard records a death for "steve" with finalMass 250
    And client "bob" is connected
    Then the leaderboard mock recorded 2 writes
    And client "bob" receives a leaderboard with 1 entries
    And client "bob" receives a leaderboard whose top name is "steve"

  Scenario: A player's worse second run does not appear on the board
    When the leaderboard records a death for "Mega" with finalMass 500
    And the leaderboard records a death for "Mega" with finalMass 120
    And client "bob" is connected
    Then client "bob" receives a leaderboard with 1 entries
    And client "bob" receives a leaderboard whose top name is "Mega"
