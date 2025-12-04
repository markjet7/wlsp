namespace FwlParser

open System

// ------------------------
// Source and span tracking
// ------------------------

[<Struct>]
type Position =
    { Line: int
      Column: int }

module Position =
    let start = { Line = 1; Column = 1 }

    let advance (ch: char) (pos: Position) =
        if ch = '\n' then
            { Line = pos.Line + 1; Column = 1 }
        else
            { pos with Column = pos.Column + 1 }

[<Struct>]
type Span =
    { Start: Position
      EndPos: Position }

module Span =
    let covering a b =
        { Start = a.Start
          EndPos = b.EndPos }

type Source =
    | Span of Span
    | Unknown

// ----------------
// Diagnostics data
// ----------------

type UnsafeCharacterEncoding =
    | Bom
    | InvalidUtf8
    | NonAscii
    | Custom of string

type IssueSeverity =
    | Info
    | Warning
    | Error

type Issue =
    { Severity: IssueSeverity
      Message: string
      Span: Span option }

type CodeAction =
    { Title: string
      Replacement: string option
      Span: Span option }

type TrackedSourceLocations =
    { Tokens: Span list }
    static member Empty = { Tokens = [] }

type Metadata =
    { Source: Source
      SyntaxIssues: Issue list option
      ConfidenceLevel: decimal option
      CodeActions: CodeAction list option
      FileName: string option
      EmbeddedTabs: bool option
      EmbeddedNewlines: bool option
      SimpleLineContinuations: bool option
      ComplexLineContinuations: bool option }
    static member Empty =
        { Source = Source.Unknown
          SyntaxIssues = None
          ConfidenceLevel = None
          CodeActions = None
          FileName = None
          EmbeddedTabs = None
          EmbeddedNewlines = None
          SimpleLineContinuations = None
          ComplexLineContinuations = None }

[<StructuralEquality; StructuralComparison>]
type NodeSeq<'a> = NodeSeq of 'a list with
    member this.ToList() = let (NodeSeq items) = this in items
    member this.IsEmpty =
        match this with
        | NodeSeq items -> List.isEmpty items
    member this.Append(item) =
        let (NodeSeq items) = this
        NodeSeq(items @ [ item ])

module NodeSeq =
    let empty<'a> : NodeSeq<'a> = NodeSeq []
    let ofList items = NodeSeq items

// ----------
// Containers
// ----------

type ContainerKind =
    | String
    | File
    | Byte
    | Box
    | Cell
    | Hold

type ContainerMissingReason =
    | EmptyInput
    | UnsafeCharacterEncoding of UnsafeCharacterEncoding

type ContainerBody<'a> =
    | Nodes of NodeSeq<'a>
    | Missing of ContainerMissingReason

and Container<'a> =
    { Kind: ContainerKind
      Body: ContainerBody<'a>
      Metadata: Metadata }

// ------
// Quirks
// ------

type QuirkSettings =
    { AllowImplicitTimes: bool
      AllowUnicodeLetters: bool }
    static member Default =
        { AllowImplicitTimes = true
          AllowUnicodeLetters = true }

// -----------
// Parse setup
// -----------

type FirstLineBehavior =
    | NotScript
    | Check
    | Script

type EncodingMode =
    | Normal
    | Box

type SourceConvention =
    | LineColumn
    | CharacterIndex

type ParseOptions =
    { FirstLineBehavior: FirstLineBehavior
      SourceConvention: SourceConvention
      EncodingMode: EncodingMode
      TabWidth: int
      CheckIssues: bool
      ComputeOutOfBounds: bool
      QuirkSettings: QuirkSettings }
    static member Default =
        { FirstLineBehavior = FirstLineBehavior.NotScript
          SourceConvention = SourceConvention.LineColumn
          EncodingMode = EncodingMode.Normal
          TabWidth = 4
          CheckIssues = true
          ComputeOutOfBounds = true
          QuirkSettings = QuirkSettings.Default }
    member this.WithTabWidth width = { this with TabWidth = width }
    member this.WithSourceConvention convention =
        { this with SourceConvention = convention }
    member this.WithFirstLineBehavior behavior =
        { this with FirstLineBehavior = behavior }

type ParseResult<'syntax> =
    { Syntax: 'syntax
      UnsafeCharacterEncoding: UnsafeCharacterEncoding option
      FatalIssues: Issue list
      NonFatalIssues: Issue list
      Tracked: TrackedSourceLocations }

// -------------
// Tokenization
// -------------

type TokenKind =
    | Unknown
    | EndOfFile
    | Symbol
    | String
    | Integer
    | Real
    | Rational
    | LinearSyntaxBlob
    | InternalNewline
    | Comment
    | Whitespace
    | Buffer1
    | ToplevelNewline
    | Buffer2
    | Buffer3
    | Buffer4
    | Error_ExpectedEqual
    | Error_Number
    | Error_UnhandledCharacter
    | Error_ExpectedLetterlike
    | Error_Aborted
    | Error_ExpectedOperand
    | Error_ExpectedTag
    | Error_ExpectedFile
    | Error_UnexpectedCloser
    | Error_PrefixImplicitNull
    | Error_InfixImplicitNull
    | Error_UnsafeCharacterEncoding
    | Error_UnterminatedComment
    | Error_UnterminatedString
    | Error_UnterminatedFileString
    | Error_UnterminatedLinearSyntaxBlob
    | Error_UnsupportedToken
    | Error_UnexpectedCommentCloser
    | Dot
    | Colon
    | OpenParen
    | CloseParen
    | OpenSquare
    | CloseSquare
    | Comma
    | OpenCurly
    | CloseCurly
    | Equal
    | Bang
    | Under
    | Less
    | Greater
    | Minus
    | Bar
    | Semi
    | Hash
    | Amp
    | Slash
    | At
    | Plus
    | Tilde
    | Star
    | StarCaret
    | Caret
    | SingleQuote
    | Percent
    | Question
    | DotDot
    | ColonColon
    | ColonEqual
    | ColonGreater
    | EqualEqual
    | UnderUnder
    | UnderDot
    | LessBar
    | LessLess
    | LessGreater
    | LessEqual
    | GreaterGreater
    | GreaterEqual
    | MinusGreater
    | MinusMinus
    | MinusEqual
    | BarBar
    | BarGreater
    | SemiSemi
    | AmpAmp
    | SlashAt
    | SlashSemi
    | SlashDot
    | SlashSlash
    | SlashColon
    | SlashEqual
    | SlashStar
    | AtAt
    | AtStar
    | PlusPlus
    | PlusEqual
    | TildeTilde
    | StarEqual
    | StarStar
    | CaretEqual
    | HashHash
    | BangEqual
    | BangBang
    | QuestionQuestion
    | DotDotDot
    | EqualEqualEqual
    | EqualBangEqual
    | UnderUnderUnder
    | SlashSlashDot
    | AtAtAt
    | LessMinusGreater
    | SlashSlashAt
    | CaretColonEqual
    | GreaterGreaterGreater
    | BarMinusGreater
    | SlashSlashEqual
    | ColonColonOpenSquare
    | PercentPercent
    | LinearSyntax_Bang
    | LinearSyntax_CloseParen
    | LinearSyntax_At
    | LinearSyntax_Amp
    | LinearSyntax_Star
    | LinearSyntax_Under
    | LinearSyntax_Caret
    | LinearSyntax_Space
    | LinearSyntax_Percent
    | LinearSyntax_Plus
    | LinearSyntax_Slash
    | LinearSyntax_BackTick
    | Fake_ImplicitTimes
    | Fake_ImplicitNull
    | Fake_ImplicitOne
    | Fake_ImplicitAll
    | Boxes_OpenParenStar
    | Boxes_StarCloseParen
    | Boxes_MultiSingleQuote
    | Boxes_MultiWhitespace
    | LongName_Not
    | LongName_PlusMinus
    | LongName_CenterDot
    | LongName_Times
    | LongName_Divide
    | LongName_OpenCurlyQuote
    | LongName_CloseCurlyQuote
    | LongName_OpenCurlyDoubleQuote
    | LongName_CloseCurlyDoubleQuote
    | LongName_InvisibleTimes
    | LongName_LeftArrow
    | LongName_UpArrow
    | LongName_RightArrow
    | LongName_DownArrow
    | LongName_LeftRightArrow
    | LongName_UpDownArrow
    | LongName_UpperLeftArrow
    | LongName_UpperRightArrow
    | LongName_LowerRightArrow
    | LongName_LowerLeftArrow
    | LongName_LeftTeeArrow
    | LongName_UpTeeArrow
    | LongName_RightTeeArrow
    | LongName_DownTeeArrow
    | LongName_LeftVector
    | LongName_DownLeftVector
    | LongName_RightUpVector
    | LongName_LeftUpVector
    | LongName_RightVector
    | LongName_DownRightVector
    | LongName_RightDownVector
    | LongName_LeftDownVector
    | LongName_RightArrowLeftArrow
    | LongName_UpArrowDownArrow
    | LongName_LeftArrowRightArrow
    | LongName_ReverseEquilibrium
    | LongName_Equilibrium
    | LongName_DoubleLeftArrow
    | LongName_DoubleUpArrow
    | LongName_DoubleRightArrow
    | LongName_DoubleDownArrow
    | LongName_DoubleLeftRightArrow
    | LongName_DoubleUpDownArrow
    | LongName_LeftArrowBar
    | LongName_RightArrowBar
    | LongName_DownArrowUpArrow
    | LongName_ForAll
    | LongName_PartialD
    | LongName_Exists
    | LongName_NotExists
    | LongName_Del
    | LongName_Element
    | LongName_NotElement
    | LongName_ReverseElement
    | LongName_NotReverseElement
    | LongName_SuchThat
    | LongName_Product
    | LongName_Coproduct
    | LongName_Sum
    | LongName_Minus
    | LongName_MinusPlus
    | LongName_DivisionSlash
    | LongName_Backslash
    | LongName_SmallCircle
    | LongName_Sqrt
    | LongName_CubeRoot
    | LongName_Proportional
    | LongName_Divides
    | LongName_DoubleVerticalBar
    | LongName_NotDoubleVerticalBar
    | LongName_And
    | LongName_Or
    | LongName_Integral
    | LongName_ContourIntegral
    | LongName_DoubleContourIntegral
    | LongName_ClockwiseContourIntegral
    | LongName_CounterClockwiseContourIntegral
    | LongName_Therefore
    | LongName_Because
    | LongName_Colon
    | LongName_Proportion
    | LongName_Tilde
    | LongName_VerticalTilde
    | LongName_NotTilde
    | LongName_EqualTilde
    | LongName_TildeEqual
    | LongName_NotTildeEqual
    | LongName_TildeFullEqual
    | LongName_NotTildeFullEqual
    | LongName_TildeTilde
    | LongName_NotTildeTilde
    | LongName_CupCap
    | LongName_HumpDownHump
    | LongName_HumpEqual
    | LongName_DotEqual
    | LongName_NotEqual
    | LongName_Congruent
    | LongName_NotCongruent
    | LongName_LessEqual
    | LongName_GreaterEqual
    | LongName_LessFullEqual
    | LongName_GreaterFullEqual
    | LongName_NotLessFullEqual
    | LongName_NotGreaterFullEqual
    | LongName_LessLess
    | LongName_GreaterGreater
    | LongName_NotCupCap
    | LongName_NotLess
    | LongName_NotGreater
    | LongName_NotLessEqual
    | LongName_NotGreaterEqual
    | LongName_LessTilde
    | LongName_GreaterTilde
    | LongName_NotLessTilde
    | LongName_NotGreaterTilde
    | LongName_LessGreater
    | LongName_GreaterLess
    | LongName_NotLessGreater
    | LongName_NotGreaterLess
    | LongName_Precedes
    | LongName_Succeeds
    | LongName_PrecedesSlantEqual
    | LongName_SucceedsSlantEqual
    | LongName_PrecedesTilde
    | LongName_SucceedsTilde
    | LongName_NotPrecedes
    | LongName_NotSucceeds
    | LongName_Subset
    | LongName_Superset
    | LongName_NotSubset
    | LongName_NotSuperset
    | LongName_SubsetEqual
    | LongName_SupersetEqual
    | LongName_NotSubsetEqual
    | LongName_NotSupersetEqual
    | LongName_UnionPlus
    | LongName_SquareSubset
    | LongName_SquareSuperset
    | LongName_SquareSubsetEqual
    | LongName_SquareSupersetEqual
    | LongName_SquareIntersection
    | LongName_SquareUnion
    | LongName_CirclePlus
    | LongName_CircleMinus
    | LongName_CircleTimes
    | LongName_CircleDot
    | LongName_RightTee
    | LongName_LeftTee
    | LongName_DownTee
    | LongName_UpTee
    | LongName_DoubleRightTee
    | LongName_LeftTriangle
    | LongName_RightTriangle
    | LongName_LeftTriangleEqual
    | LongName_RightTriangleEqual
    | LongName_Xor
    | LongName_Nand
    | LongName_Nor
    | LongName_Wedge
    | LongName_Vee
    | LongName_Intersection
    | LongName_Union
    | LongName_Diamond
    | LongName_Star
    | LongName_LessEqualGreater
    | LongName_GreaterEqualLess
    | LongName_NotPrecedesSlantEqual
    | LongName_NotSucceedsSlantEqual
    | LongName_NotSquareSubsetEqual
    | LongName_NotSquareSupersetEqual
    | LongName_NotPrecedesTilde
    | LongName_NotSucceedsTilde
    | LongName_NotLeftTriangle
    | LongName_NotRightTriangle
    | LongName_NotLeftTriangleEqual
    | LongName_NotRightTriangleEqual
    | LongName_LeftCeiling
    | LongName_RightCeiling
    | LongName_LeftFloor
    | LongName_RightFloor
    | LongName_Cap
    | LongName_Cup
    | LongName_LeftAngleBracket
    | LongName_RightAngleBracket
    | LongName_Perpendicular
    | LongName_LongLeftArrow
    | LongName_LongRightArrow
    | LongName_LongLeftRightArrow
    | LongName_DoubleLongLeftArrow
    | LongName_DoubleLongRightArrow
    | LongName_DoubleLongLeftRightArrow
    | LongName_UpArrowBar
    | LongName_DownArrowBar
    | LongName_LeftRightVector
    | LongName_RightUpDownVector
    | LongName_DownLeftRightVector
    | LongName_LeftUpDownVector
    | LongName_LeftVectorBar
    | LongName_RightVectorBar
    | LongName_RightUpVectorBar
    | LongName_RightDownVectorBar
    | LongName_DownLeftVectorBar
    | LongName_DownRightVectorBar
    | LongName_LeftUpVectorBar
    | LongName_LeftDownVectorBar
    | LongName_LeftTeeVector
    | LongName_RightTeeVector
    | LongName_RightUpTeeVector
    | LongName_RightDownTeeVector
    | LongName_DownLeftTeeVector
    | LongName_DownRightTeeVector
    | LongName_LeftUpTeeVector
    | LongName_LeftDownTeeVector
    | LongName_UpEquilibrium
    | LongName_ReverseUpEquilibrium
    | LongName_RoundImplies
    | LongName_LeftTriangleBar
    | LongName_RightTriangleBar
    | LongName_Equivalent
    | LongName_LessSlantEqual
    | LongName_GreaterSlantEqual
    | LongName_NestedLessLess
    | LongName_NestedGreaterGreater
    | LongName_PrecedesEqual
    | LongName_SucceedsEqual
    | LongName_DoubleLeftTee
    | LongName_LeftDoubleBracket
    | LongName_RightDoubleBracket
    | LongName_LeftAssociation
    | LongName_RightAssociation
    | LongName_TwoWayRule
    | LongName_Piecewise
    | LongName_ImplicitPlus
    | LongName_AutoLeftMatch
    | LongName_AutoRightMatch
    | LongName_InvisiblePrefixScriptBase
    | LongName_InvisiblePostfixScriptBase
    | LongName_Transpose
    | LongName_Conjugate
    | LongName_ConjugateTranspose
    | LongName_HermitianConjugate
    | LongName_VerticalBar
    | LongName_NotVerticalBar
    | LongName_Distributed
    | LongName_Conditioned
    | LongName_UndirectedEdge
    | LongName_DirectedEdge
    | LongName_ContinuedFractionK
    | LongName_TensorProduct
    | LongName_TensorWedge
    | LongName_ProbabilityPr
    | LongName_ExpectationE
    | LongName_PermutationProduct
    | LongName_NotEqualTilde
    | LongName_NotHumpEqual
    | LongName_NotHumpDownHump
    | LongName_NotLeftTriangleBar
    | LongName_NotRightTriangleBar
    | LongName_NotLessLess
    | LongName_NotNestedLessLess
    | LongName_NotLessSlantEqual
    | LongName_NotGreaterGreater
    | LongName_NotNestedGreaterGreater
    | LongName_NotGreaterSlantEqual
    | LongName_NotPrecedesEqual
    | LongName_NotSucceedsEqual
    | LongName_NotSquareSubset
    | LongName_NotSquareSuperset
    | LongName_Equal
    | LongName_VerticalSeparator
    | LongName_VectorGreater
    | LongName_VectorGreaterEqual
    | LongName_VectorLess
    | LongName_VectorLessEqual
    | LongName_Limit
    | LongName_MaxLimit
    | LongName_MinLimit
    | LongName_Cross
    | LongName_Function
    | LongName_Xnor
    | LongName_DiscreteShift
    | LongName_DifferenceDelta
    | LongName_DiscreteRatio
    | LongName_RuleDelayed
    | LongName_Square
    | LongName_Rule
    | LongName_Implies
    | LongName_ShortRightArrow
    | LongName_ShortLeftArrow
    | LongName_ShortUpArrow
    | LongName_ShortDownArrow
    | LongName_Application
    | LongName_LeftBracketingBar
    | LongName_RightBracketingBar
    | LongName_LeftDoubleBracketingBar
    | LongName_RightDoubleBracketingBar
    | LongName_CapitalDifferentialD
    | LongName_DifferentialD
    | LongName_InvisibleComma
    | LongName_InvisibleApplication
    | LongName_LongEqual
    | Newline  // compatibility helper for existing parser code
type Token<'text> =
    { Kind: TokenKind
      Text: 'text
      Span: Span }

type TokenStr = string

// ------------------
// Concrete syntax
// ------------------

type OperatorNode<'a> =
    { Op: TokenKind
      Children: NodeSeq<Cst<'a>> }

and Cst<'a> =
    | Token of Token<'a>
    | Infix of OperatorNode<'a>
    | Group of NodeSeq<Cst<'a>>
    | Error of string * Span option

type CstSeq<'a> = NodeSeq<Cst<'a>>

// -----------------
// Abstract syntax
// -----------------

type AstMetadata =
    { Source: Source
      Issues: Issue list }
    static member Empty =
        { Source = Source.Unknown
          Issues = [] }

type Ast =
    | Leaf of kind: TokenKind * input: string * data: AstMetadata
    | Error of message: string * data: AstMetadata
    | Call of head: Ast * args: Ast list * data: AstMetadata

module Ast =
    let metadata span =
        { AstMetadata.Empty with
            Source = Source.Span span }

    let leaf kind text span =
        Leaf(kind, text, metadata span)

    let call head args span =
        Call(head, args, metadata span)
