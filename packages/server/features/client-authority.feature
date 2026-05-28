Feature: Client-authoritative weapon hits
  The client owns its own fish and reports when one of its projectiles visually
  hit an enemy. The server honors the call (so hits land on what the player sees)
  but shares the projectile's re-hit gate with its own detection, so a hit can
  never be double-applied, and a buggy client can't snipe off-screen.

  Background:
    Given a fresh world

  Scenario: A reported hit drains the target's mass and can kill
    Given a player "Sniper" at (4000, 4000) with mass 50
    And a player "Victim" at (4000, 4100) with mass 10
    And "Sniper" owns a projectile at (4000, 4100) with damage 20
    When "Sniper" reports a client weapon hit on "Victim"
    Then the client weapon hit was applied
    And "Victim" is dead
    And "Sniper" has kill count 1

  Scenario: A single-hit projectile cannot be reported twice (no double-apply)
    Given a player "Sniper" at (4000, 4000) with mass 50
    And a player "Victim" at (4000, 4100) with mass 100
    And "Sniper" owns a projectile at (4000, 4100) with damage 5
    When "Sniper" reports a client weapon hit on "Victim"
    Then the client weapon hit was applied
    When "Sniper" reports a client weapon hit on "Victim"
    Then the client weapon hit was rejected

  Scenario: A fish cannot report a hit on itself
    Given a player "Sniper" at (4000, 4000) with mass 50
    And "Sniper" owns a projectile at (4000, 4000) with damage 5
    When "Sniper" reports a client weapon hit on "Sniper"
    Then the client weapon hit was rejected
