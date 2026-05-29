Feature: Danger indicator on threatening fish
  Fish big enough to eat the local player (they can swallow you — at least 15% more
  mass) are flagged with a 💀 in front of their nameplate, so you can see at a glance
  which neighbours to avoid. Smaller fish, and your own fish, are never flagged.

  Background:
    Given the WebSocket is mocked
    And I open the title screen
    And I go deep as "Alice"

  Scenario: A fish large enough to eat me is flagged; smaller fish and I are not
    When the server sends a snapshot with my mass 50 and fish:
      | id | name    | mass |
      | 2  | BigBob  | 60   |
      | 3  | TinyTom | 20   |
    Then the nameplate for "BigBob" shows a danger marker
    And the nameplate for "TinyTom" has no danger marker
    And the nameplate for "Alice" has no danger marker
