# Switch benchmarks

Measured on 5 September 2026 on Apple M5 Pro, macOS arm64, with Scriptc 0.0.36, yao-pkg 6.22.0 and Node 24.20.0. Raw samples are in [switch-live-results.json](switch-live-results.json) and [switch-selector-results.json](switch-selector-results.json).

## Live native switch

Ten fresh invocations of the production `inth switch` binary reached the picker in **537.0 ms median**, with a range of **508.9–613.9 ms**. One warmup took 573.3 ms and is excluded. With ten samples, nearest-rank p95 is the maximum, 613.9 ms.

This includes process launch, production credential locking and Keychain lookup, any required token refresh, the live `/v1/organizations` request, response validation, and initial terminal rendering. Every run sent Ctrl+C at the picker and checked for cancellation exit status 130 and restored terminal settings. The benchmark never selected an organization, wrote the default, or saved private prompt contents. It does not measure saving the selection or human decision time.

The live result includes network and server latency. This benchmark does not instrument those separately from credential lookup and other CLI work. It therefore cannot attribute the entire difference between the live result and the local fixture to the API.

## Local selector comparison

Thirty measured processes per target follow three warmups. Target order rotates each iteration; filesystem caches are warm. Each fixture passes the same two memberships through production selection policy and its terminal adapter, receives Down followed by Enter, and checks that the second organization was selected. The parent measures terminal output in a 100-column, 24-row PTY. Input delays vary across five phases outside the measured keyboard intervals to avoid always sampling the native polling loop at the same point.

| Target | Launch to picker, median | Launch to picker, p95 | Arrow to redraw, median | Arrow to redraw, p95 | Enter to exit, median |
| --- | --: | --: | --: | --: | --: |
| Scriptc | 5.49 ms | 8.23 ms | 0.12 ms | 3.15 ms | 1.40 ms |
| Node, bundled JS | 54.78 ms | 61.53 ms | 1.21 ms | 1.51 ms | 4.40 ms |
| yao-pkg | 63.88 ms | 70.06 ms | 1.25 ms | 1.47 ms | 4.44 ms |

Scriptc starts this selector fixture about 10 times faster than Node and 12 times faster than yao-pkg. Its median redraw is faster, but the native adapter's polling produces a longer tail: 3.15 ms p95 for an arrow redraw and 8.66 ms p95 from Enter to exit. The Node adapters handle keypress events instead of polling.

These are selector fixtures, not complete `inth switch` invocations. They exclude credentials, HTTP, token refresh, and configuration writes. Node runs the same bundled JavaScript packaged by yao-pkg. Node and yao-pkg use Clack; Scriptc uses the native terminal adapter. This compares our implementations rather than isolating compiler speed. Timings include process creation, imports, terminal I/O, parent observation, and process exit where applicable. The PTY reader drains output throughout, including while the child restores terminal settings.

## Reproduce

On macOS arm64 with Python 3:

```sh
pnpm --filter @inth/cli bench:switch
```

This rebuilds the native fixtures and packages the Node selector fixture with yao-pkg, then measures all three targets. The benchmark checks selection results and terminal restoration for every sample.

With a saved native sign-in and more than one accessible organization:

```sh
pnpm --filter @inth/cli bench:switch:live
```

The live command uses the existing native binary and performs eleven organization lookups including warmup. It cancels at each picker. Normal OAuth refresh may rotate an expired access token's refresh token. With only one membership, normal switch behavior auto-selects it, so this picker benchmark requires multiple memberships.
