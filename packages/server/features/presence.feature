Feature: Live presence — join/death toasts and roster broadcast
  Other connected players see join/death events as toast-worthy messages, and
  everyone sees a roster of currently-alive humans broadcast a few times per
  second.

  Background:
    Given the server is running

  Scenario: A new joiner triggers playerJoined for existing clients
    Given client "alice" is connected
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    Given client "bob" is connected
    When client "bob" sends hello as "Bob" with color "#7fcfff"
    Then client "alice" receives a playerJoined for "Bob"

  Scenario: The joiner does not receive a toast for themselves
    Given client "alice" is connected
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    And client "alice" does not receive a playerJoined for "Alice" within 250ms

  Scenario: A player death triggers playerDied for the other clients
    Given client "alice" is connected
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    Given client "bob" is connected
    When client "bob" sends hello as "Bob" with color "#7fcfff"
    Then client "bob" receives a welcome
    When the fish for client "alice" is killed
    Then client "bob" receives a playerDied for "Alice"

  Scenario: Roster broadcasts contain currently-alive humans
    Given client "alice" is connected
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    Given client "bob" is connected
    When client "bob" sends hello as "Bob" with color "#7fcfff"
    Then client "bob" receives a welcome
    And client "alice" receives a roster within 1000ms
    And client "alice"'s most recent roster contains "Alice" and "Bob"
    And client "alice"'s most recent roster marks "Alice" as self
