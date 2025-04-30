module LSP

open System
open System.IO
open System.Diagnostics
open System.Threading
open System.Threading.Tasks
open System.Collections.Generic
open System.Reflection

type AsyncEventHandler<'T when 'T :> EventArgs> = delegate of obj * 'T -> Task

type Connection(inputStream: Stream, outputStream: Stream) =
    member val InputStream = inputStream
    member val OutputStream = outputStream

type LanguageClient() =
    let startEvent = new Event<AsyncEventHandler<EventArgs>>()
    let stopEvent = new Event<AsyncEventHandler<EventArgs>>()

    member val Name = "F# Language Extension"
    member val ConfigurationSections = Seq.empty<string>
    member val InitializationOptions = null
    member val FilesToWatch = Seq.empty<string>

    member val StartAsync = startEvent.Publish
    member val StopAsync = stopEvent.Publish

    member this.ActivateAsync(token: CancellationToken) =
        async {
            let serverPath = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "Server", "LanguageServer.exe")
            
            let info = ProcessStartInfo()
            info.FileName <- serverPath
            info.Arguments <- "fsharp"
            info.RedirectStandardInput <- true
            info.RedirectStandardOutput <- true
            info.UseShellExecute <- false
            info.CreateNoWindow <- true
            
            let proc = new Process()
            proc.StartInfo <- info
            
            if proc.Start() then
                return Connection(proc.StandardOutput.BaseStream, proc.StandardInput.BaseStream)
            else
                return Unchecked.defaultof<Connection>
        } |> Async.StartAsTask

    member this.OnLoadedAsync() : Task<unit> =
        async {
            startEvent.Trigger(this :> obj, EventArgs.Empty)
            return ()
        } |> Async.StartAsTask

    member this.OnServerInitializeFailedAsync(e: Exception) =
        Task.CompletedTask

    member this.OnServerInitializedAsync() =
        Task.CompletedTask

let setupLanguageServer() =
    let client = LanguageClient()
    client