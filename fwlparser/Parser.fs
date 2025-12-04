namespace FwlParser

// Parser architecture draws heavy inspiration from WolframResearch/codeparser (https://github.com/WolframResearch/codeparser/tree/master/crates).

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

    let private peek offset (state: ParserState) =
        let idx = state.Index + offset
        if idx >= state.Tokens.Length then
            None
        else
            Some state.Tokens[idx]

    let private advance (state: ParserState) =
        if not (isAtEnd state) then
            state.Index <- state.Index + 1

    let rec private skipToplevelNewlines (state: ParserState) =
        match current state with
        | Some tok when tok.Kind = TokenKind.ToplevelNewline ->
            advance state
            skipToplevelNewlines state
        | _ -> ()

    let private headSymbol kind =
        match kind with
        | TokenKind.Plus -> "Plus"
        | TokenKind.Minus -> "Subtract"
        | TokenKind.Star
        | TokenKind.StarCaret
        | TokenKind.LongName_Times -> "Times"
        | TokenKind.Slash
        | TokenKind.LongName_Divide -> "Divide"
        | TokenKind.Caret -> "Power"
        | TokenKind.Semi
        | TokenKind.SemiSemi -> "CompoundExpression"
        | TokenKind.Colon -> "Optional"
        | TokenKind.ColonGreater
        | TokenKind.LongName_RuleDelayed -> "RuleDelayed"
        | TokenKind.MinusGreater
        | TokenKind.LongName_Rule -> "Rule"
        | TokenKind.EqualEqual -> "Equal"
        | TokenKind.Less -> "Less"
        | TokenKind.LessEqual -> "LessEqual"
        | TokenKind.Greater -> "Greater"
        | TokenKind.GreaterEqual -> "GreaterEqual"
        | TokenKind.AmpAmp
        | TokenKind.LongName_And -> "And"
        | TokenKind.BarBar
        | TokenKind.LongName_Or -> "Or"
        | TokenKind.Equal -> "Set"
        | TokenKind.ColonEqual -> "SetDelayed"
        | TokenKind.At -> "Prefix"
        | TokenKind.ToplevelNewline -> "CompoundExpression"
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
                | TokenKind.Semi
                | TokenKind.ToplevelNewline -> Some(1, Assoc.Left)
                | TokenKind.Plus
                | TokenKind.Minus -> Some(10, Assoc.Left)
                | TokenKind.Star
                | TokenKind.Slash -> Some(20, Assoc.Left)
                | TokenKind.Caret -> Some(30, Assoc.Right)
                | TokenKind.Colon -> Some(15, Assoc.Right)
                | TokenKind.ColonGreater -> Some(15, Assoc.Right)
                | TokenKind.MinusGreater -> Some(15, Assoc.Right)
                | TokenKind.EqualEqual -> Some(25, Assoc.Left)
                | TokenKind.Greater
                | TokenKind.GreaterEqual
                | TokenKind.Less
                | TokenKind.LessEqual -> Some(25, Assoc.Left)
                | TokenKind.AmpAmp -> Some(30, Assoc.Left)
                | _ -> None
            fallback |> Option.map (fun (p, a) -> (p, a, headSymbol kind))

    let private implicitInteger value =
        Ast.Leaf(TokenKind.Integer, value, AstMetadata.Empty)

    let rec private parseExpression (state: ParserState) =
        parseExpressionWithPrecedence 1 state

    and private parseSpanSequence state leftOpt semiTok =
        let args = ResizeArray<Ast>()
        let children = ResizeArray<Cst<_>>()
        let mutable combinedSpanOpt: Span option = None

        let addSpan span =
            match combinedSpanOpt with
            | Some existing -> combinedSpanOpt <- Some(Span.covering existing span)
            | None -> combinedSpanOpt <- Some span

        match leftOpt with
        | Some(astLeft, cstLeft, spanLeft) ->
            args.Add astLeft
            children.Add cstLeft
            addSpan spanLeft
        | None ->
            args.Add(implicitInteger "1")

        children.Add(Cst.Token semiTok)
        addSpan semiTok.Span

        let isTerminator allowSemi tokKind =
            match tokKind with
            | TokenKind.Comma
            | TokenKind.CloseSquare
            | TokenKind.CloseParen
            | TokenKind.CloseCurly
            | TokenKind.EndOfFile
            | TokenKind.ToplevelNewline -> true
            | TokenKind.SemiSemi when allowSemi -> true
            | _ -> false

        let parseSpanArg defaultValue allowSemiTerminator =
            let inline shouldUseDefault () =
                match current state with
                | Some tok when isTerminator allowSemiTerminator tok.Kind -> true
                | _ -> false

            if shouldUseDefault () then
                Some(implicitInteger defaultValue, None, None)
            else
                match parseExpressionWithPrecedence 2 state with
                | Some(ast, cst, span) -> Some(ast, Some cst, Some span)
                | None ->
                    if shouldUseDefault () then
                        Some(implicitInteger defaultValue, None, None)
                    else
                        let issue =
                            ParserHelpers.issue IssueSeverity.Error "Expected expression for span specification" (Some semiTok.Span)
                        state.Issues.Add issue
                        None

        let appendArg defaultValue allowSemiTerminator =
            match parseSpanArg defaultValue allowSemiTerminator with
            | Some(ast, cstOpt, spanOpt) ->
                args.Add ast
                match cstOpt with
                | Some c -> children.Add c
                | None -> ()
                spanOpt |> Option.iter addSpan
                true
            | None -> false

        if not (appendArg "-1" true) then
            None
        else
            match current state with
            | Some nextSemi when nextSemi.Kind = TokenKind.SemiSemi ->
                advance state
                children.Add(Cst.Token nextSemi)
                addSpan nextSemi.Span
                if not (appendArg "1" false) then
                    None
                else
                    let fullSpan =
                        match combinedSpanOpt with
                        | Some span -> span
                        | None -> semiTok.Span

                    let head = Ast.Leaf(TokenKind.Symbol, "Span", Ast.metadata semiTok.Span)
                    let astCombined = Ast.Call(head, List.ofSeq args, Ast.metadata fullSpan)
                    let cstCombined = Cst.Group(NodeSeq.ofList (List.ofSeq children))
                    Some(astCombined, cstCombined, fullSpan)
            | _ ->
                let fullSpan =
                    match combinedSpanOpt with
                    | Some span -> span
                    | None -> semiTok.Span

                let head = Ast.Leaf(TokenKind.Symbol, "Span", Ast.metadata semiTok.Span)
                let astCombined = Ast.Call(head, List.ofSeq args, Ast.metadata fullSpan)
                let cstCombined = Cst.Group(NodeSeq.ofList (List.ofSeq children))
                Some(astCombined, cstCombined, fullSpan)

    and private parseExpressionWithPrecedence minPrec (state: ParserState) =
        let mutable leftOpt = parsePrimary state

        let rec loop leftOpt =
            match leftOpt, current state with
            | Some(astLeft, cstLeft, spanLeft), Some tok ->
                match tok.Kind with
                | TokenKind.SemiSemi ->
                    advance state
                    match parseSpanSequence state (Some(astLeft, cstLeft, spanLeft)) tok with
                    | Some combined -> loop (Some combined)
                    | None -> leftOpt
                | TokenKind.At ->
                    advance state
                    skipToplevelNewlines state
                    let prec = 82
                    match parseExpressionWithPrecedence prec state with
                    | Some(astRight, cstRight, spanRight) ->
                        let fullSpan = Span.covering spanLeft spanRight
                        let astCombined = Ast.Call(astLeft, [ astRight ], Ast.metadata fullSpan)
                        let cstCombined =
                            Cst.Infix
                                { Op = tok.Kind
                                  Children = NodeSeq.ofList [ cstLeft; Cst.Token tok; cstRight ] }
                        loop (Some(astCombined, cstCombined, fullSpan))
                    | None -> leftOpt
                | TokenKind.Comma
                | TokenKind.CloseCurly
                | TokenKind.CloseSquare
                | TokenKind.CloseParen -> leftOpt
                | _ ->
                match infixInfo tok.Kind with
                | Some(prec, assoc, headName) when prec >= minPrec ->
                    advance state
                    skipToplevelNewlines state
                    let nextMin =
                        match assoc with
                        | Assoc.Left -> prec + 1
                        | Assoc.Right -> prec
                    match parseExpressionWithPrecedence nextMin state with
                    | Some(astRight, cstRight, spanRight) ->
                        let astRightAdjusted, spanRightAdjusted =
                            if tok.Kind = TokenKind.StarCaret then
                                let tenSpan = tok.Span
                                let tenAst = Ast.Leaf(TokenKind.Integer, "10", Ast.metadata tenSpan)
                                let headPower = Ast.Leaf(TokenKind.Symbol, "Power", Ast.metadata tenSpan)
                                let powerSpan = Span.covering tenSpan spanRight
                                let powerAst = Ast.Call(headPower, [ tenAst; astRight ], Ast.metadata powerSpan)
                                powerAst, powerSpan
                            else
                                astRight, spanRight
                        let head =
                            Ast.Leaf(TokenKind.Symbol, headName, Ast.metadata tok.Span)
                        let fullSpan = Span.covering spanLeft spanRightAdjusted
                        let astCombined =
                            Ast.Call(head, [ astLeft; astRightAdjusted ], Ast.metadata fullSpan)
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
        skipToplevelNewlines state
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
            | TokenKind.PlusPlus ->
                match parsePrimary state with
                | Some(ast, cst, span) ->
                    let fullSpan = Span.covering tok.Span span
                    let head = Ast.Leaf(TokenKind.Symbol, "PreIncrement", Ast.metadata tok.Span)
                    let astCall = Ast.Call(head, [ ast ], Ast.metadata fullSpan)
                    let cst =
                        Cst.Infix
                            { Op = TokenKind.PlusPlus
                              Children = NodeSeq.ofList [ Cst.Token tok; cst ] }
                    Some(astCall, cst, fullSpan)
                | None -> None
            | TokenKind.Hash ->
                let indexTokOpt =
                    match current state with
                    | Some next when next.Kind = TokenKind.Integer ->
                        advance state
                        Some next
                    | _ -> None
                let indexAst =
                    match indexTokOpt with
                    | Some idxTok -> ParserHelpers.astLeafFromToken idxTok
                    | None -> implicitInteger "1"
                let head = Ast.Leaf(TokenKind.Symbol, "Slot", Ast.metadata tok.Span)
                let fullSpan =
                    match indexTokOpt with
                    | Some idxTok -> Span.covering tok.Span idxTok.Span
                    | None -> tok.Span
                let ast = Ast.Call(head, [ indexAst ], Ast.metadata fullSpan)
                let cst =
                    match indexTokOpt with
                    | Some idxTok ->
                        Cst.Group(NodeSeq.ofList [ Cst.Token tok; Cst.Token idxTok ])
                    | None -> Cst.Token tok
                Some(ast, cst, fullSpan)
            | TokenKind.HashHash ->
                let indexTokOpt =
                    match current state with
                    | Some next when next.Kind = TokenKind.Integer ->
                        advance state
                        Some next
                    | _ -> None
                let indexAst =
                    match indexTokOpt with
                    | Some idxTok -> ParserHelpers.astLeafFromToken idxTok
                    | None -> implicitInteger "1"
                let head = Ast.Leaf(TokenKind.Symbol, "SlotSequence", Ast.metadata tok.Span)
                let fullSpan =
                    match indexTokOpt with
                    | Some idxTok -> Span.covering tok.Span idxTok.Span
                    | None -> tok.Span
                let ast = Ast.Call(head, [ indexAst ], Ast.metadata fullSpan)
                let cst =
                    match indexTokOpt with
                    | Some idxTok ->
                        Cst.Group(NodeSeq.ofList [ Cst.Token tok; Cst.Token idxTok ])
                    | None -> Cst.Token tok
                Some(ast, cst, fullSpan)
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
            | TokenKind.SemiSemi ->
                parseSpanSequence state None tok
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
                match current state with
                | Some tok2 when tok2.Kind = TokenKind.OpenSquare ->
                    advance state
                    let rec collectPart argsAst argsCstRev =
                        match current state with
                        | Some close when close.Kind = TokenKind.CloseSquare ->
                            match peek 1 state with
                            | Some close2 when close2.Kind = TokenKind.CloseSquare ->
                                advance state
                                let closeTok1 = close
                                let closeTok2 =
                                    match current state with
                                    | Some tokClose2 when tokClose2.Kind = TokenKind.CloseSquare ->
                                        tokClose2
                                    | _ ->
                                        let issue =
                                            ParserHelpers.issue IssueSeverity.Error
                                                "Expected closing ']]' for Part expression"
                                                (Some close.Span)
                                        state.Issues.Add issue
                                        close
                                advance state
                                let head = Ast.Leaf(TokenKind.Symbol, "Part", Ast.metadata tok.Span)
                                let args = ast :: List.rev argsAst
                                let fullSpan = Span.covering span closeTok2.Span
                                let astCombined = Ast.Call(head, args, Ast.metadata fullSpan)
                                let content = List.rev argsCstRev
                                let children =
                                    NodeSeq.ofList (
                                        cst
                                        :: Cst.Token tok
                                        :: Cst.Token tok2
                                        :: content
                                        @ [ Cst.Token closeTok1; Cst.Token closeTok2 ]
                                    )
                                let cstCombined = Cst.Group(children)
                                Some(astCombined, cstCombined, fullSpan)
                            | _ ->
                                let issue =
                                    ParserHelpers.issue IssueSeverity.Error
                                        "Expected closing ']]' for Part expression"
                                        (Some close.Span)
                                state.Issues.Add issue
                                None
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
                                collectPart (astInner :: argsAst) nextCstRev
                            | None ->
                                let issue =
                                    ParserHelpers.issue IssueSeverity.Error "Unclosed Part expression" (Some tok.Span)
                                state.Issues.Add issue
                                None
                    match collectPart [] [] with
                    | Some res -> loop res
                    | None -> None
                | _ ->
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
            | Some tok when tok.Kind = TokenKind.Amp ->
                advance state
                let head = Ast.Leaf(TokenKind.Symbol, "Function", Ast.metadata tok.Span)
                let fullSpan = Span.covering span tok.Span
                let astCombined = Ast.Call(head, [ ast ], Ast.metadata fullSpan)
                let cstCombined =
                    Cst.Group(NodeSeq.ofList [ cst; Cst.Token tok ])
                loop (astCombined, cstCombined, fullSpan)
            | Some tok when tok.Kind = TokenKind.PlusPlus ->
                advance state
                let head = Ast.Leaf(TokenKind.Symbol, "Increment", Ast.metadata tok.Span)
                let fullSpan = Span.covering span tok.Span
                let astCombined = Ast.Call(head, [ ast ], Ast.metadata fullSpan)
                let cstCombined = Cst.Group(NodeSeq.ofList [ cst; Cst.Token tok ])
                loop (astCombined, cstCombined, fullSpan)
            | _ -> Some(ast, cst, span)
        loop (baseAst, baseCst, baseSpan)

    let private promoteToplevelNewlines (tokens: Token<TokenStr> list) =
        let rec loop depth acc remaining =
            match remaining with
            | [] -> List.rev acc
            | tok :: rest ->
                let tok' =
                    if tok.Kind = TokenKind.Newline && depth = 0 then
                        { tok with Kind = TokenKind.ToplevelNewline }
                    else
                        tok

                let nextDepth =
                    match tok.Kind with
                    | TokenKind.OpenParen
                    | TokenKind.OpenSquare
                    | TokenKind.OpenCurly -> depth + 1
                    | TokenKind.CloseParen
                    | TokenKind.CloseSquare
                    | TokenKind.CloseCurly -> max (depth - 1) 0
                    | _ -> depth

                loop nextDepth (tok' :: acc) rest

        loop 0 [] tokens

    let private pruneDanglingToplevelNewlines (tokens: Token<TokenStr> list) =
        let withoutTrailing =
            (tokens, ([], false))
            ||> List.foldBack (fun tok (acc, seenExprAfter) ->
                match tok.Kind with
                | TokenKind.ToplevelNewline when not seenExprAfter -> acc, seenExprAfter
                | TokenKind.ToplevelNewline -> tok :: acc, seenExprAfter
                | TokenKind.Semi
                | TokenKind.SemiSemi ->
                    tok :: acc, seenExprAfter
                | _ ->
                    tok :: acc, true)
            |> fst

        let rec dropLeading seenExpr acc remaining =
            match remaining with
            | [] -> List.rev acc
            | tok :: rest ->
                match tok.Kind with
                | TokenKind.ToplevelNewline when seenExpr ->
                    dropLeading false (tok :: acc) rest
                | TokenKind.ToplevelNewline ->
                    dropLeading false acc rest
                | _ ->
                    dropLeading true (tok :: acc) rest

        dropLeading false [] withoutTrailing

    let private isImplicitTimesLeft kind =
        match kind with
        | TokenKind.Integer
        | TokenKind.Real
        | TokenKind.Rational
        | TokenKind.Symbol
        | TokenKind.String
        | TokenKind.CloseParen
        | TokenKind.CloseSquare
        | TokenKind.CloseCurly
        | TokenKind.Hash
        | TokenKind.HashHash
        | TokenKind.SingleQuote -> true
        | _ -> false

    let private isImplicitTimesRight kind =
        match kind with
        | TokenKind.Symbol
        | TokenKind.Integer
        | TokenKind.Real
        | TokenKind.Rational
        | TokenKind.String
        | TokenKind.OpenParen
        | TokenKind.OpenCurly
        | TokenKind.Hash
        | TokenKind.HashHash -> true
        | _ -> false

    let private insertImplicitTimes (tokens: Token<TokenStr> list) =
        let shouldInsert prev prevPrevOpt current =
            match prev.Kind with
            | TokenKind.PlusPlus ->
                match prevPrevOpt with
                | Some prevPrev when isImplicitTimesLeft prevPrev.Kind && isImplicitTimesRight current.Kind -> true
                | _ -> false
            | _ ->
                isImplicitTimesLeft prev.Kind
                && isImplicitTimesRight current.Kind
        let rec loop prevOpt prevPrevOpt accRev remaining =
            match remaining with
            | [] -> List.rev accRev
            | tok :: rest ->
                let accWithFake =
                    match prevOpt with
                    | Some prev when shouldInsert prev prevPrevOpt tok ->
                        let span =
                            { Start = prev.Span.EndPos
                              EndPos = prev.Span.EndPos }
                        let fake =
                            { Kind = TokenKind.Fake_ImplicitTimes
                              Text = ""
                              Span = span }
                        fake :: accRev
                    | _ -> accRev
                let accWithTok = tok :: accWithFake
                loop (Some tok) prevOpt accWithTok rest
        loop None None [] tokens

    let private parseTokens (tokens: Token<TokenStr> list) (opts: ParseOptions) =
        let tokensWithNewlines = promoteToplevelNewlines tokens

        let filtered =
            tokensWithNewlines
            |> List.filter (fun t ->
                t.Kind <> TokenKind.Whitespace
                && t.Kind <> TokenKind.Newline
                && t.Kind <> TokenKind.InternalNewline
                && t.Kind <> TokenKind.Comment
                && t.Kind <> TokenKind.EndOfFile)
            |> pruneDanglingToplevelNewlines

        let withImplicitTimes =
            if opts.QuirkSettings.AllowImplicitTimes then
                insertImplicitTimes filtered
            else
                filtered

        let filteredArray = withImplicitTimes |> List.toArray

        let state =
            { Tokens = filteredArray
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
            let _, cstSeq, issues, _ = parseTokens tokenList opts
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
            let _, cstSeq, issues, _ = parseTokens tokenList opts
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
        try
            match Tokenizer.tokenizeBytes (Encoding.UTF8.GetBytes input) opts with
            | Result.Ok tokens ->
                let (NodeSeq tokenList) = tokens
                let astSeq, _, issues, span = parseTokens tokenList opts
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
        with ex ->
            { Syntax = NodeSeq.empty
              UnsafeCharacterEncoding = None
              FatalIssues =
                [ ParserHelpers.issue IssueSeverity.Error (sprintf "Parser panic: %s" ex.Message) None ]
              NonFatalIssues = []
              Tracked = TrackedSourceLocations.Empty }

    let parseBytesAstSeq (bytes: byte[]) (opts: ParseOptions) =
        match Tokenizer.tokenizeBytes bytes opts with
        | Result.Ok tokens ->
            let (NodeSeq tokenList) = tokens
            let astSeq, _, issues, span = parseTokens tokenList opts
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
