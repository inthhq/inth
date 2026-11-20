#!/usr/bin/env python3
"""Run prebuilt instrumented tests on a booted device, as connectedAndroidTest
would, and write a JUnit report.

CI builds the APKs on one runner and runs them on another that has KVM, so the
emulator job needs no Gradle build. AndroidJUnitRunner's raw output (-r) says
when each test starts and ends; that gives per-test results and times.

  ci-android-instrument.py --test-apk TEST.apk [--apk APP.apk ...] \\
      --instrumentation PACKAGE/RUNNER [--arg KEY=VALUE ...] --out DIR

Installs every --apk, then --test-apk, with runtime permissions granted (-g), as
connectedAndroidTest does. Writes DIR/instrument.log and DIR/junit.xml. Exits 0
only when every test the runner announced finished, none failed, and the runner
reported success; a crash part way through fails the run.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path
from xml.etree import ElementTree as ET

# AndroidJUnitRunner status codes.
START, OK, ERROR, FAILURE, IGNORED, ASSUMPTION = 1, 0, -1, -2, -3, -4


def parse(lines):
    """Yield (status code, fields, monotonic time) per INSTRUMENTATION_STATUS_CODE,
    and ('result', fields, None) for the final result block."""
    fields: dict[str, str] = {}
    key = None
    for line, at in lines:
        if line.startswith(('INSTRUMENTATION_STATUS: ', 'INSTRUMENTATION_RESULT: ')):
            key, _, value = line.split(': ', 1)[1].partition('=')
            fields[key] = value
        elif line.startswith('INSTRUMENTATION_STATUS_CODE: '):
            yield int(line.split(': ', 1)[1]), fields, at
            fields, key = {}, None
        elif line.startswith('INSTRUMENTATION_CODE: '):
            fields['code'] = line.split(': ', 1)[1]
            yield 'result', fields, None
            fields, key = {}, None
        elif line.startswith('INSTRUMENTATION_FAILED: '):
            fields['failed'] = line.split(': ', 1)[1]
        elif key is not None:
            # Stack traces and streams continue on the following lines.
            fields[key] += '\n' + line


def summarise(events):
    """Return (tests, announced, result) from parsed events."""
    tests: list[dict] = []
    started: dict[tuple[str, str], float] = {}
    announced = None
    result: dict[str, str] = {}
    for code, fields, at in events:
        if code == 'result':
            result = fields
            continue
        name = (fields.get('class', ''), fields.get('test', ''))
        if announced is None and fields.get('numtests', '').isdigit():
            announced = int(fields['numtests'])
        if code == START:
            started[name] = at
        else:
            tests.append({'class': name[0], 'test': name[1], 'code': code, 'stack': fields.get('stack', ''),
                          'time': max(0.0, at - started.pop(name, at))})
    return tests, announced, result


def junit(tests, problem):
    root = ET.Element('testsuites')
    by_class: dict[str, list[dict]] = {}
    for test in tests:
        by_class.setdefault(test['class'], []).append(test)
    for name, cases in sorted(by_class.items()):
        failures = sum(case['code'] == FAILURE for case in cases)
        errors = sum(case['code'] == ERROR for case in cases)
        skipped = sum(case['code'] in (IGNORED, ASSUMPTION) for case in cases)
        suite = ET.SubElement(root, 'testsuite', name=name, tests=str(len(cases)), failures=str(failures),
                              errors=str(errors), skipped=str(skipped),
                              time=f"{sum(case['time'] for case in cases):.3f}")
        for case in cases:
            element = ET.SubElement(suite, 'testcase', classname=name, name=case['test'], time=f"{case['time']:.3f}")
            if case['code'] == FAILURE:
                ET.SubElement(element, 'failure', message=case['stack'].split('\n', 1)[0]).text = case['stack']
            elif case['code'] == ERROR:
                ET.SubElement(element, 'error', message=case['stack'].split('\n', 1)[0]).text = case['stack']
            elif case['code'] in (IGNORED, ASSUMPTION):
                ET.SubElement(element, 'skipped')
    if problem:
        suite = ET.SubElement(root, 'testsuite', name='instrumentation', tests='1', failures='1', errors='0', skipped='0')
        case = ET.SubElement(suite, 'testcase', classname='instrumentation', name='run')
        ET.SubElement(case, 'failure', message=problem).text = problem
    return ET.ElementTree(root)


def verdict(tests, announced, result):
    """Return None when the run passed, else what went wrong."""
    if result.get('failed'):
        return f"INSTRUMENTATION_FAILED: {result['failed']}"
    if not tests:
        return 'The runner reported no tests.'
    bad = [f"{t['class']}#{t['test']}" for t in tests if t['code'] in (FAILURE, ERROR)]
    if bad:
        return f"{len(bad)} of {len(tests)} tests failed: {', '.join(bad)}"
    if announced is not None and len(tests) != announced:
        return f"The runner announced {announced} tests but {len(tests)} finished; the process may have crashed. {result.get('shortMsg', '')}".strip()
    if result.get('code') != '-1':
        return f"The runner did not report success (INSTRUMENTATION_CODE {result.get('code')}). {result.get('shortMsg', '')}".strip()
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--apk', action='append', default=[])
    parser.add_argument('--test-apk', required=True)
    parser.add_argument('--instrumentation', required=True)
    parser.add_argument('--arg', action='append', default=[])
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()

    adb = [os.path.join(os.environ['ANDROID_HOME'], 'platform-tools', 'adb')]
    if os.environ.get('ANDROID_SERIAL'):
        adb += ['-s', os.environ['ANDROID_SERIAL']]
    args.out.mkdir(parents=True, exist_ok=True)
    for apk in [*args.apk, args.test_apk]:
        subprocess.run([*adb, 'install', '-r', '-t', '-g', apk], check=True)

    command = [*adb, 'shell', 'am', 'instrument', '-w', '-r']
    for item in args.arg:
        key, _, value = item.partition('=')
        command += ['-e', key, value]
    command.append(args.instrumentation)

    lines = []
    with open(args.out / 'instrument.log', 'w') as log, \
            subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True) as process:
        for raw in process.stdout:
            log.write(raw)
            log.flush()
            lines.append((raw.rstrip('\r\n'), time.monotonic()))
    tests, announced, result = summarise(parse(lines))
    problem = verdict(tests, announced, result)
    junit(tests, problem).write(args.out / 'junit.xml', encoding='utf-8', xml_declaration=True)
    passed = sum(t['code'] == OK for t in tests)
    print(f'{passed} of {len(tests)} tests passed in {sum(t["time"] for t in tests):.0f} s.')
    if problem:
        print(problem, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
