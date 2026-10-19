/* eslint-disable prefer-named-capture-group -- Scriptc reads regex captures by index. */

// The parts of npm's `semver` package the codemods use. Scriptc cannot compile
// `semver` itself, so this follows its strict (not loose) parsing and its
// range desugaring: `^`, `~`, x-ranges and hyphen ranges become comparator
// sets. Each set is then treated as one interval of versions, which is how
// `intersects` and `subset` behave with `includePrerelease`. One difference:
// with that option, `semver` starts some lower bounds at a prerelease, so
// `^2` allows 2.0.0-0 there and here starts at 2.0.0.

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export interface RangeOptions {
  includePrerelease?: boolean;
}

interface Bound {
  version: SemVer;
  inclusive: boolean;
}

// A comparator set: every version at or above `lower` and below `upper`.
// Without an upper bound it is open-ended.
interface Interval {
  lower: Bound;
  upper: Bound | undefined;
}

const NUMBER = String.raw`0|[1-9]\d*`;
const IDENTIFIER = String.raw`(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*)`;
const PRERELEASE = String.raw`${IDENTIFIER}(?:\.${IDENTIFIER})*`;
const BUILD = String.raw`[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*`;
const PART = String.raw`${NUMBER}|x|X|\*`;
const PARTIAL = String.raw`v?(${PART})(?:\.(${PART})(?:\.(${PART})(?:-(${PRERELEASE}))?(?:\+${BUILD})?)?)?`;

const VERSION = new RegExp(
  String.raw`^v?(${NUMBER})\.(${NUMBER})\.(${NUMBER})(?:-(${PRERELEASE}))?(?:\+${BUILD})?$`,
  "u"
);
const COMPARATOR = new RegExp(String.raw`^(~>?|\^|[<>]?=?)${PARTIAL}$`, "u");
const HYPHEN = new RegExp(String.raw`^${PARTIAL}\s+-\s+${PARTIAL}$`, "u");
const OPERATOR_SPACE = /(~>?|\^|[<>]=?|=)\s+(?=[v\dxX*])/gu;

const ZERO: SemVer = { major: 0, minor: 0, patch: 0, prerelease: ["0"] };

/** Parse a version such as `3.1.0` or `v3.0.0-canary.2`, or return null. */
export const parse = (version: string): SemVer | null => {
  const match = VERSION.exec(version.trim());
  if (!match) {
    return null;
  }
  const [, major = "0", minor = "0", patch = "0", prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined ? [] : prerelease.split("."),
  };
};

const format = (version: SemVer): string => {
  const main = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length === 0
    ? main
    : `${main}-${version.prerelease.join(".")}`;
};

/** The version without a `v` prefix or build metadata, or null. */
export const valid = (version: string): string | null => {
  const parsed = parse(version);
  return parsed === null ? null : format(parsed);
};

const compareIdentifiers = (left: string, right: string): number => {
  const leftNumeric = /^\d+$/u.test(left);
  const rightNumeric = /^\d+$/u.test(right);
  if (leftNumeric && rightNumeric) {
    return Math.sign(Number(left) - Number(right));
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

const compare = (left: SemVer, right: SemVer): number => {
  const main =
    Math.sign(left.major - right.major) ||
    Math.sign(left.minor - right.minor) ||
    Math.sign(left.patch - right.patch);
  if (main !== 0) {
    return main;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return Math.sign(right.prerelease.length - left.prerelease.length);
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      return leftPart === undefined ? -1 : 1;
    }
    const order = compareIdentifiers(leftPart, rightPart);
    if (order !== 0) {
      return order;
    }
  }
  return 0;
};

const isX = (part: string | undefined): boolean =>
  part === undefined || part === "x" || part === "X" || part === "*";

const version = (
  major: number,
  minor: number,
  patch: number,
  prerelease: string[] = []
): SemVer => ({ major, minor, patch, prerelease });

const atLeast = (value: SemVer): Interval => ({
  lower: { inclusive: true, version: value },
  upper: undefined,
});

const below = (value: SemVer): Interval => ({
  lower: { inclusive: true, version: ZERO },
  upper: { inclusive: false, version: value },
});

const between = (lower: SemVer, upper: SemVer): Interval => ({
  lower: { inclusive: true, version: lower },
  upper: { inclusive: false, version: upper },
});

const ANY: Interval = atLeast(ZERO);
const NONE: Interval = below(ZERO);

const prereleaseOf = (text: string | undefined): string[] =>
  text === undefined ? [] : text.split(".");

// `>`, `>=`, `<`, `<=` or `=` with a version. A partial version such as
// `2.x` covers every version from `exact` up to `next`.
const operatorInterval = (
  operator: string,
  exact: SemVer,
  partial: boolean,
  next: SemVer
): Interval => {
  switch (operator) {
    case ">": {
      return partial
        ? atLeast(version(next.major, next.minor, 0))
        : { lower: { inclusive: false, version: exact }, upper: undefined };
    }
    case ">=": {
      return atLeast(exact);
    }
    case "<": {
      return below(
        partial ? version(exact.major, exact.minor, 0, ["0"]) : exact
      );
    }
    case "<=": {
      return partial
        ? below(next)
        : {
            lower: { inclusive: true, version: ZERO },
            upper: { inclusive: true, version: exact },
          };
    }
    default: {
      return partial
        ? between(exact, next)
        : {
            lower: { inclusive: true, version: exact },
            upper: { inclusive: true, version: exact },
          };
    }
  }
};

// A comparator such as `^2.3`, `~3`, `>=2 ` or `3.x`, as an interval.
const comparatorInterval = (token: string): Interval | null => {
  const match = COMPARATOR.exec(token);
  if (!match) {
    return null;
  }
  const [, operator = "", majorText, minorText, patchText, pre] = match;
  if (isX(majorText)) {
    return operator === "<" || operator === ">" ? NONE : ANY;
  }
  const major = Number(majorText);
  const minor = isX(minorText) ? 0 : Number(minorText);
  const patch = isX(patchText) ? 0 : Number(patchText);
  const exact = version(major, minor, patch, prereleaseOf(pre));
  const nextMajor = version(major + 1, 0, 0, ["0"]);
  const nextMinor = version(major, minor + 1, 0, ["0"]);

  if (operator === "^") {
    if (isX(minorText) || major > 0) {
      return between(exact, nextMajor);
    }
    if (isX(patchText) || minor > 0) {
      return between(exact, nextMinor);
    }
    return between(exact, version(major, minor, patch + 1, ["0"]));
  }
  // The version just past a partial one: `2.x` ends at 3.0.0-0.
  const next = isX(minorText) ? nextMajor : nextMinor;
  if (operator === "~" || operator === "~>") {
    return between(exact, next);
  }
  return operatorInterval(
    operator,
    exact,
    isX(minorText) || isX(patchText),
    next
  );
};

// `1.2 - 2.3.4`: inclusive of both ends, with a partial end rounded up.
const hyphenInterval = (match: RegExpExecArray): Interval => {
  const [, fromMajor, fromMinor, fromPatch, fromPre] = match;
  const [toMajor, toMinor, toPatch, toPre] = match.slice(5);
  const lower = isX(fromMajor)
    ? ZERO
    : version(
        Number(fromMajor),
        isX(fromMinor) ? 0 : Number(fromMinor),
        isX(fromPatch) ? 0 : Number(fromPatch),
        prereleaseOf(fromPre)
      );
  if (isX(toMajor)) {
    return atLeast(lower);
  }
  const major = Number(toMajor);
  if (isX(toMinor)) {
    return between(lower, version(major + 1, 0, 0, ["0"]));
  }
  const minor = Number(toMinor);
  if (isX(toPatch)) {
    return between(lower, version(major, minor + 1, 0, ["0"]));
  }
  return {
    lower: { inclusive: true, version: lower },
    upper: {
      inclusive: true,
      version: version(major, minor, Number(toPatch), prereleaseOf(toPre)),
    },
  };
};

const higherLower = (left: Bound, right: Bound): Bound => {
  const order = compare(left.version, right.version);
  if (order !== 0) {
    return order > 0 ? left : right;
  }
  return left.inclusive ? right : left;
};

const lowerUpper = (
  left: Bound | undefined,
  right: Bound | undefined
): Bound | undefined => {
  if (!left || !right) {
    return left ?? right;
  }
  const order = compare(left.version, right.version);
  if (order !== 0) {
    return order < 0 ? left : right;
  }
  return left.inclusive ? right : left;
};

const intersect = (left: Interval, right: Interval): Interval => ({
  lower: higherLower(left.lower, right.lower),
  upper: lowerUpper(left.upper, right.upper),
});

const isEmpty = (interval: Interval): boolean => {
  if (!interval.upper) {
    return false;
  }
  const order = compare(interval.lower.version, interval.upper.version);
  return (
    order > 0 ||
    (order === 0 && !(interval.lower.inclusive && interval.upper.inclusive))
  );
};

const contains = (outer: Interval, inner: Interval): boolean => {
  const lowerOrder = compare(outer.lower.version, inner.lower.version);
  const lowerFits =
    lowerOrder < 0 ||
    (lowerOrder === 0 && (outer.lower.inclusive || !inner.lower.inclusive));
  if (!lowerFits) {
    return false;
  }
  if (!outer.upper) {
    return true;
  }
  if (!inner.upper) {
    return false;
  }
  const upperOrder = compare(inner.upper.version, outer.upper.version);
  return (
    upperOrder < 0 ||
    (upperOrder === 0 && (outer.upper.inclusive || !inner.upper.inclusive))
  );
};

const setInterval = (set: string): Interval | null => {
  const text = set.trim();
  const hyphen = HYPHEN.exec(text);
  if (hyphen) {
    return hyphenInterval(hyphen);
  }
  const tokens = text.replaceAll(OPERATOR_SPACE, "$1").split(/\s+/u);
  let interval = ANY;
  for (const token of tokens) {
    if (token === "") {
      continue;
    }
    const comparator = comparatorInterval(token);
    if (!comparator) {
      return null;
    }
    interval = intersect(interval, comparator);
  }
  return interval;
};

const parseRange = (range: string): Interval[] | null => {
  const intervals: Interval[] = [];
  for (const set of range.split("||")) {
    const interval = setInterval(set);
    if (!interval) {
      return null;
    }
    intervals.push(interval);
  }
  return intervals;
};

const parseRangeOrThrow = (range: string): Interval[] => {
  const intervals = parseRange(range);
  if (!intervals) {
    throw new TypeError(`Invalid comparator: ${range}`);
  }
  return intervals;
};

/** The range when it parses, or null, as `semver.validRange` returns. */
export const validRange = (range: string): string | null =>
  parseRange(range) === null ? null : range.trim();

/** The lowest version a range allows, or null when it allows none. */
export const minVersion = (range: string): SemVer | null => {
  let lowest: SemVer | null = null;
  for (const interval of parseRangeOrThrow(range)) {
    if (isEmpty(interval)) {
      continue;
    }
    const { inclusive, version: bound } = interval.lower;
    let candidate = bound;
    if (!inclusive) {
      candidate =
        bound.prerelease.length > 0
          ? version(bound.major, bound.minor, bound.patch, [
              ...bound.prerelease,
              "0",
            ])
          : version(bound.major, bound.minor, bound.patch + 1);
    } else if (compare(bound, ZERO) === 0) {
      // `semver` tries 0.0.0 before 0.0.0-0.
      candidate = version(0, 0, 0);
    }
    if (lowest === null || compare(candidate, lowest) < 0) {
      lowest = candidate;
    }
  }
  return lowest;
};

/**
 * Whether two ranges allow a common version. Only the `includePrerelease`
 * form is implemented, which is the one the codemods use.
 */
export const intersects = (
  left: string,
  right: string,
  _options: RangeOptions
): boolean => {
  const rightIntervals = parseRangeOrThrow(right);
  return parseRangeOrThrow(left).some((leftInterval) =>
    rightIntervals.some(
      (rightInterval) =>
        !isEmpty(leftInterval) &&
        !isEmpty(rightInterval) &&
        !isEmpty(intersect(leftInterval, rightInterval))
    )
  );
};

/**
 * Whether every version `sub` allows is allowed by `dom`. Only the
 * `includePrerelease` form is implemented.
 */
export const subset = (
  sub: string,
  dom: string,
  _options: RangeOptions
): boolean => {
  const domIntervals = parseRangeOrThrow(dom);
  return parseRangeOrThrow(sub).every(
    (subInterval) =>
      isEmpty(subInterval) ||
      domIntervals.some(
        (domInterval) =>
          !isEmpty(domInterval) && contains(domInterval, subInterval)
      )
  );
};
