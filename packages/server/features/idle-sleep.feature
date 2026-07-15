Feature: Idle sleep — the game loop pauses when no clients are connected
  An unwatched server must not burn CPU simulating a world nobody sees. Once
  the last socket closes, the tick loop keeps running for a short grace window
  (so death/score processing drains), then pauses entirely. The next websocket
  connection resumes it.

  Scenario: The tick loop pauses after the idle grace period
    Given the server is running with an idle grace of 3 ticks
    When 400ms passes
    Then the world tick counter is frozen for 300ms

  Scenario: A connecting client resumes the tick loop
    Given the server is running with an idle grace of 3 ticks
    When 400ms passes
    Then the world tick counter is frozen for 300ms
    Given client "alice" is connected
    Then the world tick counter advances within 1000ms

  Scenario: The loop keeps ticking while a client is connected
    Given the server is running with an idle grace of 3 ticks
    Given client "alice" is connected
    When 400ms passes
    Then the world tick counter advances within 1000ms

  Scenario: The loop pauses again after the last client disconnects
    Given the server is running with an idle grace of 3 ticks
    Given client "alice" is connected
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    When client "alice" disconnects
    And 400ms passes
    Then the world tick counter is frozen for 300ms
