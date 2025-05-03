//  https://github.com/matarillo/vscode-languageserver-csharp-example/blob/master/server/SampleServer/App.cs

// use lower case for member names
module fswlsp

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

type SetTraceParams() =
    inherit RequestMessageBase()
    member val trace: string = "" with get, set

type fswlspServer(input: Stream, output: Stream) = 
    inherit ServiceConnection(input, output)
    
    member val Trace = "" with get, set

    

    override this.Initialize(initializeParams: InitializeParams): Result<InitializeResult, ResponseError<InitializeErrorData>> =
        try
            this.RequestHandlers.Set(
                "$/setTrace",
                fun (request:RequestMessageBase, cancellationToken:CancellationToken, response:RequestMessageBase) ->
                    this.Trace <- request.trace
                    ResponseMessageBase()
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
        printfn "Server initialized"
        base.Initialized()