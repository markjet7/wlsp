#r "fwlparser/bin/Debug/net9.0/FwlParser.dll";;
open FwlParser
open FwlParser.Parser
let res = parseAst "Table[a, {a, 1, 10}]" ParseOptions.Default
printfn "%A" res
