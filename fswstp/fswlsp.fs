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

open Wolfram.NETLink


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

type WolframBusyParams() =
    inherit NotificationMessageBase()
    member val ``params``: JToken = null with get, set
    member val method : string = "wolframBusy" with get, set

type updateInputsParams() =
    inherit NotificationMessageBase()
    member val ``params``: JToken = null with get, set
    member val method: string = "updateInputs" with get, set

type SetTraceParams() =
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set

type storageUriParams() =
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set
    member val uri: string = "" with get, set


type storageUriResponseParams() =
    inherit ResponseMessageBase()
    member val ``params``: JToken = null with get, set

type GetInputParams() =
    inherit RequestMessageBase()
    member val Params: JToken = null with get, set

type RunInWolframParams() =
    inherit GetInputParams()

    // member val range: Range = null with get, set
    // member val textDocument: TextDocument option = None with get, set
    // member val print: bool = true with get, set
    // member val output: bool = false with get, set
    // member val trace: bool = false with get, set

    // member val ``params``: Prompt option = None with get, set

    // inherit RunInWolframParams()
    // member val range: {| start: {| line: int; character: int |}; ``end``: {| line: int; character: int |} |} = {| start = {| line = 0; character = 0 |}; ``end`` = {| line = 0; character = 0 |} |} with get, set
    // member val textDocument: TextDocumentItem = null with get, set
    // member val print: bool = false with get, set
    // member val output: bool = false with get, set
    // member val trace: bool = false with get, set






type fswlspServer(input: Stream, output: Stream) = 
    inherit ServiceConnection(input, output)



    member val _ml : IKernelLink = null with get, set
    
    member val Trace = "" with get, set

    member val Window: WindowProxy = null with get, set

    member val _document: string = "" with get, set

    member val _text: string = "" with get, set

    member this.log_messages(message: string): unit =
        let p = new LogMessageParams()
        p.``type`` <- MessageType.Info
        p.message <- sprintf "Result from Wolfram: %s" message
        this.Window.LogMessage(p)
        ()

    member this.evaluate_in_kernel(ml: IKernelLink, code: string) =
        let toHTML : string = sprintf "ExportString[%s, \"HTMLFragment\"]" code
        // this.log_messages(sprintf "Result from Wolfram: %s" toHTML)
        ml.Evaluate(toHTML)
        ml.WaitForAnswer() |> ignore
        let result = ml.GetString()

        // this.log_messages(sprintf "Result from Wolfram: %s" result)
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
                // log_messages(sprintf "setTrace: %s" ( value.ToString() ))
                ()

            let storageUriHandler (request: storageUriParams) (cancellationToken: CancellationToken): ResponseMessageBase =
                let uri = request.Params["uri"].ToString()
                let result:storageUriResponseParams  = 
                    storageUriResponseParams()
                result.``params`` <- JObject()
                result.``params``.["uri"] <- uri
                result 


            let get_input(request: GetInputParams): string = 

                let range = request.Params["range"].ToString().Replace("\"", "\\\"")
                let t = this._text.Replace("\"", "\\\"")

                let eval = sprintf "getCodeString[\"%s\", \"%s\"]" t range

                let input = JObject.Parse( this.evaluate_in_kernel(this._ml,eval ))
                let code = input["code"].ToString()
                code 

            let getInputHandler (request: GetInputParams): unit = 
                try
                    let input:string = get_input(request)

                    // send notification to client
                    let p = new updateInputsParams()
                    p.``params`` <- {| input = input |} |> JObject.FromObject

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

                this.log_messages(sprintf "Run in Wolfram: %s" input)

                let start_time = DateTime.Now

                let result = this.evaluate_in_kernel(this._ml, input) 
                // printfn "Result from Wolfram: %d" resultp

                let end_time = DateTime.Now
                let elapsed_time = end_time - start_time
                let elapsed_time_seconds = elapsed_time.TotalSeconds


                
                let wolframResult: WolframResultParams = WolframResultParams()
                wolframResult.``params`` <- JObject.FromObject({|
                    input = input
                    load = false
                    print = false
                    result = result
                    output = result
                    position = range.``end``
                    hover = result
                    messages = []
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

            this.RequestHandlers.Set<storageUriParams, ResponseMessageBase>(
                "storageUri",
                Func<storageUriParams, CancellationToken, ResponseMessageBase>(storageUriHandler)
            )

            this.NotificationHandlers.Set<SetTraceParams>(
                "$/setTrace",
                Action<SetTraceParams>(traceHandler)
            )

            this.NotificationHandlers.Set<RunInWolframParams>(
                "runInWolfram",
                Action<RunInWolframParams>(runInWolframHandler)
            )

            this.NotificationHandlers.Set<GetInputParams>(
                "getInput",
                Action<GetInputParams>(getInputHandler)
            )

            let capabilities = new ServerCapabilities()
            capabilities.textDocumentSync <- TextDocumentSyncKind.Full

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

    override this.Initialized (): unit = 
        // Handle the initialized event
        // You can send notifications or perform actions here

        this._ml <- MathLinkFactory.CreateKernelLink()
        this._ml.WaitAndDiscardAnswer()

        // get path of binary
        let binary_path = System.Reflection.Assembly.GetExecutingAssembly().Location

        let wlsp_folder = binary_path.Substring(0, binary_path.IndexOf("wlsp")+4)


        this.Window <- this.Proxy.Window
        

        let current_dir = Directory.GetCurrentDirectory()
        let utils_path = Path.Combine(wlsp_folder, "wolfram", "utils.wl")
        let utils = this.evaluate_in_kernel(this._ml, sprintf "Get[\"%s\"]" utils_path) 

        // let p = new LogMessageParams()
        // p.``type`` <- MessageType.Info
        // p.message <- sprintf "Hello from Wolfram: %s" utils
        // this.Window.LogMessage(
        //     p
        // )
        base.Initialized()

    override this.DidChangeTextDocument (p: DidChangeTextDocumentParams): unit = 
            this._document <- p.textDocument.uri.ToString() 

            this._text <- p.contentChanges.[0].text.ToString()

    override this.DidOpenTextDocument (p: DidOpenTextDocumentParams): unit = 
        this._document <- p.textDocument.uri.ToString() 
        this._text <- p.textDocument.text.ToString()

        let expr = sprintf "Unprotect[NotebookDirectory]; NotebookDirectory[] = FileNameJoin[
			URLParse[DirectoryName[\"%s\"]][\"Path\"]] <> $PathnameSeparator ;" this._document
        
        this.evaluate_in_kernel(this._ml, expr) |> ignore
        // let p = new LogMessageParams()
        // p.``type`` <- MessageType.Info
        // p.message <- sprintf "Hello from Wolfram: %s" this._document
        // this.Window.LogMessage(
        //     p
        // )
