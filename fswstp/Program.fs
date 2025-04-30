open System
open LSP

[<EntryPoint>]
let main args =
    try
        let client = setupLanguageServer()
        client.OnLoadedAsync().Wait()
        
        printfn "Language server started. Press any key to exit..."
        Console.ReadKey() |> ignore
        0
    with
    | ex ->
        printfn "Error: %s" ex.Message
        1
