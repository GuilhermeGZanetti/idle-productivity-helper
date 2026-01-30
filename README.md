# Idle Productivity Helper

## Project Overview
Idle Productivity Helper is a browser-based fantasy idle RPG that rewards
real-world progress. Players define the activities they want to complete
(study, gym, work on a personal project) and the game advances only when
those activities are done. The game is designed to be checked briefly during
the day without becoming a distraction.

## Vision
Create a light, cozy fantasy world that turns habit-building into a
motivating loop: complete real tasks, gain in-game power, unlock new areas,
and keep momentum. The game should feel rewarding and fun, but never demand
attention when the player should be focusing on the real activity.

## Target Experience
- Fast check-ins (30-90 seconds).
- Clear feedback for completed tasks.
- Calm visuals and light animations.
- Minimal friction for logging progress.
- No pressure to stay in the game.

## Core Loop
1. Player sets goals and schedules.
2. Player completes a real-world activity.
3. Player checks in and marks it done.
4. Game grants rewards and advances idle progress.
5. Player unlocks upgrades and story beats.
6. Player returns to real activity.

## Game Theme
Fantasy setting with a small camp or village that grows as the player
progresses. The player is an adventurer who gains power from real-world
discipline. Quests represent personal goals.

## Key Features
### Task-Driven Progression
- Players create activities with a frequency and minimum effort.
- Completion grants experience, materials, and morale.
- Streaks provide small bonuses but never punish breaks harshly.

### Idle RPG Mechanics
- Hero levels, skills, and equipment that advance when tasks are completed.
- Passive resource generation that scales with consistency.
- Short, optional micro-quests that last minutes of real time.

### Meaningful Rewards
- New zones (forest, ruins, mountain shrine) unlocked by milestones.
- Visual upgrades to the camp (tents to cottages, glowing runes, banners).
- Unlockable companions that provide passive buffs.

### Light Narrative
- Short, optional story fragments unlocked at milestones.
- Emphasis on encouragement and progress, not pressure.

## Player Motivation System
### Rewards
- Experience and levels.
- Gear upgrades with small, clear effects.
- Cosmetic changes to the world.

### Feedback
- Immediate in-game celebration on completion.
- Progress bars and next milestone hints.
- Weekly recap screen with earned rewards.

## Example Activities
- Study 1 hour per day.
- Gym 3 times per week.
- Write 300 words per day.
- Practice a language for 20 minutes.

## Mechanics Detail
### Activities
Each activity includes:
- Name.
- Frequency (daily, weekly, custom).
- Minimum effort (time, repetitions, or checklist).
- Reward weight (light, normal, heavy).

### Energy and Time
The hero has a daily energy pool. Completing activities restores energy,
which enables progress in idle battles and crafting. If no tasks are done,
the hero still idles but at a reduced pace. This avoids punishment while
keeping task completion valuable.

### Streaks
Streaks increase small rewards but reset gently. Missed days reduce the
streak by one step rather than resetting to zero.

## Visual Style
Simple, warm pixel art or minimalist vector art. Small animations:
campfires flicker, banners sway, companions move. The UI should be clean
and easy to read.

## User Experience
- Quick "Check-In" button as the main action.
- Dashboard with today’s tasks and progress.
- Optional "Focus Mode" that hides the game with a timer.
- Reminder notifications that can be disabled.

## Scope and Platform
- Browser-first, desktop and mobile friendly.
- No account required to try; optional login for sync.
- Data stored locally with optional cloud backup.

## Success Criteria
- Users can set up in under 3 minutes.
- Daily check-in takes under 60 seconds.
- Clear sense of progression within the first week.
- Players report increased consistency with habits.

## Next Steps
1. Define the MVP feature list.
2. Create wireframes for the check-in flow.
3. Draft a small art style guide.
4. Prototype the task-completion to reward loop.

## Implementation Plan
This plan builds the Mini-Army Simulator mechanics, Strategic Deployment,
and Troop Evolution into an MVP that stays fast and non-distracting.

### Phase 0: Product Definition (1 week)
- Lock the scope for MVP: goal setup, task logging, War Table placement,
  auto-battle, troop evolution (Level 1/3/5), and reward mapping.
- Finalize the army roster and evolution table (Infantry, Ranged, Magic,
  Cavalry, Alchemists, Beasts, Constructs).
- Define the activity categories (Physical, Mental, Creative, Logistics)
  and their stat effects.
- Draft a single player journey for a 7-day onboarding flow.

### Phase 1: UX + Visual Foundations (1-2 weeks)
- Wireframes:
  - Onboarding: create activities + choose starting troop.
  - Daily check-in: task list + reward summary.
  - War Table: 3x3 grid, squad slots, deploy button.
  - Camp view: buildings, upgrades, progression map.
- Style guide:
  - Palette, typography, icon set, UI components.
  - Unit sprite tiers (Recruit, Veteran, Elite).
- Define animation budget: short, readable battle loops under 30 seconds.

### Phase 2: Data Model + Core Systems (2 weeks)
- Data structures:
  - Activities: frequency, minimum effort, reward weight.
  - Tasks log: date, category, completion.
  - Army: troop types, platoon size, evolution level.
  - Squad slots: slot count, assigned platoon.
  - Resources: Strategic Points, Command Tokens, gold, morale.
- Progression rules:
  - Task completion -> reward mapping -> stat scaling.
  - Evolution thresholds (Level 1 -> 3 -> 5).
  - Gentle streak adjustments.
- Local storage for offline-first usage.

### Phase 3: War Table + Auto-Battle Prototype (2 weeks)
- Grid placement UI for squad slots.
- Auto-battle simulation:
  - Simple AI by class (frontline, ranged, magic, support).
  - Fast deterministic loop with clear battle outcome.
  - No-loss retreat and reinforcement bonuses.
- Battle summary screen:
  - Total damage, units evolved, resources earned.

### Phase 4: Activity-to-Army Loop (1-2 weeks)
- Check-in flow:
  - Mark tasks complete.
  - Show mapped buffs to troop types.
  - Award Strategic Points and Command Tokens.
- Upgrade actions:
  - Expand slot.
  - Diversify troop type.
  - Specialize (evolve) platoon.
- Visual progression updates:
  - Camp building unlocks by troop type.
  - Unit sprites tiered by evolution.

### Phase 5: MVP Polish (1 week)
- Performance pass: fast loading, no heavy animations.
- Usability pass: check-in in under 60 seconds.
- Add guidance text for new users and a short in-game tutorial.
- Basic analytics or local stats recap (weekly summary).

### Phase 6: Validation + Iteration (ongoing)
- Playtest with 5-10 users focusing on:
  - Clarity of task-to-reward mapping.
  - Whether battles feel rewarding without being distracting.
  - Time-to-check-in and return to work.
- Adjust balance: reward weights, evolution thresholds,
  and slot unlock pacing.

## Implementation Notes
- MVP should avoid real-time pressure; no timers beyond optional focus mode.
- Use short animations and skip buttons for battles.
- Prefer local-only storage with optional account sync later.
