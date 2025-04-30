module LanguageServer

open System
open System.IO
open System.Text
open System.Text.Json
open System.Threading
open System.Threading.Tasks
open System.Collections.Generic

type MessageType =
    | Request = 1
    | Response = 2
    | Notification = 3

type Message = {
    JsonRpc: string
    Id: int option
    Method: string option
    Params: JsonElement option
    Result: JsonElement option
    Error: JsonElement option
}

type Position = {
    Line: int
    Character: int
}

type Range = {
    Start: Position
    End: Position
}

type Diagnostic = {
    Range: Range
    Severity: int option
    Code: string option
    Source: string option
    Message: string
}

type Server(input: Stream, output: Stream) =
    let reader = new StreamReader(input, Encoding.UTF8)
    let writer = new StreamWriter(output, Encoding.UTF8, AutoFlush = true)
    let documents = Dictionary<string, string>()
    let cancellationTokenSource = new CancellationTokenSource()
    let mutable initialized = false
    
    let parseMessage (message: string) =
        let options = JsonSerializerOptions(PropertyNameCaseInsensitive = true)
        try
            let msg = JsonSerializer.Deserialize<Message>(message, options)
            msg
        with ex ->
            printfn "Failed to parse message: %s" ex.Message
            { JsonRpc = "2.0"; Id = None; Method = None; Params = None; Result = None; Error = None }
    
    let writeMessage (message: string) =
        let contentLength = Encoding.UTF8.GetByteCount(message)
        writer.WriteLine($"Content-Length: {contentLength}")
        writer.WriteLine()
        writer.Write(message)
        writer.Flush()
    
    let sendResponse id result =
        let response = {|
            jsonrpc = "2.0"
            id = id
            result = result
        |}
        let json = JsonSerializer.Serialize(response)
        writeMessage json
    
    let sendNotification method parameters =
        let notification = {|
            jsonrpc = "2.0"
            method = method
            params = parameters
        |}
        let json = JsonSerializer.Serialize(notification)
        writeMessage json
    
    let handleInitialize id (parameters: JsonElement) =
        initialized <- true
        let capabilities = {|
            textDocumentSync = 1
            hoverProvider = true
            completionProvider = {|
                resolveProvider = true
                triggerCharacters = [| "." |]
            |}
            definitionProvider = true
        |}
        sendResponse id {| capabilities = capabilities |}
    
    let handleTextDocumentDidOpen parameters =
        try
            let textDocument = JsonSerializer.Deserialize<{| textDocument: {| uri: string; text: string |} |}>(parameters.ToString())
            documents[textDocument.textDocument.uri] <- textDocument.textDocument.text
            
            let diagnostics = [|
                {|
                    range = {|
                        start = {| line = 0; character = 0 |}
                        ``end`` = {| line = 0; character = 10 |}
                    |}
                    severity = 2
                    code = "demo-diagnostic"
                    source = "F# Language Server"
                    message = "This is a demo diagnostic."
                |}
            |]
            
            sendNotification "textDocument/publishDiagnostics" {|
                uri = textDocument.textDocument.uri
                diagnostics = diagnostics
            |}
        with ex ->
            printfn "Error handling textDocument/didOpen: %s" ex.Message
    
    let handleTextDocumentCompletion id parameters =
        let completionItems = [|
            {| label = "function"; kind = 3; detail = "F# keyword" |}
            {| label = "let"; kind = 3; detail = "F# keyword" |}
            {| label = "match"; kind = 3; detail = "F# keyword" |}
            {| label = "type"; kind = 3; detail = "F# keyword" |}
        |]
        sendResponse id completionItems
    
    let handleMessage (message: string) =
        let msg = parseMessage message
        match msg.Method, msg.Id with
        | Some "initialize", Some id ->
            match msg.Params with
            | Some parameters -> handleInitialize id parameters
            | None -> ()
        | Some "initialized", _ ->
            ()
        | Some "textDocument/didOpen", _ ->
            match msg.Params with
            | Some parameters -> handleTextDocumentDidOpen parameters
            | None -> ()
        | Some "textDocument/completion", Some id ->
            match msg.Params with
            | Some parameters -> handleTextDocumentCompletion id parameters
            | None -> ()
        | Some method, _ ->
            printfn "Unhandled method: %s" method
        | None, _ ->
            ()
    
    let readHeaders () =
        let headers = Dictionary<string, string>()
        let mutable line = reader.ReadLine()
        while line <> null && line <> "" do
            let parts = line.Split(':', 2)
            if parts.Length = 2 then
                headers.Add(parts[0].Trim(), parts[1].Trim())
            line <- reader.ReadLine()
        headers
    
    let readContent length =
        let buffer = Array.zeroCreate<char> length
        let mutable bytesRead = 0
        while bytesRead < length do
            let read = reader.Read(buffer, bytesRead, length - bytesRead)
            if read = 0 then
                failwith "End of stream reached before content was fully read"
            bytesRead <- bytesRead + read
        new string(buffer)
    
    member this.Start() =
        Task.Run(fun () ->
            try
                while not cancellationTokenSource.IsCancellationRequested do
                    let headers = readHeaders()
                    if headers.ContainsKey("Content-Length") && Int32.TryParse(headers["Content-Length"], ref 0) then
                        let contentLength = Int32.Parse(headers["Content-Length"])
                        let content = readContent contentLength
                        handleMessage content
            with ex ->
                printfn "Server error: %s" ex.Message
        )
    
    member this.Stop() =
        cancellationTokenSource.Cancel()

[<EntryPoint>]
let main args =
    try
        let server = Server(Console.OpenStandardInput(), Console.OpenStandardOutput())
        let serverTask = server.Start()
        
        serverTask.Wait()
        0
    with ex ->
        printfn "Error: %s" ex.Message
        1