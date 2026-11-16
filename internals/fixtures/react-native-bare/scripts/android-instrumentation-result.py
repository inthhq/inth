#!/usr/bin/env python3
"""Preserve AndroidJUnitRunner's result without enumerating other devices."""
from pathlib import Path
import re
import sys
from xml.etree import ElementTree as ET

log, output = map(Path, sys.argv[1:])
text = log.read_text()
passed = re.search(r'OK \((\d+) tests?\)', text)
failures = 'FAILURES!!!' in text or 'INSTRUMENTATION_FAILED' in text
ok = passed is not None and not failures
suite = ET.Element('testsuite', name='com.c15t.bare.e2e.ConsentJourney',
                   tests=passed[1] if passed else '1', failures='0' if ok else '1', errors='0', skipped='0')
case = ET.SubElement(suite, 'testcase', name='consentJourney', classname='com.c15t.bare.e2e.ConsentJourney')
if not ok:
    ET.SubElement(case, 'failure', message='AndroidJUnitRunner did not report success').text = text
ET.SubElement(suite, 'system-out').text = text
output.parent.mkdir(parents=True, exist_ok=True)
ET.ElementTree(suite).write(output, encoding='utf-8', xml_declaration=True)
sys.exit(0 if ok else 1)
