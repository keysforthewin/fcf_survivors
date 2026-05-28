Feature: Title screen
  The lobby gate: pick a name + fish species, then dive in. Keeps the entry flow
  pinned across UI tweaks.

  Background:
    Given the WebSocket is mocked
    And I open the title screen

  Scenario: Title overlay renders with name input and DIVE IN
    Then I see the title overlay
    And the default species is selected

  Scenario: Selecting a new species updates the highlight
    When I click the "blue-tang" species
    Then the "blue-tang" species is selected

  Scenario: DIVE IN with a name sends a hello with that name
    When I type "Captain" into the name input
    And I click DIVE IN
    Then the title overlay is gone
    And the hello message sent to the server has name "Captain"

  Scenario: Empty name defaults to "Fish"
    When I leave the name input empty
    And I click DIVE IN
    Then the hello message sent to the server has name "Fish"

  Scenario: Selected species is sent in the hello message
    When I click the "blue-tang" species
    And I type "Bloop" into the name input
    And I click DIVE IN
    Then the hello message sent to the server has species "blue-tang"

  Scenario: Pressing Enter in the name input also submits
    When I type "Bloop" into the name input
    And I press Enter in the name input
    Then the title overlay is gone
