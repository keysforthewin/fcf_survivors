Feature: Combat toasts over the wire
  A weapon kill sends the killer a personal "You killed X with <weapon>" combatToast, broadcasts a
  weapon-aware playerDied to bystanders, and EXCLUDES the killer from that global line so they don't
  see it twice.

  Background:
    Given the server is running
    And client "killer" is connected
    And client "victim" is connected
    And client "bystander" is connected

  Scenario: A weapon kill is announced to the right audiences
    When client "killer" sends hello as "Killer" with color "#ff85a1"
    Then client "killer" receives a welcome
    When client "victim" sends hello as "Victim" with color "#7fcfff"
    Then client "victim" receives a welcome
    When client "bystander" sends hello as "Bystander" with color "#9affcf"
    Then client "bystander" receives a welcome
    When the fish for client "victim" is killed by client "killer" with weapon "bubble"
    Then client "killer" receives a combatToast "kill" for "Victim" with weapon "bubble"
    And client "bystander" receives a playerDied for "Victim" with weapon "bubble"
    And client "killer" does not receive a playerDied for "Victim" within 300ms
