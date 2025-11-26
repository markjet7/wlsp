namespace FwlParser

open System
open System.Text

open FwlParser

module internal TokenizerHelpers =
    let span startPos endPos =
        { Start = startPos
          EndPos = endPos }

    let advanceText (text: string) (pos: Position) =
        text |> Seq.fold (fun acc ch -> Position.advance ch acc) pos

/// Simple tokenizer that covers a minimal subset of the Rust wolfram-parser API.
module Tokenizer =
    let private tokenizeString (input: string) =
        let length = input.Length
        let rec loop idx pos acc =
            if idx >= length then
                let eof =
                    { Kind = TokenKind.EndOfFile
                      Text = ""
                      Span = TokenizerHelpers.span pos pos }

                NodeSeq(List.rev (eof :: acc))
            else
                let ch = input[idx]
                match ch with
                | '\n' ->
                    let nextPos = Position.advance ch pos
                    let tok =
                        { Kind = TokenKind.Newline
                          Text = "\n"
                          Span = TokenizerHelpers.span pos nextPos }
                    loop (idx + 1) nextPos (tok :: acc)
                | _ when Char.IsWhiteSpace ch ->
                    let startPos = pos
                    let mutable j = idx
                    let mutable p = pos
                    while j < length && (let c = input[j] in c <> '\n' && Char.IsWhiteSpace c) do
                        p <- Position.advance input[j] p
                        j <- j + 1
                    let text = input.Substring(idx, j - idx)
                    let tok =
                        { Kind = TokenKind.Whitespace
                          Text = text
                          Span = TokenizerHelpers.span startPos p }
                    loop j p (tok :: acc)
                | _ when Char.IsDigit ch ->
                    let startPos = pos
                    let mutable j = idx
                    let mutable p = pos
                    let mutable sawDot = false
                    let mutable cont = true
                    while j < length && cont do
                        let c = input[j]
                        if Char.IsDigit c then
                            p <- Position.advance c p
                            j <- j + 1
                        elif c = '.' && not sawDot then
                            sawDot <- true
                            p <- Position.advance c p
                            j <- j + 1
                        else
                            cont <- false
                    let text = input.Substring(idx, j - idx)
                    let kind = if sawDot then TokenKind.Real else TokenKind.Integer
                    let tok =
                        { Kind = kind
                          Text = text
                          Span = TokenizerHelpers.span startPos p }
                    loop j p (tok :: acc)
                | _ when Char.IsLetter ch || ch = '_' ->
                    let startPos = pos
                    let mutable j = idx
                    let mutable p = pos
                    while j < length && (let c = input[j] in Char.IsLetterOrDigit c || c = '_' || c = '`') do
                        p <- Position.advance input[j] p
                        j <- j + 1
                    let text = input.Substring(idx, j - idx)
                    let tok =
                        { Kind = TokenKind.Symbol
                          Text = text
                          Span = TokenizerHelpers.span startPos p }
                    loop j p (tok :: acc)
                | '"' ->
                    let startPos = pos
                    let mutable j = idx + 1
                    let mutable p = Position.advance '"' pos
                    let sb = StringBuilder()
                    let mutable closed = false
                    while j < length && not closed do
                        let c = input[j]
                        p <- Position.advance c p
                        match c with
                        | '\\' when j + 1 < length ->
                            let next = input[j + 1]
                            sb.Append(next) |> ignore
                            p <- Position.advance next p
                            j <- j + 2
                        | '"' ->
                            closed <- true
                            j <- j + 1
                        | _ ->
                            sb.Append(c) |> ignore
                            j <- j + 1
                    let endPos = p
                    let text = sb.ToString()
                    let tok =
                        { Kind = TokenKind.String
                          Text = text
                          Span = TokenizerHelpers.span startPos endPos }
                    loop j endPos (tok :: acc)
                | _ ->
                    let nextChar offset =
                        let idx' = idx + offset
                        if idx' < length then Some input[idx'] else None

                    let buildToken kind len =
                        let text = input.Substring(idx, len)
                        let endPos = TokenizerHelpers.advanceText text pos
                        let tok =
                            { Kind = kind
                              Text = text
                              Span = TokenizerHelpers.span pos endPos }
                        (idx + len, endPos, tok :: acc)

                    let advanceToken kind len =
                        let nextIdx, nextPos, nextAcc = buildToken kind len
                        loop nextIdx nextPos nextAcc

                    match ch with
                    | '.' ->
                        match nextChar 1, nextChar 2 with
                        | Some '.', Some '.' -> advanceToken TokenKind.DotDotDot 3
                        | Some '.', _ -> advanceToken TokenKind.DotDot 2
                        | _ -> advanceToken TokenKind.Dot 1
                    | ':' ->
                        match nextChar 1, nextChar 2 with
                        | Some ':', Some '[' -> advanceToken TokenKind.ColonColonOpenSquare 3
                        | Some ':', _ -> advanceToken TokenKind.ColonColon 2
                        | Some '=', _ -> advanceToken TokenKind.ColonEqual 2
                        | Some '>', _ -> advanceToken TokenKind.ColonGreater 2
                        | _ -> advanceToken TokenKind.Colon 1
                    | ';' ->
                        match nextChar 1 with
                        | Some ';' -> advanceToken TokenKind.SemiSemi 2
                        | _ -> advanceToken TokenKind.Semi 1
                    | '=' ->
                        match nextChar 1, nextChar 2 with
                        | Some '=', Some '=' -> advanceToken TokenKind.EqualEqualEqual 3
                        | Some '!', Some '=' -> advanceToken TokenKind.EqualBangEqual 3
                        | Some '=', _ -> advanceToken TokenKind.EqualEqual 2
                        | _ -> advanceToken TokenKind.Equal 1
                    | '!' ->
                        match nextChar 1 with
                        | Some '=' -> advanceToken TokenKind.BangEqual 2
                        | Some '!' -> advanceToken TokenKind.BangBang 2
                        | _ -> advanceToken TokenKind.Bang 1
                    | '<' ->
                        match nextChar 1, nextChar 2 with
                        | Some '-', Some '>' -> advanceToken TokenKind.LessMinusGreater 3
                        | Some '<', _ -> advanceToken TokenKind.LessLess 2
                        | Some '=', _ -> advanceToken TokenKind.LessEqual 2
                        | Some '>', _ -> advanceToken TokenKind.LessGreater 2
                        | Some '|', _ -> advanceToken TokenKind.LessBar 2
                        | _ -> advanceToken TokenKind.Less 1
                    | '>' ->
                        match nextChar 1, nextChar 2 with
                        | Some '>', Some '>' -> advanceToken TokenKind.GreaterGreaterGreater 3
                        | Some '>', _ -> advanceToken TokenKind.GreaterGreater 2
                        | Some '=', _ -> advanceToken TokenKind.GreaterEqual 2
                        | _ -> advanceToken TokenKind.Greater 1
                    | '-' ->
                        match nextChar 1 with
                        | Some '>' -> advanceToken TokenKind.MinusGreater 2
                        | Some '-' -> advanceToken TokenKind.MinusMinus 2
                        | Some '=' -> advanceToken TokenKind.MinusEqual 2
                        | _ -> advanceToken TokenKind.Minus 1
                    | '+' ->
                        match nextChar 1 with
                        | Some '+' -> advanceToken TokenKind.PlusPlus 2
                        | Some '=' -> advanceToken TokenKind.PlusEqual 2
                        | _ -> advanceToken TokenKind.Plus 1
                    | '*' ->
                        match nextChar 1 with
                        | Some '=' -> advanceToken TokenKind.StarEqual 2
                        | Some '*' -> advanceToken TokenKind.StarStar 2
                        | _ -> advanceToken TokenKind.Star 1
                    | '^' ->
                        match nextChar 1, nextChar 2 with
                        | Some ':', Some '=' -> advanceToken TokenKind.CaretColonEqual 3
                        | Some '=', _ -> advanceToken TokenKind.CaretEqual 2
                        | _ -> advanceToken TokenKind.Caret 1
                    | '/' ->
                        match nextChar 1, nextChar 2 with
                        | Some '/', Some '.' -> advanceToken TokenKind.SlashSlashDot 3
                        | Some '/', Some '@' -> advanceToken TokenKind.SlashSlashAt 3
                        | Some '/', Some '=' -> advanceToken TokenKind.SlashSlashEqual 3
                        | Some '/', _ -> advanceToken TokenKind.SlashSlash 2
                        | Some '*', _ -> advanceToken TokenKind.SlashStar 2
                        | Some ';', _ -> advanceToken TokenKind.SlashSemi 2
                        | Some '.', _ -> advanceToken TokenKind.SlashDot 2
                        | Some '=', _ -> advanceToken TokenKind.SlashEqual 2
                        | Some '@', _ -> advanceToken TokenKind.SlashAt 2
                        | Some ':', _ -> advanceToken TokenKind.SlashColon 2
                        | _ -> advanceToken TokenKind.Slash 1
                    | '@' ->
                        match nextChar 1, nextChar 2 with
                        | Some '@', Some '@' -> advanceToken TokenKind.AtAtAt 3
                        | Some '@', _ -> advanceToken TokenKind.AtAt 2
                        | Some '*', _ -> advanceToken TokenKind.AtStar 2
                        | _ -> advanceToken TokenKind.At 1
                    | '#' ->
                        match nextChar 1 with
                        | Some '#' -> advanceToken TokenKind.HashHash 2
                        | _ -> advanceToken TokenKind.Hash 1
                    | '~' ->
                        match nextChar 1 with
                        | Some '~' -> advanceToken TokenKind.TildeTilde 2
                        | _ -> advanceToken TokenKind.Tilde 1
                    | '_' ->
                        match nextChar 1, nextChar 2 with
                        | Some '_', Some '_' -> advanceToken TokenKind.UnderUnderUnder 3
                        | Some '_', _ -> advanceToken TokenKind.UnderUnder 2
                        | Some '.', _ -> advanceToken TokenKind.UnderDot 2
                        | _ -> advanceToken TokenKind.Under 1
                    | '&' ->
                        match nextChar 1 with
                        | Some '&' -> advanceToken TokenKind.AmpAmp 2
                        | _ -> advanceToken TokenKind.Amp 1
                    | '|' ->
                        match nextChar 1 with
                        | Some '|' -> advanceToken TokenKind.BarBar 2
                        | Some '>' -> advanceToken TokenKind.BarGreater 2
                        | _ -> advanceToken TokenKind.Bar 1
                    | '%' ->
                        match nextChar 1 with
                        | Some '%' -> advanceToken TokenKind.PercentPercent 2
                        | _ -> advanceToken TokenKind.Percent 1
                    | '(' -> advanceToken TokenKind.OpenParen 1
                    | ')' -> advanceToken TokenKind.CloseParen 1
                    | '[' -> advanceToken TokenKind.OpenSquare 1
                    | ']' -> advanceToken TokenKind.CloseSquare 1
                    | '{' -> advanceToken TokenKind.OpenCurly 1
                    | '}' -> advanceToken TokenKind.CloseCurly 1
                    | ',' -> advanceToken TokenKind.Comma 1
                    | '\'' -> advanceToken TokenKind.SingleQuote 1
                    | '\\' ->
                        match nextChar 1 with
                        | Some '!' -> advanceToken TokenKind.LinearSyntax_Bang 2
                        | Some ')' -> advanceToken TokenKind.LinearSyntax_CloseParen 2
                        | Some '@' -> advanceToken TokenKind.LinearSyntax_At 2
                        | Some '&' -> advanceToken TokenKind.LinearSyntax_Amp 2
                        | Some '*' -> advanceToken TokenKind.LinearSyntax_Star 2
                        | Some '_' -> advanceToken TokenKind.LinearSyntax_Under 2
                        | Some '^' -> advanceToken TokenKind.LinearSyntax_Caret 2
                        | Some ' ' -> advanceToken TokenKind.LinearSyntax_Space 2
                        | Some '%' -> advanceToken TokenKind.LinearSyntax_Percent 2
                        | Some '+' -> advanceToken TokenKind.LinearSyntax_Plus 2
                        | Some '/' -> advanceToken TokenKind.LinearSyntax_Slash 2
                        | Some '`' -> advanceToken TokenKind.LinearSyntax_BackTick 2
                        | _ -> advanceToken TokenKind.Unknown 1
                    | _ ->
                        advanceToken TokenKind.Unknown 1

        loop 0 Position.start []

    /// Tokenize a UTF-8 string input.
    let tokenize (input: string) (_opts: ParseOptions) =
        tokenizeString input

    /// Tokenize raw UTF-8 bytes.
    let tokenizeBytes (bytes: byte[]) (opts: ParseOptions) =
        let hasBom =
            bytes.Length >= 3
            && bytes[0] = 0xEFuy
            && bytes[1] = 0xBBuy
            && bytes[2] = 0xBFuy

        let slice, flag =
            if hasBom then
                bytes.AsSpan(3).ToArray(), Some UnsafeCharacterEncoding.Bom
            else
                bytes, None

        try
            let text = Encoding.UTF8.GetString slice
            let tokens = tokenize text opts
            match flag with
            | Some f -> Result.Error f
            | None -> Result.Ok tokens
        with :? DecoderFallbackException ->
            Result.Error UnsafeCharacterEncoding.InvalidUtf8
