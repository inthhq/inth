/* eslint-disable unicorn/prefer-code-point -- The scanner walks UTF-16 code units, as the TypeScript scanner does. */
/* eslint-disable complexity -- One case per punctuation character. */

// Tokenizer for TypeScript, TSX and JavaScript. It follows the TypeScript
// compiler's scanner: `>` is always one token until the parser rescans it,
// and the parser drives regex, template and JSX rescans.

/** Token kinds. Punctuation tokens use their own text. */
export const Token = {
  BigInt: "BigInt",
  Eof: "Eof",
  JsxText: "JsxText",
  Name: "Name",
  NoSubstitutionTemplate: "NoSubstitutionTemplate",
  Number: "Number",
  PrivateName: "PrivateName",
  Regex: "Regex",
  String: "String",
  TemplateHead: "TemplateHead",
  TemplateMiddle: "TemplateMiddle",
  TemplateTail: "TemplateTail",
} as const;

/** A position in the scan that `restore` can return to. */
export interface ScannerState {
  pos: number;
  token: string;
  value: string;
  tokenStart: number;
  tokenFullStart: number;
  lineBreak: boolean;
  lastTokenEnd: number;
}

const isLineBreak = (ch: number): boolean =>
  ch === 10 || ch === 13 || ch === 0x20_28 || ch === 0x20_29;

const isWhiteSpace = (ch: number): boolean =>
  ch === 32 ||
  ch === 9 ||
  ch === 11 ||
  ch === 12 ||
  ch === 0xa0 ||
  ch === 0xfe_ff ||
  ch === 0x16_80 ||
  (ch >= 0x20_00 && ch <= 0x20_0a) ||
  ch === 0x20_2f ||
  ch === 0x20_5f ||
  ch === 0x30_00 ||
  ch === 0x85;

const isDigit = (ch: number): boolean => ch >= 48 && ch <= 57;

/** Whether `ch` can start an identifier. */
export const isIdentifierStart = (ch: number): boolean =>
  (ch >= 65 && ch <= 90) ||
  (ch >= 97 && ch <= 122) ||
  ch === 36 ||
  ch === 95 ||
  (ch > 127 && !isWhiteSpace(ch) && !isLineBreak(ch));

/** Whether `ch` can continue an identifier. */
export const isIdentifierPart = (ch: number): boolean =>
  isIdentifierStart(ch) || isDigit(ch) || ch === 0x20_0c || ch === 0x20_0d;

const isHexDigit = (ch: number): boolean =>
  isDigit(ch) || (ch >= 65 && ch <= 70) || (ch >= 97 && ch <= 102);

const fromCodePoint = (code: number): string => {
  if (code <= 0xff_ff) {
    return String.fromCharCode(code);
  }
  const offset = code - 0x1_00_00;
  return String.fromCharCode(
    0xd8_00 + Math.floor(offset / 0x4_00),
    0xdc_00 + (offset % 0x4_00)
  );
};

/** A syntax error with the offset it was found at. */
export const syntaxError = (message: string, offset: number): Error =>
  new Error(`Syntax error at offset ${String(offset)}: ${message}`);

export class Scanner {
  text: string;
  pos = 0;
  token: string = Token.Eof;
  value = "";
  tokenStart = 0;
  tokenFullStart = 0;
  lineBreak = false;
  // End of the token before the current one. Nodes end here.
  lastTokenEnd = 0;
  jsx: boolean;

  constructor(text: string, jsx: boolean) {
    this.text = text;
    this.jsx = jsx;
  }

  save(): ScannerState {
    return {
      lastTokenEnd: this.lastTokenEnd,
      lineBreak: this.lineBreak,
      pos: this.pos,
      token: this.token,
      tokenFullStart: this.tokenFullStart,
      tokenStart: this.tokenStart,
      value: this.value,
    };
  }

  restore(state: ScannerState): void {
    this.lastTokenEnd = state.lastTokenEnd;
    this.lineBreak = state.lineBreak;
    this.pos = state.pos;
    this.token = state.token;
    this.tokenFullStart = state.tokenFullStart;
    this.tokenStart = state.tokenStart;
    this.value = state.value;
  }

  private code(offset: number): number {
    return offset < this.text.length ? this.text.charCodeAt(offset) : -1;
  }

  /** Move past the current token and scan the next one. */
  next(): string {
    this.lastTokenEnd = this.pos;
    return this.scan();
  }

  /** The first offset at or after `start` that is not whitespace or a comment. */
  triviaEnd(start: number): number {
    const savedPos = this.pos;
    const savedLineBreak = this.lineBreak;
    this.pos = start;
    this.skipTrivia();
    const end = this.pos;
    this.pos = savedPos;
    this.lineBreak = savedLineBreak;
    return end;
  }

  private skipTrivia(): void {
    const { text } = this;
    while (this.pos < text.length) {
      const ch = text.charCodeAt(this.pos);
      if (isLineBreak(ch)) {
        this.lineBreak = true;
        this.pos += 1;
      } else if (isWhiteSpace(ch)) {
        this.pos += 1;
      } else if (ch === 47 && this.code(this.pos + 1) === 47) {
        this.pos += 2;
        while (
          this.pos < text.length &&
          !isLineBreak(text.charCodeAt(this.pos))
        ) {
          this.pos += 1;
        }
      } else if (ch === 47 && this.code(this.pos + 1) === 42) {
        const close = text.indexOf("*/", this.pos + 2);
        const end = close === -1 ? text.length : close + 2;
        for (let index = this.pos; index < end; index += 1) {
          if (isLineBreak(text.charCodeAt(index))) {
            this.lineBreak = true;
          }
        }
        this.pos = end;
      } else if (ch === 35 && this.pos === 0 && this.code(1) === 33) {
        while (
          this.pos < text.length &&
          !isLineBreak(text.charCodeAt(this.pos))
        ) {
          this.pos += 1;
        }
      } else {
        return;
      }
    }
  }

  scan(): string {
    this.tokenFullStart = this.pos;
    this.lineBreak = false;
    this.skipTrivia();
    this.tokenStart = this.pos;
    this.value = "";
    const { text } = this;
    if (this.pos >= text.length) {
      this.token = Token.Eof;
      return this.token;
    }
    const ch = text.charCodeAt(this.pos);
    if (ch === 34 || ch === 39) {
      this.value = this.scanString(ch, false);
      this.token = Token.String;
      return this.token;
    }
    if (ch === 96) {
      this.pos += 1;
      this.token = this.scanTemplate(true);
      return this.token;
    }
    if (isDigit(ch) || (ch === 46 && isDigit(this.code(this.pos + 1)))) {
      this.token = this.scanNumber();
      return this.token;
    }
    if (
      isIdentifierStart(ch) ||
      (ch === 92 && this.code(this.pos + 1) === 117)
    ) {
      this.scanName();
      this.token = Token.Name;
      return this.token;
    }
    if (ch === 35 && isIdentifierStart(this.code(this.pos + 1))) {
      this.pos += 1;
      this.scanName();
      this.value = `#${this.value}`;
      this.token = Token.PrivateName;
      return this.token;
    }
    this.token = this.scanPunctuation(ch);
    return this.token;
  }

  // The value is the cooked name, so `\u0061` reads as `a`.
  private scanName(): void {
    let value = "";
    let chunkStart = this.pos;
    while (this.pos < this.text.length) {
      const ch = this.text.charCodeAt(this.pos);
      if (ch === 92 && this.code(this.pos + 1) === 117) {
        value += this.text.slice(chunkStart, this.pos);
        this.pos += 1;
        value += this.scanEscape();
        chunkStart = this.pos;
      } else if (isIdentifierPart(ch)) {
        this.pos += 1;
      } else {
        break;
      }
    }
    this.value = value + this.text.slice(chunkStart, this.pos);
  }

  private punct(token: string): string {
    this.pos += token.length;
    return token;
  }

  private scanPunctuation(ch: number): string {
    const next = this.code(this.pos + 1);
    const third = this.code(this.pos + 2);
    switch (ch) {
      case 33: {
        if (next === 61) {
          return this.punct(third === 61 ? "!==" : "!=");
        }
        return this.punct("!");
      }
      case 37: {
        return this.punct(next === 61 ? "%=" : "%");
      }
      case 38: {
        if (next === 38) {
          return this.punct(third === 61 ? "&&=" : "&&");
        }
        return this.punct(next === 61 ? "&=" : "&");
      }
      case 40: {
        return this.punct("(");
      }
      case 41: {
        return this.punct(")");
      }
      case 42: {
        if (next === 42) {
          return this.punct(third === 61 ? "**=" : "**");
        }
        return this.punct(next === 61 ? "*=" : "*");
      }
      case 43: {
        if (next === 43) {
          return this.punct("++");
        }
        return this.punct(next === 61 ? "+=" : "+");
      }
      case 44: {
        return this.punct(",");
      }
      case 45: {
        if (next === 45) {
          return this.punct("--");
        }
        return this.punct(next === 61 ? "-=" : "-");
      }
      case 46: {
        return this.punct(next === 46 && third === 46 ? "..." : ".");
      }
      case 47: {
        return this.punct(next === 61 ? "/=" : "/");
      }
      case 58: {
        return this.punct(":");
      }
      case 59: {
        return this.punct(";");
      }
      case 60: {
        if (next === 60) {
          return this.punct(third === 61 ? "<<=" : "<<");
        }
        if (next === 61) {
          return this.punct("<=");
        }
        if (this.jsx && next === 47 && third !== 42) {
          return this.punct("</");
        }
        return this.punct("<");
      }
      case 61: {
        if (next === 61) {
          return this.punct(third === 61 ? "===" : "==");
        }
        return this.punct(next === 62 ? "=>" : "=");
      }
      case 62: {
        return this.punct(">");
      }
      case 63: {
        if (next === 46 && !isDigit(third)) {
          return this.punct("?.");
        }
        if (next === 63) {
          return this.punct(third === 61 ? "??=" : "??");
        }
        return this.punct("?");
      }
      case 64: {
        return this.punct("@");
      }
      case 91: {
        return this.punct("[");
      }
      case 93: {
        return this.punct("]");
      }
      case 94: {
        return this.punct(next === 61 ? "^=" : "^");
      }
      case 123: {
        return this.punct("{");
      }
      case 124: {
        if (next === 124) {
          return this.punct(third === 61 ? "||=" : "||");
        }
        return this.punct(next === 61 ? "|=" : "|");
      }
      case 125: {
        return this.punct("}");
      }
      case 126: {
        return this.punct("~");
      }
      default: {
        throw syntaxError(
          `Unexpected character ${JSON.stringify(String.fromCharCode(ch))}`,
          this.pos
        );
      }
    }
  }

  private scanDigits(accept: (ch: number) => boolean): void {
    while (this.pos < this.text.length) {
      const ch = this.text.charCodeAt(this.pos);
      if (accept(ch) || (ch === 95 && accept(this.code(this.pos + 1)))) {
        this.pos += 1;
      } else {
        return;
      }
    }
  }

  private scanNumber(): string {
    const start = this.pos;
    const ch = this.text.charCodeAt(this.pos);
    const radix = this.text.charAt(this.pos + 1).toLowerCase();
    if (ch === 48 && (radix === "x" || radix === "b" || radix === "o")) {
      this.pos += 2;
      this.scanDigits(isHexDigit);
    } else {
      this.scanDigits(isDigit);
      if (this.code(this.pos) === 46) {
        this.pos += 1;
        this.scanDigits(isDigit);
      }
      if (this.text.charAt(this.pos).toLowerCase() === "e") {
        const sign = this.code(this.pos + 1);
        const digit = sign === 43 || sign === 45 ? this.pos + 2 : this.pos + 1;
        if (isDigit(this.code(digit))) {
          this.pos = digit;
          this.scanDigits(isDigit);
        }
      }
    }
    if (this.code(this.pos) === 110) {
      this.pos += 1;
      this.value = this.text.slice(start, this.pos);
      return Token.BigInt;
    }
    this.value = this.text.slice(start, this.pos);
    return Token.Number;
  }

  /** Read an escape after a backslash and return its cooked text. */
  private scanEscape(): string {
    const ch = this.code(this.pos);
    this.pos += 1;
    switch (ch) {
      case 48: {
        return "\0";
      }
      case 98: {
        return "\b";
      }
      case 102: {
        return "\f";
      }
      case 110: {
        return "\n";
      }
      case 114: {
        return "\r";
      }
      case 116: {
        return "\t";
      }
      case 118: {
        return "\v";
      }
      case 120: {
        const hex = this.text.slice(this.pos, this.pos + 2);
        this.pos += 2;
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      case 117: {
        if (this.code(this.pos) === 123) {
          const close = this.text.indexOf("}", this.pos);
          const hex = this.text.slice(this.pos + 1, close);
          this.pos = close + 1;
          return fromCodePoint(Number.parseInt(hex, 16));
        }
        const hex = this.text.slice(this.pos, this.pos + 4);
        this.pos += 4;
        return String.fromCharCode(Number.parseInt(hex, 16));
      }
      case 13: {
        if (this.code(this.pos) === 10) {
          this.pos += 1;
        }
        return "";
      }
      case 10:
      case 0x20_28:
      case 0x20_29: {
        return "";
      }
      default: {
        return ch === -1 ? "" : String.fromCharCode(ch);
      }
    }
  }

  private scanString(quote: number, jsxAttribute: boolean): string {
    const start = this.pos;
    this.pos += 1;
    let value = "";
    let chunk = this.pos;
    while (true) {
      if (this.pos >= this.text.length) {
        throw syntaxError("Unterminated string literal", start);
      }
      const ch = this.text.charCodeAt(this.pos);
      if (ch === quote) {
        value += this.text.slice(chunk, this.pos);
        this.pos += 1;
        return value;
      }
      if (ch === 92 && !jsxAttribute) {
        value += this.text.slice(chunk, this.pos);
        this.pos += 1;
        value += this.scanEscape();
        chunk = this.pos;
      } else if ((ch === 10 || ch === 13) && !jsxAttribute) {
        throw syntaxError("Unterminated string literal", start);
      } else {
        this.pos += 1;
      }
    }
  }

  /** Scan template text after a backtick or a `}` that closes a span. */
  private scanTemplate(fromBacktick: boolean): string {
    const start = this.pos;
    let value = "";
    let chunk = this.pos;
    while (true) {
      if (this.pos >= this.text.length) {
        throw syntaxError("Unterminated template literal", start);
      }
      const ch = this.text.charCodeAt(this.pos);
      if (ch === 96) {
        value += this.text.slice(chunk, this.pos);
        this.pos += 1;
        this.value = value;
        return fromBacktick ? Token.NoSubstitutionTemplate : Token.TemplateTail;
      }
      if (ch === 36 && this.code(this.pos + 1) === 123) {
        value += this.text.slice(chunk, this.pos);
        this.pos += 2;
        this.value = value;
        return fromBacktick ? Token.TemplateHead : Token.TemplateMiddle;
      }
      if (ch === 92) {
        value += this.text.slice(chunk, this.pos);
        this.pos += 1;
        value += this.scanEscape();
        chunk = this.pos;
      } else if (ch === 13) {
        value += `${this.text.slice(chunk, this.pos)}\n`;
        this.pos += this.code(this.pos + 1) === 10 ? 2 : 1;
        chunk = this.pos;
      } else {
        this.pos += 1;
      }
    }
  }

  // Rescans requested by the parser.

  /** Join `>` with the characters after it into `>=`, `>>`, `>>>=` and so on. */
  reScanGreater(): string {
    if (this.token !== ">") {
      return this.token;
    }
    const next = this.code(this.pos);
    if (next === 62) {
      if (this.code(this.pos + 1) === 62) {
        this.pos += this.code(this.pos + 2) === 61 ? 3 : 2;
        this.token = this.code(this.pos - 1) === 61 ? ">>>=" : ">>>";
        return this.token;
      }
      if (this.code(this.pos + 1) === 61) {
        this.pos += 2;
        this.token = ">>=";
        return this.token;
      }
      this.pos += 1;
      this.token = ">>";
      return this.token;
    }
    if (next === 61) {
      this.pos += 1;
      this.token = ">=";
    }
    return this.token;
  }

  /** Split `<<` and `<<=` so a type argument list can start. */
  reScanLessThan(): string {
    if (this.token === "<<" || this.token === "<<=") {
      this.pos = this.tokenStart + 1;
      this.token = "<";
    }
    return this.token;
  }

  reScanSlash(): string {
    if (this.token !== "/" && this.token !== "/=") {
      return this.token;
    }
    let inClass = false;
    this.pos = this.tokenStart + 1;
    while (true) {
      const ch = this.code(this.pos);
      if (ch === -1 || isLineBreak(ch)) {
        throw syntaxError("Unterminated regular expression", this.tokenStart);
      }
      this.pos += 1;
      if (ch === 92) {
        this.pos += 1;
      } else if (ch === 47 && !inClass) {
        break;
      } else if (ch === 91) {
        inClass = true;
      } else if (ch === 93) {
        inClass = false;
      }
    }
    while (
      this.pos < this.text.length &&
      isIdentifierPart(this.code(this.pos))
    ) {
      this.pos += 1;
    }
    this.value = this.text.slice(this.tokenStart, this.pos);
    this.token = Token.Regex;
    return this.token;
  }

  reScanTemplate(): string {
    this.pos = this.tokenStart + 1;
    this.token = this.scanTemplate(false);
    return this.token;
  }

  // JSX scanning.

  /** Scan JSX children: text, `{`, `<` or `</`. */
  scanJsxToken(): string {
    this.tokenFullStart = this.pos;
    this.tokenStart = this.pos;
    this.lineBreak = false;
    const { text } = this;
    if (this.pos >= text.length) {
      this.token = Token.Eof;
      return this.token;
    }
    const ch = text.charCodeAt(this.pos);
    if (ch === 60) {
      if (this.code(this.pos + 1) === 47) {
        this.pos += 2;
        this.token = "</";
        return this.token;
      }
      this.pos += 1;
      this.token = "<";
      return this.token;
    }
    if (ch === 123) {
      this.pos += 1;
      this.token = "{";
      return this.token;
    }
    while (this.pos < text.length) {
      const code = text.charCodeAt(this.pos);
      if (code === 123 || code === 60) {
        break;
      }
      this.pos += 1;
    }
    this.value = text.slice(this.tokenStart, this.pos);
    this.token = Token.JsxText;
    return this.token;
  }

  /** Move past the current token and scan JSX children. */
  nextJsxText(): string {
    this.lastTokenEnd = this.pos;
    return this.scanJsxToken();
  }

  reScanJsxToken(): string {
    this.pos = this.tokenFullStart;
    return this.scanJsxToken();
  }

  /** Extend a name with `-` parts, as in `data-id` or `my-element`. */
  scanJsxIdentifier(): void {
    if (this.token !== Token.Name) {
      return;
    }
    while (this.pos < this.text.length) {
      const ch = this.text.charCodeAt(this.pos);
      if (ch === 45 || isIdentifierPart(ch)) {
        this.pos += 1;
      } else {
        break;
      }
    }
    this.value = this.text.slice(this.tokenStart, this.pos);
  }

  /** Move past `=` and scan a JSX attribute value. */
  nextJsxAttributeValue(): string {
    this.lastTokenEnd = this.pos;
    const ch = this.code(this.pos);
    if (ch === 34 || ch === 39) {
      this.tokenFullStart = this.pos;
      this.tokenStart = this.pos;
      this.lineBreak = false;
      this.value = this.scanString(ch, true);
      this.token = Token.String;
      return this.token;
    }
    return this.scan();
  }
}
