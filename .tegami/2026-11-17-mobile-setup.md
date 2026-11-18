---
packages:
  "group:inth": patch
---

### Set up mobile apps with `inth mobile setup`

`inth mobile setup --backend-url https://your-project.inth.app --privacy-policy-url https://your-app.example/privacy` configures Inth consent in an Expo, bare React Native, Swift or Android app. In an Expo app it adds the config plugin entry to `app.json` and writes a provider file. In a bare React Native app it writes the provider file and prints the `Info.plist` and `AndroidManifest.xml` entries. In a Swift or Android app it prints the package, dependencies and code to add. It never edits an Xcode project, a Gradle file or a native manifest.

Setup checks `--backend-url` with the same rule as the Expo plugin and the native SDKs, and checks every answer before it writes a file. `--dry-run` shows the files and steps without writing, and `--json` returns them for scripts. It needs no sign-in and never prompts.
