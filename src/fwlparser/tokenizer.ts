import { TextDecoder } from 'util';
import {
  NodeSeq,
  ParseOptions,
  Position,
  PositionHelpers,
  Result,
  Span,
  Token,
  TokenStr,
  UnsafeCharacterEncoding,
} from './types';
import { TokenKind } from './tokenKinds';

const textDecoder = new TextDecoder('utf-8', { fatal: true });

const span = (start: Position, end: Position): Span => ({ start, end });

const advanceText = (text: string, pos: Position): Position => {
  let current = pos;
  for (const ch of text) {
    current = PositionHelpers.advance(ch, current);
  }
  return current;
};

const isWhitespace = (ch: string): boolean => /\s/.test(ch);
const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
const isLetter = (ch: string): boolean => /[A-Za-z]/.test(ch);
const isLetterOrDigit = (ch: string): boolean => /[A-Za-z0-9]/.test(ch);

const tokenizeString = (input: string): NodeSeq<Token<TokenStr>> => {
  const tokens: Token<TokenStr>[] = [];
  let idx = 0;
  let pos = PositionHelpers.start();

  const emitToken = (kind: TokenKind, text: string, startPos: Position, endPos: Position) => {
    tokens.push({ kind, text, span: span(startPos, endPos) });
  };

  const advanceToken = (kind: TokenKind, length: number, startIdx: number, startPos: Position) => {
    const text = input.substring(startIdx, startIdx + length);
    const endPos = advanceText(text, startPos);
    emitToken(kind, text, startPos, endPos);
    return { nextIndex: startIdx + length, nextPos: endPos };
  };

  const nextChar = (offset: number): string | undefined => {
    const target = idx + offset;
    return target < input.length ? input[target] : undefined;
  };

  while (idx < input.length) {
    const ch = input[idx];
    switch (ch) {
      case '\n': {
        const start = pos;
        const nextPos = PositionHelpers.advance(ch, pos);
        emitToken(TokenKind.Newline, '\n', start, nextPos);
        idx += 1;
        pos = nextPos;
        break;
      }
      default:
        if (isWhitespace(ch)) {
          const start = pos;
          let j = idx;
          let currentPos = pos;
          while (j < input.length) {
            const c = input[j];
            if (c === '\n' || !isWhitespace(c)) {
              break;
            }
            currentPos = PositionHelpers.advance(c, currentPos);
            j += 1;
          }
          const text = input.substring(idx, j);
          emitToken(TokenKind.Whitespace, text, start, currentPos);
          idx = j;
          pos = currentPos;
        } else if (isDigit(ch)) {
          const start = pos;
          let j = idx;
          let currentPos = pos;
          let sawDot = false;
          let looping = true;
          while (j < input.length && looping) {
            const c = input[j];
            if (isDigit(c)) {
              currentPos = PositionHelpers.advance(c, currentPos);
              j += 1;
            } else if (c === '.' && !sawDot) {
              sawDot = true;
              currentPos = PositionHelpers.advance(c, currentPos);
              j += 1;
            } else {
              looping = false;
            }
          }
          const text = input.substring(idx, j);
          const kind = sawDot ? TokenKind.Real : TokenKind.Integer;
          emitToken(kind, text, start, currentPos);
          idx = j;
          pos = currentPos;
        } else if (isLetter(ch) || ch === '_') {
          const start = pos;
          let j = idx;
          let currentPos = pos;
          while (
            j < input.length &&
            (isLetterOrDigit(input[j]) || input[j] === '_' || input[j] === '`')
          ) {
            currentPos = PositionHelpers.advance(input[j], currentPos);
            j += 1;
          }
          const text = input.substring(idx, j);
          emitToken(TokenKind.Symbol, text, start, currentPos);
          idx = j;
          pos = currentPos;
        } else if (ch === '"') {
          const start = pos;
          let j = idx + 1;
          let currentPos = PositionHelpers.advance('"', pos);
          const builder: string[] = [];
          let closed = false;
          while (j < input.length && !closed) {
            const c = input[j];
            currentPos = PositionHelpers.advance(c, currentPos);
            if (c === '\\' && j + 1 < input.length) {
              const next = input[j + 1];
              builder.push(next);
              currentPos = PositionHelpers.advance(next, currentPos);
              j += 2;
            } else if (c === '"') {
              closed = true;
              j += 1;
            } else {
              builder.push(c);
              j += 1;
            }
          }
          const text = builder.join('');
          emitToken(TokenKind.String, text, start, currentPos);
          idx = j;
          pos = currentPos;
        } else {
          const advance = (kind: TokenKind, length: number) => {
            const { nextIndex, nextPos } = advanceToken(kind, length, idx, pos);
            idx = nextIndex;
            pos = nextPos;
          };

          switch (ch) {
            case '.': {
              const c1 = nextChar(1);
              const c2 = nextChar(2);
              if (c1 === '.' && c2 === '.') {
                advance(TokenKind.DotDotDot, 3);
              } else if (c1 === '.') {
                advance(TokenKind.DotDot, 2);
              } else {
                advance(TokenKind.Dot, 1);
              }
              break;
            }
            case ':': {
              const c1 = nextChar(1);
              const c2 = nextChar(2);
              if (c1 === ':' && c2 === '[') {
                advance(TokenKind.ColonColonOpenSquare, 3);
              } else if (c1 === ':') {
                advance(TokenKind.ColonColon, 2);
              } else if (c1 === '=') {
                advance(TokenKind.ColonEqual, 2);
              } else if (c1 === '>') {
                advance(TokenKind.ColonGreater, 2);
              } else {
                advance(TokenKind.Colon, 1);
              }
              break;
            }
            case ';': {
              if (nextChar(1) === ';') {
                advance(TokenKind.SemiSemi, 2);
              } else {
                advance(TokenKind.Semi, 1);
              }
              break;
            }
            case '=': {
              const c1 = nextChar(1);
              const c2 = nextChar(2);
              if (c1 === '=' && c2 === '=') {
                advance(TokenKind.EqualEqualEqual, 3);
              } else if (c1 === '!' && c2 === '=') {
                advance(TokenKind.EqualBangEqual, 3);
              } else if (c1 === '=') {
                advance(TokenKind.EqualEqual, 2);
              } else {
                advance(TokenKind.Equal, 1);
              }
              break;
            }
            case '!': {
              if (nextChar(1) === '=') {
                advance(TokenKind.BangEqual, 2);
              } else if (nextChar(1) === '!') {
                advance(TokenKind.BangBang, 2);
              } else {
                advance(TokenKind.Bang, 1);
              }
              break;
            }
            case '<': {
              const c1 = nextChar(1);
              const c2 = nextChar(2);
              if (c1 === '-' && c2 === '>') {
                advance(TokenKind.LessMinusGreater, 3);
              } else if (c1 === '<') {
                advance(TokenKind.LessLess, 2);
              } else if (c1 === '=') {
                advance(TokenKind.LessEqual, 2);
              } else if (c1 === '>') {
                advance(TokenKind.LessGreater, 2);
              } else if (c1 === '|') {
                advance(TokenKind.LessBar, 2);
              } else {
                advance(TokenKind.Less, 1);
              }
              break;
            }
            case '>': {
              const c1 = nextChar(1);
              const c2 = nextChar(2);
              if (c1 === '>' && c2 === '>') {
                advance(TokenKind.GreaterGreaterGreater, 3);
              } else if (c1 === '>') {
                advance(TokenKind.GreaterGreater, 2);
              } else if (c1 === '=') {
                advance(TokenKind.GreaterEqual, 2);
              } else {
                advance(TokenKind.Greater, 1);
              }
              break;
            }
            case '-': {
              const c1 = nextChar(1);
              if (c1 === '>') {
                advance(TokenKind.MinusGreater, 2);
              } else if (c1 === '-') {
                advance(TokenKind.MinusMinus, 2);
              } else if (c1 === '=') {
                advance(TokenKind.MinusEqual, 2);
              } else {
                advance(TokenKind.Minus, 1);
              }
              break;
            }
            case '+': {
              const c1 = nextChar(1);
              if (c1 === '+') {
                advance(TokenKind.PlusPlus, 2);
              } else if (c1 === '=') {
                advance(TokenKind.PlusEqual, 2);
              } else {
                advance(TokenKind.Plus, 1);
              }
              break;
            }
            case '*': {
              const c1 = nextChar(1);
              if (c1 === '^') {
                advance(TokenKind.StarCaret, 2);
              } else if (c1 === '=') {
                advance(TokenKind.StarEqual, 2);
              } else if (c1 === '*') {
                advance(TokenKind.StarStar, 2);
              } else {
                advance(TokenKind.Star, 1);
              }
              break;
            }
            case '^': {
              const c1 = nextChar(1);
              const c2 = nextChar(2);
              if (c1 === ':' && c2 === '=') {
                advance(TokenKind.CaretColonEqual, 3);
              } else if (c1 === '=') {
                advance(TokenKind.CaretEqual, 2);
              } else {
                advance(TokenKind.Caret, 1);
              }
              break;
            }
            case '/': {
              const c1 = nextChar(1);
              const c2 = nextChar(2);
              if (c1 === '/' && c2 === '.') {
                advance(TokenKind.SlashSlashDot, 3);
              } else if (c1 === '/' && c2 === '@') {
                advance(TokenKind.SlashSlashAt, 3);
              } else if (c1 === '/' && c2 === '=') {
                advance(TokenKind.SlashSlashEqual, 3);
              } else if (c1 === '/') {
                advance(TokenKind.SlashSlash, 2);
              } else if (c1 === '*') {
                advance(TokenKind.SlashStar, 2);
              } else if (c1 === ';') {
                advance(TokenKind.SlashSemi, 2);
              } else if (c1 === '.') {
                advance(TokenKind.SlashDot, 2);
              } else if (c1 === '=') {
                advance(TokenKind.SlashEqual, 2);
              } else if (c1 === '@') {
                advance(TokenKind.SlashAt, 2);
              } else if (c1 === ':') {
                advance(TokenKind.SlashColon, 2);
              } else {
                advance(TokenKind.Slash, 1);
              }
              break;
            }
            case '@': {
              const c1 = nextChar(1);
              const c2 = nextChar(2);
              if (c1 === '@' && c2 === '@') {
                advance(TokenKind.AtAtAt, 3);
              } else if (c1 === '@') {
                advance(TokenKind.AtAt, 2);
              } else if (c1 === '*') {
                advance(TokenKind.AtStar, 2);
              } else {
                advance(TokenKind.At, 1);
              }
              break;
            }
            case '#': {
              if (nextChar(1) === '#') {
                advance(TokenKind.HashHash, 2);
              } else {
                advance(TokenKind.Hash, 1);
              }
              break;
            }
            case '~': {
              if (nextChar(1) === '~') {
                advance(TokenKind.TildeTilde, 2);
              } else {
                advance(TokenKind.Tilde, 1);
              }
              break;
            }
            case '_': {
              const c1 = nextChar(1);
              const c2 = nextChar(2);
              if (c1 === '_' && c2 === '_') {
                advance(TokenKind.UnderUnderUnder, 3);
              } else if (c1 === '_') {
                advance(TokenKind.UnderUnder, 2);
              } else if (c1 === '.') {
                advance(TokenKind.UnderDot, 2);
              } else {
                advance(TokenKind.Under, 1);
              }
              break;
            }
            case '&': {
              if (nextChar(1) === '&') {
                advance(TokenKind.AmpAmp, 2);
              } else {
                advance(TokenKind.Amp, 1);
              }
              break;
            }
            case '|': {
              if (nextChar(1) === '|') {
                advance(TokenKind.BarBar, 2);
              } else if (nextChar(1) === '>') {
                advance(TokenKind.BarGreater, 2);
              } else {
                advance(TokenKind.Bar, 1);
              }
              break;
            }
            case '%': {
              if (nextChar(1) === '%') {
                advance(TokenKind.PercentPercent, 2);
              } else {
                advance(TokenKind.Percent, 1);
              }
              break;
            }
            case '(':
              if (nextChar(1) === '*') {
                const start = pos;
                let j = idx + 2;
                let currentPos = PositionHelpers.advance('*', PositionHelpers.advance('(', pos));
                let depth = 1;
                let closed = false;
                while (j < input.length && !closed) {
                  const lookahead = (offset: number) =>
                    j + offset < input.length ? input[j + offset] : undefined;
                  const c = input[j];
                  const next = lookahead(1);
                  if (c === '(' && next === '*') {
                    depth += 1;
                    currentPos = PositionHelpers.advance('(', currentPos);
                    currentPos = PositionHelpers.advance('*', currentPos);
                    j += 2;
                  } else if (c === '*' && next === ')') {
                    depth -= 1;
                    currentPos = PositionHelpers.advance('*', currentPos);
                    currentPos = PositionHelpers.advance(')', currentPos);
                    j += 2;
                    if (depth === 0) {
                      closed = true;
                    }
                  } else {
                    currentPos = PositionHelpers.advance(c, currentPos);
                    j += 1;
                  }
                }
                const text = input.substring(idx, j);
                if (closed && depth === 0) {
                  emitToken(TokenKind.Comment, text, start, currentPos);
                } else {
                  emitToken(TokenKind.Error_UnterminatedComment, text, start, currentPos);
                }
                idx = j;
                pos = currentPos;
              } else {
                advance(TokenKind.OpenParen, 1);
              }
              break;
            case ')':
              advance(TokenKind.CloseParen, 1);
              break;
            case '[':
              advance(TokenKind.OpenSquare, 1);
              break;
            case ']':
              advance(TokenKind.CloseSquare, 1);
              break;
            case '{':
              advance(TokenKind.OpenCurly, 1);
              break;
            case '}':
              advance(TokenKind.CloseCurly, 1);
              break;
            case ',':
              advance(TokenKind.Comma, 1);
              break;
            case '\'':
              advance(TokenKind.SingleQuote, 1);
              break;
            case '\\': {
              const c1 = nextChar(1);
              switch (c1) {
                case '!':
                  advance(TokenKind.LinearSyntax_Bang, 2);
                  break;
                case ')':
                  advance(TokenKind.LinearSyntax_CloseParen, 2);
                  break;
                case '@':
                  advance(TokenKind.LinearSyntax_At, 2);
                  break;
                case '&':
                  advance(TokenKind.LinearSyntax_Amp, 2);
                  break;
                case '*':
                  advance(TokenKind.LinearSyntax_Star, 2);
                  break;
                case '_':
                  advance(TokenKind.LinearSyntax_Under, 2);
                  break;
                case '^':
                  advance(TokenKind.LinearSyntax_Caret, 2);
                  break;
                case ' ':
                  advance(TokenKind.LinearSyntax_Space, 2);
                  break;
                case '%':
                  advance(TokenKind.LinearSyntax_Percent, 2);
                  break;
                case '+':
                  advance(TokenKind.LinearSyntax_Plus, 2);
                  break;
                case '/':
                  advance(TokenKind.LinearSyntax_Slash, 2);
                  break;
                case '`':
                  advance(TokenKind.LinearSyntax_BackTick, 2);
                  break;
                default:
                  advance(TokenKind.Unknown, 1);
                  break;
              }
              break;
            }
            default:
              advance(TokenKind.Unknown, 1);
              break;
          }
        }
    }
  }

  const eofSpan = span(pos, pos);
  tokens.push({ kind: TokenKind.EndOfFile, text: '', span: eofSpan });

  return NodeSeq.ofList(tokens);
};

export const tokenize = (input: string, _opts: ParseOptions): NodeSeq<Token<TokenStr>> => {
  return tokenizeString(input);
};

export const tokenizeBytes = (
  bytes: Uint8Array | Buffer,
  opts: ParseOptions,
): Result<NodeSeq<Token<TokenStr>>, UnsafeCharacterEncoding> => {
  const inputBytes = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  let slice = inputBytes;
  let flag: UnsafeCharacterEncoding | undefined;
  if (slice.length >= 3 && slice[0] === 0xef && slice[1] === 0xbb && slice[2] === 0xbf) {
    slice = slice.slice(3);
    flag = UnsafeCharacterEncoding.Bom;
  }

  let text: string;
  try {
    text = textDecoder.decode(slice);
  } catch {
    return { ok: false, error: UnsafeCharacterEncoding.InvalidUtf8 };
  }

  const tokens = tokenize(text, opts);
  if (flag) {
    return { ok: false, error: flag };
  }
  return { ok: true, value: tokens };
};
