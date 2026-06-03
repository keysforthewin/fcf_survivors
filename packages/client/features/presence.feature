Feature: Presence HUD — toasts and roster
  Join/death events surface as transient toasts, and a roster panel lists
  alive humans ranked by mass with the local player highlighted.

  Background:
    Given the WebSocket is mocked
    And I open the title screen
    And I go deep as "Alice"

  Scenario: A playerJoined message shows a toast naming the joiner
    When the server sends a playerJoined for "Bob"
    Then a toast containing "Bob" is visible
    And a toast containing "joined" is visible

  Scenario: A playerDied message shows a toast with the killer
    When the server sends a playerDied for "Bob" eaten by "Charlie"
    Then a toast containing "Bob" is visible
    And a toast containing "eaten by Charlie" is visible

  Scenario: A playerBitten message shows a toast with the attacker
    When the server sends a playerBitten for "Bob" by "Charlie"
    Then a toast containing "Bob" is visible
    And a toast containing "was bitten by Charlie" is visible

  Scenario: Swallowing an AI fish shows an "Ate" toast
    When an AI fish "Snacky" with id 2 is on screen
    And the server reports I swallowed fish id 2
    Then a toast containing "Ate Snacky" is visible

  Scenario: Roster panel lists alive humans with self highlighted
    When the server sends a roster with entries:
      | name  | color   | mass | level | isMe  |
      | Top   | #ff85a1 | 999  | 9     | false |
      | Alice | #7fcfff | 100  | 3     | true  |
      | Mid   | #9affcf | 50   | 1     | false |
    Then the roster shows 3 rows
    And the roster's row 1 shows "Top"
    And the roster's self row shows "Alice"
