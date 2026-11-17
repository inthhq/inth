// The browser integration groups from the c15t repository's CI planner. Each
// group runs through scripts/ci-browser.ts with a list of targets; a target is
// selected when its fixture, starter, Storybook or bench is selected.

export interface BrowserGroup {
  kind: "compat" | "examples" | "journeys" | "parity" | "starters" | "styles";
  targets: string;
}

interface SelectedWorkspace {
  directory: string;
  name: string;
  scripts: string[];
}

const acceptance = "@c15t/fixture-acceptance";

// Example id, then its directory under internals/fixtures.
const examples: [string, string][] = [
  ["nextjs", "nextjs"],
  ["react", "react"],
  ["vue", "vue"],
  ["svelte", "svelte"],
  ["angular", "angular"],
  ["html", "script-tag"],
  ["javascript", "javascript"],
  ["nuxt", "nuxt"],
  ["nuxt-prerender", "nuxt"],
  ["nuxt-static", "nuxt"],
  ["nuxt-vapor", "nuxt-vapor"],
  ["nuxt-vapor-future", "nuxt-vapor"],
  ["tanstack-start", "tanstack-start"],
  ["tanstack-start-streamed", "tanstack-start"],
  ["tanstack-start-same-origin", "tanstack-start"],
  ["tanstack-start-static", "tanstack-start"],
  ["astro", "astro-demo"],
  ["astro-static", "astro-demo"],
  ["sveltekit", "sveltekit-demo"],
];

const allParity = ["react", "svelte", "vue", "astro", "angular"];
const allJourneys = ["nextjs", "nuxt", "sveltekit"];

// Starters are the examples/ apps other than showcases, plus the Svelte and
// Angular compatibility apps. Each directory name is its smoke-test target.
const starterDirectory =
  /^(?:examples\/(?!showcase-)|internals\/(?:svelte|angular)-compat\/)(?<target>[^/]+)$/u;

const styleBenches =
  /^benchmarks\/(?:tw3-test|tw4-test|no-tw-test|css-layer-preview|tailwind-matrix\/v[34](?:\/next-15(?:-turbopack)?)?)$/u;

const parityTargets = (selected: SelectedWorkspace[]) => {
  const parity = selected
    .map(
      (workspace) =>
        /^apps\/storybook-(?<target>react|vue|svelte|astro|angular)$/u.exec(
          workspace.directory
        )?.groups?.target
    )
    .filter((target) => target !== undefined);
  // React is the reference every framework compares against, and Astro and
  // Angular are only compared next to React, Svelte and Vue.
  if (["react", "astro", "angular"].some((target) => parity.includes(target))) {
    return allParity;
  }
  if (parity.length > 0) {
    return ["react", ...parity];
  }
  // A change to the comparison runner exercises the whole contract.
  return selected.some(
    (workspace) => workspace.directory === "apps/parity-runner"
  )
    ? allParity
    : [];
};

/** The browser groups for the selected SDK workspaces. */
export const browserGroups = (
  selected: SelectedWorkspace[],
  all: SelectedWorkspace[]
): BrowserGroup[] => {
  const everything = selected.some(
    (workspace) => workspace.name === acceptance
  );
  const directories = new Set(selected.map((workspace) => workspace.directory));
  const exampleIds = everything
    ? examples.map(([id]) => id)
    : examples
        .filter(([, directory]) =>
          directories.has(`internals/fixtures/${directory}`)
        )
        .map(([id]) => id);
  const starters = (everything ? all : selected)
    .map(
      (workspace) => starterDirectory.exec(workspace.directory)?.groups?.target
    )
    .filter((target) => target !== undefined)
    .toSorted();
  const compat = selected
    .filter((workspace) => workspace.scripts.includes("test:compat"))
    .map((workspace) => workspace.name.replace("@c15t/next-compat-", ""));
  const journeys = everything
    ? allJourneys
    : allJourneys.filter((target) =>
        directories.has(`benchmarks/${target}-browser-bench`)
      );
  const styles = selected.some((workspace) =>
    styleBenches.test(workspace.directory)
  );
  const groups: BrowserGroup[] = [
    { kind: "examples", targets: exampleIds.join(",") },
    { kind: "starters", targets: starters.join(",") },
    { kind: "compat", targets: compat.join(",") },
    { kind: "parity", targets: parityTargets(selected).join(",") },
    { kind: "journeys", targets: journeys.join(",") },
    { kind: "styles", targets: styles ? "all" : "" },
  ];
  return groups.filter((group) => group.targets.length > 0);
};
