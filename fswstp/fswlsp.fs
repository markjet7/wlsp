//  https://github.com/matarillo/vscode-languageserver-csharp-example/blob/master/server/SampleServer/App.cs

// use lower case for member names
namespace fswlsp

open System
open System.IO
open System.Diagnostics
open System.Runtime.InteropServices
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

type didChangeParams() =
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set
    member val method: string = "textDocument/didChange" with get, set

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

type WorkspaceSymbolParams() =
    inherit RequestMessageBase()
    member val ``params``: JToken = null with get, set

type WorkspaceSymbolResponse() =
    inherit ResponseMessageBase()
    member val ``params``: JToken = null with get, set
    member val ``result``: JToken = null with get, set


type fswlspServer(input: Stream, output: Stream) = 
    inherit ServiceConnection(input, output)

    member val _ml : IKernelLink = null with get, set
    member val _lsp: IKernelLink = null with get, set

    member val _symbolsLink: IKernelLink = null with get, set
    
    member val Trace = "" with get, set

    member val Window: WindowProxy = null with get, set

    member val _document: string = "" with get, set

    member val _text: string = "" with get, set

    member val _documentPlainText: string = "" with get, set

    member val completions: JArray = null with get, set
    member val details: JObject = null with get, set

    member val locations : JArray = null with get, set

    member val _wlspPath: string = "" with get, set

    member val _codeParserDiagnosticsPath: string = "" with get, set

    // Dictionary of file paths and their document symbols
    // member val _document_symbols: Map<string, DocumentSymbol array> = Map.empty with get set
    member val _workspace_symbols:  Map<string, DocumentSymbol array> = Map.empty with get, set

    // Add lock for thread-safe cache access
    member val _cacheLock = obj() with get, set

    member val utils_path: string = "" with get, set

    member this.pulse() =
        // this.log_messages("Pulse called")
        // this._lsp.Pulse() |> ignore
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
        let expr = sprintf "evaluateInKernel[%s]" (this.escapeWolframString(code))

        try
            ml.Evaluate(expr)
            ml.WaitForAnswer() |> ignore
        with
        | ex ->
            let error = new ResponseError<InitializeErrorData>()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            error.data <- null
            // this.log_messages(sprintf "Error: %s" ex.Message)
            this.Initialized()
            try
                ml.Evaluate(expr)
                ml.WaitForAnswer() |> ignore
            with
            | ex ->
                let innerError = new ResponseError<InitializeErrorData>()
                innerError.code <- ErrorCodes.InternalError
                innerError.message <- ex.Message
                innerError.data <- null
                // this.log_messages(sprintf "Error: %s" ex.Message)
                ()
            ()

        let eval = ml.GetString()

        let json = JToken.Parse(eval)
        let result = json.["Result"].ToString()
        let errors = String.Join("\n", (json.["Errors"] :?> JArray) |> Seq.map (fun x -> x.ToString()))

        let response = {|
            result = result
            errors = errors
        |}

        response

    member private this.getCodeParserBinaryName () =
        if RuntimeInformation.IsOSPlatform(OSPlatform.Windows) then
            "wlsp-diagnostics.exe"
        else
            "wlsp-diagnostics"

    member private this.resolveCodeParserDiagnosticsPath (wlspPath: string) =
        let envCandidate = Environment.GetEnvironmentVariable("WLSP_CODEPARSER_DIAGNOSTICS")
        let binaryName = this.getCodeParserBinaryName()
        let baseDir = AppContext.BaseDirectory

        let normalizeCandidate path =
            if String.IsNullOrWhiteSpace(path) then
                None
            else
                let full = Path.GetFullPath(path)
                if File.Exists(full) then Some(full) else None

        let candidates =
            [ envCandidate
              Path.Combine(baseDir, binaryName)
              Path.Combine(wlspPath, "codeparser", "target", "release", binaryName)
              Path.Combine(wlspPath, "codeparser", "target", "debug", binaryName) ]

        candidates |> Seq.choose normalizeCandidate |> Seq.tryHead

    member this.get_word_at_position(code: string, position: LanguageServer.Parameters.Position) =
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

            // let didChangeHandler (p: didChangeParams) : unit =
            //     // Handle document change
            //     let uri = p.Params.["textDocument"].["uri"].ToString()
            //     let content = p.Params.["contentChanges"].[0].["text"].ToString()

            //     this.log_messages(sprintf "Document changed: %s" uri)

            //     this._documentPlainText <- content

            //     ()

            let workspaceFoldersChangeHandler (p: changeWorkspaceFoldersParams) : unit =
                // try
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
                            // this.log_messages(sprintf "Reading file: %s" file)
                            let fileText = 
                                try
                                    File.ReadAllText(file)
                                with
                                | :? FileNotFoundException -> 
                                    // this.log_messages(sprintf "File not found: %s" file)
                                    ""
                                | ex -> 
                                    // this.log_messages(sprintf "Error reading file %s: %s" file ex.Message)
                                    ""
                            
                            match this.getSymbolsForDocument(file, fileText) with
                            | Some symbols ->
                                this._workspace_symbols <- this._workspace_symbols.Add(file.ToString(), symbols)
                            | None -> ()
                        with
                        | ex -> 
                            this.log_messages(sprintf "WLSP Error processing file %s: %s" file ex.Message)
                    )
                    // _lsp.Close()

                with
                | ex -> 
                    // this.log_messages(sprintf "Error processing workspace folder %s: %s" path ex.Message)   
                ()
                // Wait for the task to complete with a timeout
                // if task.Wait(TimeSpan.FromSeconds(60.0)) then
                //     this.log_messages(sprintf "Found %d symbols in workspace folders" this._workspace_symbols.Count)
                //     ()
                //     // Result<DocumentSymbolResult,ResponseError>.Success(result)
                // else
                //     this.log_messages(sprintf "Timed out adding symbols" )
                //     ()
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

            let workplaceSymbolsHandler (request: WorkspaceSymbolParams) (cancellationToken: CancellationToken): ResponseMessageBase =
                // Handle the request to get workspace 
                // this.log_messages("workplaceSymbolsHandler called")
                let _, query = 
                    request.``params``.ToObject<JObject>().TryGetValue("query")

                // this.log_messages(sprintf "WorkspaceSymbolParams: %d" (this._workspace_symbols.Length))
                
                let response = new WorkspaceSymbolResponse()
                response.result <-
                    if query = null || query.ToString() = "" then
                         JToken.FromObject(this._workspace_symbols)
                    else
                        // find the symbol whose name contains the query string (case insensitive)
                        let symbols = 
                            this._workspace_symbols 
                            |> Map.filter (fun k v ->
                                v 
                                |> Array.exists (fun s -> 
                                    s.name.IndexOf(query.ToString(), StringComparison.OrdinalIgnoreCase) >= 0
                                )
                            )
                        // Create a response with the filtered symbols
                        // this.log_messages(sprintf "Filtered symbols: %d" (symbols.Length))
                        JToken.FromObject(symbols)
                response


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

            let updateConfigurationHandler (request: UpdateConfigurationParams): unit = 
                // Handle the configuration update here
                // You can access the updated configuration using request.configuration
                // let config = request.configuration
                // Perform any necessary actions based on the updated configuration
                ()
            // let storageUriHandler (request: storageUriParams) (cancellationToken: CancellationToken): ResponseMessageBase =
            let getVersionHandler(request: GetVersionParams) (cancellationToken: CancellationToken): ResponseMessageBase =
                let response = new GetVersionResponseParams()
                response.``result`` <- JObject.FromObject({|
                    version = "TBD"
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

            this.RequestHandlers.Set<WorkspaceSymbolParams, ResponseMessageBase>(
                "workspace/symbol",
                Func<WorkspaceSymbolParams, CancellationToken, ResponseMessageBase>(workplaceSymbolsHandler)
            )
            

            // this.NotificationHandlers.Set<RunInWolframParams>(
            //     "runInWolfram",
            //     Action<RunInWolframParams>(runInWolframHandler)
            // )

            // this.NotificationHandlers.Set<GetInputParams>(
            //     "getInput",
            //     Action<GetInputParams>(getInputHandler)
            // )

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

            // this.NotificationHandlers.Set<didChangeParams>(
            //     "textDocument/didChange",
            //     Action<didChangeParams>(didChangeHandler)
            // )

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

            capabilities.workspaceSymbolProvider <- false

            capabilities.workspace <- new WorkspaceOptions()
            capabilities.workspace.workspaceFolders <- new WorkspaceFoldersOptions()
            capabilities.workspace.workspaceFolders.supported <- true
            capabilities.workspace.workspaceFolders.changeNotifications <- new ChangeNotificationsOptions(true)
            

            let result = new InitializeResult()
            result.capabilities <- capabilities 

            Result<InitializeResult, ResponseError<InitializeErrorData>>.Success result
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
            // | PacketType.Illegal -> () // this.log_messages("Illegal packet received.")
            // | PacketType.Call -> () // this.log_messages("Call packet received.")
            // | PacketType.Evaluate -> () // this.log_messages("Evaluate packet received.")
            | PacketType.Return -> ()
            // | PacketType.InputName -> () // this.log_messages("InputName packet received.")
            // | PacketType.EnterText -> () // this.log_messages("EnterText packet received.")
            // | PacketType.EnterExpression -> () // this.log_messages("EnterExpression packet received.")
            // | PacketType.OutputName -> () // this.log_messages("OutputName packet received.")
            // | PacketType.ReturnText -> () // this.log_messages("ReturnText packet received.")
            // | PacketType.ReturnExpression -> () // this.log_messages("ReturnExpression packet received.")
            // | PacketType.Display -> this.log_messages( sprintf "%s" (this._lsp.GetString()))
            // | PacketType.DisplayEnd -> this.log_messages(sprintf "%s" (this._lsp.GetString()))
            | PacketType.Message -> 
                let message = this._lsp.GetString()
                this.log_messages(sprintf "%s" message)
            | PacketType.Text -> 
                let text = this._lsp.GetString()
                // this.log_messages(sprintf "%s" text)
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
            | _ ->
                ()
            // | PacketType.InputReply -> () // this.log_messages("InputReply packet received.")
            // | PacketType.InputExpression -> () // this.log_messages("InputExpression packet received.")
            // | PacketType.InputText -> () // this.log_messages("InputText packet received.") 
            // | PacketType.Input -> () // this.log_messages("Input packet received.")
            // | PacketType.InputString -> () // this.log_messages("InputString packet received.")
            // | PacketType.Menu -> () // this.log_messages("Menu packet received.")
            // | PacketType.Syntax -> this.log_messages(sprintf "%s" (this._lsp.GetString()))
            // | PacketType.Suspend -> () // this.log_messages("Suspend packet received.")
            // | PacketType.Resume -> () // this.log_messages("Resume packet received.")
            // | PacketType.BeginDialog -> () // this.log_messages("BeginDialog packet received.")
            // | PacketType.EndDialog -> () // this.log_messages("EndDialog packet received.")
            // | PacketType.FirstUser -> () // this.log_messages("FirstUser packet received.")
            // | PacketType.LastUser -> () // this.log_messages("LastUser packet received.")
            // | PacketType.FrontEnd -> () // this.log_messages("FrontEnd packet received.")
            // | PacketType.Expression -> () // this.log_messages("Expression packet received.")
            // | _ -> () // this.log_messages("Unknown packet type received.")     
        true

    override this.Initialized (): unit = 
        // Initialize the MathLink connections
        // try
            // this._lsp <- MathLinkFactory.CreateKernelLink()
            // this._lsp.WaitAndDiscardAnswer()

            // this._symbolsLink <- MathLinkFactory.CreateKernelLink()
            // this._symbolsLink.WaitAndDiscardAnswer() |> ignore


            // this._lsp.add_PacketArrived(PacketHandler(fun _ -> 
            //     // this._lsp.WaitAndDiscardAnswer() |> ignore
            //     this.packetArrived
            // )) |> ignore

        // with
        // | ex -> 
        //     let error = new ResponseError<InitializeErrorData>()
        //     error.code <- ErrorCodes.InternalError
        //     error.message <- ex.Message
        //     error.data <- null
        //     // Handle the error here, e.g., log it or send a notification to the client
        //     // this.log_messages(sprintf "Error: %s" ex.Message)
        //     let showMessageParams = new ShowMessageParams()
        //     showMessageParams.``type`` <- MessageType.Error
        //     showMessageParams.message <- sprintf "Error starting Wolfram. This may be due to installation or licensing problems: %s" ex.Message

        //     this.Window.ShowMessage(
        //         showMessageParams
        //     )
            
        //     // exit 1
        //     ()

        

        // get path of binary
        let binary_path = System.Reflection.Assembly.GetExecutingAssembly().Location

        // let wlsp_folder = binary_path.Substring(0, binary_path.IndexOf("wlsp")+4)
        let binary_folder = System.IO.Path.GetDirectoryName(binary_path)


        this.Window <- this.Proxy.Window
        
        let current_dir = Directory.GetCurrentDirectory()

        // match wlsp
        let fswstp_path = binary_folder.Substring(0, binary_folder.IndexOf("fswstp")+6)
        let wlsp_path = Path.Combine(fswstp_path,  "../")
        this._wlspPath <- Path.GetFullPath(wlsp_path)

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
        // this.log_messages("WLSP change Language Server initialized.")
        base.Initialized()

    member private this.tryGetSymbolsFromFSharp(text: string) : DocumentSymbol array option =
        if String.IsNullOrWhiteSpace(text) then
            None
        else
            let spanToRange (span: FwlParser.Span) =
                let startPos = LanguageServer.Parameters.Position()
                startPos.line <- int64 (max 0 (span.Start.Line - 1))
                startPos.character <- int64 (max 0 (span.Start.Column - 1))
                let endPos = LanguageServer.Parameters.Position()
                endPos.line <- int64 (max 0 (span.EndPos.Line - 1))
                endPos.character <- int64 (max 0 (span.EndPos.Column - 1))
                let range = Range()
                range.start <- startPos
                range.``end`` <- endPos
                range

            let tryHeadName args =
                match args |> List.tryItem 1 with
                | Some (FwlParser.Ast.Call(FwlParser.Ast.Leaf(_, h, _), _, _)) -> Some h
                | Some (FwlParser.Ast.Leaf(_, h, _)) -> Some h
                | _ -> None

            let tryAssignmentKind headName =
                match headName with
                | Some "Symbol" -> SymbolKind.Variable
                | Some "Number" -> SymbolKind.Number
                | Some ("List" | "Map" | "Table") -> SymbolKind.Array
                | Some "Association" -> SymbolKind.Struct
                | Some ("Function" | "Module") -> SymbolKind.Function
                | Some "String" -> SymbolKind.String
                | _ -> SymbolKind.Variable

            let rec findSymbolLeaf (ast: FwlParser.Ast) : (string * FwlParser.AstMetadata) option =
                match ast with
                | FwlParser.Ast.Leaf(kind, name, data) when kind = FwlParser.TokenKind.Symbol ->
                    Some(name, data)
                | FwlParser.Ast.Call(head, args, _) ->
                    match findSymbolLeaf head with
                    | Some _ as res -> res
                    | None -> args |> List.tryPick findSymbolLeaf
                | _ -> None

            let rangeFromMetadata (data: FwlParser.AstMetadata) =
                match data.Source with
                | FwlParser.Source.Span span -> spanToRange span
                | _ ->
                    let r = Range()
                    let s = LanguageServer.Parameters.Position()
                    s.line <- 0L; s.character <- 0L
                    let e = LanguageServer.Parameters.Position()
                    e.line <- 0L; e.character <- 1L
                    r.start <- s; r.``end`` <- e
                    r

            try
                let parseResult = FwlParser.Parser.parseAstSeq text FwlParser.ParseOptions.Default
                let (FwlParser.NodeSeq nodes) = parseResult.Syntax

                let rec extract acc (ast: FwlParser.Ast) =
                    match ast with
                    | FwlParser.Ast.Call(FwlParser.Ast.Leaf(_, name, _), args, _) when name = "Set" || name = "SetDelayed" ->
                        match args with
                        | lhs :: _ ->
                            match findSymbolLeaf lhs with
                            | Some (symName, symData) ->
                                let rng = rangeFromMetadata symData
                                let symbol = new DocumentSymbol()
                                let headName = tryHeadName args
                                symbol.name <- symName
                                symbol.kind <- tryAssignmentKind headName
                                symbol.detail <- headName |> Option.defaultValue name
                                symbol.range <- rng
                                symbol.selectionRange <- rng
                                symbol.children <- [||]
                                args |> List.fold extract (symbol :: acc)
                            | None ->
                                args |> List.fold extract acc
                        | _ ->
                            args |> List.fold extract acc
                    | FwlParser.Ast.Call(head, args, _) ->
                        let accHead = extract acc head
                        args |> List.fold extract accHead
                    | _ -> acc

                let syms =
                    nodes
                    |> List.fold (fun acc ast -> extract acc ast) []
                    |> List.distinctBy (fun s -> s.name, s.range.start.line, s.range.start.character, s.range.``end``.line, s.range.``end``.character)
                    |> List.toArray

                Some syms
            with _ -> None

    member private this.tryGetSymbolsFromWolfram(filePath: string, text: string) : DocumentSymbol array option =
        if String.IsNullOrWhiteSpace(text) || this._symbolsLink = null then
            None
        else
            try
                let input = sprintf "documentSymbols[%s, <|\"uri\"->%s|>]" (this.escapeWolframString text) (this.escapeWolframString filePath)
                this._symbolsLink.Evaluate(input)
                this._symbolsLink.WaitForAnswer() |> ignore
                let js =
                    try
                        this._symbolsLink.GetString()
                    with
                    | _ -> "Null"

                if String.IsNullOrWhiteSpace(js) || js = "Null" then
                    None
                else
                    let symbolsJson =
                        try
                            JArray.Parse(js)
                        with
                        | _ -> JArray()

                    if symbolsJson.Count = 0 then
                        None
                    else
                        let symbols =
                            symbolsJson
                            |> Seq.map (fun x ->
                                let symbol = new DocumentSymbol()
                                symbol.name <- x["name"].ToString()
                                symbol.kind <-
                                    try
                                        x["kind"].ToObject<SymbolKind>()
                                    with
                                    | _ -> SymbolKind.Struct
                                symbol.detail <- x["detail"].ToString()
                                symbol.range <- x["location"].["range"].ToObject<Range>()
                                symbol.selectionRange <- x["location"].["range"].ToObject<Range>()
                                symbol.children <- [||]
                                symbol
                            )
                            |> Seq.toArray

                        Some symbols
            with
            | _ -> None

    member private this.getSymbolsForDocument(filePath: string, text: string) =
        match this.tryGetSymbolsFromFSharp(text) with
        | Some symbols -> Some symbols
        | None -> this.tryGetSymbolsFromWolfram(filePath, text)

    member private this.tryGetCursorLocationsFromFSharp(text: string) : JArray option =
        if String.IsNullOrWhiteSpace(text) then
            Some(JArray())
        else
            let endEntry (span: FwlParser.Span) =
                let posObj = JObject()
                posObj["line"] <- JValue(int64 (max 0 (span.EndPos.Line - 1)))
                posObj["character"] <- JValue(int64 (max 0 (span.EndPos.Column - 1)))
                let entry = JObject()
                entry["start"] <- posObj
                entry["end"] <- posObj
                entry

            let addSpan depth (data: FwlParser.AstMetadata) acc =
                match data.Source with
                | FwlParser.Source.Span span when depth <= 1 -> span :: acc
                | _ -> acc

            let rec collectAssignments depth ast acc =
                match ast with
                | FwlParser.Ast.Call(FwlParser.Ast.Leaf(_, name, _), args, callData) ->
                    let acc' =
                        if name = "Set" || name = "SetDelayed" then
                            addSpan depth callData acc
                        else
                            acc

                    let childDepth =
                        if depth = 0 && name = "CompoundExpression" then
                            depth
                        else
                            depth + 1

                    args |> List.fold (fun a arg -> collectAssignments childDepth arg a) acc'
                | _ -> acc

            try
                let parseResult = FwlParser.Parser.parseAstSeq text FwlParser.ParseOptions.Default
                let (FwlParser.NodeSeq nodes) = parseResult.Syntax

                let spans =
                    nodes
                    |> List.fold (fun acc ast -> collectAssignments 0 ast acc) []
                    |> List.distinctBy (fun span -> span.EndPos.Line, span.EndPos.Column)
                    |> List.sortBy (fun span -> span.EndPos.Line, span.EndPos.Column)

                let arr = JArray()
                spans |> List.iter (fun span -> arr.Add(endEntry span))
                Some arr
            with
            | _ -> None

    member private this.getCursorLocations(text: string) =
        match this.tryGetCursorLocationsFromFSharp(text) with
        | Some arr -> arr
        | None -> JArray()

    member private this.updateDocumentSymbolsCache(filePath: string, text: string) =
        try
            match this.getSymbolsForDocument(filePath, text) with
            | Some symbols ->
                this._workspace_symbols <- this._workspace_symbols.Add(filePath.ToString(), symbols)
            | None ->
                ()
        with
        | ex ->
            this.log_messages(sprintf "WLSP Background DocumentSymbols update error: %s" ex.Message)

    override this.DocumentSymbols (p: DocumentSymbolParams): Result<DocumentSymbolResult,ResponseError> = 
        // this.log_messages(sprintf "DocumentSymbols request for: %s" (p.textDocument.uri.LocalPath.Replace("file://", "")))
        // base.DocumentSymbols(params: DocumentSymbolParams) 
        // try
        // let filePath = p.textDocument.uri.LocalPath.Replace("file://", "")
        let filePath = p.textDocument.uri.ToString()
        this.updateDocumentSymbolsCache(filePath, this._text)
        
        // Get cached symbols with lock
        let cachedSymbols = 
            this._workspace_symbols.TryFind(filePath.ToString())

        // this.log_messages(sprintf "cachedSymbols for %s: %A" filePath (cachedSymbols |> Option.map (fun s -> s.Length)))
    

        // Return cached symbols immediately
        let resultSymbols = cachedSymbols |> Option.defaultValue [||]
        
        let result = new DocumentSymbolResult(resultSymbols)
        // this.log_messages(sprintf "Returning %d DocumentSymbols for %s" resultSymbols.Length filePath)
        Result<DocumentSymbolResult,ResponseError>.Success result
        // with
        // | ex -> 
        //     this.log_messages(sprintf "Error in DocumentSymbols: %s" ex.Message)
        //     let result = new DocumentSymbolResult([||]: DocumentSymbol array)
        //     Result<DocumentSymbolResult,ResponseError>.Success result


    override this.FoldingRange (p: FoldingRangeRequestParam): Result<FoldingRange array,ResponseError> = 
        let toRange (span: FwlParser.Span) =
            let range = new FoldingRange()
            range.startLine <- int64 (max 0 (span.Start.Line - 1))
            range.startCharacter <- int64 (max 0 (span.Start.Column - 1))
            range.endLine <- int64 (max 0 (span.EndPos.Line - 1))
            range.endCharacter <- int64 (max 0 (span.EndPos.Column - 1))
            range.kind <- FoldingRangeKind.Region
            range

        let rec collectSpans acc (ast: FwlParser.Ast) =
            let accWithCurrent =
                match ast with
                | FwlParser.Ast.Call(_, _, data)
                | FwlParser.Ast.Leaf(_, _, data)
                | FwlParser.Ast.Error(_, data) ->
                    match data.Source with
                    | FwlParser.Source.Span span when span.EndPos.Line > span.Start.Line -> span :: acc
                    | _ -> acc

            match ast with
            | FwlParser.Ast.Call(head, args, _) ->
                let accHead = collectSpans accWithCurrent head
                args |> List.fold collectSpans accHead
            | _ -> accWithCurrent

        try
            let parseResult = FwlParser.Parser.parseAstSeq this._text FwlParser.ParseOptions.Default
            let (FwlParser.NodeSeq nodes) = parseResult.Syntax

            let spans =
                nodes
                |> List.fold (fun acc ast -> collectSpans acc ast) []
                |> List.distinctBy (fun span -> span.Start.Line, span.Start.Column, span.EndPos.Line, span.EndPos.Column)

            spans
            |> List.map toRange
            |> List.toArray
            |> Result<FoldingRange array,ResponseError>.Success
        with
        | ex ->
            let error = new ResponseError()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            Result<FoldingRange array,ResponseError>.Error(error)


    override this.DidChangeTextDocument (p: DidChangeTextDocumentParams): unit = 
        // this.log_messages(sprintf "WLSP Document changed: %s" (p.textDocument.uri.LocalPath.Replace("file://", "")))
        // check if file exists
        if not (File.Exists(this._document)) then
            ()
        else
            this._document <- p.textDocument.uri.LocalPath.Replace("file://", "") 

            this._text <- p.contentChanges.[0].text

            // this.log_messages(sprintf "WLSP Document content changes: %s" p.contentChanges.[0].text)

            if p.contentChanges.Length > 0 then
                this._documentPlainText <- p.contentChanges.[0].text
                
            this.validate(p)

            let locations = this.getCursorLocations(this._text)

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
            
            // Update cache in background
            this.updateDocumentSymbolsCache(this._document, this._text)
            
    override this.DidOpenTextDocument (p: DidOpenTextDocumentParams): unit = 

        // this.log_messages(sprintf "WLSP: Document opened: %s" (p.textDocument.uri.LocalPath.Replace("file://", "")))
        //  check if file exists 
        if not (File.Exists(p.textDocument.uri.LocalPath.Replace("file://", ""))) then
     
            ()
        else
            this._document <- p.textDocument.uri.LocalPath.Replace("file://", "")
            this._text <- p.textDocument.text
            this._documentPlainText <- p.textDocument.text

            let expr = sprintf "Unprotect[NotebookDirectory]; NotebookDirectory[] = FileNameJoin[
                URLParse[DirectoryName[\"%s\"]][\"Path\"]] <> $PathnameSeparator ;" this._document
            

            let locations = this.getCursorLocations(this._text)
            // this.log_messages("WLSP4")
            let p2 = new updatePositionsParams()
            p2.``params`` <- JObject.FromObject({|
                result = [{|
                    location = {| uri = this._document|}
                    locations = locations 
                |}]
            |})

            // this.log_messages(sprintf "Sending updatePositions notification for %s" this._document)

            this.SendNotification(
                p2
            )

            this.validate(p)

            // this.log_messages("WLSP5")

            // Update cache in background
            // this.updateDocumentSymbolsCache(this._document, this._text)
            ()

    member this.validate(paramsI: obj) = 
        // this.log_messages("Validating document...")
        let textDocument = 
            match paramsI with
            | :? DidSaveTextDocumentParams as saveParams -> saveParams.textDocument
            | :? DidChangeTextDocumentParams as changeParams -> changeParams.textDocument
            | :? DidOpenTextDocumentParams as openParams -> 
                let td = new TextDocumentIdentifier()
                td.uri <- openParams.textDocument.uri
                td
            | _ -> failwith "Unsupported parameter type"

        let publish diagnostics =
            let p = new PublishDiagnosticsParams()
            p.uri <- textDocument.uri
            p.diagnostics <- diagnostics
            let pd = new PublishDiagnosticsNotification()
            pd.``params`` <- JObject.FromObject(p)
            this.SendNotification(pd)

            // this.log_messages(sprintf "Published %d diagnostics." diagnostics.Length)

        let tryFSharpParser () =
            try
                let result = FwlParser.Parser.parseAst this._text FwlParser.ParseOptions.Default
                // log the full result object as string
                // this.log_messages(sprintf "F# Parser result: %A" result)
                // this.log_messages(sprintf "Parser Text: %s" this._text)
                let issues = result.FatalIssues @ result.NonFatalIssues
                let mapIssue (iss: FwlParser.Issue) =
                    let range =
                        match iss.Span with
                        | Some span ->
                            let startPos = LanguageServer.Parameters.Position()
                            startPos.line <- int64 (max 0 (span.Start.Line - 1))
                            startPos.character <- int64 (max 0 (span.Start.Column - 1))
                            let endPos = LanguageServer.Parameters.Position()
                            endPos.line <- int64 (max 0 (span.EndPos.Line - 1))
                            endPos.character <- int64 (max 0 (span.EndPos.Column - 1))
                            let r = Range()
                            r.start <- startPos
                            r.``end`` <- endPos
                            r
                        | None ->
                            let r = Range()
                            let s = LanguageServer.Parameters.Position()
                            s.line <- 0L
                            s.character <- 0L
                            let e = LanguageServer.Parameters.Position()
                            e.line <- 0L
                            e.character <- 1L
                            r.start <- s
                            r.``end`` <- e
                            r
                    let d = Diagnostic()
                    d.message <- iss.Message
                    d.range <- range
                    d.severity <-
                        match iss.Severity with
                        | FwlParser.IssueSeverity.Error -> DiagnosticSeverity.Error
                        | FwlParser.IssueSeverity.Warning -> DiagnosticSeverity.Warning
                        | FwlParser.IssueSeverity.Info -> DiagnosticSeverity.Information
                    Some d
                let diags =
                    issues
                    |> List.choose mapIssue
                    |> List.toArray
                Some diags
            with _ ->
                None

        match tryFSharpParser() with
        | Some diagnostics ->
            publish diagnostics
        | None ->
            let emptyDiagnostics: Diagnostic array = [||]
            publish emptyDiagnostics

        // this.log_messages("Document validated.")
        ()

    override this.DidSaveTextDocument (p: DidSaveTextDocumentParams): unit = 
        // this.log_messages("WLSP: Document saved.")
         // check if file exists 
        try
            this._document <- p.textDocument.uri.LocalPath.Replace("file://", "")
            if File.Exists(this._document) then
                this._documentPlainText <- File.ReadAllText(this._document)
            // this.log_messages(sprintf "DidSaveTextDocument: %s" this._document)
            this.validate(p)
            ()
        with
        | ex -> 
            let error = new ResponseError()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            // Handle the error here, e.g., log it or send a notification to the client
            // this.log_messages(sprintf "Error: %s" ex.Message)
            ()


    override this.CodeLens (p: CodeLensParams): Result<CodeLens array,ResponseError> = 
        let createPosition line character =
            let pos = Position()
            pos.line <- int64 (max line 0)
            pos.character <- int64 (max character 0)
            pos

        let createRange line totalLines =
            let safeLine =
                if totalLines = 0 then 0 else max 0 (min line (totalLines - 1))
            let range = Range()
            range.start <- createPosition safeLine 0
            range.``end`` <- createPosition safeLine 0
            range

        let createRunCellCommand (startLine: int) (endLine: int) =
            if endLine < startLine then None else
            let startObj = JObject()
            startObj["line"] <- JValue(startLine - 1)
            startObj["character"] <- JValue(0)
            let endObj = JObject()
            endObj["line"] <- JValue(endLine - 1)
            endObj["character"] <- JValue(100)
            let rangeObj = JObject()
            rangeObj["start"] <- startObj
            rangeObj["end"] <- endObj
            let cmd = Command()
            let lineCount = max 1 (endLine - startLine + 1)
            cmd.title <- sprintf "Run cell (%d line(s))" lineCount
            cmd.command <- "wolfram.runTextCell"
            cmd.arguments <- [| rangeObj :> obj |]
            Some cmd

        let createRunAboveCommand (lineToRun: int) =
            if lineToRun <= 0 then None else
            let cmd = Command()
            cmd.title <- sprintf "Run above (%d line(s))" lineToRun
            cmd.command <- "wolfram.runToLine"
            cmd.arguments <- [| lineToRun :> obj |]
            Some cmd

        let createRunBelowCommand (startLine: int) =
            if startLine < 1 then None else
            let cmd = Command()
            cmd.title <- "Run below"
            cmd.command <- "wolfram.runFromLine"
            cmd.arguments <- [| (startLine - 1) :> obj |]
            Some cmd

        let isBlank (line: string) = String.IsNullOrWhiteSpace(line)

        let parseAstSpans (text: string) =
            try
                let result = FwlParser.Parser.parseAstSeq text FwlParser.ParseOptions.Default
                let (FwlParser.NodeSeq nodes) = result.Syntax
                nodes
                |> List.choose (fun ast ->
                    let data =
                        match ast with
                        | FwlParser.Ast.Call(_, _, metadata)
                        | FwlParser.Ast.Leaf(_, _, metadata)
                        | FwlParser.Ast.Error(_, metadata) -> metadata
                    match data.Source with
                    | FwlParser.Source.Span span -> Some span
                    | _ -> None)
            with
            | _ -> []

        let getLastCodeIndex (lines: string array) (fallback: int) =
            let mutable idx = lines.Length - 1
            let mutable found = fallback
            let mutable located = false
            while idx >= 0 && not located do
                if not (isBlank lines.[idx]) then
                    found <- idx
                    located <- true
                else
                    idx <- idx - 1
            found

        let normalizeText (text: string) =
            text.Replace("\r\n", "\n").Replace("\r", "\n")

        let tryComputeCells (lines: string array) (firstIdx: int) (lastIdx: int) =
            let cells = ResizeArray<int * int>()
            let mutable currentStart = firstIdx
            let mutable idx = firstIdx
            while idx <= lastIdx do
                if isBlank lines.[idx] then
                    let runStart = idx
                    while idx <= lastIdx && isBlank lines.[idx] do
                        idx <- idx + 1
                    let runLength = idx - runStart
                    if runLength >= 3 && idx <= lastIdx then
                        let cellEnd = runStart - 1
                        if cellEnd >= currentStart then
                            cells.Add(currentStart, cellEnd)
                        currentStart <- idx
                else
                    idx <- idx + 1
            if currentStart <= lastIdx then
                cells.Add(currentStart, lastIdx)
            cells

        let getCellLineRange (spans: FwlParser.Span list) (startIdx: int, endIdx: int) =
            let cellStartLine = startIdx + 1
            let cellEndLine = endIdx + 1
            let overlapping =
                spans
                |> List.filter (fun span ->
                    span.EndPos.Line >= cellStartLine && span.Start.Line <= cellEndLine)
            if List.isEmpty overlapping then
                cellStartLine, cellEndLine
            else
                let actualStart =
                    overlapping
                    |> List.minBy (fun span -> span.Start.Line)
                    |> fun span -> span.Start.Line
                    |> max cellStartLine
                    |> min cellEndLine
                let actualEnd =
                    overlapping
                    |> List.maxBy (fun span -> span.EndPos.Line)
                    |> fun span -> span.EndPos.Line
                    |> min cellEndLine
                let safeEnd = max actualStart actualEnd
                actualStart, safeEnd

        try
            if String.IsNullOrWhiteSpace(this._text) then
                Result<CodeLens array,ResponseError>.Success([||])
            else
                let normalized = normalizeText this._text
                let lines = normalized.Split([|'\n'|], StringSplitOptions.None)
                match lines |> Array.tryFindIndex (fun line -> not (isBlank line)) with
                | None ->
                    Result<CodeLens array,ResponseError>.Success([||])
                | Some firstCodeIdx ->
                    let lastCodeIdx = getLastCodeIndex lines firstCodeIdx
                    let cells = tryComputeCells lines firstCodeIdx lastCodeIdx
                    if cells.Count = 0 then
                        Result<CodeLens array,ResponseError>.Success([||])
                    else
                        let spans = parseAstSpans this._text
                        let totalLines = lines.Length
                        let lenses = ResizeArray<CodeLens>()

                        for i in 0 .. cells.Count - 1 do
                            let startIdx, endIdx = cells.[i]
                            let isFirst = i = 0
                            let isLast = i = cells.Count - 1
                            let displayLine = startIdx
                            let cellStartLine, cellEndLine = getCellLineRange spans (startIdx, endIdx)

                            match createRunCellCommand cellStartLine cellEndLine with
                            | Some cmd ->
                                let lens = CodeLens()
                                lens.range <- createRange displayLine totalLines
                                lens.command <- cmd
                                lenses.Add(lens)
                            | None -> ()

                            if not isFirst then
                                let runAboveLine = cellStartLine - 1
                                match createRunAboveCommand runAboveLine with
                                | Some cmd ->
                                    let lens = CodeLens()
                                    lens.range <- createRange displayLine totalLines
                                    lens.command <- cmd
                                    lenses.Add(lens)
                                | None -> ()

                            let shouldAddRunBelow = isFirst || not isLast
                            if shouldAddRunBelow then
                                match createRunBelowCommand cellStartLine with
                                | Some cmd ->
                                    let lens = CodeLens()
                                    lens.range <- createRange displayLine totalLines
                                    lens.command <- cmd
                                    lenses.Add(lens)
                                | None -> ()

                        let finalLensLine =
                            if totalLines = 0 then 0
                            else
                                let candidate = lastCodeIdx + 1
                                if candidate >= totalLines then totalLines - 1 else candidate

                        match createRunAboveCommand (lastCodeIdx + 1) with
                        | Some cmd ->
                            let lens = CodeLens()
                            lens.range <- createRange finalLensLine totalLines
                            lens.command <- cmd
                            lenses.Add(lens)
                        | None -> ()

                        Result<CodeLens array,ResponseError>.Success(lenses.ToArray())
        with
            | ex -> 
                let error = new ResponseError()
                error.code <- ErrorCodes.InternalError
                error.message <- ex.Message
                Result<CodeLens array,ResponseError>.Error(error)



        // this.evaluate_in_kernel(this._lsp, expr) |> ignore
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
                // let result = this.evaluate_in_kernel(
                //     this._lsp, 
                //     sprintf "TimeConstrained[%s, 2, \"Large output\"]" s)

                // let message = result.result.ToString().Replace("<img src=\"data:image/jpg;base64,", "![alt text](data:image/jpg;base64,").Replace("class=\"img-responsive\"/>", ")"). Replace("\" \)", ")") 
                // let message = result.result

                // details object and get the value or null
                let exists, value = this.details.TryGetValue(s)
                let detail = if exists then value else new JObject()
                let message2 = 
                    if detail.["detail"] <> null then
                        sprintf "%s" (this.escapeWolframString(detail.["documentation"].ToString()) )
                    else
                        "-- No documentation found --"

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
            // this.log_messages(sprintf "Completion request at position: line %d, character %d" p.position.line p.position.character)
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

                    let endPosition = new LanguageServer.Parameters.Position()
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
            // this.log_messages(sprintf "Error in Completion: %s" ex.Message)
            let result = new CompletionResult([||])
            Result<CompletionResult,ResponseError>.Success(result)

    override this.Symbol (p: LanguageServer.Parameters.Workspace.WorkspaceSymbolParams): Result<SymbolInformation array,ResponseError> = 
            // base.Symbol(p: WorkspaceSymbolParams)
                // Handle the request to get workspace symbols
        let query = p.query
        // this.log_messages(sprintf "WorkspaceSymbolParams: %s" (JObject.FromObject(p).ToString()))

        // this.log_messages(sprintf "WorkspaceSymbolParams: %d" (this._workspace_symbols.Count))

        let symbols: SymbolInformation array =
            this._workspace_symbols
            |> Map.toSeq
            |> Seq.collect (fun (key, value: DocumentSymbol array) -> 
                // this.log_messages(sprintf "Symbol: %s" key)
                value 
                |> Array.filter (fun (s: DocumentSymbol) -> 
                    if query = null || query.ToString() = "" then
                        true
                    else
                        s.name.Contains(query.ToString(), StringComparison.OrdinalIgnoreCase)
                )
                |> Array.map (fun (x: DocumentSymbol) -> 
                    // this.log_messages(sprintf "Symbol: %s" kvp.Key)
                    // let jsonObject = JObject.Parse(kvp.Key)
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

        // log all the symbols found by sending the name of each symbol to the log
        // this.log_messages(sprintf "Found %d symbols in workspace folders" symbols.Length)
        // for symbol in symbols do
        //     this.log_messages(sprintf "Symbol: %s" symbol.name)


        let response = symbols

        // this.log_messages(sprintf "Workspace symbols response count: %d" response.Length)
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

    override this.DidChangeWorkspaceFolders (p: DidChangeWorkspaceFoldersParams): unit = 
        // this.log_messages(sprintf "DidChangeWorkspaceFolders" )
            // create a task that will find all .wl and .wls files in the workspace and get the documentSymbols for each file using the Wolfram Language
        try
            let workspaceFolders = p.event.added |> Seq.map (fun x -> x.uri.ToString()) |> Seq.toArray
            let allFiles = 
                workspaceFolders
                |> Seq.collect (fun folder ->
                    Directory.GetFiles(folder, "*.wl", SearchOption.AllDirectories)
                    |> Seq.append (Directory.GetFiles(folder, "*.wls", SearchOption.AllDirectories))
                )
            let workspaceSymbols =
                allFiles
                |> Seq.fold (fun (acc: Map<string, DocumentSymbol array>) file ->
                    let fileText =
                        try
                            File.ReadAllText(file)
                        with
                        | :? FileNotFoundException -> ""
                        | _ -> ""

                    match this.getSymbolsForDocument(file, fileText) with
                    | Some symbols -> acc.Add(file, symbols)
                    | None -> acc
                ) Map.empty

            this._workspace_symbols <- workspaceSymbols

        with
        | ex -> 
            this.log_messages(sprintf "Error in DidChangeWorkspaceFolders: %s" ex.Message)
            // let result = new DocumentSymbolResult([||]: DocumentSymbol array)
            // // Result<DocumentSymbolResult,ResponseError>.Success(result)  

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
                    // this.log_messages(sprintf "Error in ColorPresentation: %s" ex.Message)
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


                            let start = new LanguageServer.Parameters.Position()
                            let l, c = calculateLineAndCharacter this._text m.Index
                            start.line <- int64 l
                            start.character <- int64 c

                            let endPos = new LanguageServer.Parameters.Position()
                            let endLine, endCharacter = calculateLineAndCharacter this._text (m.Index + m.Length)
                            endPos.line <- int64 endLine
                            endPos.character <- int64 endCharacter

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
                    // this.log_messages(sprintf "Error in DocumentColor: %s" ex.Message)
                    Result<ColorInformation array,ResponseError>.Error(error)

    override this.Exit (): unit = 
        try
            if this._lsp <> null then
                this._lsp.Close()
            if this._lsp <> null then
                this._lsp.Close() 
        with
        | ex -> 
            // this.log_messages(sprintf "Error during cleanup: %s" ex.Message)
        
        base.Exit()
        Environment.Exit(0)

    override this.Shutdown (): VoidResult<ResponseError> =
        try
            if this._lsp <> null then
                this._lsp.Close()
            if this._symbolsLink <> null then
                this._symbolsLink.Close()
            // base.Shutdown()
            Environment.Exit(0)
            VoidResult<ResponseError>.Success()
        with
        | ex -> 
            // this.log_messages(sprintf "Error during shutdown: %s" ex.Message)
            let error = new ResponseError()
            error.code <- ErrorCodes.InternalError
            error.message <- ex.Message
            Environment.Exit(0)
            VoidResult<ResponseError>.Error(error)
