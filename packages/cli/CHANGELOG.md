## @inth/cli@0.1.0

### Add CLI usage telemetry and error reporting

Production builds collect command usage and report unexpected errors to help improve the CLI. Reports exclude raw command arguments, credentials, request bodies, and arbitrary error messages. Development builds send no telemetry.

To opt out, run `inth telemetry disable` or set `INTH_TELEMETRY_DISABLED=1`. The same setting controls usage tracking and error reports.

### Bundle CLI documentation

Include an agent index, skill entry point, and ten CLI guides in the npm launcher and native packages. The guides cover setup, authentication, organizations, resources, automation, MCP, skills, flags, and telemetry, and match the installed package version.

### Support Linux systems with glibc 2.36

Build Linux packages against glibc 2.36 so they run on Debian 12, and check the packed executables on that baseline before release. Document the Linux and macOS requirements.

## @inth/cli@0.0.0

### Publish the Inth CLI

Install `@inth/cli` to run the Inth CLI on Apple silicon Macs, Linux arm64/x64, or Windows x64. The package selects the native executable for your platform.
