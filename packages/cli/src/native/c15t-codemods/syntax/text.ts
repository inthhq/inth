// Text helpers for source edits. They follow ts-morph's helpers of the same
// names, so removals and insertions leave the same whitespace ts-morph does.

const isWhitespaceCode = (code: number): boolean =>
  code === 32 ||
  code === 9 ||
  code === 10 ||
  code === 11 ||
  code === 12 ||
  code === 13 ||
  code === 160 ||
  code === 0x20_28 ||
  code === 0x20_29;

/** Whether `char` is a whitespace character, as ts-morph counts them. */
export const isWhitespace = (char: string | undefined): boolean =>
  char !== undefined && char.length > 0 && isWhitespaceCode(char.charCodeAt(0));

/** The first position at or after `pos` whose character matches. */
export const getNextMatchingPos = (
  text: string,
  pos: number,
  condition: (code: number) => boolean
): number => {
  let next = pos;
  while (next < text.length && !condition(text.charCodeAt(next))) {
    next += 1;
  }
  return next;
};

/** The last position at or before `pos` whose preceding character matches. */
export const getPreviousMatchingPos = (
  text: string,
  pos: number,
  condition: (code: number) => boolean
): number => {
  let previous = pos;
  while (previous > 0 && !condition(text.charCodeAt(previous - 1))) {
    previous -= 1;
  }
  return previous;
};

export const getNextNonWhitespacePos = (text: string, pos: number): number =>
  getNextMatchingPos(text, pos, (code) => !isWhitespaceCode(code));

export const getPreviousNonWhitespacePos = (
  text: string,
  pos: number
): number =>
  getPreviousMatchingPos(text, pos, (code) => !isWhitespaceCode(code));

export const getPosAtEndOfPreviousLine = (text: string, pos: number): number => {
  let current = pos;
  while (current > 0) {
    current -= 1;
    if (text[current] === "\n") {
      return text[current - 1] === "\r" ? current - 1 : current;
    }
  }
  return current;
};

export const getPosAtNextNonBlankLine = (text: string, pos: number): number => {
  let next = pos;
  let index = pos;
  while (index < text.length) {
    const char = text[index];
    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }
    if (char === "\n" || (char === "\r" && text[index + 1] === "\n")) {
      index += char === "\r" ? 2 : 1;
      next = index;
      continue;
    }
    return next;
  }
  return next;
};

export const getPosAtStartOfLineOrNonWhitespace = (
  text: string,
  pos: number
): number => {
  let current = pos;
  while (current > 0) {
    current -= 1;
    const char = text[current];
    if (char === "\n" || (char !== " " && char !== "\t")) {
      return current + 1;
    }
  }
  return current;
};

export const isNewLineAtPos = (text: string, pos: number): boolean =>
  text[pos] === "\n" || (text[pos] === "\r" && text[pos + 1] === "\n");

export const hasNewLineInRange = (
  text: string,
  start: number,
  end: number
): boolean => {
  for (let index = start; index < end; index += 1) {
    if (text[index] === "\n") {
      return true;
    }
  }
  return false;
};

export const getLineStartFromPos = (text: string, pos: number): number => {
  let current = pos;
  while (current > 0) {
    const char = text[current - 1];
    if (char === "\n" || char === "\r") {
      break;
    }
    current -= 1;
  }
  return current;
};

export const getLineEndFromPos = (text: string, pos: number): number => {
  let current = pos;
  while (current < text.length) {
    const char = text[current];
    if (char === "\n" || char === "\r") {
      break;
    }
    current += 1;
  }
  return current;
};

/** The end of a comment starting at `pos`, or -1 when none starts there. */
export const commentEnd = (text: string, pos: number): number => {
  if (text[pos] !== "/") {
    return -1;
  }
  if (text[pos + 1] === "/") {
    return getLineEndFromPos(text, pos + 2);
  }
  if (text[pos + 1] === "*") {
    const close = text.indexOf("*/", pos + 2);
    return close === -1 ? text.length : close + 2;
  }
  return -1;
};

/**
 * The end of the comments that trail `pos` on its line, or `pos` when there
 * are none. Matches the compiler's `getTrailingCommentRanges`.
 */
export const trailingCommentsEnd = (text: string, pos: number): number => {
  let end = pos;
  let current = pos;
  while (current < text.length) {
    const char = text[current];
    if (char === " " || char === "\t" || char === "\v" || char === "\f") {
      current += 1;
      continue;
    }
    const close = commentEnd(text, current);
    if (close === -1) {
      break;
    }
    const lineComment = text[current + 1] === "/";
    end = close;
    current = close;
    if (lineComment) {
      break;
    }
  }
  return end;
};

/** Skip whitespace and comments. */
export const skipTrivia = (text: string, pos: number): number => {
  let current = pos;
  while (current < text.length) {
    if (isWhitespace(text[current])) {
      current += 1;
      continue;
    }
    const close = commentEnd(text, current);
    if (close === -1) {
      break;
    }
    current = close;
  }
  return current;
};
