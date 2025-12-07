import { Buffer } from 'buffer';
import {
  Ast,
  AstHelpers,
  AstMetadataEmpty,
  Cst,
  Issue,
  IssueSeverity,
  NodeSeq,
  ParseOptions,
  ParseOptionsDefault,
  ParseResult,
  PositionHelpers,
  Span,
  SpanHelpers,
  Token,
  TokenStr,
  TrackedSourceLocationsEmpty,
  UnsafeCharacterEncoding,
} from './types';
import { Associativity, precedenceTable } from './precedence';
import { TokenKind } from './tokenKinds';
import * as tokenizer from './tokenizer';

type ParserState = {
  tokens: Token<TokenStr>[];
  index: number;
  issues: Issue[];
};

interface ParsedNode {
  ast: Ast;
  cst: Cst;
  span: Span;
}

const issue = (severity: IssueSeverity, message: string, span?: Span): Issue => ({
  severity,
  message,
  span,
});

const astLeafFromToken = (tok: Token): Ast => AstHelpers.leaf(tok.kind, tok.text, tok.span);
const cstToken = (tok: Token): Cst => ({ type: 'token', token: tok });
const cstGroup = (children: Cst[]): Cst => ({ type: 'group', children: NodeSeq.ofList(children) });
const cstInfix = (op: TokenKind, children: Cst[]): Cst => ({
  type: 'infix',
  node: { op, children: NodeSeq.ofList(children) },
});

const implicitInteger = (value: string): Ast => ({
  type: 'leaf',
  kind: TokenKind.Integer,
  text: value,
  metadata: AstMetadataEmpty,
});

const isAtEnd = (state: ParserState) => state.index >= state.tokens.length;
const current = (state: ParserState) => (isAtEnd(state) ? undefined : state.tokens[state.index]);
const peek = (state: ParserState, offset: number) => {
  const idx = state.index + offset;
  return idx >= state.tokens.length ? undefined : state.tokens[idx];
};
const advance = (state: ParserState) => {
  if (!isAtEnd(state)) {
    state.index += 1;
  }
};

const skipToplevelNewlines = (state: ParserState) => {
  while (current(state)?.kind === TokenKind.ToplevelNewline) {
    advance(state);
  }
};

const headSymbol = (kind: TokenKind): string => {
  switch (kind) {
    case TokenKind.Plus:
      return 'Plus';
    case TokenKind.Minus:
      return 'Subtract';
    case TokenKind.Star:
    case TokenKind.StarCaret:
    case TokenKind.LongName_Times:
      return 'Times';
    case TokenKind.Slash:
    case TokenKind.LongName_Divide:
      return 'Divide';
    case TokenKind.Caret:
      return 'Power';
    case TokenKind.Semi:
    case TokenKind.SemiSemi:
      return 'CompoundExpression';
    case TokenKind.Colon:
      return 'Optional';
    case TokenKind.ColonGreater:
    case TokenKind.LongName_RuleDelayed:
      return 'RuleDelayed';
    case TokenKind.MinusGreater:
    case TokenKind.LongName_Rule:
      return 'Rule';
    case TokenKind.EqualEqual:
      return 'Equal';
    case TokenKind.Less:
      return 'Less';
    case TokenKind.LessEqual:
      return 'LessEqual';
    case TokenKind.Greater:
      return 'Greater';
    case TokenKind.GreaterEqual:
      return 'GreaterEqual';
    case TokenKind.AmpAmp:
    case TokenKind.LongName_And:
      return 'And';
    case TokenKind.BarBar:
    case TokenKind.LongName_Or:
      return 'Or';
    case TokenKind.Equal:
      return 'Set';
    case TokenKind.ColonEqual:
      return 'SetDelayed';
    case TokenKind.At:
      return 'Prefix';
    case TokenKind.ToplevelNewline:
      return 'CompoundExpression';
    default:
      return kind.toString();
  }
};

const infixInfo = (
  kind: TokenKind,
): { precedence: number; assoc: Associativity; head: string } | undefined => {
  const entry = precedenceTable.get(kind);
  if (entry) {
    return { precedence: entry.precedence, assoc: entry.associativity, head: headSymbol(kind) };
  }

  switch (kind) {
    case TokenKind.Semi:
    case TokenKind.ToplevelNewline:
      return { precedence: 1, assoc: Associativity.Left, head: headSymbol(kind) };
    case TokenKind.Plus:
    case TokenKind.Minus:
      return { precedence: 10, assoc: Associativity.Left, head: headSymbol(kind) };
    case TokenKind.Star:
    case TokenKind.Slash:
      return { precedence: 20, assoc: Associativity.Left, head: headSymbol(kind) };
    case TokenKind.Caret:
      return { precedence: 30, assoc: Associativity.Right, head: headSymbol(kind) };
    case TokenKind.Colon:
    case TokenKind.ColonGreater:
    case TokenKind.MinusGreater:
      return { precedence: 15, assoc: Associativity.Right, head: headSymbol(kind) };
    case TokenKind.EqualEqual:
      return { precedence: 25, assoc: Associativity.Left, head: headSymbol(kind) };
    case TokenKind.Greater:
    case TokenKind.GreaterEqual:
    case TokenKind.Less:
    case TokenKind.LessEqual:
      return { precedence: 25, assoc: Associativity.Left, head: headSymbol(kind) };
    case TokenKind.AmpAmp:
      return { precedence: 30, assoc: Associativity.Left, head: headSymbol(kind) };
    default:
      return undefined;
  }
};

const combineSpan = (a: Span, b: Span) => SpanHelpers.covering(a, b);

const parseExpression = (state: ParserState): ParsedNode | undefined =>
  parseExpressionWithPrecedence(1, state);

const parseSpanSequence = (
  state: ParserState,
  left: ParsedNode | undefined,
  semiTok: Token,
): ParsedNode | undefined => {
  const args: Ast[] = [];
  const children: Cst[] = [];
  let combinedSpan: Span | undefined;

  const addSpan = (span: Span) => {
    combinedSpan = combinedSpan ? combineSpan(combinedSpan, span) : span;
  };

  if (left) {
    args.push(left.ast);
    children.push(left.cst);
    addSpan(left.span);
  } else {
    args.push(implicitInteger('1'));
  }

  children.push(cstToken(semiTok));
  addSpan(semiTok.span);

  const isTerminator = (kind: TokenKind, allowSemi: boolean) => {
    switch (kind) {
      case TokenKind.Comma:
      case TokenKind.CloseSquare:
      case TokenKind.CloseParen:
      case TokenKind.BarGreater:
      case TokenKind.CloseCurly:
      case TokenKind.EndOfFile:
      case TokenKind.ToplevelNewline:
        return true;
      case TokenKind.SemiSemi:
        return allowSemi;
      default:
        return false;
    }
  };

  const parseSpanArg = (defaultValue: string, allowSemiTerminator: boolean) => {
    const nextTok = current(state);
    if (nextTok && isTerminator(nextTok.kind, allowSemiTerminator)) {
      return { ast: implicitInteger(defaultValue), cst: undefined, span: undefined };
    }
    const parsed = parseExpressionWithPrecedence(2, state);
    if (parsed) {
      return parsed;
    }
    const look = current(state);
    if (look && isTerminator(look.kind, allowSemiTerminator)) {
      return { ast: implicitInteger(defaultValue), cst: undefined, span: undefined };
    }
    state.issues.push(
      issue(IssueSeverity.Error, 'Expected expression for span specification', semiTok.span),
    );
    return undefined;
  };

  const appendArg = (defaultValue: string, allowSemiTerminator: boolean): boolean => {
    const result = parseSpanArg(defaultValue, allowSemiTerminator);
    if (result) {
      args.push(result.ast);
      if (result.cst) {
        children.push(result.cst);
      }
      if (result.span) {
        addSpan(result.span);
      }
      return true;
    }
    return false;
  };

  if (!appendArg('-1', true)) {
    return undefined;
  }

  const next = current(state);
  if (next?.kind === TokenKind.SemiSemi) {
    advance(state);
    children.push(cstToken(next));
    addSpan(next.span);
    if (!appendArg('1', false)) {
      return undefined;
    }
  }

  const fullSpan = combinedSpan ?? semiTok.span;
  const head = AstHelpers.leaf(TokenKind.Symbol, 'Span', semiTok.span);
  const ast = AstHelpers.call(head, args, fullSpan);
  const cst = cstGroup(children);
  return { ast, cst, span: fullSpan };
};

const parseExpressionWithPrecedence = (
  minPrec: number,
  state: ParserState,
): ParsedNode | undefined => {
  let left = parsePrimary(state);

  const loop = (): ParsedNode | undefined => {
    const currentLeft = left;
    if (!currentLeft) {
      return undefined;
    }
    const tok = current(state);
    if (!tok) {
      return currentLeft;
    }

    if (tok.kind === TokenKind.SemiSemi) {
      advance(state);
      const combined = parseSpanSequence(state, currentLeft, tok);
      if (combined) {
        left = combined;
        return loop();
      }
      return currentLeft;
    }

    if (tok.kind === TokenKind.At) {
      advance(state);
      skipToplevelNewlines(state);
      const prec = 82;
      const right = parseExpressionWithPrecedence(prec, state);
      if (right) {
        const fullSpan = combineSpan(currentLeft.span, right.span);
        const ast = AstHelpers.call(currentLeft.ast, [right.ast], fullSpan);
        const cst = cstInfix(tok.kind, [currentLeft.cst, cstToken(tok), right.cst]);
        left = { ast, cst, span: fullSpan };
        return loop();
      }
      return currentLeft;
    }

    if (
      tok.kind === TokenKind.Comma ||
      tok.kind === TokenKind.CloseCurly ||
      tok.kind === TokenKind.BarGreater ||
      tok.kind === TokenKind.CloseSquare ||
      tok.kind === TokenKind.CloseParen
    ) {
      return currentLeft;
    }

    const infix = infixInfo(tok.kind);
    if (!infix || infix.precedence < minPrec) {
      return currentLeft;
    }

    advance(state);
    skipToplevelNewlines(state);
    const nextMin =
      infix.assoc === Associativity.Left
        ? infix.precedence + 1
        : infix.precedence;
    const right = parseExpressionWithPrecedence(nextMin, state);
    if (!right) {
      return currentLeft;
    }

    let adjustedRight = right;
    if (tok.kind === TokenKind.StarCaret) {
      const tenSpan = tok.span;
      const tenAst = AstHelpers.leaf(TokenKind.Integer, '10', tenSpan);
      const head = AstHelpers.leaf(TokenKind.Symbol, 'Power', tenSpan);
      const powerSpan = combineSpan(tenSpan, right.span);
      const ast = AstHelpers.call(head, [tenAst, right.ast], powerSpan);
      adjustedRight = { ast, cst: right.cst, span: powerSpan };
    }

    const head = AstHelpers.leaf(TokenKind.Symbol, infix.head, tok.span);
    const fullSpan = combineSpan(currentLeft.span, adjustedRight.span);
    const ast = AstHelpers.call(head, [currentLeft.ast, adjustedRight.ast], fullSpan);
    const cst = cstInfix(tok.kind, [currentLeft.cst, cstToken(tok), right.cst]);
    left = { ast, cst, span: fullSpan };
    return loop();
  };

  return loop();
};

const parsePrimary = (state: ParserState): ParsedNode | undefined => {
  skipToplevelNewlines(state);
  const atom = parseAtom(state);
  if (!atom) {
    return undefined;
  }
  return parsePostfix(state, atom);
};

const parseAtom = (state: ParserState): ParsedNode | undefined => {
  const tok = current(state);
  if (!tok) {
    return undefined;
  }
  advance(state);
  switch (tok.kind) {
    case TokenKind.Integer:
    case TokenKind.Real:
    case TokenKind.Symbol:
    case TokenKind.String: {
      const ast = astLeafFromToken(tok);
      const cst = cstToken(tok);
      return { ast, cst, span: tok.span };
    }
    case TokenKind.PlusPlus: {
      const operand = parsePrimary(state);
      if (!operand) {
        return undefined;
      }
      const fullSpan = combineSpan(tok.span, operand.span);
      const head = AstHelpers.leaf(TokenKind.Symbol, 'PreIncrement', tok.span);
      const ast = AstHelpers.call(head, [operand.ast], fullSpan);
      const cst = cstInfix(TokenKind.PlusPlus, [cstToken(tok), operand.cst]);
      return { ast, cst, span: fullSpan };
    }
    case TokenKind.Hash:
    case TokenKind.HashHash: {
      const headName = tok.kind === TokenKind.Hash ? 'Slot' : 'SlotSequence';
      let indexTok: Token | undefined;
      if (current(state)?.kind === TokenKind.Integer) {
        indexTok = current(state);
        advance(state);
      }
      const indexAst = indexTok ? astLeafFromToken(indexTok) : implicitInteger('1');
      const head = AstHelpers.leaf(TokenKind.Symbol, headName, tok.span);
      const fullSpan = indexTok ? combineSpan(tok.span, indexTok.span) : tok.span;
      const ast = AstHelpers.call(head, [indexAst], fullSpan);
      const tokens = indexTok ? [cstToken(tok), cstToken(indexTok)] : [cstToken(tok)];
      const cst = cstGroup(tokens);
      return { ast, cst, span: fullSpan };
    }
    case TokenKind.OpenCurly: {
      const items: ParsedNode[] = [];
      const cstItems: Cst[] = [cstToken(tok)];
      while (true) {
        const next = current(state);
        if (next?.kind === TokenKind.CloseCurly) {
          advance(state);
          cstItems.push(cstToken(next));
          const args = items.map((i) => i.ast);
          const head = AstHelpers.leaf(TokenKind.Symbol, 'List', tok.span);
          const fullSpan = combineSpan(tok.span, next.span);
          const ast = AstHelpers.call(head, args, fullSpan);
          const cst = cstGroup(cstItems);
          return { ast, cst, span: fullSpan };
        }
        const expr = parseExpression(state);
        if (!expr) {
          state.issues.push(issue(IssueSeverity.Error, 'Unclosed list', tok.span));
          return undefined;
        }
        items.push(expr);
        cstItems.push(expr.cst);
        const comma = current(state);
        if (comma?.kind === TokenKind.Comma) {
          advance(state);
          cstItems.push(cstToken(comma));
        }
      }
    }
    case TokenKind.LessBar: {
      const items: ParsedNode[] = [];
      const cstItems: Cst[] = [cstToken(tok)];
      while (true) {
        const next = current(state);
        if (next?.kind === TokenKind.BarGreater) {
          advance(state);
          cstItems.push(cstToken(next));
          const args = items.map((i) => i.ast);
          const head = AstHelpers.leaf(TokenKind.Symbol, 'Association', tok.span);
          const fullSpan = combineSpan(tok.span, next.span);
          const ast = AstHelpers.call(head, args, fullSpan);
          const cst = cstGroup(cstItems);
          return { ast, cst, span: fullSpan };
        }
        const expr = parseExpression(state);
        if (!expr) {
          state.issues.push(issue(IssueSeverity.Error, 'Unclosed association', tok.span));
          return undefined;
        }
        items.push(expr);
        cstItems.push(expr.cst);
        const comma = current(state);
        if (comma?.kind === TokenKind.Comma) {
          advance(state);
          cstItems.push(cstToken(comma));
        }
      }
    }
    case TokenKind.OpenParen: {
      const inner = parseExpression(state);
      const close = current(state);
      if (close?.kind === TokenKind.CloseParen) {
        advance(state);
        if (inner) {
          const cst = cstGroup([inner.cst]);
          const span = combineSpan(tok.span, close.span);
          return { ast: inner.ast, cst, span };
        }
        state.issues.push(
          issue(IssueSeverity.Error, 'Empty parenthesized expression', tok.span),
        );
        return {
          ast: AstHelpers.error('Empty group', tok.span),
          cst: { type: 'error', message: 'empty group', span: tok.span },
          span: tok.span,
        };
      }
      state.issues.push(
        issue(IssueSeverity.Error, 'Unclosed parenthesized expression', tok.span),
      );
      return inner ?? undefined;
    }
    case TokenKind.Minus: {
      const operand = parsePrimary(state);
      if (!operand) {
        return undefined;
      }
      const fullSpan = combineSpan(tok.span, operand.span);
      const head = AstHelpers.leaf(TokenKind.Symbol, 'Minus', tok.span);
      const ast = AstHelpers.call(head, [operand.ast], fullSpan);
      const cst = cstInfix(TokenKind.Minus, [cstToken(tok), operand.cst]);
      return { ast, cst, span: fullSpan };
    }
    case TokenKind.SemiSemi:
      return parseSpanSequence(state, undefined, tok);
    default:
      state.issues.push(issue(IssueSeverity.Error, `Unexpected token '${tok.text}'`, tok.span));
      return {
        ast: AstHelpers.error('Unexpected token', tok.span),
        cst: { type: 'error', message: 'unexpected token', span: tok.span },
        span: tok.span,
      };
  }
};

const parsePostfix = (state: ParserState, startNode: ParsedNode): ParsedNode | undefined => {
  let currentNode: ParsedNode = startNode;
  const loop = (): ParsedNode | undefined => {
    const tok = current(state);
    if (!tok) {
      return currentNode;
    }

    if (tok.kind === TokenKind.OpenSquare) {
      advance(state);
      const next = current(state);
      if (next?.kind === TokenKind.OpenSquare) {
        advance(state);
        const args: ParsedNode[] = [];
        const cstItems: Cst[] = [currentNode.cst, cstToken(tok), cstToken(next)];
        while (true) {
          const closeCandidate = current(state);
          if (closeCandidate?.kind === TokenKind.CloseSquare) {
            advance(state);
            let closeSecond = current(state);
            if (closeSecond?.kind === TokenKind.CloseSquare) {
              advance(state);
            } else {
              state.issues.push(
                issue(
                  IssueSeverity.Error,
                  "Expected closing ']]' for Part expression",
                  closeCandidate.span,
                ),
              );
              closeSecond = closeCandidate;
            }
            if (closeSecond) {
              cstItems.push(cstToken(closeCandidate), cstToken(closeSecond));
              const head = AstHelpers.leaf(TokenKind.Symbol, 'Part', tok.span);
              const argAsts = [currentNode.ast, ...args.map((a) => a.ast)];
              const fullSpan = combineSpan(currentNode.span, closeSecond.span);
              const ast = AstHelpers.call(head, argAsts, fullSpan);
              const cst = cstGroup(cstItems);
              currentNode = { ast, cst, span: fullSpan };
              return loop();
            }
            return undefined;
          }
          const expr = parseExpressionWithPrecedence(2, state);
          if (!expr) {
            state.issues.push(
              issue(IssueSeverity.Error, 'Unclosed Part expression', tok.span),
            );
            return undefined;
          }
          args.push(expr);
          cstItems.push(expr.cst);
          const comma = current(state);
          if (comma?.kind === TokenKind.Comma) {
            advance(state);
            cstItems.push(cstToken(comma));
          }
        }
      } else {
        const args: ParsedNode[] = [];
        const cstItems: Cst[] = [currentNode.cst, cstToken(tok)];
        while (true) {
          const closeCandidate = current(state);
          if (closeCandidate?.kind === TokenKind.CloseSquare) {
            advance(state);
            cstItems.push(cstToken(closeCandidate));
            const fullSpan = combineSpan(currentNode.span, closeCandidate.span);
            const ast = AstHelpers.call(
              currentNode.ast,
              args.map((a) => a.ast),
              fullSpan,
            );
            const cst = cstGroup(cstItems);
            currentNode = { ast, cst, span: fullSpan };
            return loop();
          }
          const expr = parseExpressionWithPrecedence(2, state);
          if (!expr) {
            state.issues.push(
              issue(IssueSeverity.Error, 'Unclosed function call', tok.span),
            );
            return undefined;
          }
          args.push(expr);
          cstItems.push(expr.cst);
          const comma = current(state);
          if (comma?.kind === TokenKind.Comma) {
            advance(state);
            cstItems.push(cstToken(comma));
          }
        }
      }
    }

    if (tok.kind === TokenKind.Amp) {
      advance(state);
      const head = AstHelpers.leaf(TokenKind.Symbol, 'Function', tok.span);
      const fullSpan = combineSpan(currentNode.span, tok.span);
      const ast = AstHelpers.call(head, [currentNode.ast], fullSpan);
      const cst = cstGroup([currentNode.cst, cstToken(tok)]);
      currentNode = { ast, cst, span: fullSpan };
      return loop();
    }

    if (tok.kind === TokenKind.PlusPlus) {
      advance(state);
      const head = AstHelpers.leaf(TokenKind.Symbol, 'Increment', tok.span);
      const fullSpan = combineSpan(currentNode.span, tok.span);
      const ast = AstHelpers.call(head, [currentNode.ast], fullSpan);
      const cst = cstGroup([currentNode.cst, cstToken(tok)]);
      currentNode = { ast, cst, span: fullSpan };
      return loop();
    }

    return currentNode;
  };

  return loop();
};

const promoteToplevelNewlines = (tokens: Token<TokenStr>[]): Token<TokenStr>[] => {
  const result: Token<TokenStr>[] = [];
  let depth = 0;
  for (const tok of tokens) {
    const promoted =
      tok.kind === TokenKind.Newline && depth === 0
        ? { ...tok, kind: TokenKind.ToplevelNewline }
        : tok;
    result.push(promoted);
    switch (tok.kind) {
      case TokenKind.OpenParen:
      case TokenKind.OpenSquare:
      case TokenKind.OpenCurly:
      case TokenKind.LessBar:
        depth += 1;
        break;
      case TokenKind.CloseParen:
      case TokenKind.CloseSquare:
      case TokenKind.CloseCurly:
      case TokenKind.BarGreater:
        depth = Math.max(depth - 1, 0);
        break;
      default:
        break;
    }
  }
  return result;
};

const pruneDanglingToplevelNewlines = (tokens: Token<TokenStr>[]): Token<TokenStr>[] => {
  const withoutTrailing: Token<TokenStr>[] = [];
  let seenExprAfter = false;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (tok.kind === TokenKind.ToplevelNewline && !seenExprAfter) {
      continue;
    }
    if (
      tok.kind !== TokenKind.ToplevelNewline &&
      tok.kind !== TokenKind.Semi &&
      tok.kind !== TokenKind.SemiSemi
    ) {
      seenExprAfter = true;
    }
    withoutTrailing.push(tok);
  }
  withoutTrailing.reverse();

  const result: Token<TokenStr>[] = [];
  let allow = false;
  for (const tok of withoutTrailing) {
    if (tok.kind === TokenKind.ToplevelNewline) {
      if (allow) {
        result.push(tok);
        allow = false;
      }
    } else {
      result.push(tok);
      allow = true;
    }
  }
  return result;
};

const isImplicitTimesLeft = (kind: TokenKind) => {
  switch (kind) {
    case TokenKind.Integer:
    case TokenKind.Real:
    case TokenKind.Rational:
    case TokenKind.Symbol:
    case TokenKind.String:
    case TokenKind.CloseParen:
    case TokenKind.CloseSquare:
    case TokenKind.BarGreater:
    case TokenKind.CloseCurly:
    case TokenKind.Hash:
    case TokenKind.HashHash:
    case TokenKind.SingleQuote:
      return true;
    default:
      return false;
  }
};

const isImplicitTimesRight = (kind: TokenKind) => {
  switch (kind) {
    case TokenKind.Symbol:
    case TokenKind.Integer:
    case TokenKind.Real:
    case TokenKind.Rational:
    case TokenKind.String:
    case TokenKind.OpenParen:
    case TokenKind.OpenCurly:
    case TokenKind.LessBar:
    case TokenKind.Hash:
    case TokenKind.HashHash:
      return true;
    default:
      return false;
  }
};

const insertImplicitTimes = (tokens: Token<TokenStr>[]): Token<TokenStr>[] => {
  const result: Token<TokenStr>[] = [];
  let prev: Token<TokenStr> | undefined;
  let prevPrev: Token<TokenStr> | undefined;
  for (const tok of tokens) {
    if (
      prev &&
      ((prev.kind === TokenKind.PlusPlus &&
        prevPrev &&
        isImplicitTimesLeft(prevPrev.kind) &&
        isImplicitTimesRight(tok.kind)) ||
        (prev.kind !== TokenKind.PlusPlus &&
          isImplicitTimesLeft(prev.kind) &&
          isImplicitTimesRight(tok.kind)))
    ) {
      const span: Span = { start: prev.span.end, end: prev.span.end };
      result.push({ kind: TokenKind.Fake_ImplicitTimes, text: '', span });
    }
    result.push(tok);
    prevPrev = prev;
    prev = tok;
  }
  return result;
};

const parseTokensInternal = (
  tokens: Token<TokenStr>[],
  opts: ParseOptions,
): { astSeq: NodeSeq<Ast>; cstSeq: NodeSeq<Cst>; issues: Issue[]; span: Span } => {
  const tokensWithNewlines = promoteToplevelNewlines(tokens);
  const filtered = tokensWithNewlines.filter(
    (t) =>
      t.kind !== TokenKind.Whitespace &&
      t.kind !== TokenKind.Newline &&
      t.kind !== TokenKind.InternalNewline &&
      t.kind !== TokenKind.Comment &&
      t.kind !== TokenKind.EndOfFile,
  );
  const pruned = pruneDanglingToplevelNewlines(filtered);
  const ready = opts.quirkSettings.allowImplicitTimes
    ? insertImplicitTimes(pruned)
    : pruned;
  const state: ParserState = { tokens: ready, index: 0, issues: [] };
  const parsed = parseExpression(state);
  if (parsed) {
    return {
      astSeq: NodeSeq.ofList([parsed.ast]),
      cstSeq: NodeSeq.ofList([parsed.cst]),
      issues: [...state.issues],
      span: parsed.span,
    };
  }
  const zero = { start: PositionHelpers.start(), end: PositionHelpers.start() };
  return {
    astSeq: NodeSeq.empty(),
    cstSeq: NodeSeq.empty(),
    issues: [...state.issues],
    span: zero,
  };
};

const expectSingle = <T>(
  name: string,
  result: ParseResult<NodeSeq<T>>,
): ParseResult<T> => {
  const items = result.syntax.toArray();
  if (items.length === 1) {
    return {
      syntax: items[0],
      unsafeCharacterEncoding: result.unsafeCharacterEncoding,
      fatalIssues: result.fatalIssues,
      nonFatalIssues: result.nonFatalIssues,
      tracked: result.tracked,
    };
  }
  const extraIssue = issue(IssueSeverity.Error, `${name} expected a single expression`);
  return {
    syntax: (undefined as unknown) as T,
    unsafeCharacterEncoding: result.unsafeCharacterEncoding,
    fatalIssues: [extraIssue, ...result.fatalIssues],
    nonFatalIssues: result.nonFatalIssues,
    tracked: result.tracked,
  };
};

const decodeTokens = (
  input: string | Uint8Array | Buffer,
  opts: ParseOptions,
): { ok: true; tokens: NodeSeq<Token<TokenStr>> } | { ok: false; flag: UnsafeCharacterEncoding } => {
  const bytes =
    typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  const tokenResult = tokenizer.tokenizeBytes(bytes, opts);
  if (!tokenResult.ok) {
    return { ok: false, flag: tokenResult.error };
  }
  return { ok: true, tokens: tokenResult.value };
};

export const parseCstSeq = (
  input: string,
  options: ParseOptions = ParseOptionsDefault,
): ParseResult<NodeSeq<Cst>> => {
  const opts = options ?? ParseOptionsDefault;
  const decoded = decodeTokens(input, opts);
  if (!decoded.ok) {
    const fatalIssue = issue(IssueSeverity.Error, 'Unable to decode input as UTF-8');
    return {
      syntax: NodeSeq.empty(),
      unsafeCharacterEncoding: decoded.flag,
      fatalIssues: [fatalIssue],
      nonFatalIssues: [],
      tracked: TrackedSourceLocationsEmpty,
    };
  }
  const tokenList = decoded.tokens.toArray();
  const { cstSeq, issues } = parseTokensInternal(tokenList, opts);
  return {
    syntax: cstSeq,
    unsafeCharacterEncoding: undefined,
    fatalIssues: issues,
    nonFatalIssues: [],
    tracked: { tokens: tokenList.map((t) => t.span) },
  };
};

export const parseBytesCstSeq = (
  bytes: Uint8Array | Buffer,
  options: ParseOptions = ParseOptionsDefault,
): ParseResult<NodeSeq<Cst>> => {
  const opts = options ?? ParseOptionsDefault;
  const decoded = decodeTokens(bytes, opts);
  if (!decoded.ok) {
    const fatalIssue = issue(IssueSeverity.Error, 'Unable to decode input as UTF-8');
    return {
      syntax: NodeSeq.empty(),
      unsafeCharacterEncoding: decoded.flag,
      fatalIssues: [fatalIssue],
      nonFatalIssues: [],
      tracked: TrackedSourceLocationsEmpty,
    };
  }
  const tokenList = decoded.tokens.toArray();
  const { cstSeq, issues } = parseTokensInternal(tokenList, opts);
  return {
    syntax: cstSeq,
    unsafeCharacterEncoding: undefined,
    fatalIssues: issues,
    nonFatalIssues: [],
    tracked: { tokens: tokenList.map((t) => t.span) },
  };
};

export const parseCst = (
  input: string,
  options: ParseOptions = ParseOptionsDefault,
): ParseResult<Cst> => expectSingle('parse_cst', parseCstSeq(input, options));

export const parseBytesCst = (
  bytes: Uint8Array | Buffer,
  options: ParseOptions = ParseOptionsDefault,
): ParseResult<Cst> => expectSingle('parse_bytes_cst', parseBytesCstSeq(bytes, options));

export const parseAstSeq = (
  input: string,
  options: ParseOptions = ParseOptionsDefault,
): ParseResult<NodeSeq<Ast>> => {
  const opts = options ?? ParseOptionsDefault;
  try {
    const decoded = decodeTokens(input, opts);
    if (!decoded.ok) {
      const fatalIssue = issue(IssueSeverity.Error, 'Unable to decode input as UTF-8');
      return {
        syntax: NodeSeq.empty(),
        unsafeCharacterEncoding: decoded.flag,
        fatalIssues: [fatalIssue],
        nonFatalIssues: [],
        tracked: TrackedSourceLocationsEmpty,
      };
    }
    const tokenList = decoded.tokens.toArray();
    const { astSeq, issues, span } = parseTokensInternal(tokenList, opts);
    return {
      syntax: astSeq,
      unsafeCharacterEncoding: undefined,
      fatalIssues: issues,
      nonFatalIssues: [],
      tracked: {
        tokens: tokenList.length === 0 ? [] : [span],
      },
    };
  } catch (error) {
    const panicIssue = issue(
      IssueSeverity.Error,
      `Parser panic: ${(error as Error).message}`,
    );
    return {
      syntax: NodeSeq.empty(),
      unsafeCharacterEncoding: undefined,
      fatalIssues: [panicIssue],
      nonFatalIssues: [],
      tracked: TrackedSourceLocationsEmpty,
    };
  }
};

export const parseBytesAstSeq = (
  bytes: Uint8Array | Buffer,
  options: ParseOptions = ParseOptionsDefault,
): ParseResult<NodeSeq<Ast>> => {
  const opts = options ?? ParseOptionsDefault;
  const decoded = decodeTokens(bytes, opts);
  if (!decoded.ok) {
    const fatalIssue = issue(IssueSeverity.Error, 'Unable to decode input as UTF-8');
    return {
      syntax: NodeSeq.empty(),
      unsafeCharacterEncoding: decoded.flag,
      fatalIssues: [fatalIssue],
      nonFatalIssues: [],
      tracked: TrackedSourceLocationsEmpty,
    };
  }
  const tokenList = decoded.tokens.toArray();
  const { astSeq, issues, span } = parseTokensInternal(tokenList, opts);
  return {
    syntax: astSeq,
    unsafeCharacterEncoding: undefined,
    fatalIssues: issues,
    nonFatalIssues: [],
    tracked: {
      tokens: tokenList.length === 0 ? [] : [span],
    },
  };
};

export const parseAst = (
  input: string,
  options: ParseOptions = ParseOptionsDefault,
): ParseResult<Ast> => expectSingle('parse_ast', parseAstSeq(input, options));

export const parseBytesAst = (
  bytes: Uint8Array | Buffer,
  options: ParseOptions = ParseOptionsDefault,
): ParseResult<Ast> => expectSingle('parse_bytes_ast', parseBytesAstSeq(bytes, options));

export const tokenize = tokenizer.tokenize;
export const tokenizeBytes = tokenizer.tokenizeBytes;
