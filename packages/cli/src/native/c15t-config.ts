/** Remove config comments while preserving quoted values and line breaks. */
export const withoutConfigComments = (source: string): string => {
  let result = "";
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") {
        lineComment = false;
        result += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      } else if (character === "\n") {
        result += character;
      }
      continue;
    }
    if (quote) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "/" && (next === "/" || next === "*")) {
      lineComment = next === "/";
      blockComment = next === "*";
      result += " ";
      index += 1;
    } else {
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
      }
      result += character;
    }
  }
  return result;
};
