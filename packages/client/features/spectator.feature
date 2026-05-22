Feature: Spectator mode
  After dying, the death overlay sits translucently over the live arena.
  Clicking SPECTATE dismisses the overlay and exposes free-pan camera
  controls (WASD pan, Space cycle player) plus a DIVE AGAIN button that
  reuses the existing socket via a respawn message.

  Background:
    Given the WebSocket is mocked
    And I open the title screen
    And I dive in as "Alice"

  Scenario: Death overlay is translucent so the arena stays visible behind it
    When the server sends an eaten message from "Megafish"
    Then the death overlay is translucent

  Scenario: The death card offers both SPECTATE and DIVE AGAIN buttons
    When the server sends an eaten message from "Megafish"
    Then the death screen offers a SPECTATE button
    And the death screen offers a DIVE AGAIN button

  Scenario: Clicking SPECTATE dismisses the overlay and mounts the spectator HUD
    When the server sends an eaten message from "Megafish"
    And I click SPECTATE
    Then the death overlay is dismissed
    And the spectator HUD is visible

  Scenario: Spectator socket sends a spectate heartbeat
    When the server sends an eaten message from "Megafish"
    Then a spectate message is sent to the server

  Scenario: DIVE AGAIN from the spectator HUD sends a respawn message
    When the server sends an eaten message from "Megafish"
    And I click SPECTATE
    And I click DIVE AGAIN from spectator
    Then a respawn message is sent to the server

  Scenario: DIVE AGAIN from the death card sends a respawn message
    When the server sends an eaten message from "Megafish"
    And I click DIVE AGAIN
    Then a respawn message is sent to the server
