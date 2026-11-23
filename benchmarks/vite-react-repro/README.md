# Vite React Repro

Minimal production-bundle repro for `@inth/react` using:

- `vite@7.3.2`
- `@vitejs/plugin-react@5.1.0`
- `react@19.2.0`
- `react-dom@19.2.0`
- `rollup-plugin-visualizer@7.0.1`

Run from the repository root:

```sh
pnpm install
bun run --cwd benchmarks/vite-react-repro build
```

Then inspect:

- `dist/stats.html`
- `dist/stats.json`
