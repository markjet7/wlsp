import { TokenKind } from './tokenKinds';

export interface Position {
  line: number;
  column: number;
}

export const PositionHelpers = {
  start(): Position {
    return { line: 1, column: 1 };
  },
  advance(ch: string, pos: Position): Position {
    if (ch === '\n') {
      return { line: pos.line + 1, column: 1 };
    }
    return { line: pos.line, column: pos.column + 1 };
  },
};

export interface Span {
  start: Position;
  end: Position;
}

export const SpanHelpers = {
  covering(a: Span, b: Span): Span {
    return { start: a.start, end: b.end };
  },
};

export type Source = { kind: 'span'; span: Span } | { kind: 'unknown' };

export enum IssueSeverity {
  Info = 'Info',
  Warning = 'Warning',
  Error = 'Error',
}

export interface Issue {
  severity: IssueSeverity;
  message: string;
  span?: Span;
}

export interface CodeAction {
  title: string;
  replacement?: string;
  span?: Span;
}

export interface TrackedSourceLocations {
  tokens: Span[];
}

export const TrackedSourceLocationsEmpty: TrackedSourceLocations = {
  tokens: [],
};

export interface Metadata {
  source: Source;
  syntaxIssues?: Issue[];
  confidenceLevel?: number;
  codeActions?: CodeAction[];
  fileName?: string;
  embeddedTabs?: boolean;
  embeddedNewlines?: boolean;
  simpleLineContinuations?: boolean;
  complexLineContinuations?: boolean;
}

export interface QuirkSettings {
  allowImplicitTimes: boolean;
  allowUnicodeLetters: boolean;
}

export const QuirkSettingsDefault: QuirkSettings = {
  allowImplicitTimes: true,
  allowUnicodeLetters: true,
};

export enum FirstLineBehavior {
  NotScript = 'NotScript',
  Check = 'Check',
  Script = 'Script',
}

export enum EncodingMode {
  Normal = 'Normal',
  Box = 'Box',
}

export enum SourceConvention {
  LineColumn = 'LineColumn',
  CharacterIndex = 'CharacterIndex',
}

export interface ParseOptions {
  firstLineBehavior: FirstLineBehavior;
  sourceConvention: SourceConvention;
  encodingMode: EncodingMode;
  tabWidth: number;
  checkIssues: boolean;
  computeOutOfBounds: boolean;
  quirkSettings: QuirkSettings;
}

export const ParseOptionsDefault: ParseOptions = {
  firstLineBehavior: FirstLineBehavior.NotScript,
  sourceConvention: SourceConvention.LineColumn,
  encodingMode: EncodingMode.Normal,
  tabWidth: 4,
  checkIssues: true,
  computeOutOfBounds: true,
  quirkSettings: QuirkSettingsDefault,
};

export enum UnsafeCharacterEncoding {
  Bom = 'Bom',
  InvalidUtf8 = 'InvalidUtf8',
  NonAscii = 'NonAscii',
  Custom = 'Custom',
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export class NodeSeq<T> {
  private readonly items: T[];

  constructor(items: T[] = []) {
    this.items = items.slice();
  }

  static empty<TValue>(): NodeSeq<TValue> {
    return new NodeSeq<TValue>([]);
  }

  static ofList<TValue>(items: TValue[]): NodeSeq<TValue> {
    return new NodeSeq(items);
  }

  toArray(): T[] {
    return this.items.slice();
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  append(item: T): NodeSeq<T> {
    return new NodeSeq([...this.items, item]);
  }
}

export interface Token<TText = string> {
  kind: TokenKind;
  text: TText;
  span: Span;
}

export type TokenStr = string;

export interface OperatorNode<TText = string> {
  op: TokenKind;
  children: NodeSeq<Cst<TText>>;
}

export type Cst<TText = string> =
  | { type: 'token'; token: Token<TText> }
  | { type: 'infix'; node: OperatorNode<TText> }
  | { type: 'group'; children: NodeSeq<Cst<TText>> }
  | { type: 'error'; message: string; span?: Span };

export interface AstMetadata {
  source: Source;
  issues: Issue[];
}

export const AstMetadataEmpty: AstMetadata = {
  source: { kind: 'unknown' },
  issues: [],
};

interface AstBase {
  metadata: AstMetadata;
}

export interface AstLeaf extends AstBase {
  type: 'leaf';
  kind: TokenKind;
  text: string;
}

export interface AstError extends AstBase {
  type: 'error';
  message: string;
}

export interface AstCall extends AstBase {
  type: 'call';
  head: Ast;
  args: Ast[];
}

export type Ast = AstLeaf | AstError | AstCall;

export const AstHelpers = {
  metadata(span: Span): AstMetadata {
    return { source: { kind: 'span', span }, issues: [] };
  },
  leaf(kind: TokenKind, text: string, span: Span): AstLeaf {
    return { type: 'leaf', kind, text, metadata: this.metadata(span) };
  },
  call(head: Ast, args: Ast[], span: Span): AstCall {
    return { type: 'call', head, args, metadata: this.metadata(span) };
  },
  error(message: string, span: Span): AstError {
    return { type: 'error', message, metadata: this.metadata(span) };
  },
};

export interface ParseResult<TSyntax> {
  syntax: TSyntax;
  unsafeCharacterEncoding?: UnsafeCharacterEncoding;
  fatalIssues: Issue[];
  nonFatalIssues: Issue[];
  tracked: TrackedSourceLocations;
}
