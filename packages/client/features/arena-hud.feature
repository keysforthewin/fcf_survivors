Feature: Arena HUD reflects server state
  The mass / level / xp / boost / players widgets are driven entirely by
  server snapshots. These scenarios drive the mock-ws directly and assert the
  HUD repaints accordingly.

  Background:
    Given the WebSocket is mocked
    And I open the title screen
    And I dive in as "Alice"

  Scenario: HUD mounts on the arena scene
    Then the HUD is visible

  Scenario: Mass display updates when a snapshot arrives
    When the server sends a snapshot with mass 25
    Then the HUD shows mass 25

  Scenario: Level display tracks the server snapshot
    When the server sends a snapshot with mass 60 and level 3 and xp 0 of 24
    Then the HUD shows level 3

  Scenario: XP bar width tracks xp / nextLevelXp
    When the server sends a snapshot with mass 10 and level 1 and xp 10 of 20
    Then the XP bar is at approximately 50%

  Scenario: Boost indicator is ready when boostReadyAt is in the past
    When the server sends a snapshot with boost ready
    Then the boost indicator is ready

  Scenario: Boost indicator shows a cooldown remaining
    When the server sends a snapshot with boost ready in 12 seconds
    Then the boost indicator reports approximately 12 seconds cooldown
