# Reproduce the historical dependency analysis

The [report](report.md) describes the frozen `android-release` cohort, where
`proguard-android.txt` disables optimization. [results.json](results.json) is a
compact snapshot of its direct APK costs, APK Analyzer estimates, exact DEX
instruction counts and input hashes. These are different units. The report's
recommendations were unmeasured at the time of that analysis. The separate
`android-optimized` experiment does not replace these inputs or conclusions.

The scripts in this directory reproduce that historical analysis. They require
the original immutable evidence layout. They do not accept arbitrary new APKs,
and are not the fresh size-build runner. Use [the harness](../../README.md) for
fresh builds. No binary evidence, copied host trees or full dependency graphs
are stored in git.

The original report is preserved byte for byte. Its references to
`graph-paths.json`, `dependency-resolution.json` and other supporting JSON
mean the generated files in `OUTPUT`. The commands below recreate them;
they are not additional committed inputs. The committed `results.json`
contains the compact findings and source hashes.

Run from this directory. Set `EVIDENCE` to the competitive evidence root, which
contains `android/`, `ACCEPTANCE` to the original acceptance root containing
`inputs/`, and `OUTPUT` to a new external writable directory. Set `ANDROID_HOME`
and `JAVA_HOME` to the matched toolchains. Supply `NATIVE_LOCK` as the absolute
path to the coordinator's shared lock wrapper. Heavy APK audits must also use
that lock when they share a machine with runtime sampling.

```sh
mkdir -p "$OUTPUT"
cp report.md "$OUTPUT/"
python3 scripts/tool-hashes.py --android-home "$ANDROID_HOME" --out "$OUTPUT"
python3 "$NATIVE_LOCK" dependency-apk-analysis \
  python3 scripts/analyze.py --evidence "$EVIDENCE" --out "$OUTPUT" \
  --run-apkanalyzer --apkanalyzer "$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer"
python3 "$NATIVE_LOCK" dependency-artifact-analysis \
  python3 scripts/artifact-retention.py --evidence "$EVIDENCE" --out "$OUTPUT"
python3 "$NATIVE_LOCK" dependency-resource-analysis \
  python3 scripts/resource-analysis.py --evidence "$EVIDENCE" --out "$OUTPUT" \
  --refresh --aapt2 "$ANDROID_HOME/build-tools/36.0.0/aapt2"
python3 "$NATIVE_LOCK" dependency-graph-capture \
  python3 scripts/capture-graph.py --evidence "$EVIDENCE" --out "$OUTPUT" \
  --attempt captured c15t baseline
python3 scripts/summarize-graphs.py --evidence "$EVIDENCE" --out "$OUTPUT"
python3 "$NATIVE_LOCK" dependency-input-verification \
  python3 scripts/verify.py --evidence "$EVIDENCE" --acceptance "$ACCEPTANCE" \
  --producer "$PRODUCER" --out "$OUTPUT"
```

`PRODUCER` must be the unchanged clean source commit in the snapshot. Only this
historical verification needs its checkout and 1,814-file source manifest.
Fresh harness runs need the exact c15t RN archive and 90 Maven files instead.
The scripts verify the six APKs, final R8 outputs, dependency binaries, DEX
instruction ownership and report arithmetic. Generated `results.json` is the
full local calculation, rather than the compact committed snapshot.

Graph capture copies hosts and their module trees into `OUTPUT/consumers`.
Included Gradle plugin builds may run, so capture holds the native lock. It
does not assemble an APK. A rerun needs a fresh output directory or an explicit
`--resume-owned-copy` and a new `--attempt` name. Artifact coordinates and
SHA256, including duplicate rows, must match the frozen inputs before the
graph can support the report.

The frozen c15t host records an absolute local Maven repository URI in its
Gradle file. Graph capture preserves that file, so its recorded repository
location must still be available. Changing `EVIDENCE` alone does not relocate
that host. Fresh harness builds take the Maven path from the external config
and support a new location. The static APK/DEX analysis does not resolve Maven.

The original 27-file portable manifest was verified before incorporation.
[source-manifest.json](source-manifest.json) retains its hash and the exact
hashes of the incorporated original scripts and report. Full per-class
ownership, ZIP-entry lists, resolved graphs, temporary dumps and build logs
remain external. The commands regenerate those supporting reports in `OUTPUT`.
The original verification's Maven manifest hash covers the JSON file bytes;
the fresh harness hashes its canonical file records. Both verify the same 90
Maven files individually.
