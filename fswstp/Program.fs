open System
open fswlsp

[<EntryPoint>]
let main args =
    try
        let server = new fswlspServer(Console.OpenStandardInput(), Console.OpenStandardOutput())

        server.Listen().Wait()
        0

    with
    | ex ->
        printfn "Error: %s" ex.Message
        1
