module Fswstp.LanguageServers

open System
open System.IO
open System.Threading
open System.Threading.Tasks
open Microsoft.VisualStudio.LanguageServer.Protocol
open StreamJsonRpc

type LanguageServer(inputStream: Stream, outputStream: Stream) =
    let rpc = JsonRpc.Attach(outputStream, inputStream)
    let startEvent = Event<unit>()
    let stopEvent = Event<unit>()
    let mutable isRunning = false
    let mutable disposed = false

    let mutable textDocumentSyncHandler: ITextDocumentSyncHandler = null
    let mutable definitionHandler: IDefinitionHandler = null
    let mutable completionHandler: ICompletionHandler = null

    do
        rpc.AddLocalRpcTarget<LanguageServer>(this) |> ignore

    member this.StartAsync() : Task =
        task {
            if not isRunning then
                isRunning <- true
                startEvent.Trigger()
                rpc.StartListening()
                do! rpc.Completion
                stopEvent.Trigger()
                isRunning <- false
        }

    member this.StopAsync() : Task =
        rpc.Dispose()
        Task.CompletedTask

    member val Start = startEvent.Publish
    member val Stop = stopEvent.Publish

    interface IDisposable with
        member this.Dispose() =
            if not disposed then
                rpc.Dispose()
                disposed <- true

    [<JsonRpcMethod(Methods.InitializeName)>]
    member this.InitializeAsync(params': InitializeParams, cancellationToken: CancellationToken) : Task<InitializeResult> =
        task {
            let capabilities = ServerCapabilities()
            capabilities.TextDocumentSync <- TextDocumentSyncKind.Incremental
            capabilities.DefinitionProvider <- true
            capabilities.CompletionProvider <- CompletionOptions(ResolveProvider = false, TriggerCharacters = [| "." |])

            let result = InitializeResult(Capabilities = capabilities)
            return result
        }

    [<JsonRpcMethod(Methods.InitializedName)>]
    member this.OnInitializedAsync(params': InitializedParams, cancellationToken: CancellationToken) : Task =
        Task.CompletedTask

    [<JsonRpcMethod(Methods.ShutdownName)>]
    member this.ShutdownAsync(cancellationToken: CancellationToken) : Task =
        Task.CompletedTask

    [<JsonRpcMethod(Methods.ExitName)>]
    member this.ExitAsync(cancellationToken: CancellationToken) : Task =
        this.StopAsync()

    [<JsonRpcMethod(Methods.TextDocumentDidOpenName)>]
    member this.OnTextDocumentOpenedAsync(params': DidOpenTextDocumentParams, cancellationToken: CancellationToken) : Task =
        match textDocumentSyncHandler with
        | null -> Task.CompletedTask
        | handler -> handler.HandleDidOpenTextDocumentAsync(params', cancellationToken)

    [<JsonRpcMethod(Methods.TextDocumentDidChangeName)>]
    member this.OnTextDocumentChangedAsync(params': DidChangeTextDocumentParams, cancellationToken: CancellationToken) : Task =
         match textDocumentSyncHandler with
         | null -> Task.CompletedTask
         | handler -> handler.HandleDidChangeTextDocumentAsync(params', cancellationToken)

    [<JsonRpcMethod(Methods.TextDocumentDidCloseName)>]
    member this.OnTextDocumentClosedAsync(params': DidCloseTextDocumentParams, cancellationToken: CancellationToken) : Task =
         match textDocumentSyncHandler with
         | null -> Task.CompletedTask
         | handler -> handler.HandleDidCloseTextDocumentAsync(params', cancellationToken)

    [<JsonRpcMethod(Methods.TextDocumentDefinitionName)>]
    member this.OnDefinitionRequestedAsync(params': TextDocumentPositionParams, cancellationToken: CancellationToken) : Task<Location[]> =
        match definitionHandler with
        | null -> Task.FromResult(Array.empty<Location>)
        | handler -> handler.HandleDefinitionAsync(params', cancellationToken)

    [<JsonRpcMethod(Methods.TextDocumentCompletionName)>]
    member this.OnCompletionRequestedAsync(params': CompletionParams, cancellationToken: CancellationToken) : Task<CompletionList> =
         match completionHandler with
         | null -> Task.FromResult(CompletionList())
         | handler -> handler.HandleCompletionAsync(params', cancellationToken)

    member this.SetTextDocumentSyncHandler(handler: ITextDocumentSyncHandler) =
        textDocumentSyncHandler <- handler

    member this.SetDefinitionHandler(handler: IDefinitionHandler) =
        definitionHandler <- handler

    member this.SetCompletionHandler(handler: ICompletionHandler) =
        completionHandler <- handler

and ITextDocumentSyncHandler =
    abstract member HandleDidOpenTextDocumentAsync : DidOpenTextDocumentParams * CancellationToken -> Task
    abstract member HandleDidChangeTextDocumentAsync : DidChangeTextDocumentParams * CancellationToken -> Task
    abstract member HandleDidCloseTextDocumentAsync : DidCloseTextDocumentParams * CancellationToken -> Task

and IDefinitionHandler =
    abstract member HandleDefinitionAsync : TextDocumentPositionParams * CancellationToken -> Task<Location[]>

and ICompletionHandler =
    abstract member HandleCompletionAsync : CompletionParams * CancellationToken -> Task<CompletionList>
