#r "fwlparser/bin/Debug/net9.0/FwlParser.dll"
open System
open System.IO
open FwlParser

let path = @"/System/Volumes/Data/Users/markmw/Library/CloudStorage/OneDrive-IowaStateUniversity/General - Lignin HCA (Patrick)/Meta Analysis/test.wl"
let text = File.ReadAllText path
let opts = ParseOptions.Default
let (NodeSeq tokens) = Tokenizer.tokenize text opts
for t in tokens do
    printfn "%A %A %A" t.Kind t.Text t.Span
