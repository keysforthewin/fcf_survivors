Feature: Title screen
  The lobby gate: pick a name + colour, then dive in. Keeps the entry flow
  pinned across UI tweaks.

  Background:
    Given the WebSocket is mocked
    And I open the title screen

  Scenario: Title overlay renders with name input and DIVE IN
    Then I see the title overlay
    And the first color swatch is selected by default

  Scenario: Selecting a new color updates the highlight
    When I click the "#7fcfff" color swatch
    Then the "#7fcfff" swatch is selected

  Scenario: DIVE IN with a name sends a hello with that name
    When I type "Captain" into the name input
    And I click DIVE IN
    Then the title overlay is gone
    And the hello message sent to the server has name "Captain"

  Scenario: Empty name defaults to "Fish"
    When I leave the name input empty
    And I click DIVE IN
    Then the hello message sent to the server has name "Fish"

  Scenario: Selected color is sent in the hello message
    When I click the "#9affcf" color swatch
    And I type "Bloop" into the name input
    And I click DIVE IN
    Then the hello message sent to the server has color "#9affcf"

  Scenario: Pressing Enter in the name input also submits
    When I type "Bloop" into the name input
    And I press Enter in the name input
    Then the title overlay is gone
