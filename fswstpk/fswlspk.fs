//  https://github.com/matarillo/vscode-languageserver-csharp-example/blob/master/server/SampleServer/App.cs

// use lower case for member names
namespace fswlspk

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
open System.Text

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

    member this.log_messages(message: string): unit =
        let p = new LogMessageParams()
        p.``type`` <- MessageType.Info
        p.message <- sprintf "Wolfram: %s" message
        this.Window.LogMessage(p)
        ()

    member this.evaluate_in_kernel(ml: IKernelLink, code: string) =
        // ml
        
        let expr = sprintf "evaluateInKernel[%s]" (this.escapeWolframString( this.unescapeWolframString(code)))

        this.log_messages(sprintf "Eval: %s" expr)


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

        this.log_messages(sprintf "Eval: %s" eval)



        let json = JToken.Parse( eval)
        let result = json.["Result"].ToString()
        let raw = json.["Raw"].ToString()
        let errors = String.Join("\n", (json.["Errors"] :?> JArray) |> Seq.map (fun x -> x.ToString()))


        let response = {|
            result = result
            raw = raw
            errors = errors
        |}


        response

    member this.get_word_at_position(code: string, position: Position) =
        let lines = code.Split('\n')
        let line = lines.[int position.line]

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
                try 

                    let range = request.Params["range"].ToString().Replace("\"", "\\\"")
                    let t = this.escapeWolframString( this.unescapeWolframString(request.Params["text"].ToString()))

                    let eval = sprintf "getCodeString[%s, \"%s\"]" t range

                    this._ml.Evaluate(eval)
                    this._ml.WaitForAnswer() |> ignore

                    let result = this._ml.GetString()

                    let input = JObject.Parse( result)
                    let code = input["code"].ToString()
                    code 
                with
                | ex -> 
                    let error = new ResponseError<InitializeErrorData>()
                    error.code <- ErrorCodes.InternalError
                    error.message <- ex.Message
                    error.data <- null
                    // Handle the error here, e.g., log it or send a notification to the client
                    this.log_messages(sprintf "Error: %s" ex.Message)
                    "Print[\"Error getting input: " + ex.Message.Replace("\"", "\\\"") + "\"];"

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

                try
                    this._ml.Evaluate(expr)
                    this._ml.WaitForAnswer() |> ignore
                    this._ml.GetString() |> ignore
                with
                | ex -> 
                    let error = new ResponseError<InitializeErrorData>()
                    error.code <- ErrorCodes.InternalError
                    error.message <- ex.Message
                    error.data <- null
                    // Handle the error here, e.g., log it or send a notification to the client
                    this.log_messages(sprintf "Error: %s" ex.Message)
                    ()


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
                let raw = eval.raw
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
                    raw = raw
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

            let capabilities = new ServerCapabilities()
            capabilities.textDocumentSync <- TextDocumentSyncKind.Full
            capabilities.hoverProvider <- true
            // capabilities.codeLensProvider <- new CodeLensOptions()
            // capabilities.codeLensProvider.resolveProvider <- false
            capabilities.documentSymbolProvider <- true

            let completionOptions = new CompletionOptions()
            completionOptions.resolveProvider <- true
            // completionOptions.triggerCharacters <- [| "["; "," |]
            completionOptions.resolveProvider <- false
            capabilities.completionProvider <- new CompletionOptions()
            capabilities.completionProvider <- completionOptions

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

                let printMessage = WolframPrintParams()
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
        // Handle the initialized event
        // You can send notifications or perform actions here

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
            
            // this.Initialized()
            // exit 1 // Exit the program with an error code
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
        this.log_messages(sprintf "Wolfram: %s" utils_path)
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
                let input = sprintf "documentSymbols[\"%s\", <|\"uri\"->\"%s\"|>]" (this._text.Replace("\"", "\\\"")) (p.textDocument.uri.ToString())



                
                // this._lsp.Evaluate(sprintf "documentSymbols[\"%s\"]" input)
                this._lsp.Evaluate(input)
                // this._lsp.Evaluate("1+1")
                this._lsp.WaitForAnswer() |> ignore
                let js = this._lsp.GetString() 


                let symbols: DocumentSymbol array = 
                    js 
                    |> JArray.Parse
                    |> Seq.map (fun x -> 
                        let symbol = new DocumentSymbol()
                        symbol.name <- x["name"].ToString()
                        symbol.kind <- x["kind"].ToObject<SymbolKind>()
                        symbol.detail <- x["detail"].ToString()

                        symbol.range <- x["location"].["range"].ToObject<Range>()
                        symbol.selectionRange <- x["location"].["range"].ToObject<Range>()

                        symbol.children <- [||]
                        symbol
                    )
                    |> Seq.toArray

                let result:DocumentSymbolResult = new DocumentSymbolResult(symbols)
                Result<DocumentSymbolResult,ResponseError>.Success result
            with
            | ex -> 
                let error = new ResponseError()
                error.code <- ErrorCodes.InternalError
                error.message <- ex.Message
                // Handle the error here, e.g., log it or send a notification to the client
                let result:DocumentSymbolResult = new DocumentSymbolResult([||]: DocumentSymbol array)
                Result<DocumentSymbolResult,ResponseError>.Success(result)
                // let symbols: DocumentSymbol array = [||]

            // let result = new DocumentSymbolResult(symbols)
            // Result<DocumentSymbolResult,ResponseError>.Success(result)


    override this.DidChangeTextDocument (p: DidChangeTextDocumentParams): unit = 

        this._document <- p.textDocument.uri.ToString() 
        this._text <- p.contentChanges.[0].text.ToString()

        let expr = sprintf "Unprotect[NotebookDirectory]; NotebookDirectory[] = FileNameJoin[
            URLParse[DirectoryName[\"%s\"]][\"Path\"]] <> $PathnameSeparator ;" this._document
        
        this._ml.Evaluate(expr) 
        this._ml.WaitAndDiscardAnswer() |> ignore

        let expr = sprintf "updateCursorLocations[\"%s\"]" (this._text.Replace("\"", "\\\"").Replace("\\n", "\\\\n").Replace("\\r", "\\\\r"))

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
        this._document <- p.textDocument.uri.ToString()
        this._text <- p.textDocument.text

        let expr = sprintf "Unprotect[NotebookDirectory]; NotebookDirectory[] = FileNameJoin[
			URLParse[DirectoryName[\"%s\"]][\"Path\"]] <> $PathnameSeparator ;" this._document
        
        this._ml.Evaluate(expr) 
        this._ml.WaitAndDiscardAnswer() |> ignore

        let expr = sprintf "updateCursorLocations[\"%s\"]" (this._text.Replace("\"", "\\\"").Replace("\\n", "\\\\n").Replace("\\r", "\\\\r"))

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
    override this.CodeLens (p: CodeLensParams): Result<CodeLens array,ResponseError> = 
            
        
        if p.textDocument.uri.ToString() <> this._document then

            Result<CodeLens array,ResponseError>.Success([||])
        else
            // try
            let input = sprintf "codeLens[\"%s\"]" (this._text.Replace("\"", "\\\""))
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
            // with
            // | ex -> 
            //     let error = new ResponseError()
            //     error.code <- ErrorCodes.InternalError
            //     error.message <- ex.Message
            //     Result<CodeLens array,ResponseError>.Error(error)



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
                        sprintf "%s\n\n%s" message (detail.["documentation"].ToString().Replace("\n", "\n\n"))
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
            hover.contents <- m
            Result<Hover,ResponseError>.Success(hover)
        

    override this.Completion (p: CompletionParams): Result<CompletionResult,ResponseError> = 
            
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

    override this.SignatureHelp (p: TextDocumentPositionParams): Result<SignatureHelp,ResponseError> = 
            base.SignatureHelp(p: TextDocumentPositionParams)


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
