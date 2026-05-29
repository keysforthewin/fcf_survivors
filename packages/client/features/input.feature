Feature: Keyboard input
  Movement, boost, and blur. Inputs send at 20Hz from the arena scene.

  Background:
    Given the WebSocket is mocked
    And I open the title screen
    And I go deep as "Alice"

  Scenario: ArrowRight produces vx = 1
    When I press and hold "ArrowRight"
    Then the last input sent has vx 1 and vy 0

  Scenario: ArrowLeft produces vx = -1
    When I press and hold "ArrowLeft"
    Then the last input sent has vx -1 and vy 0

  Scenario: ArrowUp produces vy = -1
    When I press and hold "ArrowUp"
    Then the last input sent has vx 0 and vy -1

  Scenario: WASD keys mirror the arrow keys
    When I press and hold "KeyD"
    Then the last input sent has vx 1 and vy 0

  Scenario: Diagonal keypresses send a normalised vector
    When I press and hold "ArrowRight"
    And I press and hold "ArrowDown"
    Then the last input sent has vx approximately 0.707 and vy approximately 0.707

  Scenario: Releasing the key returns vx and vy to zero
    When I press and hold "ArrowRight"
    And I release "ArrowRight"
    Then the last input sent has vx 0 and vy 0

  Scenario: Space sets boost to true
    When I press and hold "Space"
    Then the last input sent has boost "true"

  Scenario: Window blur clears all held keys
    When I press and hold "ArrowRight"
    And the window loses focus
    Then the last input sent has vx 0 and vy 0
