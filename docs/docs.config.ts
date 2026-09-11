import { defineDocsConfig } from "leadtype";

const pages = [
  "index",
  "getting-started",
  "authentication",
  "organizations",
  "commands",
  "automation",
  "mcp",
  "skills",
  "global-flags",
  "telemetry",
];

export default defineDocsConfig({
  lint: {
    rules: {
      "geo:code-language": "error",
      "geo:heading-skip": "error",
      "geo:image-alt": "error",
    },
  },
  llms: {
    sections: [
      {
        heading: "Inth CLI guides",
        links: pages.map((page) => ({
          urlPath: page === "index" ? "/docs/cli" : `/docs/cli/${page}`,
        })),
        type: "links",
      },
    ],
  },
  navigation: [
    {
      base: "cli",
      pages,
      title: "Inth CLI",
    },
  ],
  organization: { name: "Inth", url: "https://inth.com" },
  product: {
    category: "DeveloperApplication",
    docs: "https://inth.com/docs/cli",
    homepage: "https://inth.com",
    kind: "app",
    name: "@inth/cli",
    repository: "https://github.com/inthhq/inth",
    tagline:
      "Manage Inth organizations, projects, Code Audit, and Inbox from the terminal.",
  },
});
