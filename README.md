<h1 align="center">inth CLI</h1>

<p align="center">Manage your Inth organizations, projects, Code Audit, and Inbox from the terminal.</p>

<p align="center">
  <a href="packages/cli/README.md#get-started"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Status-In%20development.svg?variant=outline&size=xs&mode=dark"><img src="https://shieldcn.dev/badge/Status-In%20development.svg?variant=outline&size=xs&mode=light" alt="Status: in development"></picture></a>
  <a href="packages/cli/README.md#get-started"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Platform-macOS%20arm64.svg?variant=outline&size=xs&mode=dark"><img src="https://shieldcn.dev/badge/Platform-macOS%20arm64.svg?variant=outline&size=xs&mode=light" alt="Platform: macOS arm64"></picture></a>
  <a href="LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/License-Apache%202.0.svg?variant=outline&size=xs&mode=dark"><img src="https://shieldcn.dev/badge/License-Apache%202.0.svg?variant=outline&size=xs&mode=light" alt="License: Apache 2.0"></picture></a>
  <a href="https://inth.com?utm_source=github&utm_medium=repo_homepage"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?size=xs&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&color=ffc803&labelTextColor=000000&valueColor=000000&mode=dark"><img src="https://shieldcn.dev/badge/Made%20By-Inth-ffc803.svg?size=xs&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAzOTMgNDAwIj48cGF0aCBmaWxsPSIjMDAwIiBkPSJNMTgyLjY2MiAwdjM2Ljg5NWgtNTkuMDMxdjgyLjczM2g1OS4wMzF2MzYuODkzSDI3LjQ4MnYtMzYuODkzaDU5LjAzVjM2Ljg5NWgtNTkuMDNWMHpNMzIxLjk0MSA4OS44NVYwaDM1LjM1NXYxNTYuNTIxaC0yNS43MTNsLTg2LjEzNy05MC4zNjR2OTAuMzY0aC0zNS4zNTVWMGgyNi4zNTV6Ii8%2BPHBhdGggZmlsbD0iIzAwMCIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzE4LjU3MSAxODUuNzE0aDc0LjI4NlY0MDBIMFYxODUuNzE0aDI3Mi44NTd2LTQ3LjE0M3ptLTI5MS4wOSAyOC45Njl2MzcuMTE4aDU4LjEzN3YxMTkuNjI4aDM2Ljg5NVYyNTEuODAxaDU4LjU4NHYtMzcuMTE4em0xODIuNjEuMjI0djE1Ni41MjJoMzYuODk0VjMxMy41OWg3My4zNDF2NTcuODM5aDM3LjExOFYyMTQuOTA3aC0zNy4xMTh2NjEuNzg4aC03My4zNDF2LTYxLjc4OHoiIGNsaXAtcnVsZT0iZXZlbm9kZCIvPjwvc3ZnPg%3D%3D&color=ffc803&labelTextColor=000000&valueColor=000000&mode=light" alt="Made by Inth"></picture></a>
</p>

This repository contains [`@inth/cli`](packages/cli/README.md), the public Inth command-line client. Use it to manage organizations, projects, team access, API keys, billing, Code Audit scans, and Inbox findings.

The CLI is in development and has not been published to npm. Local builds currently support macOS on Apple Silicon and require Node.js 24, pnpm, and Xcode Command Line Tools.

```sh
pnpm install
pnpm --filter @inth/cli build
pnpm --filter @inth/cli inth --help
pnpm --filter @inth/cli inth login
```

Read the **[CLI guide](packages/cli/README.md)** for setup, command examples, development, and testing. For automation, see [agents and scripts](packages/cli/AGENT-USAGE.md).

To rebuild and run a command while developing:

```sh
pnpm --filter @inth/cli dev billing
```

Development builds call the live Inth API. Named commands print formatted text by default; add `--json` for scripts.

Licensed under [Apache 2.0](LICENSE).
