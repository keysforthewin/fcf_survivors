Feature: Humans get priority over AI fish names
  When a human's name collides with an NPC's, the human keeps it and the NPC is
  renamed. The guarantee is bidirectional: a freshly spawned NPC also avoids any
  name a live human currently holds, so no human ever shares a name with an NPC.

  Background:
    Given a fresh world

  Scenario: A human claiming a name evicts the NPC using it
    Given an NPC named "Nemo"
    And a human named "Nemo"
    When a human claims the name "Nemo"
    Then no AI fish is named "Nemo"
    And a human fish is named "Nemo"

  Scenario: A unique human name leaves NPCs untouched
    Given an NPC named "Bloop"
    And a human named "Hero"
    When a human claims the name "Hero"
    Then an AI fish is named "Bloop"

  Scenario: The replacement avoids other live humans, not just the claimant
    # Two humans, "Nemo" and "Gilly". An NPC also called "Nemo" is evicted when
    # "Nemo" is claimed — the new name must not become "Gilly" either.
    Given an NPC named "Nemo"
    And a human named "Nemo"
    And a human named "Gilly"
    When a human claims the name "Nemo"
    Then no AI fish is named "Nemo"
    And no AI fish is named "Gilly"

  Scenario: Multiple NPCs sharing the claimed name all get distinct new names
    Given an NPC named "Nemo"
    And an NPC named "Nemo"
    When a human claims the name "Nemo"
    Then no AI fish is named "Nemo"
    And the renamed NPCs all have distinct names

  Scenario: When the whole name pool is taken the NPC gets a unique fallback name
    Given humans hold every NPC name
    And an NPC named "Nemo"
    When a human claims the name "Nemo"
    Then no AI fish is named "Nemo"
    And the renamed NPC has a fallback-suffixed name

  Scenario: A newly spawned NPC never lands on a live human's name
    Given a human named "Nemo"
    When the world spawns 50 AI fish
    Then no AI fish is named "Nemo"

  Scenario: Freshly spawned NPCs never share a name with each other
    # More spawns than the name pool — past exhaustion the fallback suffix must
    # still keep every NPC's name unique.
    When the world spawns 100 AI fish
    Then all AI fish have distinct names

  Scenario: An evicted NPC's replacement avoids other live NPCs
    # The whole pool is held by NPCs, so renaming the evicted one cannot just
    # land on a name another NPC already uses — it must fall back to a suffix.
    Given an NPC for every name in the pool
    And a human named "Keys"
    When a human claims the name "Keys"
    Then no AI fish is named "Keys"
    And all AI fish have distinct names
