# Emberline Survivors Plan

## Goal
Turn the current prototype into a Vampire Survivors-style mobile-friendly action game with:
- multiple weapons
- evolving builds
- dense enemy waves
- elite threats
- a real level-up choice flow
- readable UI on phone

## Execution Order

### 1. Weapon System
Build a modular weapon framework instead of the current single auto-shot.

Deliverables:
- shared weapon base/update loop
- support for multiple simultaneous weapons
- weapon stats: damage, rate, projectile count, area, duration, pierce
- first weapon set:
  - Magic Bolt
  - Orbit Blades
  - Flame Ring
  - Pierce Lance
- evolution hooks for future upgrades

Definition of done:
- player can own more than one weapon
- different weapons behave differently on screen
- weapons scale from upgrade data instead of hardcoded one-off logic

### 2. Enemies And Waves
Make the arena feel like a real survivors run.

Deliverables:
- wave pacing by time
- higher enemy density over time
- at least 3 enemy archetypes
- elite enemies with more HP and pressure
- simple telegraphed danger patterns where needed
- clearer scaling rules for HP, speed, spawn count, and damage

Definition of done:
- early, mid, and late run pacing feel distinct
- elite enemies are recognizable and materially different from trash mobs

### 3. Level-Up Choice Flow
Replace auto-stat bumps with a proper upgrade selection layer.

Deliverables:
- pause-on-level-up overlay
- 3 upgrade choices per level
- upgrade pools:
  - new weapons
  - weapon upgrades
  - passive upgrades
- rarity weighting
- no duplicate-invalid choices

Definition of done:
- each level-up presents meaningful build decisions
- selections immediately affect the run

### 4. UI And Build Clarity
Expose the build state clearly on desktop and mobile.

Deliverables:
- weapon inventory panel
- passive/bonus panel
- visible XP bar
- better wave and elite indicators
- upgrade descriptions with concise numbers
- mobile-safe spacing and touch readability

Definition of done:
- player can understand current build and incoming danger without guessing

### 5. Balance And Shipping
Tune the run into a coherent playable slice and republish.

Deliverables:
- rebalance damage, spawn rate, XP income, and survivability
- mobile control tuning
- fix edge-case bugs found during playtesting
- publish updated build to the current hosted URL

Definition of done:
- the run is stable
- mobile play is viable
- build progression feels intentional instead of random

### 6. Content Expansion: Weapon Pack
Grow the run beyond the initial four-weapon slice.

Deliverables:
- add 2 to 4 new weapons with clearly different screen patterns
- candidate set:
  - Chain Arc
  - Saw Bloom
  - Meteor Call
  - Frost Field
- ensure each new weapon plugs into the existing modular weapon system
- add at least one new passive that synergizes with projectile-heavy builds

Definition of done:
- the player can build toward noticeably different damage patterns
- new weapons are not simple recolors of existing ones

### 7. Content Expansion: Bosses And Mini-Bosses
Introduce anchor enemies that change the run rhythm.

Deliverables:
- add mini-boss spawns at timed intervals
- add at least one boss-grade enemy with unique attacks
- give boss units telegraphs, larger presence, and better rewards
- ensure boss attacks are readable on mobile

Definition of done:
- the run has memorable spike moments instead of only density scaling
- boss rewards materially affect the build

### 8. Content Expansion: Weapon Evolution Layer
Add late-run build payoffs similar to genre evolution systems.

Deliverables:
- define evolution recipes based on weapon + passive combinations
- create evolved versions for at least 2 existing weapons
- make evolution noticeably stronger and visually distinct
- integrate evolution offerings into the level-up/reward flow

Definition of done:
- players can intentionally plan toward evolution outcomes
- evolved weapons feel like a payoff, not a small stat bump

### 9. Content Expansion: Enemy Ecology
Make later runs feel less repetitive.

Deliverables:
- add more enemy archetypes or modifiers
- add swarm events, rush events, and ranged pressure variations
- vary spawn composition by elapsed time and danger phase
- ensure enemy mixes create different movement decisions

Definition of done:
- a 10+ minute run presents multiple distinct combat problems
- enemy variety meaningfully changes pathing and target priority

### 10. Content Expansion: Run Identity And Replayability
Push the prototype from feature-complete toward replayable.

Deliverables:
- add biome/theme variation or rotating arena modifiers
- add run-start choice, blessing, or draft element
- improve reward loops so different runs branch earlier
- preserve readability and mobile play while increasing content depth

Definition of done:
- repeated runs feel materially different
- the game starts to support build experimentation rather than one solved route

## Next Execution Order
The next content phase should be implemented in this order:
1. Weapon Pack
2. Bosses And Mini-Bosses
3. Weapon Evolution Layer
4. Enemy Ecology
5. Run Identity And Replayability

## Working Rule
Implement in order.
Do not skip ahead unless a later task is blocked by a required foundation change.
After each section:
- run a build
- keep the hosted version playable
- summarize what changed before moving to the next section
