Feature: Radioactive Waste trail size
  Radioactive Waste (weapon id "ink") drops a lingering toxic cloud behind the
  player. The clouds are large now (~4x the old puddle), so they actually control
  space and threaten fish that pass near — not just whatever is touching you.

  Background:
    Given a fresh world

  Scenario: The bigger waste cloud reaches a fish the old small trail could not
    # Tox drops a cloud (Lv1 radius 120) at its own position; Bystander sits 100 units
    # away — outside the old 30-radius puddle (reach ~68) but well inside the 4x cloud
    # (reach ~158). Equal mass means no eat, and at 100 units there's no body contact,
    # so only the trail cloud can shave Bystander's mass.
    Given a player "Tox" at (4000, 4000) with mass 30
    And "Tox" has weapon "ink" at level 1
    And an AI fish "Bystander" at (4000, 4100) with mass 30
    When the world advances 1 tick
    Then "Bystander" has at most mass 29.5
