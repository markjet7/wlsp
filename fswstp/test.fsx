
open System.Text
let escapeWolframString (input: string) =
        let sb = StringBuilder()
        sb.Append('"') |> ignore
        for c in input do
            match c with
            | '"'  -> sb.Append("\\\"") |> ignore 
            | '\\' -> sb.Append("\\\\") |> ignore
            | '\n' -> sb.Append("\\n") |> ignore
            | '\r' -> sb.Append("\\r") |> ignore
            | '\t' -> sb.Append("\\t") |> ignore
            // | _ when int c < 0x20 || int c > 0x7E ->
            //     // Use Wolfram's hex notation for non-printable characters
            //     sb.Append(sprintf "\\:%04X" (int c)) |> ignore
            | _ ->
                sb.Append(c) |> ignore
        sb.Append('"') |> ignore
        sb.ToString()

escapeWolframString \""\""->""\""