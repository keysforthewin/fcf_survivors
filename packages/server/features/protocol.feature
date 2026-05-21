Feature: Wire protocol validation
  Zod parses inbound client messages. Bad messages are dropped silently so a
  hostile or buggy client cannot crash the room.

  Background:
    Given the server is running
    And client "alice" is connected

  Scenario: Valid hello returns a welcome with selfId and arena dimensions
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome

  Scenario: After hello, snapshots stream at the configured tick rate
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    And client "alice" receives a snapshot within 500ms

  Scenario: A malformed input message is dropped without disconnecting
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    When client "alice" sends a malformed input with vx 99
    Then client "alice" stays connected

  Scenario: An unknown message type is dropped silently
    When client "alice" sends an unknown message
    Then client "alice" stays connected

  Scenario: Garbage non-JSON does not crash the connection
    When client "alice" sends a raw payload "{not json"
    Then client "alice" stays connected

  Scenario: pickCard is accepted silently (M4 placeholder)
    When client "alice" sends hello as "Alice" with color "#ff85a1"
    Then client "alice" receives a welcome
    When client "alice" sends pickCard "tidal-wave"
    Then client "alice" stays connected
