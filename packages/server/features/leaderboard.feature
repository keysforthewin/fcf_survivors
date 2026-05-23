Feature: Leaderboard persistence and broadcast
  ScoreDocs are written on death; the board keeps each player's all-time best
  of every stat and ranks by kills (the primary metric). The score module is
  mocked at module-boundary level — no Mongo required.

  Background:
    Given the server is running
    And client "alice" is connected

  Scenario: Joining the room receives the current leaderboard
    Given the leaderboard contains:
      | name | color   | kills | peakMass | hits | damage | level |
      | Mega | #ff85a1 | 12    | 500      | 300  | 4000   | 7     |
      | Mini | #7fcfff | 2     | 30       | 40   | 200    | 1     |
    And client "bob" is connected
    Then client "bob" receives a leaderboard with 2 entries
    And client "bob" receives a leaderboard whose top name is "Mega"

  Scenario: An empty leaderboard still arrives as an empty broadcast
    Then client "alice" receives a leaderboard with 0 entries

  Scenario: A player's repeated runs collapse to one entry
    When the leaderboard records a death for "Steve" with 3 kills and peak mass 100
    And the leaderboard records a death for "steve" with 9 kills and peak mass 80
    And client "bob" is connected
    Then the leaderboard mock recorded 2 writes
    And client "bob" receives a leaderboard with 1 entries
    And client "bob" receives a leaderboard whose top name is "steve"

  Scenario: Career bests are tracked independently across runs
    # Run A: many kills, little mass. Run B: few kills, huge mass. The single
    # surviving row keeps the best of each, not just the best run overall.
    When the leaderboard records a death for "Ace" with 10 kills and peak mass 50
    And the leaderboard records a death for "Ace" with 1 kills and peak mass 900
    And client "bob" is connected
    Then the leaderboard mock recorded 2 writes
    And client "bob" receives a leaderboard with 1 entries
    And client "bob" receives a leaderboard where "Ace" has 10 kills and peak mass 900

  Scenario: Highest level and longest run are tracked independently across runs
    # Run A: high level, short life. Run B: low level, long survival. The row
    # keeps the best level AND the longest time, not a single run's pair.
    When the leaderboard records a death for "Nova" with level 20 and time 30000
    And the leaderboard records a death for "Nova" with level 3 and time 600000
    And client "bob" is connected
    Then the leaderboard mock recorded 2 writes
    And client "bob" receives a leaderboard with 1 entries
    And client "bob" receives a leaderboard where "Nova" has level 20 and time 600000
