//  https://github.com/matarillo/vscode-languageserver-csharp-example/blob/master/server/SampleServer/App.cs

// use lower case for member names
namespace fswlsp

open System
open System.IO
open System.Threading
open System.Threading.Tasks
open LanguageServer 
open LanguageServer.Client 
open LanguageServer.Parameters 
open LanguageServer.Parameters.General 
open LanguageServer.Parameters.TextDocument 
open LanguageServer.Parameters.Workspace 
open LanguageServer.Parameters.Window
open LanguageServer.Json
open Newtonsoft.Json
open Newtonsoft.Json.Linq
open System.Text.RegularExpressions
open System.Text.Json
open System.Text
open System.Text.Encodings.Web
open System.Text.Json

open Wolfram.NETLink // https://reference.wolfram.com/language/NETLink/ref/net/Wolfram.NETLink.html



type WolframResultParams() =
                //     let result = json!({
                //     "input":  code["code"].to_string(),
                //     "load": false,
                //     "print":false,
                //     "result": response_clone.trim_matches('"'),
                //     "output": response_clone.trim_matches('"'),
                //     "position": code["range"]["end"],
                //     "hover": response_clone,
                //     "messages":  messages_and_errors.split("\n").collect::<Vec<&str>>(),
                //     "time": 0,
                //     "decoration":decoration,
                //     "document":  {
                //         "path": filepath
                //     }
                // });
    inherit NotificationMessageBase()
    member val ``params``: JToken = null with get, set
    member val method : string = "onRunInWolfram" with get, set

type WolframPrintParams() =
    inherit NotificationMessageBase()
    member val ``params``: JToken = null with get, set  
    member val method : string = "onPrintMessage" with get, set

type WolframBusyParams() =
    inherit NotificationMessageBase()
    member val ``params``: JToken = null with get, set
    member val method : string = "wolframBusy" with get, set

type updateInputsParams() =
    inherit NotificationMessageBase()
    member val ``params``: JToken = null with get, set
    member val method: string = "updateInputs" with get, set

type updatePositionsParams() =
    inherit NotificationMessageBase()
    member val ``params``: JToken = null with get, set
    member val method: string = "updatePositions" with get, set

type changeWorkspaceFoldersParams() =
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set

type SetTraceParams() =
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set

type storageUriParams() =
    inherit RequestMessageBase()
    // member val Params: JToken = null with get, set
    // member val uri: string = "" with get, set


type storageUriResponseParams() =
    inherit ResponseMessageBase()
    member val ``params``: JToken = null with get, set
    member val ``result``: JToken = null with get, set

type GetInputParams() =
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set

type RunInWolframParams() =
    inherit GetInputParams()

type UpdateConfigurationParams() = 
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set

type CancelRequestParams() =
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set

type windowFocusedParams() =
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set
    member val method: string = "windowFocused" with get, set

type GetVersionParams() =
    inherit RequestMessageBase()

type GetVersionResponseParams() =
    inherit ResponseMessageBase()
    member val ``params``: JToken = null with get, set
    member val ``result``: JToken = null with get, set

type PublishDiagnosticsNotification() = 
    inherit NotificationMessageBase()
    member val ``params``: JToken = null with get, set
    member val method: string = "textDocument/publishDiagnostics" with get, set

// type WorkspaceSymbolParams() =
//     inherit RequestMessageBase()
//     member val ``params``: JToken = null with get, set

type WorkspaceSymbolResponse() =
    inherit ResponseMessageBase()
    member val ``params``: JToken = null with get, set
    member val ``result``: JToken = null with get, set


type fswlspServer(input: Stream, output: Stream) = 
    inherit ServiceConnection(input, output)

    member val _ml : IKernelLink = null with get, set
    member val _lsp: IKernelLink = null with get, set
    
    member val Trace = "" with get, set

    member val Window: WindowProxy = null with get, set

    member val _document: string = "" with get, set

    member val _text: string = "" with get, set

    member val completions: JArray = null with get, set
    member val details: JObject = null with get, set

    member val locations : JArray = null with get, set

    // Dictionary of file paths and their document symbols
    // member val _document_symbols: Map<string, DocumentSymbol array> = Map.empty with get set
    member val _workspace_symbols:  Map<string, DocumentSymbol array> = Map.empty with get, set

    member this.pulse() =
        // this.log_messages("Pulse called")
        // this._ml.Pulse() |> ignore
        // this._lsp.Pulse() |> ignore
        ()

    member this.JsonToWolfram(input: string) = 
        this.escapeWolframString(this.unescapeWolframString(input))

    member this.unescapeWolframString (input: string) =
    // Check if the string is enclosed in quotes
        let content = input
        // Replace escaped sequences with their actual characters
        content
            .Replace("\\\\", "\\")
            // .Replace("\\n", "\n")
            .Replace("\\r", "\r")
            .Replace("\\u", "\u")
            .Replace("\\t", "\t")
            .Replace("\\/", "/")
            // Handle Unicode escapes like \u0022
            |> (fun s -> Regex.Replace(s, "\\\\u([0-9a-fA-F]{4})", 
                    (fun m -> 
                        let hex = m.Groups.[1].Value
                        Char.ConvertFromUtf32(Int32.Parse(hex, System.Globalization.NumberStyles.HexNumber)))))
    member this.escapeWolframString (input: string) =
        let sb = StringBuilder()
        sb.Append('"') |> ignore
        for c in input do
            match c with
            | '\\' -> sb.Append("\\\\") |> ignore
            | '"'  -> sb.Append("\\\"") |> ignore 
            // | '\n' -> sb.Append("\\n") |> ignore
            | '\r' -> sb.Append("\\r") |> ignore
            | '\t' -> sb.Append("\\t") |> ignore
            // | _ when int c < 0x20 || int c > 0x7E ->
            //     // Use Wolfram's hex notation for non-printable characters
            //     sb.Append(sprintf "\\:%04X" (int c)) |> ignore
            | _ ->
                sb.Append(c) |> ignore
        sb.Append('"') |> ignore
        sb.ToString()

    member this.log_messages(message: string): unit =
        let p = new LogMessageParams()
        p.``type`` <- MessageType.Info
        p.message <- sprintf "Wolfram: %s" message
        this.Window.LogMessage(p)
        ()

    member this.evaluate_in_kernel(ml: IKernelLink, code: string) =
        // ml
        
        

        let expr = sprintf "evaluateInKernel[%s]" ( this.escapeWolframString(code))


        try
            ml.Evaluate(expr)
            ml.WaitForAnswer() |> ignore
        with
        | ex -> 
            let error = new ResponseError<InitializeErrorData>()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            error.data <- null
            // Handle the error here, e.g., log it or send a notification to the client
            this.log_messages(sprintf "Error: %s" ex.Message)
            this.Initialized()
            ml.Evaluate(expr)
            ml.WaitForAnswer() |> ignore
            ()
        let eval = ml.GetString()



        let json = JToken.Parse( eval)
        let result = json.["Result"].ToString()
        let errors = String.Join("\n", (json.["Errors"] :?> JArray) |> Seq.map (fun x -> x.ToString()))


        let response = {|
            result = result
            errors = errors
        |}


        response

    member this.get_word_at_position(code: string, position: Position) =
        let lines = code.Split("\n")

        let line = lines.[min (int position.line) (lines.Length - 1)]

        // get the last word in the line using regex
        let regex = Regex(@"\w+")
        let words = regex.Matches(line)

        let word = words |> Seq.cast<Match> |> Seq.tryFind(fun m -> m.Index <= int position.character && m.Index + m.Length >= int position.character)
        let result = 
            match word with
            | Some m -> m.Value
            | None -> ""

        result






    override this.Initialize(initializeParams: InitializeParams): Result<InitializeResult, ResponseError<InitializeErrorData>> =
        try
            let log_messages(message :string) = 
                let p = new LogMessageParams()
                p.``type`` <- MessageType.Info
                p.message <- sprintf "%s" message

                this.Window.LogMessage(
                    p
                )
                ()

            let workspaceFoldersChangeHandler (p: changeWorkspaceFoldersParams) : unit =
                // Handle the workspace folders change event
                // You can perform actions when workspace folders are added or removed here
                // For example, you can log a message or update the UI

                // try
                let task = Task.Run(fun () ->
                    let uri = p.Params.["uri"].ToString()
                    let path = p.Params.["uri"].["path"].ToString()

                    try
                        let allFiles = 
                            Directory.GetFiles(path, "*.wl*", SearchOption.AllDirectories)
                            |> Seq.filter (fun file -> 
                                // Filter out files that are not Wolfram Language files
                                file.EndsWith(".wl") || file.EndsWith(".wls") 
                            )
                            |> Seq.toArray

                        // this.log_messages(sprintf "Workspace folders changed: %s" (String.Join(", ", allFiles)))

                        allFiles
                        |> Seq.iter (fun file ->
                            try
                                this.log_messages(sprintf "Reading file: %s" file)
                                let fileText = 
                                    try
                                        File.ReadAllText(file)
                                    with
                                    | :? FileNotFoundException -> 
                                        this.log_messages(sprintf "File not found: %s" file)
                                        ""
                                    | ex -> 
                                        this.log_messages(sprintf "Error reading file %s: %s" file ex.Message)
                                        ""
                                
                                if fileText <> "" then
                                    let input = sprintf "documentSymbols[%s, <|\"uri\"->\"%s\"|>]" (this.escapeWolframString fileText) file
                                    
                                    // this.log_messages(sprintf "Evaluating documentSymbols for file: %s" file)

                                    this._lsp.Evaluate(input)
                                    this._lsp.WaitForAnswer() |> ignore
                                    let js = this._lsp.GetString()

                                    this.log_messages(sprintf "Processing file: %s" file)

                                    let symbols = 
                                        js
                                        |> JArray.Parse
                                        |> Seq.map (fun x ->
                                            let symbol = new DocumentSymbol()
                                            symbol.name <- x["name"].ToString()     
                                            symbol.kind <- 
                                                try
                                                    x["kind"].ToObject<SymbolKind>()
                                                with
                                                | _ -> SymbolKind.Struct // Provide a default value
                                            symbol.detail <- x["detail"].ToString()     
                                            symbol.range <- x["location"].["range"].ToObject<Range>()
                                            symbol.selectionRange <- x["location"].["range"].ToObject<Range>()
                                            symbol.children <- [||]
                                            symbol
                                        )
                                        |> Seq.toArray

                                    // this.log_messages(sprintf "Adding %d symbols for file: %s" symbols.Length file)
                                    this._workspace_symbols <- this._workspace_symbols.Add(file, symbols)
                            with
                            | ex -> 
                                this.log_messages(sprintf "Error processing file %s: %s" file ex.Message)
                        )
                    with
                    | ex -> 
                        this.log_messages(sprintf "Error processing workspace folder %s: %s" path ex.Message)
                )       
                // Wait for the task to complete with a timeout
                if task.Wait(TimeSpan.FromSeconds(60.0)) then
                    this.log_messages(sprintf "Found %d symbols in workspace folders" this._workspace_symbols.Count)
                    ()
                    // Result<DocumentSymbolResult,ResponseError>.Success(result)
                else
                    this.log_messages(sprintf "Timed out adding symbols" )
                    ()
                    // Handle timeout case
                    // let uri = p.Params.["uri"].ToString()
                    // this.log_messages(sprintf "Timed out adding symbols for URI: %s" uri)
                    // let emptyResult = new DocumentSymbolResult([||]: DocumentSymbol array)
                    // Result<DocumentSymbolResult,ResponseError>.Success emptyResult
                // with
                // | ex -> 
                //     this.log_messages(sprintf "Error in DidChangeWorkspaceFolders: %s" ex.Message)
                //     // let result = new DocumentSymbolResult([||]: DocumentSymbol array)
                //     // // Result<DocumentSymbolResult,ResponseError>.Success(result)  
                // ()

            // let workplaceSymbolsHandler (request: WorkspaceSymbolParams) (cancellationToken: CancellationToken): ResponseMessageBase =
            //     // Handle the request to get workspace symbols
            //     let _, query = 
            //         request.``params``.ToObject<JObject>().TryGetValue("query")

            //     this.log_messages(sprintf "WorkspaceSymbolParams: %d" (this._workspace_symbols.Length))
                
            //     let response = new WorkspaceSymbolResponse()
            //     response.result <-
            //         if query = null || query.ToString() = "" then
            //              JToken.FromObject(this._workspace_symbols)
            //         else
            //             let symbols = 
            //                 this._workspace_symbols 
            //                 |> Array.filter (fun s -> s.name.Contains(query.ToString(), StringComparison.OrdinalIgnoreCase))
            //             // Create a response with the filtered symbols
            //             this.log_messages(sprintf "Filtered symbols: %d" (symbols.Length))
            //             JToken.FromObject(symbols)
            //     response


            let traceHandler (request: SetTraceParams) : unit =

                let value:JToken = request.Params["value"]
                // log_messages(sprintf "setTrace: %s" ( request.Params.ToString() ))
                ()

            let storageUriHandler (request: storageUriParams) (cancellationToken: CancellationToken): ResponseMessageBase =
                // log_messages(sprintf "setTrace: %s" ( request.ToString() ))
                // let uri = request.Params["uri"].ToString()
                let working_dir_uri = Directory.GetCurrentDirectory()

                let result:storageUriResponseParams  = 
                    storageUriResponseParams()
                result.``result`` <- JObject()
                result.``result``.["uri"] <- working_dir_uri
                result.id <- request.id
                result 

            let windowFocusedHandler (request: windowFocusedParams): unit =
                // Handle the window focused event
                // You can perform actions when the window is focused here
                // For example, you can log a message or update the UI

                // this.log_messages(sprintf "Window focused: %s" (request.Params.ToString()))
                ()

            let get_input(request: GetInputParams): string = 

                let range = this.escapeWolframString (request.Params["range"].ToString())
                let text = this.escapeWolframString (this.unescapeWolframString (request.Params["text"].ToString()))

                let eval = sprintf "getCodeString[%s, %s]" text range

                this._ml.Evaluate(eval)
                this._ml.WaitForAnswer() |> ignore

                let result = this._ml.GetString()

                let input = JObject.Parse( result)
                let code = input["code"].ToString()
                code 

            let getInputHandler (request: GetInputParams): unit = 
                try
                    let input:string = get_input(request)

                    // send notification to client
                    let p = new updateInputsParams()
                    p.``params`` <- {| 
                        id = request.Params["id"]
                        input = input
                        
                         |} |> JObject.FromObject

                    this.SendNotification(
                        p
                    )
                with 
                | ex -> 
                    let error = new ResponseError<InitializeErrorData>()
                    error.code <- ErrorCodes.InternalError
                    error.message <- ex.Message
                    error.data <- null
                    // Handle the error here, e.g., log it or send a notification to the client
                    log_messages(sprintf "Error: %s" ex.Message)
                ()

            let runInWolframHandler(request: RunInWolframParams): unit =
                // Handle the request to run code in Wolfram
                // You can implement the logic to run the code here

                this._document <- request.Params.["textDocument"].["uri"].["external"].ToString() 

                let expr = sprintf "Unprotect[NotebookDirectory]; NotebookDirectory[] = FileNameJoin[
                    URLParse[DirectoryName[\"%s\"]][\"Path\"]] <> $PathnameSeparator ;" this._document

                this._ml.Evaluate(expr)
                this._ml.WaitForAnswer() |> ignore
                this._ml.GetString() |> ignore


                let range = request.Params["range"].ToObject<Range>()
                range.``end``.line <- range.``end``.line + int64(1)
                
                let busy = WolframBusyParams()
                busy.``params`` <- JObject.FromObject({|
                    busy = true
                    text = "..."
                    position = range
                    |})
                busy.method <- "wolframBusy"
                this.SendNotification(
                    busy
                )


                let input = get_input request

                let start_time = DateTime.Now

                let eval = this.evaluate_in_kernel(this._ml, input) 
                let result = eval.result
                let errors = eval.errors
                // printfn "Result from Wolfram: %d" resultp

                let end_time = DateTime.Now
                let elapsed_time = end_time - start_time
                let elapsed_time_seconds = elapsed_time.TotalSeconds

                let wolframResult: WolframResultParams = WolframResultParams()
                wolframResult.``params`` <- JObject.FromObject({|
                    id = request.Params["id"]
                    input = input
                    load = false
                    print = request.Params["print"].ToObject<bool>()
                    result = result
                    output = result
                    position = range.``end``
                    hover = result
                    messages = errors.Split("\n")
                    time = 0
                    decoration = sprintf "%0.2f s: %s" elapsed_time_seconds (result.Substring(0, Math.Min(result.Length, 100)))
                    document = request.Params["textDocument"]
                |})
                
                this.SendNotification(
                    wolframResult
                )

                busy.``params``["busy"] <- false
                busy.``params``["text"] <- ""
                this.SendNotification(
                    busy
                )
                ()

            let updateConfigurationHandler (request: UpdateConfigurationParams): unit = 
                // Handle the configuration update here
                // You can access the updated configuration using request.configuration
                // let config = request.configuration
                // Perform any necessary actions based on the updated configuration
                ()
            // let storageUriHandler (request: storageUriParams) (cancellationToken: CancellationToken): ResponseMessageBase =
            let getVersionHandler(request: GetVersionParams) (cancellationToken: CancellationToken): ResponseMessageBase =
                this._ml.Evaluate("Round[$VersionNumber, 0.1]")
                this._ml.WaitForAnswer() |> ignore
                let version = this._ml.GetString()
                let response = new GetVersionResponseParams()
                response.``result`` <- JObject.FromObject({|
                    version = version
                |})
                response.id <- request.id
                response

            this.RequestHandlers.Set<storageUriParams, ResponseMessageBase>(
                "storageUri",
                Func<storageUriParams, CancellationToken, ResponseMessageBase>(storageUriHandler)
            )
            
            this.RequestHandlers.Set<CancelRequestParams, ResponseMessageBase>(
                "$/cancelRequest",
                Func<CancelRequestParams, CancellationToken, ResponseMessageBase>(fun _ _ -> null)
            )

            this.RequestHandlers.Set<GetVersionParams, ResponseMessageBase>(
                "getVersion",
                Func<GetVersionParams, CancellationToken, ResponseMessageBase>(getVersionHandler)
            )

            this.RequestHandlers.Set<CancelRequestParams, ResponseMessageBase>(
                "$/cancelRequest",
                Func<CancelRequestParams, CancellationToken, ResponseMessageBase>(fun _ _ -> null)
            )

            // this.RequestHandlers.Set<WorkspaceSymbolParams, ResponseMessageBase>(
            //     "workspace/symbol",
            //     Func<WorkspaceSymbolParams, CancellationToken, ResponseMessageBase>(workplaceSymbolsHandler)
            // )
            

            this.NotificationHandlers.Set<RunInWolframParams>(
                "runInWolfram",
                Action<RunInWolframParams>(runInWolframHandler)
            )

            this.NotificationHandlers.Set<GetInputParams>(
                "getInput",
                Action<GetInputParams>(getInputHandler)
            )

            this.NotificationHandlers.Set<UpdateConfigurationParams>(
                "updateConfiguration",
                Action<UpdateConfigurationParams>(updateConfigurationHandler)
            )

            this.NotificationHandlers.Set<windowFocusedParams>(
                "windowFocused",
                Action<windowFocusedParams>(windowFocusedHandler)
            )

            this.NotificationHandlers.Set<SetTraceParams>(
                "$/setTrace",
                Action<SetTraceParams>(traceHandler)
            )

            this.NotificationHandlers.Set<changeWorkspaceFoldersParams>(
                "didChangeWorkspaceFolders",
                Action<changeWorkspaceFoldersParams>(workspaceFoldersChangeHandler)
            )

            let capabilities = new ServerCapabilities()
            capabilities.textDocumentSync <- TextDocumentSyncKind.Full
            capabilities.hoverProvider <- true
            capabilities.codeLensProvider <- new CodeLensOptions()
            capabilities.codeLensProvider.resolveProvider <- false
            capabilities.documentSymbolProvider <- true
            capabilities.foldingRangeProvider <- true
            capabilities.colorProvider <- true

            let completionOptions = new CompletionOptions()
            // completionOptions.resolveProvider <- true
            // completionOptions.triggerCharacters <- [| "["; "," |]
            completionOptions.resolveProvider <- false
            capabilities.completionProvider <- completionOptions

            capabilities.workspaceSymbolProvider <- true

            // capabilities.workspace <- new WorkspaceOptions()
            // capabilities.workspace.workspaceFolders <- new WorkspaceFoldersOptions()
            // capabilities.workspace.workspaceFolders.supported <- true
            // capabilities.workspace.workspaceFolders.changeNotifications <- new ChangeNotificationsOptions(true)
            

            let result = new InitializeResult()
            result.capabilities <- capabilities 

            Result<InitializeResult, ResponseError<InitializeErrorData>>.Success(result)
        with
        | ex -> 
            let errorData = new InitializeErrorData()
            errorData.retry <- false
            let error = new ResponseError<InitializeErrorData>()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            error.data <- errorData
            Result<InitializeResult, ResponseError<InitializeErrorData>>.Error(error)

    member this.packetArrived(pkt:PacketType):bool =  
        // switch statement to handle the packet type
        // this.log_messages(sprintf "Packet arrived: %A" pkt)
        match pkt with
            | PacketType.Illegal -> () // this.log_messages("Illegal packet received.")
            | PacketType.Call -> () // this.log_messages("Call packet received.")
            | PacketType.Evaluate -> () // this.log_messages("Evaluate packet received.")
            | PacketType.Return -> ()
            | PacketType.InputName -> () // this.log_messages("InputName packet received.")
            | PacketType.EnterText -> () // this.log_messages("EnterText packet received.")
            | PacketType.EnterExpression -> () // this.log_messages("EnterExpression packet received.")
            | PacketType.OutputName -> () // this.log_messages("OutputName packet received.")
            | PacketType.ReturnText -> () // this.log_messages("ReturnText packet received.")
            | PacketType.ReturnExpression -> () // this.log_messages("ReturnExpression packet received.")
            | PacketType.Display -> this.log_messages( sprintf "%s" (this._ml.GetString()))
            | PacketType.DisplayEnd -> this.log_messages(sprintf "%s" (this._ml.GetString()))
            | PacketType.Message -> 
                let message = this._ml.GetString()
                this.log_messages(sprintf "%s" message)
            | PacketType.Text -> 
                let text = this._ml.GetString()
                this.log_messages(sprintf "%s" text)
                let p = new ShowMessageParams()
                p.``type`` <- MessageType.Info
                p.message <- sprintf "%s ... full output in output log" (text.Substring(
                    0, 
                    Math.Min(text.Length, 100) // Limit the message length to 100 characters
                )) // Truncate the message to avoid overflow
                let actionItem = new MessageActionItem()
                actionItem.title <- "Open Log"
                // p.actions <- [| actionItem |]
                this.Window.ShowMessage(p)

                let p2 = new ShowMessageRequestParams()
                p2.``type`` <- MessageType.Info
                p2.message <- sprintf "%s ... full output in output log" (text.Substring(
                    0, 
                    Math.Min(text.Length, 100) // Limit the message length to 100 characters
                )) // Truncate the message to avoid overflow
                p2.actions <- [| actionItem |]
                // this.Window.ShowMessageRequest(
                //     p2
                // ) |> ignore


                let printMessage = WolframResultParams()
                printMessage.``params`` <- JObject.FromObject({|
                    id = "printMessage"
                    message = text
                    |})
                printMessage.method <- "onPrintMessage"
                this.SendNotification(
                    printMessage
                )

                ()
            // | PacketType.InputReply -> () // this.log_messages("InputReply packet received.")
            // | PacketType.InputExpression -> () // this.log_messages("InputExpression packet received.")
            // | PacketType.InputText -> () // this.log_messages("InputText packet received.") 
// ...existing code...
            | PacketType.Input -> () // this.log_messages("Input packet received.")
            | PacketType.InputString -> () // this.log_messages("InputString packet received.")
            | PacketType.Menu -> () // this.log_messages("Menu packet received.")
            | PacketType.Syntax -> this.log_messages(sprintf "%s" (this._ml.GetString()))
            | PacketType.Suspend -> () // this.log_messages("Suspend packet received.")
            | PacketType.Resume -> () // this.log_messages("Resume packet received.")
            | PacketType.BeginDialog -> () // this.log_messages("BeginDialog packet received.")
            | PacketType.EndDialog -> () // this.log_messages("EndDialog packet received.")
            | PacketType.FirstUser -> () // this.log_messages("FirstUser packet received.")
            | PacketType.LastUser -> () // this.log_messages("LastUser packet received.")
            | PacketType.FrontEnd -> () // this.log_messages("FrontEnd packet received.")
            | PacketType.Expression -> () // this.log_messages("Expression packet received.")
            | _ -> () // this.log_messages("Unknown packet type received.")     
        true

    override this.Initialized (): unit = 

        try
            this._lsp <- MathLinkFactory.CreateKernelLink()
            this._lsp.WaitAndDiscardAnswer()

            this._ml <- MathLinkFactory.CreateKernelLink()
            this._ml.WaitAndDiscardAnswer()

            this._ml.add_PacketArrived(PacketHandler(fun _ -> 
                // this._ml.WaitAndDiscardAnswer() |> ignore
                this.packetArrived
            )) |> ignore
        with
        | ex -> 
            let error = new ResponseError<InitializeErrorData>()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            error.data <- null
            // Handle the error here, e.g., log it or send a notification to the client
            this.log_messages(sprintf "Error: %s" ex.Message)
            let showMessageParams = new ShowMessageParams()
            showMessageParams.``type`` <- MessageType.Error
            showMessageParams.message <- sprintf "Error starting Wolfram. This may be due to installation or licensing problems: %s" ex.Message

            this.Window.ShowMessage(
                showMessageParams
            )
            
            // exit 1
            ()

        

        // get path of binary
        let binary_path = System.Reflection.Assembly.GetExecutingAssembly().Location

        // let wlsp_folder = binary_path.Substring(0, binary_path.IndexOf("wlsp")+4)
        let binary_folder = System.IO.Path.GetDirectoryName(binary_path)


        this.Window <- this.Proxy.Window
        
        let current_dir = Directory.GetCurrentDirectory()

        // match wlsp
        let fswstp_path = binary_folder.Substring(0, binary_folder.IndexOf("fswstp")+6)
        let wlsp_path = Path.Combine(fswstp_path,  "../")

        let utils_path = Path.Combine(wlsp_path, "wolfram", "utils.wl")
        // this.log_messages(sprintf "Wolfram: %s" utils_path)
        // this.evaluate_in_kernel(this._ml, sprintf "Get[\"%s\"]" utils_path)   |> ignore
        // this.evaluate_in_kernel(this._lsp, sprintf "Get[\"%s\"]" utils_path)  |> ignore
        this._ml.Evaluate(sprintf "Get[\"%s\"]" utils_path) 
        this._ml.WaitAndDiscardAnswer() |> ignore
        this._lsp.Evaluate(sprintf "Get[\"%s\"]" utils_path) 
        this._lsp.WaitAndDiscardAnswer() |> ignore
        // this._lsp.WaitForAnswer() |> ignore

        // read the json file and import it
        this.completions <- File.ReadAllText(Path.Combine(binary_folder, "completions.json")) |> JArray.Parse 
        let details = File.ReadAllText(Path.Combine(binary_folder, "details.json")) |> JArray.Parse

        // for each item in details, create a JObject with the key detail and value the item
        let detailsObject = new JObject()
        for item in details do
            let key = item["detail"].ToString().Replace(" details", "")
            let value = item
            detailsObject.[key] <- value

        this.details <- detailsObject

        // let p = new LogMessageParams()
        // p.``type`` <- MessageType.Info
        // p.message <- sprintf "Hello from Wolfram: %s" utils
        // this.Window.LogMessage(
        //     p
        // )
        base.Initialized()

    override this.DocumentSymbols (p: DocumentSymbolParams): Result<DocumentSymbolResult,ResponseError> = 
        try
            // Create a Task that will run the document symbols operation
            let task = Task.Run(fun () ->
                let input = sprintf "documentSymbols[%s, <|\"uri\"->\"%s\"|>]" (this._text) (p.textDocument.uri.LocalPath.Replace("file://", ""))
                
                this._lsp.Evaluate(input)
                this._lsp.WaitForAnswer() |> ignore
                let js = this._lsp.GetString() 

                // Parse symbols from the JSON response
                let symbols = 
                    js 
                    |> JArray.Parse
                    |> Seq.map (fun x -> 
                        let symbol = new DocumentSymbol()
                        symbol.name <- x["name"].ToString()
                        symbol.kind <- 
                            try
                                x["kind"].ToObject<SymbolKind>()
                            with
                            | _ -> SymbolKind.Struct // Provide a default value
                        symbol.detail <- x["detail"].ToString()
                        symbol.range <- x["location"].["range"].ToObject<Range>()
                        symbol.selectionRange <- x["location"].["range"].ToObject<Range>()
                        symbol.children <- [||]
                        symbol
                    )
                    |> Seq.toArray

                let result = new DocumentSymbolResult(symbols)
                result
            )
            
            // Wait for the task to complete with a timeout
            if task.Wait(TimeSpan.FromSeconds(5.0)) then
                Result<DocumentSymbolResult,ResponseError>.Success task.Result
            else
                // Handle timeout case
                this.log_messages("DocumentSymbols operation timed out")
                let emptyResult = new DocumentSymbolResult([||]: DocumentSymbol array)
                Result<DocumentSymbolResult,ResponseError>.Success emptyResult
        with
        | ex -> 
            this.log_messages(sprintf "Error in DocumentSymbols: %s" ex.Message)
            let result = new DocumentSymbolResult([||]: DocumentSymbol array)
            Result<DocumentSymbolResult,ResponseError>.Success(result)


    override this.FoldingRange (p: FoldingRangeRequestParam): Result<FoldingRange array,ResponseError> = 
            // base.FoldingRange(params: FoldingRangeRequestParam)
        try
            //check if file exists
            if not (File.Exists(p.textDocument.uri.LocalPath.Replace("file://", ""))) then
                let error = new ResponseError()
                error.code <- ErrorCodes.InvalidParams
                error.message <- sprintf "File %s does not exist" (p.textDocument.uri.LocalPath.Replace("file://", ""))
                Result<FoldingRange array,ResponseError>.Success([||] : FoldingRange array)
            else
                let expr = sprintf "updateCursorLocations[%s]" (this._text)

                this._lsp.Evaluate(expr)
                this._lsp.WaitForAnswer() |> ignore
                let locations = 
                    try 
                        let js = this._lsp.GetString()
                        JArray.Parse(js)
                    with
                    | ex -> 
                        JArray()

                let result = 
                    locations |> 
                    Seq.map (fun x -> 
                        let range = new FoldingRange()
                        range.startLine <- x.["start"].["line"].ToObject<int64>() - 1L
                        range.startCharacter <- x.["start"].["character"].ToObject<int64>()
                        range.endLine <- x.["end"].["line"].ToObject<int64>()-1L
                        range.endCharacter <- x.["end"].["character"].ToObject<int64>()
                        range.kind <- FoldingRangeKind.Region
                        range
                    ) |> 
                    Seq.toArray
                
                Result<FoldingRange array,ResponseError>.Success(result)
        with
        | ex -> 
            let error = new ResponseError()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            // Handle the error here, e.g., log it or send a notification to the client
            this.log_messages(sprintf "Error: %s" ex.Message)
            Result<FoldingRange array,ResponseError>.Error(error)


    override this.DidChangeTextDocument (p: DidChangeTextDocumentParams): unit = 

        // check if file exists
        if not (File.Exists(this._document)) then
            
            ()
        else
            this._document <- p.textDocument.uri.LocalPath.Replace("file://", "") 
            this._text <- this.JsonToWolfram(p.contentChanges.[0].text)
            let expr = sprintf "Unprotect[NotebookDirectory]; NotebookDirectory[] = FileNameJoin[
                URLParse[DirectoryName[\"%s\"]][\"Path\"]] <> $PathnameSeparator ;" this._document
            
            this._ml.Evaluate(expr) 
            this._ml.WaitAndDiscardAnswer() |> ignore

            this.validate(p)

            let expr = sprintf "updateCursorLocations[%s]" (this._text)

            this._lsp.Evaluate(expr)
            this._lsp.WaitForAnswer() |> ignore
            let locations = 
                try 
                    let js = this._lsp.GetString()
                    JArray.Parse(js)
                with
                | ex -> 
                    JArray()

            let p2 = new updatePositionsParams()
            p2.``params`` <- JObject.FromObject({|
                result = [{|
                    location = {| uri = this._document|}
                    locations = locations 
                |}]
            |})

            this.SendNotification(
                p2
            )
            
    override this.DidOpenTextDocument (p: DidOpenTextDocumentParams): unit = 

        //  check if file exists 
        if not (File.Exists(p.textDocument.uri.LocalPath.Replace("file://", ""))) then
     
            ()
        else
            this._document <- p.textDocument.uri.LocalPath.Replace("file://", "")
            this._text <- this.JsonToWolfram(p.textDocument.text)

            let expr = sprintf "Unprotect[NotebookDirectory]; NotebookDirectory[] = FileNameJoin[
                URLParse[DirectoryName[\"%s\"]][\"Path\"]] <> $PathnameSeparator ;" this._document
            
            this._ml.Evaluate(expr) 
            this._ml.WaitAndDiscardAnswer() |> ignore

            let expr = sprintf "updateCursorLocations[%s]" (this._text)

            this._lsp.Evaluate(expr)
            this._lsp.WaitForAnswer() |> ignore
            let locations = 
                try 
                    let js = this._lsp.GetString()
                    JArray.Parse(js)
                with
                | ex -> 
                    JArray()

            let p2 = new updatePositionsParams()
            p2.``params`` <- JObject.FromObject({|
                result = [{|
                    location = {| uri = this._document|}
                    locations = locations 
                |}]
            |})

            this.SendNotification(
                p2
            )

    member this.validate(paramsI: obj) = 
        let textDocument = 
            match paramsI with
            | :? DidSaveTextDocumentParams as saveParams -> saveParams.textDocument
            | :? DidChangeTextDocumentParams as changeParams -> changeParams.textDocument
            | _ -> failwith "Unsupported parameter type"


        // You can implement your validation logic here
        let escapeAscii (s: string) =
            let sb = StringBuilder()
            for c in s do
                if int c < 32 || int c > 126 then
                    sb.Append(sprintf "\\\\u%04X" (int c)) |> ignore
                else
                    sb.Append(c) |> ignore
            sb.ToString()

        let expr = sprintf "validate[%s, %s]" this._text (this.escapeWolframString(this._document))

        this._lsp.Evaluate(expr)
        this._lsp.WaitForAnswer() |> ignore
        let js = this._lsp.GetString()

        let diagnostics  = JObject.Parse(js)
        let p = new PublishDiagnosticsParams()
        p.uri <- textDocument.uri
        p.diagnostics <- diagnostics.["params"].["diagnostics"].ToObject<Diagnostic[]>()

        let pd = new PublishDiagnosticsNotification()
        pd.``params`` <- JObject.FromObject(p)
        this.SendNotification(
            pd
        )
        ()

    override this.DidSaveTextDocument (Params: DidSaveTextDocumentParams): unit = 
            try
                this._document <- Params.textDocument.uri.LocalPath.Replace("file://", "")
                this.validate(Params)
                ()
            with
            | ex -> 
                let error = new ResponseError()
                error.code <- ErrorCodes.InternalError
                error.message <- ex.Message
                // Handle the error here, e.g., log it or send a notification to the client
                this.log_messages(sprintf "Error: %s" ex.Message)
                ()


    override this.CodeLens (p: CodeLensParams): Result<CodeLens array,ResponseError> = 
        // this.log_messages(sprintf "CodeLens for %s" (p.textDocument.uri.LocalPath.Replace("file://", "")))    
        // if p.textDocument.uri.LocalPath.Replace("file://", "") <> this._document then

        //     Result<CodeLens array,ResponseError>.Success([||])
        // else
        try
            // check if file exists
            if not (File.Exists(p.textDocument.uri.LocalPath.Replace("file://", ""))) then
                Result<CodeLens array,ResponseError>.Success([||])
                // return empty array
            else
                let input = sprintf "codeLens[%s]" (this._text)
                this._lsp.Evaluate(input)
                this._lsp.WaitForAnswer() |> ignore
                let js2 = this._lsp.GetString()

                let codeLenses: CodeLens array = 
                    js2 
                    |> JArray.Parse
                    |> Seq.filter (fun x ->x.ToString().Contains("command"))
                    |> Seq.map (fun x -> 

                        let command = new Command()
                        command.title <- x["command"].["title"].ToString()
                        command.command <- x["command"].["command"].ToString()
                        command.arguments <- x["command"].["arguments"].ToObject<JArray>().ToObject<obj[]>()
                        let codeLens = new CodeLens()
                        codeLens.range <- x["range"].ToObject<Range>()
                        codeLens.command <- command // or set it if needed
                        codeLens
                    )
                    |> Seq.toArray

                Result<CodeLens array,ResponseError>.Success(codeLenses)
        with
            | ex -> 
                let error = new ResponseError()
                error.code <- ErrorCodes.InternalError
                error.message <- ex.Message
                Result<CodeLens array,ResponseError>.Error(error)



        // this.evaluate_in_kernel(this._ml, expr) |> ignore
        // let p = new LogMessageParams()
        // p.``type`` <- MessageType.Info
        // p.message <- sprintf "Hello from Wolfram: %s" this._document
        // this.Window.LogMessage(
        //     p
        // )
    override this.Hover (p: TextDocumentPositionParams): Result<Hover,ResponseError> = 
        try

            let s = this.get_word_at_position(this._text, p.position)

            // if s == "" then return null
            if s = "" then
                let hover = new Hover()
                let range = new Range()
                range.``start`` <- p.position
                range.``end`` <- p.position
                hover.range <- range
                let m:MarkupContent = new MarkupContent()
                m.kind <- MarkupKind.Markdown
                m.value <- ""
                hover.range <- range
                hover.contents <- MarkupContent()
                hover.contents <- m
                Result<Hover,ResponseError>.Success(hover)
            else
                let result = this.evaluate_in_kernel(
                    this._ml, 
                    sprintf "TimeConstrained[%s, 2, \"Large output\"]" s)

                // let message = result.result.ToString().Replace("<img src=\"data:image/jpg;base64,", "![alt text](data:image/jpg;base64,").Replace("class=\"img-responsive\"/>", ")"). Replace("\" \)", ")") 
                let message = result.result

                // details object and get the value or null
                let exists, value = this.details.TryGetValue(s)
                let detail = if exists then value else new JObject()
                let message2 = 
                    if detail.["detail"] <> null then
                        sprintf "%s\n\n%s" message (this.escapeWolframString(detail.["documentation"].ToString()) )
                    else
                        message

                let hover = new Hover()
                let range = new Range()
                range.``start`` <- p.position
                range.``end`` <- p.position

                let m:MarkupContent = new MarkupContent()
                m.kind <- MarkupKind.Markdown
                m.value <- message2
                hover.range <- range
                hover.contents <- MarkupContent()
                hover.contents <- m

                Result<Hover,ResponseError>.Success(hover)
        with
        | ex -> 
            let error = new ResponseError()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            // Handle the error here, e.g., log it or send a notification to the client
            let hover = new Hover()
            let range = new Range()
            range.``start`` <- p.position
            range.``end`` <- p.position
            let m = new MarkupContent()
            hover.range <- range
            hover.contents <- MarkupContent()
            Result<Hover,ResponseError>.Success(hover)
        

    override this.Completion (p: CompletionParams): Result<CompletionResult,ResponseError> = 
        try    
            let getDistinctWords text =
                let matches = Regex.Matches(this._text, @"\b\w+\b")
                matches |> Seq.cast<Match> |> Seq.map (fun m -> m.Value) |> Seq.distinct |> Seq.toArray
            
            // get all the labels from the completions
            let labels = this.completions |> Seq.cast<JObject> |> Seq.map (fun x -> x.["label"].ToString()) |> Seq.distinct |> Seq.toArray

            // combine the labels with the distinct words
            let candidates = Array.append labels (getDistinctWords(this._text))

            let string = this.get_word_at_position(this._text, p.position)

            // filter the candidates based on whether they start with the string
            let filteredCandidates = 
                candidates 
                |> Array.filter (fun x -> x.StartsWith(string, StringComparison.OrdinalIgnoreCase))
                |> Array.map (fun x -> 
                    let completionItem = new CompletionItem()
                    completionItem.label <- x
                    completionItem.kind <- CompletionItemKind.Text
                    completionItem.detail <- x
                    completionItem.documentation <- x
                    completionItem.insertTextFormat <- InsertTextFormat.PlainText
                    completionItem.sortText <- x
                    completionItem.filterText <- x

                    let textEditRange = new Range()
                    textEditRange.``start`` <- p.position

                    let endPosition = new Position()
                    endPosition.line <- p.position.line
                    endPosition.character <- p.position.character + int64(string.Length)

                    // completionItem.textEdit <- new TextEdit()
                    // textEditRange.``end`` <- endPosition
                    // completionItem.textEdit.range <- textEditRange
                    // completionItem.textEdit.newText <- x

                    completionItem
                )



            let result = new CompletionResult(filteredCandidates)
            
            Result<CompletionResult,ResponseError>.Success(result)
        with
        | ex -> 
            let error = new ResponseError()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            // Handle the error here, e.g., log it or send a notification to the client
            this.log_messages(sprintf "Error in Completion: %s" ex.Message)
            let result = new CompletionResult([||])
            Result<CompletionResult,ResponseError>.Success(result)

    override this.Symbol (p: WorkspaceSymbolParams): Result<SymbolInformation array,ResponseError> = 
            // base.Symbol(p: WorkspaceSymbolParams)
                // Handle the request to get workspace symbols
        let query = p.query
        // this.log_messages(sprintf "WorkspaceSymbolParams: %s" (JObject.FromObject(p).ToString()))

        // this.log_messages(sprintf "WorkspaceSymbolParams: %d" (this._workspace_symbols.Count))

        let symbols: SymbolInformation array =
            if query = null || query.ToString() = "" then 
                this.log_messages("No query provided, returning all symbols.")
                this._workspace_symbols
                |> Map.toSeq
                |> Seq.collect (fun (key, value) -> 
                    this.log_messages(sprintf "Symbol: %s" key)
                    value 
                    |> Array.map (fun x -> 
                        this.log_messages(sprintf "Symbol: %s" key)
                        // let jsonObject = JObject.Parse(key)
                        // let externalUriString = jsonObject.["external"].ToString()
                        let uri = Uri(key)

                        let symbolInfo = new SymbolInformation()
                        symbolInfo.name <- x.name
                        symbolInfo.kind <- x.kind
                        symbolInfo.location <- new Location()
                        symbolInfo.location.uri <- uri
                        symbolInfo.location.range <- x.range
                        symbolInfo
                    )
                )
                |> Seq.toArray
            else
                this._workspace_symbols
                |> Map.toSeq
                |> Seq.collect (fun (key, value) -> 
                    value 
                    |> Array.map (fun x -> 
                        // let jsonObject = JObject.Parse(key)
                        // let externalUriString = jsonObject.["external"].ToString()
                        let uri = Uri(key)

                        let symbolInfo = new SymbolInformation()
                        symbolInfo.name <- x.name
                        symbolInfo.kind <- x.kind
                        symbolInfo.location <- new Location()
                        symbolInfo.location.uri <- uri
                        symbolInfo.location.range <- x.range
                        symbolInfo
                    )
                )
                |> Seq.toArray
                |> Seq.filter (fun symbol -> 
                    // Check if the symbol name contains the query string
                    symbol.name.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0
                )
                |> Seq.toArray

        // log all the symbols found by sending the name of each symbol to the log
        // this.log_messages(sprintf "Found %d symbols in workspace folders" symbols.Length)
        // for symbol in symbols do
        //     this.log_messages(sprintf "Symbol: %s" symbol.name)


        let response = symbols
        Result<SymbolInformation array,ResponseError>.Success(response)


    // override this.SignatureHelp (p: TextDocumentPositionParams): Result<SignatureHelp,ResponseError> = 
    //         base.SignatureHelp(p: TextDocumentPositionParams)
    //         let result = new SignatureHelp()
    //         let signature = new SignatureInformation()
    //         signature.label <- "Signature Help Example"
    //         signature.documentation <- "This is an example of signature help."
    //         signature.parameters <- [| new ParameterInformation("param1", "The first parameter") | new ParameterInformation("param2", "The second parameter") |]
    //         result.signatures <- [| signature |]
    //         result.activeSignature <- 0
    //         result.activeParameter <- 0
    //         Result<SignatureHelp,ResponseError>.Success(result) 

    // override this.DidChangeWorkspaceFolders (p: DidChangeWorkspaceFoldersParams): unit = 
    //     this.log_messages(sprintf "DidChangeWorkspaceFolders" )
    //         // create a task that will find all .wl and .wls files in the workspace and get the documentSymbols for each file using the Wolfram Language
    //     try
    //         let task = Task.Run(fun () ->
    //             let workspaceFolders = p.event.added |> Seq.map (fun x -> x.uri.ToString()) |> Seq.toArray
    //             let allFiles = 
    //                 workspaceFolders
    //                 |> Seq.collect (fun folder ->
    //                     Directory.GetFiles(folder, "*.wl", SearchOption.AllDirectories)
    //                     |> Seq.append (Directory.GetFiles(folder, "*.wls", SearchOption.AllDirectories))
    //                 )       
    //             let symbols = 
    //                 allFiles
    //                 |> Seq.map (fun file ->
    //                     let input = sprintf "documentSymbols[%s, <|\"uri\"->\"%s\"|>]" (this.escapeWolframString(file)) file
    //                     this._lsp.Evaluate(input)
    //                     this._lsp.WaitForAnswer() |> ignore
    //                     let js = this._lsp.GetString()
    //                     js
    //                     |> JArray.Parse
    //                     |> Seq.map (fun x ->
    //                         let symbol = new DocumentSymbol()
    //                         symbol.name <- x["name"].ToString()     
    //                         symbol.kind <- 
    //                             try
    //                                 x["kind"].ToObject<SymbolKind>()
    //                             with
    //                             | _ -> SymbolKind.Struct // Provide a default value
    //                         symbol.detail <- x["detail"].ToString()     
    //                         symbol.range <- x["location"].["range"].ToObject<Range>()
    //                         symbol.selectionRange <- x["location"].["range"].ToObject<Range>()
    //                         symbol.children <- [||]
    //                         symbol
    //                     )
    //                     |> Seq.toArray
    //                 )
    //             symbols
    //         )       
    //         // Wait for the task to complete with a timeout
    //         if task.Wait(TimeSpan.FromSeconds(5.0)) then
    //             let symbols = task.Result |> Seq.concat |> Seq.toArray
    //             let result = new DocumentSymbolResult(symbols)
    //             this.log_messages(sprintf "Found %d symbols in workspace folders" symbols.Length)
    //             this._workspace_symbols <- symbols
    //             // Result<DocumentSymbolResult,ResponseError>.Success(result)
    //         else
    //             // Handle timeout case
    //             this.log_messages("DidChangeWorkspaceFolders operation timed out")
    //             // let emptyResult = new DocumentSymbolResult([||]: DocumentSymbol array)
    //             // Result<DocumentSymbolResult,ResponseError>.Success emptyResult
    //     with
    //     | ex -> 
    //         this.log_messages(sprintf "Error in DidChangeWorkspaceFolders: %s" ex.Message)
    //         // let result = new DocumentSymbolResult([||]: DocumentSymbol array)
    //         // // Result<DocumentSymbolResult,ResponseError>.Success(result)  

    override this.ColorPresentation (p: ColorPresentationParams): Result<ColorPresentation array,ResponseError> = 
            if p.textDocument.uri.LocalPath.Replace("file://", "") <> this._document then
                Result<ColorPresentation array,ResponseError>.Success([||])
            else
                try
                    let r = p.color.red
                    let g = p.color.green
                    let b = p.color.blue
                    let a = p.color.alpha
  
                    let colorPresentation = new ColorPresentation()
                    colorPresentation.label <- sprintf "RGBColor[%f, %f, %f, %f]" r g b a
                    colorPresentation.textEdit <- new TextEdit()
                    colorPresentation.textEdit.range <- p.range
                    colorPresentation.textEdit.newText <- sprintf "RGBColor[%f, %f, %f, %f]" r g b a

                    Result<ColorPresentation array,ResponseError>.Success([| colorPresentation |])
                with
                | ex -> 
                    let error = new ResponseError()
                    error.code <- ErrorCodes.InternalError
                    error.message <- ex.Message
                    // Handle the error here, e.g., log it or send a notification to the client
                    this.log_messages(sprintf "Error in ColorPresentation: %s" ex.Message)
                    Result<ColorPresentation array,ResponseError>.Error(error)

    override this.DocumentColor (p: DocumentColorParams): Result<ColorInformation array,ResponseError> = 
            if p.textDocument.uri.LocalPath.Replace("file://", "") <> this._document then
                Result<ColorInformation array,ResponseError>.Success([||])
            else
                try
                    // get all instances of text matching the pattern RGBColor[r_, g_, b_] or RGBColor[r_, g_, b_, a_]
                    let pattern = @"RGBColor\[\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*(?:,\s*([0-9]+(?:\.[0-9]+)?))?\s*\]"
                    let regex = new Regex(pattern)
                    let matches = regex.Matches(this._text) 

                    let calculateLineAndCharacter (text: string) (index: int) =
                        let lines = text.Split('\n')
                        let rec findLine i currentIndex =
                            if i >= lines.Length then
                                (lines.Length - 1, 0) // Default to the last line if not found
                            else
                                let lineLength = lines.[i].Length + 1 // Include newline character
                                if currentIndex + lineLength > index then
                                    let character = index - currentIndex
                                    (i, character)
                                else
                                    findLine (i + 1) (currentIndex + lineLength)
                        findLine 0 0

                    let colors = 
                        matches 
                        |> Seq.cast<Match>
                        |> Seq.map (fun m -> 
                            let r = float m.Groups.[1].Value
                            let g = float m.Groups.[2].Value
                            let b = float m.Groups.[3].Value
                            let a = 
                                if m.Groups.Count > 4 then
                                    try float m.Groups.[4].Value 
                                    with _ -> 1.0 // Default alpha value if not provided
                                else 
                                    1.0


                            let start = new Position()
                            let l, c = calculateLineAndCharacter this._text m.Index
                            start.line <- l
                            start.character <- c

                            let endPos = new Position()
                            let endLine, endCharacter = calculateLineAndCharacter this._text (m.Index + m.Length)
                            endPos.line <- endLine
                            endPos.character <- endCharacter

                            let colorInfo = new ColorInformation()
                            colorInfo.range <- new Range()
                            colorInfo.range.``start`` <- start
                            colorInfo.range.``end`` <- endPos
                            colorInfo.color <- new Color(r, g, b, a)
                            colorInfo
                        )
                        |> Seq.toArray

                    Result<ColorInformation array,ResponseError>.Success(colors)
                with
                | ex -> 
                    let error = new ResponseError()
                    error.code <- ErrorCodes.InternalError
                    error.message <- ex.Message
                    // Handle the error here, e.g., log it or send a notification to the client
                    this.log_messages(sprintf "Error in DocumentColor: %s" ex.Message)
                    Result<ColorInformation array,ResponseError>.Error(error)

    override this.Exit (): unit = 
        try
            if this._ml <> null then
                this._ml.Close()
            if this._lsp <> null then
                this._lsp.Close() 
        with
        | ex -> 
            this.log_messages(sprintf "Error during cleanup: %s" ex.Message)
        
        base.Exit()
        Environment.Exit(0)

    override this.Shutdown (): VoidResult<ResponseError> =
        try
            if this._ml <> null then
                this._ml.Close()
            if this._lsp <> null then
                this._lsp.Close() 
            // base.Shutdown()
            Environment.Exit(0)
            VoidResult<ResponseError>.Success()
        with
        | ex -> 
            this.log_messages(sprintf "Error during shutdown: %s" ex.Message)
            let error = new ResponseError()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            Environment.Exit(0)
            VoidResult<ResponseError>.Error(error)
