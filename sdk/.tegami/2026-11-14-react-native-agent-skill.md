---
packages:
  '@c15t/react-native': minor
---

### Expo's agent CLI finds the c15t skill

`@c15t/react-native` now also ships its agent skill at
`skills/c15t-react-native/SKILL.md`, with its own copy of the bundled docs.
`npx @expo/agent-cli skills:sync`, and `install`, `start` and `dev`, link it
into `.claude/skills` or `.agents/skills`. Links in the skill stay inside its
directory, so they still open after it is linked.

The root `SKILL.md`, `AGENTS.md` and `docs/` are unchanged. skills-npm and
`npx skills experimental_sync` keep linking the package root.
