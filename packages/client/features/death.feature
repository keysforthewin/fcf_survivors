Feature: Death screen
  When the server sends an eaten message the arena tears down and the death
  overlay renders the run summary plus the most recent leaderboard.

  Background:
    Given the WebSocket is mocked
    And I open the title screen
    And I go deep as "Alice"

  Scenario: Eaten message brings up the death screen with killer name
    When the server sends an eaten message from "Megafish"
    Then the death screen reports being eaten by "Megafish"
    And the death screen shows peak mass 60

  Scenario: Leaderboard is rendered on the death screen
    When the server sends a leaderboard with entries:
      | name | color   | kills | peakMass | hits | damage | level |
      | Top  | #ff85a1 | 30    | 999      | 500  | 5000   | 9     |
      | Mid  | #7fcfff | 5     | 100      | 60   | 400    | 3     |
    And the server sends an eaten message
    Then the death screen shows 2 leaderboard rows
    And the leaderboard's top row shows "Top"
