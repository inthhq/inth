#!/usr/bin/env python3
"""One advisory lock across native builds and complete timing windows."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time

if len(sys.argv) < 3:
    raise SystemExit('usage: with-native-lock.py LABEL COMMAND [ARG...]')
path = Path(os.environ.get('CMP_NATIVE_LOCK', '/tmp/c15t-mobile-cmp-native.lock'))
path.parent.mkdir(parents=True, exist_ok=True)
with path.open('a+') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    started = time.time()
    try:
        result = subprocess.run(sys.argv[2:], check=False)
    finally:
        with path.with_suffix('.jsonl').open('a') as log:
            log.write(json.dumps({'label': sys.argv[1], 'startedEpoch': started, 'endedEpoch': time.time()}) + '\n')
    raise SystemExit(result.returncode)
