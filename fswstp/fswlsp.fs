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

open Wolfram.NETLink




type SetTraceParams() =
    inherit RequestMessageBase()
    member val value: string = "messages" with get, set
    member val level: int = 0 with get, set

type storageUriParams() =
    inherit RequestMessageBase()
    member val uri: string = "" with get, set

type RunInWolframParams() =
    inherit RequestMessageBase()

type GetInputParams() =
    inherit RequestMessageBase()
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

    member this.log_messages(message: string): unit =
        let p = new LogMessageParams()
        p.``type`` <- MessageType.Info
        p.message <- sprintf "Result from Wolfram: %s" message
        this.Window.LogMessage(p)
        ()

    member this.evaluate_in_kernel(ml: IKernelLink, code: string) =
        let toHTML : string = sprintf "ExportString[%s, \"HTMLFragment\"]" code
        ml.Evaluate(code)
        ml.WaitForAnswer() |> ignore
        let result = ml.GetString()
        result


    override this.Initialize(initializeParams: InitializeParams): Result<InitializeResult, ResponseError<InitializeErrorData>> =
        try

            let log_messages(message :string) = 
                let p = new LogMessageParams()
                p.``type`` <- MessageType.Info
                p.message <- sprintf "Result from Wolfram: %s" message

                this.Window.LogMessage(
                    p
                )
                ()


            let traceHandler (request: SetTraceParams) : unit =
                log_messages(sprintf "setTrace: %A" ( request))
                ()

            let storageUriHandler (request: storageUriParams) (cancellationToken: CancellationToken): ResponseMessageBase =
                ResponseMessage()

            let getInputHandler (request: GetInputParams): unit = 
                            
                log_messages(sprintf "getInput: %A" ( request ))
                ()

            let runInWolframHandler(request: RunInWolframParams): unit =
                // Handle the request to run code in Wolfram
                // You can implement the logic to run the code here
                this._ml.Evaluate("2+2") 
                this._ml.WaitForAnswer() |> ignore
                let result = this._ml.GetInteger()
                // printfn "Result from Wolfram: %d" resultp
                

                log_messages(sprintf "Result from Wolfram: %d" result)
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
            capabilities.textDocumentSync <- TextDocumentSyncKind.Incremental

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