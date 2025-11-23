module ParserTests

open Xunit

open FwlParser
open FwlParser.Parser

[<Fact>]
let ``parse 2 plus 2`` () =
    let result = parseAst "2 + 2" ParseOptions.Default
    match result.Syntax with
    | Ast.Call(head, args, _) ->
        match head with
        | Ast.Leaf(kind, name, _) ->
            Assert.Equal(TokenKind.Symbol, kind)
            Assert.Equal("Plus", name)
        | _ -> failwith "Expected head symbol"
        Assert.Collection(
            args,
            (fun a ->
                match a with
                | Ast.Leaf(TokenKind.Integer, "2", _) -> ()
                | _ -> failwith "Expected integer arg 1"),
            (fun a ->
                match a with
                | Ast.Leaf(TokenKind.Integer, "2", _) -> ()
                | _ -> failwith "Expected integer arg 2")
        )
    | _ -> failwith "Expected call AST"

[<Fact>]
let ``parse function call`` () =
    let result = parseAst "f[x, y]" ParseOptions.Default
    match result.Syntax with
    | Ast.Call(head, args, _) ->
        match head with
        | Ast.Leaf(TokenKind.Symbol, "f", _) -> ()
        | _ -> failwith "Expected head symbol f"
        Assert.Collection(
            args,
            (fun a ->
                match a with
                | Ast.Leaf(TokenKind.Symbol, "x", _) -> ()
                | _ -> failwith "Expected arg x"),
            (fun a ->
                match a with
                | Ast.Leaf(TokenKind.Symbol, "y", _) -> ()
                | _ -> failwith "Expected arg y")
        )
    | _ -> failwith "Expected call AST"

[<Fact>]
let ``parse list`` () =
    let result = parseAst "{a, b}" ParseOptions.Default
    match result.Syntax with
    | Ast.Call(head, args, _) ->
        match head with
        | Ast.Leaf(TokenKind.Symbol, "List", _) -> ()
        | _ -> failwith "Expected List head"
        Assert.Collection(
            args,
            (fun a ->
                match a with
                | Ast.Leaf(TokenKind.Symbol, "a", _) -> ()
                | _ -> failwith "Expected element a"),
            (fun a ->
                match a with
                | Ast.Leaf(TokenKind.Symbol, "b", _) -> ()
                | _ -> failwith "Expected element b")
        )
    | _ -> failwith "Expected list call AST"

[<Fact>]
let ``operator precedence times before plus`` () =
    let result = parseAst "2 + 3 * 4" ParseOptions.Default
    match result.Syntax with
    | Ast.Call(head, args, _) ->
        match head with
        | Ast.Leaf(TokenKind.Symbol, "Plus", _) -> ()
        | _ -> failwith "Expected Plus head"
        Assert.Equal(2, args.Length)
        match args[1] with
        | Ast.Call(opHead, opArgs, _) ->
            match opHead with
            | Ast.Leaf(TokenKind.Symbol, "Times", _) -> ()
            | _ -> failwith "Expected Times"
            Assert.Equal(2, opArgs.Length)
        | _ -> failwith "Expected Times call"
    | _ -> failwith "Expected Plus AST"

[<Fact>]
let ``right associative power`` () =
    let result = parseAst "2 ^ 3 ^ 2" ParseOptions.Default
    match result.Syntax with
    | Ast.Call(head, args, _) ->
        match head with
        | Ast.Leaf(TokenKind.Symbol, "Power", _) -> ()
        | _ -> failwith "Expected Power head"
        match args[1] with
        | Ast.Call(pHead, _, _) ->
            match pHead with
            | Ast.Leaf(TokenKind.Symbol, "Power", _) -> ()
            | _ -> failwith "Expected nested Power"
        | _ -> failwith "Expected nested Power call"
    | _ -> failwith "Expected Power AST"

[<Fact>]
let ``compound expression via semicolon`` () =
    let result = parseAst "a; b" ParseOptions.Default
    match result.Syntax with
    | Ast.Call(head, args, _) ->
        match head with
        | Ast.Leaf(TokenKind.Symbol, "CompoundExpression", _) -> ()
        | _ -> failwith "Expected CompoundExpression head"
        Assert.Equal(2, args.Length)
    | _ -> failwith "Expected CompoundExpression AST"
