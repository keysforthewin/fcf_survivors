Feature: A guaranteed NPC named "meesh" is always present
  Every game must contain a fish named "meesh". The AI name picker claims the
  guaranteed name first whenever it is free, so the moment any AI fish exists,
  one of them is "meesh" — and when that fish dies, the next spawn reclaims it.
  Human priority still wins: if a human holds "meesh", no NPC takes it (but the
  game still has its Meesh).

  Background:
    Given a fresh world

  Scenario: The very first AI spawn is named "meesh"
    When the world spawns 1 AI fish
    Then an AI fish is named "meesh"

  Scenario: Meesh is present after a full population spawns
    When the world spawns 20 AI fish
    Then an AI fish is named "meesh"

  Scenario: All AI fish still have distinct names with the guarantee active
    When the world spawns 100 AI fish
    Then an AI fish is named "meesh"
    And all AI fish have distinct names

  Scenario: A human named "meesh" keeps it and no NPC duplicates it
    Given a human named "meesh"
    When the world spawns 20 AI fish
    Then no AI fish is named "meesh"
    And a human fish is named "meesh"
