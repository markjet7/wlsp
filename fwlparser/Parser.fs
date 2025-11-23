namespace FwlParser

open System
open System.Text

open FwlParser
open FwlParser.Tokenizer
open FwlParser.Precedence

type private ParserState =
    { Tokens: Token<TokenStr> array
      mutable Index: int
      Issues: ResizeArray<Issue> }

type private Assoc =
    | Left
    | Right
    | NonRight

module private ParserHelpers =
    let issue severity msg span =
        { Severity = severity
          Message = msg
          Span = span }

    let spanFromToken (tok: Token<_>) = tok.Span

    let combineSpan a b = Span.covering a b

    let astLeafFromToken (tok: Token<_>) =
        let data =
            { AstMetadata.Empty with
                Source = Source.Span tok.Span }
        Ast.Leaf(tok.Kind, tok.Text, data)

    let astCall head args span =
        Ast.Call(head, args, Ast.metadata span)

    let cstToken tok = Cst.Token tok

// ----------------
// Token level APIs
// ----------------

module Parser =
    let tokenize (input: string) (opts: ParseOptions) =
        Tokenizer.tokenize input opts

    let tokenizeBytes (bytes: byte[]) (opts: ParseOptions) =
        Tokenizer.tokenizeBytes bytes opts

    // --------------
    // Parsing helpers
    // --------------

    let private isAtEnd (state: ParserState) =
        state.Index >= state.Tokens.Length

    let private current (state: ParserState) =
        if isAtEnd state then
            None
        else
            Some state.Tokens[state.Index]

    let private advance (state: ParserState) =
        if not (isAtEnd state) then
            state.Index <- state.Index + 1

    let private headSymbol kind =
        match kind with
        | TokenKind.Plus -> "Plus"
        | TokenKind.Minus -> "Subtract"
        | TokenKind.Star
        | TokenKind.LongName_Times -> "Times"
        | TokenKind.Slash
        | TokenKind.LongName_Divide -> "Divide"
        | TokenKind.Caret -> "Power"
        | TokenKind.Semi
        | TokenKind.SemiSemi -> "CompoundExpression"
        | TokenKind.Equal -> "Set"
        | TokenKind.ColonEqual -> "SetDelayed"
        | TokenKind.MinusGreater -> "Rule"
        | TokenKind.ColonGreater -> "RuleDelayed"
        | TokenKind.At -> "Prefix"
        | _ -> kind.ToString()

    let private infixInfo kind =
        match Precedence.table.TryGetValue(kind) with
        | true, (prec, assoc) ->
            let assoc' =
                match assoc with
                | Associativity.Left -> Assoc.Left
                | Associativity.Right -> Assoc.Right
                | Associativity.NonRight -> Assoc.Left
            Some(prec, assoc', headSymbol kind)
        | _ ->
            // Fallback defaults for common operators if not found in table
            let fallback =
                match kind with
                | TokenKind.Semi -> Some(1, Assoc.Left)
                | TokenKind.Plus
                | TokenKind.Minus -> Some(10, Assoc.Left)
                | TokenKind.Star
                | TokenKind.Slash -> Some(20, Assoc.Left)
                | TokenKind.Caret -> Some(30, Assoc.Right)
                | _ -> None
            fallback |> Option.map (fun (p, a) -> (p, a, headSymbol kind))

    let rec private parseExpression (state: ParserState) =
        parseExpressionWithPrecedence 1 state

    and private parseExpressionWithPrecedence minPrec (state: ParserState) =
        let mutable leftOpt = parsePrimary state

        let rec loop leftOpt =
            match leftOpt, current state with
            | Some(astLeft, cstLeft, spanLeft), Some tok ->
                match tok.Kind with
                | TokenKind.Comma
                | TokenKind.CloseCurly
                | TokenKind.CloseSquare
                | TokenKind.CloseParen -> leftOpt
                | _ ->
                match infixInfo tok.Kind with
                | Some(prec, assoc, headName) when prec >= minPrec ->
                    advance state
                    let nextMin =
                        match assoc with
                        | Assoc.Left -> prec + 1
                        | Assoc.Right -> prec
                    match parseExpressionWithPrecedence nextMin state with
                    | Some(astRight, cstRight, spanRight) ->
                        let head =
                            Ast.Leaf(TokenKind.Symbol, headName, Ast.metadata tok.Span)
                        let fullSpan = Span.covering spanLeft spanRight
                        let astCombined =
                            Ast.Call(head, [ astLeft; astRight ], Ast.metadata fullSpan)
                        let cstCombined =
                            Cst.Infix
                                { Op = tok.Kind
                                  Children =
                                      NodeSeq.ofList
                                          [ cstLeft
                                            Cst.Token tok
                                            cstRight ] }
                        loop (Some(astCombined, cstCombined, fullSpan))
                    | None -> leftOpt
                | _ -> leftOpt
            | _ -> leftOpt

        loop leftOpt

    and private parsePrimary (state: ParserState) =
        let baseOpt = parseAtom state
        match baseOpt with
        | None -> None
        | Some(atomAst, atomCst, atomSpan) ->
            parsePostfix state (atomAst, atomCst, atomSpan)

    and private parseAtom (state: ParserState) =
        match current state with
        | Some tok ->
            advance state
            match tok.Kind with
            | TokenKind.Integer
            | TokenKind.Real
            | TokenKind.Symbol
            | TokenKind.String ->
                let ast = ParserHelpers.astLeafFromToken tok
                let cst = ParserHelpers.cstToken tok
                Some(ast, cst, tok.Span)
            | TokenKind.OpenCurly ->
                let rec gather accAst accCstRev =
                    match current state with
                    | Some close when close.Kind = TokenKind.CloseCurly ->
                        advance state
                        let args = List.rev accAst
                        let fullSpan = Span.covering tok.Span close.Span
                        let head = Ast.Leaf(TokenKind.Symbol, "List", Ast.metadata tok.Span)
                        let ast = Ast.Call(head, args, Ast.metadata fullSpan)
                        let content = List.rev accCstRev
                        let children = NodeSeq.ofList (Cst.Token tok :: content @ [ Cst.Token close ])
                        let cst = Cst.Group(children)
                        Some(ast, cst, fullSpan)
                    | _ ->
                        match parseExpression state with
                        | Some(ast, cst, _) ->
                            let sep =
                                match current state with
                                | Some comma when comma.Kind = TokenKind.Comma ->
                                    advance state
                                    Some(Cst.Token comma)
                                | _ -> None
                            let nextCstRev =
                                match sep with
                                | Some commaTok -> commaTok :: cst :: accCstRev
                                | None -> cst :: accCstRev
                            gather (ast :: accAst) nextCstRev
                        | None ->
                            let issue =
                                ParserHelpers.issue IssueSeverity.Error "Unclosed list" (Some tok.Span)
                            state.Issues.Add issue
                            None
                gather [] []
            | TokenKind.OpenParen ->
                let exprOpt = parseExpression state
                match current state with
                | Some close when close.Kind = TokenKind.CloseParen ->
                    advance state
                    match exprOpt with
                    | Some(ast, cst, span) ->
                        let fullSpan = Span.covering tok.Span close.Span
                        Some(ast, Cst.Group(NodeSeq.ofList [ cst ]), fullSpan)
                    | None ->
                        let issue =
                            ParserHelpers.issue IssueSeverity.Error "Empty parenthesized expression" (Some tok.Span)
                        state.Issues.Add issue
                        Some(Ast.Error("Empty group", Ast.metadata tok.Span), Cst.Error("empty group", Some tok.Span), tok.Span)
                | _ ->
                    let issue =
                        ParserHelpers.issue IssueSeverity.Error "Unclosed parenthesized expression" (Some tok.Span)
                    state.Issues.Add issue
                    match exprOpt with
                    | Some(ast, cst, span) -> Some(ast, cst, span)
                    | None -> None
            | TokenKind.Minus ->
                match parsePrimary state with
                | Some(ast, cst, span) ->
                    let fullSpan = Span.covering tok.Span span
                    let head = Ast.Leaf(TokenKind.Symbol, "Minus", Ast.metadata tok.Span)
                    let astCall = Ast.Call(head, [ ast ], Ast.metadata fullSpan)
                    let cst =
                        Cst.Infix
                            { Op = TokenKind.Minus
                              Children = NodeSeq.ofList [ Cst.Token tok; cst ] }
                    Some(astCall, cst, fullSpan)
                | None -> None
            | _ ->
                let issue =
                    ParserHelpers.issue IssueSeverity.Error $"Unexpected token '{tok.Text}'" (Some tok.Span)
                state.Issues.Add issue
                Some(Ast.Error("Unexpected token", Ast.metadata tok.Span), Cst.Error("unexpected token", Some tok.Span), tok.Span)
        | None -> None

    and private parsePostfix state (baseAst, baseCst, baseSpan) =
        let rec loop (ast, cst, span) =
            match current state with
            | Some tok when tok.Kind = TokenKind.OpenSquare ->
                advance state
                let rec collect argsAst argsCstRev =
                    match current state with
                    | Some close when close.Kind = TokenKind.CloseSquare ->
                        advance state
                        let fullSpan = Span.covering span close.Span
                        let head = ast
                        let astCombined =
                            Ast.Call(head, List.rev argsAst, Ast.metadata fullSpan)
                        let content = List.rev argsCstRev
                        let children =
                            NodeSeq.ofList (cst :: Cst.Token tok :: content @ [ Cst.Token close ])
                        let cstCombined = Cst.Group(children)
                        Some(astCombined, cstCombined, fullSpan)
                    | _ ->
                        match parseExpressionWithPrecedence 2 state with
                        | Some(astInner, cstInner, _) ->
                            let sep =
                                match current state with
                                | Some comma when comma.Kind = TokenKind.Comma ->
                                    advance state
                                    Some(Cst.Token comma)
                                | _ -> None
                            let nextCstRev =
                                match sep with
                                | Some commaTok -> commaTok :: cstInner :: argsCstRev
                                | None -> cstInner :: argsCstRev
                            collect (astInner :: argsAst) nextCstRev
                        | None ->
                            let issue =
                                ParserHelpers.issue IssueSeverity.Error "Unclosed function call" (Some tok.Span)
                            state.Issues.Add issue
                            None
                match collect [] [] with
                | Some res -> loop res
                | None -> None
            | _ -> Some(ast, cst, span)
        loop (baseAst, baseCst, baseSpan)

    let private parseTokens (tokens: Token<TokenStr> list) =
        let filtered =
            tokens
            |> List.filter (fun t ->
                t.Kind <> TokenKind.Whitespace
                && t.Kind <> TokenKind.Newline
                && t.Kind <> TokenKind.InternalNewline
                && t.Kind <> TokenKind.ToplevelNewline
                && t.Kind <> TokenKind.Comment
                && t.Kind <> TokenKind.EndOfFile)
            |> List.toArray

        let state =
            { Tokens = filtered
              Index = 0
              Issues = ResizeArray() }

        match parseExpression state with
        | Some(ast, cst, span) ->
            let issues = List.ofSeq state.Issues
            let astSeq = NodeSeq.ofList [ ast ]
            let cstSeq = NodeSeq.ofList [ cst ]
            astSeq, cstSeq, issues, span
        | None ->
            NodeSeq.empty, NodeSeq.empty, List.ofSeq state.Issues, { Start = Position.start; EndPos = Position.start }

    // --------------
    // Public parsing
    // --------------

    let private expectSingle name (result: ParseResult<NodeSeq<'a>>) : ParseResult<'a> =
        let items = result.Syntax.ToList()
        match items with
        | [ single ] ->
            { Syntax = single
              UnsafeCharacterEncoding = result.UnsafeCharacterEncoding
              FatalIssues = result.FatalIssues
              NonFatalIssues = result.NonFatalIssues
              Tracked = result.Tracked }
        | _ ->
            let issue =
                ParserHelpers.issue IssueSeverity.Error $"{name} expected a single expression" None
            { Syntax = Unchecked.defaultof<'a>
              UnsafeCharacterEncoding = result.UnsafeCharacterEncoding
              FatalIssues = issue :: result.FatalIssues
              NonFatalIssues = result.NonFatalIssues
              Tracked = result.Tracked }

    let parseCstSeq (input: string) (opts: ParseOptions) =
        match Tokenizer.tokenizeBytes (Encoding.UTF8.GetBytes input) opts with
        | Result.Ok tokens ->
            let (NodeSeq tokenList) = tokens
            let _, cstSeq, issues, _ = parseTokens tokenList
            { Syntax = cstSeq
              UnsafeCharacterEncoding = None
              FatalIssues = issues
              NonFatalIssues = []
              Tracked = { TrackedSourceLocations.Empty with Tokens = tokenList |> List.map (fun t -> t.Span) } }
        | Result.Error flag ->
            { Syntax = NodeSeq.empty
              UnsafeCharacterEncoding = Some flag
              FatalIssues =
                [ ParserHelpers.issue IssueSeverity.Error "Unable to decode input as UTF-8" None ]
              NonFatalIssues = []
              Tracked = TrackedSourceLocations.Empty }

    let parseBytesCstSeq (bytes: byte[]) (opts: ParseOptions) =
        match Tokenizer.tokenizeBytes bytes opts with
        | Result.Ok tokens ->
            let (NodeSeq tokenList) = tokens
            let _, cstSeq, issues, _ = parseTokens tokenList
            { Syntax = cstSeq
              UnsafeCharacterEncoding = None
              FatalIssues = issues
              NonFatalIssues = []
              Tracked = { TrackedSourceLocations.Empty with Tokens = tokenList |> List.map (fun t -> t.Span) } }
        | Result.Error flag ->
            { Syntax = NodeSeq.empty
              UnsafeCharacterEncoding = Some flag
              FatalIssues =
                [ ParserHelpers.issue IssueSeverity.Error "Unable to decode input as UTF-8" None ]
              NonFatalIssues = []
              Tracked = TrackedSourceLocations.Empty }

    let parseCst (input: string) (opts: ParseOptions) =
        parseCstSeq input opts |> expectSingle "parse_cst"

    let parseBytesCst (bytes: byte[]) (opts: ParseOptions) =
        parseBytesCstSeq bytes opts |> expectSingle "parse_bytes_cst"

    let parseAstSeq (input: string) (opts: ParseOptions) =
        match Tokenizer.tokenizeBytes (Encoding.UTF8.GetBytes input) opts with
        | Result.Ok tokens ->
            let (NodeSeq tokenList) = tokens
            let astSeq, _, issues, span = parseTokens tokenList
            { Syntax = astSeq
              UnsafeCharacterEncoding = None
              FatalIssues = issues
              NonFatalIssues = []
              Tracked =
                { TrackedSourceLocations.Empty with
                    Tokens =
                        match tokenList with
                        | [] -> []
                        | _ -> [ span ] } }
        | Result.Error flag ->
            { Syntax = NodeSeq.empty
              UnsafeCharacterEncoding = Some flag
              FatalIssues =
                [ ParserHelpers.issue IssueSeverity.Error "Unable to decode input as UTF-8" None ]
              NonFatalIssues = []
              Tracked = TrackedSourceLocations.Empty }

    let parseBytesAstSeq (bytes: byte[]) (opts: ParseOptions) =
        match Tokenizer.tokenizeBytes bytes opts with
        | Result.Ok tokens ->
            let (NodeSeq tokenList) = tokens
            let astSeq, _, issues, span = parseTokens tokenList
            { Syntax = astSeq
              UnsafeCharacterEncoding = None
              FatalIssues = issues
              NonFatalIssues = []
              Tracked =
                { TrackedSourceLocations.Empty with
                    Tokens =
                        match tokenList with
                        | [] -> []
                        | _ -> [ span ] } }
        | Result.Error flag ->
            { Syntax = NodeSeq.empty
              UnsafeCharacterEncoding = Some flag
              FatalIssues =
                [ ParserHelpers.issue IssueSeverity.Error "Unable to decode input as UTF-8" None ]
              NonFatalIssues = []
              Tracked = TrackedSourceLocations.Empty }

    let parseAst (input: string) (opts: ParseOptions) =
        parseAstSeq input opts |> expectSingle "parse_ast"

    let parseBytesAst (bytes: byte[]) (opts: ParseOptions) =
        parseBytesAstSeq bytes opts |> expectSingle "parse_bytes_ast"
