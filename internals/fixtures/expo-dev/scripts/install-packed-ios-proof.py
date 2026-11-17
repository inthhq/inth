#!/usr/bin/env python3
"""Add a native read-only observer to a task-owned packed consumer, after prebuild."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--consumer', type=Path, required=True)
args = parser.parse_args()
consumer = args.consumer.resolve()
source = Path(__file__).resolve().parent
repo = source.parents[3]
if consumer.is_relative_to(repo) or not (consumer / 'vendor/inth-react-native.tgz').is_file():
    parser.error('Expected a packed consumer outside the source checkout')
app = consumer / 'ios/inthExpoDev/AppDelegate.swift'
text = app.read_text()
if 'PackedNativeProof' in text:
    parser.error('Native proof is already installed')
needle = '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)'
assert text.count(needle) == 1
text = text.replace(needle, '    if ProcessInfo.processInfo.environment["C15T_PACKED_NATIVE_PROOF"] == "1" { PackedNativeProof.start() }\n' + needle)
app.write_text(text + '\n' + (source / 'packed-native-proof.swift').read_text())
