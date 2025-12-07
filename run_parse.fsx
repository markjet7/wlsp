#r "fwlparser/bin/Debug/net9.0/FwlParser.dll"
open System
open System.IO
open FwlParser
open FwlParser.Parser

let path = @"/System/Volumes/Data/Users/markmw/Library/CloudStorage/OneDrive-IowaStateUniversity/General - Lignin HCA (Patrick)/Meta Analysis/test.wl"
let text = File.ReadAllText path
let result = parseAst text ParseOptions.Default
printfn "Fatal issues (%d):" result.FatalIssues.Length
result.FatalIssues |> List.iter (fun issue -> printfn "- %A: %s" issue.Span issue.Message)
