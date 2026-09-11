import { defineDocsConfig } from "leadtype";

export default defineDocsConfig({
  navigation: [
    {
      base: "cli",
      pages: [
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
      ],
      title: "Inth CLI",
    },
  ],
  product: {
    docs: "https://inth.com/docs/cli",
    name: "@inth/cli",
    repository: "https://github.com/inthhq/inth",
    tagline:
      "Manage Inth organizations, projects, Code Audit, and Inbox from the terminal.",
  },
});
