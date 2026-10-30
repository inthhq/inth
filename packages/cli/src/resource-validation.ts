import { CliError } from "./cli-error.ts";
import { terminalText } from "./organizations.ts";

export const validateResourceId = (value: string, label: string): void => {
  if (
    !value ||
    value.length > 255 ||
    value === "." ||
    value === ".." ||
    value !== terminalText(value) ||
    /\s/u.test(value)
  ) {
    throw new CliError(
      "usage_error",
      `${label} must be a resource ID without whitespace or terminal controls.`
    );
  }
};

export const parseTimestamp = (value: string): number => {
  const match =
    // eslint-disable-next-line prefer-named-capture-group -- Scriptc exposes positional regex captures.
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(
      value
    );
  if (!match) {
    return Number.NaN;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Scriptc's Date.parse requires exactly three fractional digits.
  const fraction = match[7] ?? "";
  const timestamp = fraction
    ? `${value.slice(0, 19)}.${`${fraction}000`.slice(0, 3)}${value.slice(20 + fraction.length)}`
    : value;
  const time = Date.parse(timestamp);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > (days[month - 1] ?? 0) ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59 ||
    Number(match[8] ?? 0) > 23 ||
    Number(match[9] ?? 0) > 59 ||
    !Number.isFinite(time)
  ) {
    return Number.NaN;
  }
  return time;
};
