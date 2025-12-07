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
        let tokens = ResizeArray<_>()

        let emitToken kind text startPos endPos =
            tokens.Add(
                { Kind = kind
                  Text = text
                  Span = TokenizerHelpers.span startPos endPos })

        let advanceToken kind len idx pos =
            let text = input.Substring(idx, len)
            let endPos = TokenizerHelpers.advanceText text pos
            emitToken kind text pos endPos
            idx + len, endPos

        let mutable idx = 0
        let mutable pos = Position.start

        let inline nextChar offset =
            let idx' = idx + offset
            if idx' < length then Some input[idx'] else None

        while idx < length do
            let ch = input[idx]
            match ch with
            | '\n' ->
                let startPos = pos
                let nextPos = Position.advance ch pos
                emitToken TokenKind.Newline "\n" startPos nextPos
                idx <- idx + 1
                pos <- nextPos
            | _ when Char.IsWhiteSpace ch ->
                let startPos = pos
                let mutable j = idx
                let mutable p = pos
                while j < length && (let c = input[j] in c <> '\n' && Char.IsWhiteSpace c) do
                    p <- Position.advance input[j] p
                    j <- j + 1
                let text = input.Substring(idx, j - idx)
                emitToken TokenKind.Whitespace text startPos p
                idx <- j
                pos <- p
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
                emitToken kind text startPos p
                idx <- j
                pos <- p
            | _ when Char.IsLetter ch || ch = '_' ->
                let startPos = pos
                let mutable j = idx
                let mutable p = pos
                while j < length && (let c = input[j] in Char.IsLetterOrDigit c || c = '_' || c = '`') do
                    p <- Position.advance input[j] p
                    j <- j + 1
                let text = input.Substring(idx, j - idx)
                emitToken TokenKind.Symbol text startPos p
                idx <- j
                pos <- p
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
                emitToken TokenKind.String text startPos endPos
                idx <- j
                pos <- endPos
            | _ ->
                let advance kind len =
                    let nextIdx, nextPos = advanceToken kind len idx pos
                    idx <- nextIdx
                    pos <- nextPos

                match ch with
                | '.' ->
                    match nextChar 1, nextChar 2 with
                    | Some '.', Some '.' -> advance TokenKind.DotDotDot 3
                    | Some '.', _ -> advance TokenKind.DotDot 2
                    | _ -> advance TokenKind.Dot 1
                | ':' ->
                    match nextChar 1, nextChar 2 with
                    | Some ':', Some '[' -> advance TokenKind.ColonColonOpenSquare 3
                    | Some ':', _ -> advance TokenKind.ColonColon 2
                    | Some '=', _ -> advance TokenKind.ColonEqual 2
                    | Some '>', _ -> advance TokenKind.ColonGreater 2
                    | _ -> advance TokenKind.Colon 1
                | ';' ->
                    match nextChar 1 with
                    | Some ';' -> advance TokenKind.SemiSemi 2
                    | _ -> advance TokenKind.Semi 1
                | '=' ->
                    match nextChar 1, nextChar 2 with
                    | Some '=', Some '=' -> advance TokenKind.EqualEqualEqual 3
                    | Some '!', Some '=' -> advance TokenKind.EqualBangEqual 3
                    | Some '=', _ -> advance TokenKind.EqualEqual 2
                    | _ -> advance TokenKind.Equal 1
                | '!' ->
                    match nextChar 1 with
                    | Some '=' -> advance TokenKind.BangEqual 2
                    | Some '!' -> advance TokenKind.BangBang 2
                    | _ -> advance TokenKind.Bang 1
                | '<' ->
                    match nextChar 1, nextChar 2 with
                    | Some '-', Some '>' -> advance TokenKind.LessMinusGreater 3
                    | Some '<', _ -> advance TokenKind.LessLess 2
                    | Some '=', _ -> advance TokenKind.LessEqual 2
                    | Some '>', _ -> advance TokenKind.LessGreater 2
                    | Some '|', _ -> advance TokenKind.LessBar 2
                    | _ -> advance TokenKind.Less 1
                | '>' ->
                    match nextChar 1, nextChar 2 with
                    | Some '>', Some '>' -> advance TokenKind.GreaterGreaterGreater 3
                    | Some '>', _ -> advance TokenKind.GreaterGreater 2
                    | Some '=', _ -> advance TokenKind.GreaterEqual 2
                    | _ -> advance TokenKind.Greater 1
                | '-' ->
                    match nextChar 1 with
                    | Some '>' -> advance TokenKind.MinusGreater 2
                    | Some '-' -> advance TokenKind.MinusMinus 2
                    | Some '=' -> advance TokenKind.MinusEqual 2
                    | _ -> advance TokenKind.Minus 1
                | '+' ->
                    match nextChar 1 with
                    | Some '+' -> advance TokenKind.PlusPlus 2
                    | Some '=' -> advance TokenKind.PlusEqual 2
                    | _ -> advance TokenKind.Plus 1
                | '*' ->
                    match nextChar 1 with
                    | Some '^' -> advance TokenKind.StarCaret 2
                    | Some '=' -> advance TokenKind.StarEqual 2
                    | Some '*' -> advance TokenKind.StarStar 2
                    | _ -> advance TokenKind.Star 1
                | '^' ->
                    match nextChar 1, nextChar 2 with
                    | Some ':', Some '=' -> advance TokenKind.CaretColonEqual 3
                    | Some '=', _ -> advance TokenKind.CaretEqual 2
                    | _ -> advance TokenKind.Caret 1
                | '/' ->
                    match nextChar 1, nextChar 2 with
                    | Some '/', Some '.' -> advance TokenKind.SlashSlashDot 3
                    | Some '/', Some '@' -> advance TokenKind.SlashSlashAt 3
                    | Some '/', Some '=' -> advance TokenKind.SlashSlashEqual 3
                    | Some '/', _ -> advance TokenKind.SlashSlash 2
                    | Some '*', _ -> advance TokenKind.SlashStar 2
                    | Some ';', _ -> advance TokenKind.SlashSemi 2
                    | Some '.', _ -> advance TokenKind.SlashDot 2
                    | Some '=', _ -> advance TokenKind.SlashEqual 2
                    | Some '@', _ -> advance TokenKind.SlashAt 2
                    | Some ':', _ -> advance TokenKind.SlashColon 2
                    | _ -> advance TokenKind.Slash 1
                | '@' ->
                    match nextChar 1, nextChar 2 with
                    | Some '@', Some '@' -> advance TokenKind.AtAtAt 3
                    | Some '@', _ -> advance TokenKind.AtAt 2
                    | Some '*', _ -> advance TokenKind.AtStar 2
                    | _ -> advance TokenKind.At 1
                | '#' ->
                    match nextChar 1 with
                    | Some '#' -> advance TokenKind.HashHash 2
                    | _ -> advance TokenKind.Hash 1
                | '~' ->
                    match nextChar 1 with
                    | Some '~' -> advance TokenKind.TildeTilde 2
                    | _ -> advance TokenKind.Tilde 1
                | '_' ->
                    match nextChar 1, nextChar 2 with
                    | Some '_', Some '_' -> advance TokenKind.UnderUnderUnder 3
                    | Some '_', _ -> advance TokenKind.UnderUnder 2
                    | Some '.', _ -> advance TokenKind.UnderDot 2
                    | _ -> advance TokenKind.Under 1
                | '&' ->
                    match nextChar 1 with
                    | Some '&' -> advance TokenKind.AmpAmp 2
                    | _ -> advance TokenKind.Amp 1
                | '|' ->
                    match nextChar 1 with
                    | Some '|' -> advance TokenKind.BarBar 2
                    | Some '>' -> advance TokenKind.BarGreater 2
                    | _ -> advance TokenKind.Bar 1
                | '%' ->
                    match nextChar 1 with
                    | Some '%' -> advance TokenKind.PercentPercent 2
                    | _ -> advance TokenKind.Percent 1
                | '(' ->
                    match nextChar 1 with
                    | Some '*' ->
                        let startPos = pos
                        let mutable j = idx + 2
                        let mutable p =
                            pos
                            |> Position.advance '('
                            |> Position.advance '*'
                        let mutable depth = 1
                        let mutable closed = false

                        while j < length && not closed do
                            let lookahead k =
                                if j + k < length then Some input[j + k] else None

                            match input[j], lookahead 1 with
                            | '(', Some '*' ->
                                depth <- depth + 1
                                p <- Position.advance '(' p
                                p <- Position.advance '*' p
                                j <- j + 2
                            | '*', Some ')' ->
                                depth <- depth - 1
                                p <- Position.advance '*' p
                                p <- Position.advance ')' p
                                j <- j + 2
                                if depth = 0 then
                                    closed <- true
                            | ch, _ ->
                                p <- Position.advance ch p
                                j <- j + 1

                        let text = input.Substring(idx, j - idx)

                        if depth = 0 && closed then
                            emitToken TokenKind.Comment text startPos p
                            idx <- j
                            pos <- p
                        else
                            emitToken TokenKind.Error_UnterminatedComment text startPos p
                            idx <- j
                            pos <- p
                    | _ -> advance TokenKind.OpenParen 1
                | ')' -> advance TokenKind.CloseParen 1
                | '[' -> advance TokenKind.OpenSquare 1
                | ']' -> advance TokenKind.CloseSquare 1
                | '{' -> advance TokenKind.OpenCurly 1
                | '}' -> advance TokenKind.CloseCurly 1
                | ',' -> advance TokenKind.Comma 1
                | '\'' -> advance TokenKind.SingleQuote 1
                | '\\' ->
                    match nextChar 1 with
                    | Some '!' -> advance TokenKind.LinearSyntax_Bang 2
                    | Some ')' -> advance TokenKind.LinearSyntax_CloseParen 2
                    | Some '@' -> advance TokenKind.LinearSyntax_At 2
                    | Some '&' -> advance TokenKind.LinearSyntax_Amp 2
                    | Some '*' -> advance TokenKind.LinearSyntax_Star 2
                    | Some '_' -> advance TokenKind.LinearSyntax_Under 2
                    | Some '^' -> advance TokenKind.LinearSyntax_Caret 2
                    | Some ' ' -> advance TokenKind.LinearSyntax_Space 2
                    | Some '%' -> advance TokenKind.LinearSyntax_Percent 2
                    | Some '+' -> advance TokenKind.LinearSyntax_Plus 2
                    | Some '/' -> advance TokenKind.LinearSyntax_Slash 2
                    | Some '`' -> advance TokenKind.LinearSyntax_BackTick 2
                    | _ -> advance TokenKind.Unknown 1
                | _ ->
                    advance TokenKind.Unknown 1

        let eof =
            { Kind = TokenKind.EndOfFile
              Text = ""
              Span = TokenizerHelpers.span pos pos }

        tokens.Add(eof)

        tokens
        |> Seq.toList
        |> NodeSeq

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
