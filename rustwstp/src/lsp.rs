use serde_json::{json, Value};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};
// use tower_lsp_macros::rpc;

use wolfram_app_discovery::WolframApp;
use wstp::kernel;

use crate::kernel::*;

#[derive(Debug)]
struct WolframNotification {}

impl tower_lsp::lsp_types::notification::Notification for  WolframNotification {
    type Params = Value;
    const METHOD: &'static str = "onRunInWolfram";
}

struct UpdateInputs {
}
impl tower_lsp::lsp_types::notification::Notification for  UpdateInputs {
    type Params = Value;
    const METHOD: &'static str = "updateInputs";
}

#[derive(Clone)]
#[derive(Debug)]
struct Backend {
    client: Client,
    kernel: Arc<Mutex<Option<WolframKernel>>>,
    document: Arc<Mutex<Option<String>>>,
}

#[derive(Serialize, Deserialize)]
struct Code {
    code: String,
    range: Range,
}

impl Backend {
    async fn run_in_wolfram(&self, params: Value)  {
        // self.client.log_message(MessageType::INFO, params.clone()).await;
        let range = params["range"].clone().to_string();

        let filepath = params["textDocument"]["uri"]["fsPath"].as_str().unwrap();

        // check if self.document.lock is none 
        // if it is, filestr = ""

        let filestr = match self.document.lock().unwrap().as_ref() {
            Some(doc) => doc.clone(),
            None => String::new(),
        };
        // let filestr = "";

        let escaped = filestr.replace("\\", "\\\\").replace("\"", "\\\"");

        let expression = format!("getCodeString[\"{}\", {:?}]", escaped, range);

        // self.client.log_message(MessageType::INFO, expression.clone()).await;

        // start timer 
        let start = std::time::Instant::now();

        let input_string = evaluate_in_kernel(&expression, self.kernel.lock().unwrap().as_mut().unwrap().kernel_process.link()).unwrap();

        let elapsed = start.elapsed().as_secs();

        // let codeString = r#"{ 
        // "code": "Hello", 
        // "range": { "start": { "line": 0, "character": 0 }, "end": { "line": 0, "character": 0 } } }"#;

        let code: Value = match serde_json::from_str(input_string[0].join("\n").trim_matches('"')) {
            Ok(code) => code,
            Err(e) => {
                self.client
                    .log_message(MessageType::ERROR, format!("Failed to parse JSON: {:?}\n\n{}", e, input_string[0].join("\n")))
                    .await;
                return;
            }
        };

        let update_notification = json!({
            "input": code["code"].to_string().trim_matches('"'),
        });

        self.client.send_notification::<UpdateInputs>(update_notification).await;

        // self.client.log_message(MessageType::INFO, inputString.clone()).await;

        // wrap the expression with ExportString[expression, "HTMLFragment"]
        let input = format!("ExportString[ToExpression@{}, \"HTMLFragment\"]", code["code"].to_string());

        // self.client.log_message(MessageType::INFO, input.clone()).await;

        // println!("Running in Wolfram");

        let response = evaluate_in_kernel(&input, self.kernel.lock().unwrap().as_mut().unwrap().kernel_process.link()).unwrap();
        let response_clone = response[0].clone().join("\n").trim_end_matches('\n').to_string();
        let errors = response[1].clone().join("\n").trim_end_matches('\n').to_string();
        let messages = response[2].clone().join("\n").trim_end_matches('\n').to_string();

        self.client.log_message(MessageType::INFO, messages.clone()).await;


        // let expr = params["expr"].as_str().unwrap();
        // let mut kernel = self.kernel.lock().unwrap();
        // let kernel = kernel.as_mut().unwrap();
        // kernel.evaluate(expr).await

        //<|
			// "input" -> string,
			// "output"-> output,  
			// "load" -> False, (*Lookup[json["params"], "output", False],*) (*If[json["params", "output"], True, False],*)
			// "result"-> "", (* ToString[result, InputForm, CharacterEncoding -> "ASCII"], *)
			// "position"-> newPosition,
			// "print" -> json["params", "print"],
			// "hover" -> StringTake[hoverMessage, 1;;-1],
			// "messages" -> r["FormattedMessages"],
			// "time" -> time,
			// "decoration" -> ToString@time <> ": " <> $myShort[result],
			// "document" -> json["params", "textDocument"]["uri"]
			// |>

        let decoration = format!("{:2?}  s: {}", elapsed, response_clone[..std::cmp::min(100, response_clone.len())].trim_matches('"'));

        let messages_and_errors = messages.clone() + "\n" + &errors;

        let result = json!({
            "input":  code["code"].to_string(),
            "load": false,
            "result": response_clone.trim_matches('"'),
            "output": response_clone.trim_matches('"'),
            "position": code["range"]["end"],
            "hover": response_clone,
            "messages":  messages_and_errors.split("\n").collect::<Vec<&str>>(),
            "time": 0,
            "decoration":decoration,
            "document":  {
                "path": filepath
            }
        });

        self.client.log_message(MessageType::INFO, result.clone()).await;

        self.client.send_notification::<WolframNotification>(result).await;

        // Ok(()) 

    }
}


#[derive(Debug)]
struct WolframKernel {
    // Store the entire kernel process instead of just the link
    kernel_process: kernel::WolframKernelProcess,
}

// Safe to send between threads
unsafe impl Send for WolframKernel {}

// Making WolframKernel explicitly NOT Sync since Link isn't Sync
// We'll control access via Mutex instead

impl WolframKernel {
    // fn evaluate(&mut self, expr: &str) -> Result<String> {
    //     evaluate_in_kernel(expr, self.kernel_process.link())
    //         .map_err(|e| tower_lsp::jsonrpc::Error {
    //             code: tower_lsp::jsonrpc::ErrorCode::InternalError,
    //             message: format!("Kernel evaluation error: {:?}", e).into(),
    //             data: None,
    //         })
    // }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                hover_provider: Some(HoverProviderCapability::Options(
                    HoverOptions {
                        work_done_progress_options: Default::default(),
                    }
                )),
                text_document_sync: Some(TextDocumentSyncCapability::Options(TextDocumentSyncOptions {
                    open_close: Some(true),
                    change: Some(TextDocumentSyncKind::FULL),
                    ..Default::default()
                })),
                ..Default::default()
            },
            server_info: Some(ServerInfo {
                name: "Wolfram Language Server".to_string(),
                version: Some(env!("CARGO_PKG_VERSION").to_string()),
            }),
        })
    }


    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        // self.client.log_message(MessageType::INFO, "Hello Change").await;
        let text = params.content_changes[0].text.clone();
        let mut document = self.document.lock().unwrap();
        *document = Some(text);
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Initializing Wolfram Language Server in Rust...")
            .await;
        
        // Automatically discover a Wolfram Language installation
        let app = match WolframApp::try_default() {
            Ok(app) => app,
            Err(e) => {
                self.client
                    .log_message(
                        MessageType::ERROR,
                        format!("Unable to find Wolfram installation: {:?}", e),
                    )
                    .await;
                return;
            }
        };
        
        // Get the path to the WolframKernel executable
        let kernel_path = match app.kernel_executable_path() {
            Ok(path) => path,
            Err(e) => {
                self.client
                    .log_message(
                        MessageType::ERROR,
                        format!("Unable to locate Wolfram kernel: {:?}", e),
                    )
                    .await;
                return;
            }
        };
        
        self.client
            .log_message(
                MessageType::INFO,
                format!("Found Wolfram kernel at: {}", kernel_path.display()),
            )
            .await;
        
        // Launch the kernel process and establish a connection
        match launch_kernel_with_args(&kernel_path) {
            Ok(kernel_process) => {
                // Only lock the mutex for the brief moment we need to update it
                {
                    let mut kernel_mutex = self.kernel.lock().unwrap();
                    *kernel_mutex = Some(WolframKernel { kernel_process });
                } // mutex guard is dropped here
                
                self.client
                    .log_message(MessageType::INFO, "Successfully connected to Wolfram kernel")
                    .await;

                // get the current path of the binary 
                let current_exe = std::env::current_exe().unwrap();

                // get the directory  
                let current_dir = current_exe.parent().unwrap();

                self.client
                    .log_message(MessageType::INFO, format!("Current directory: {:?}", current_dir))
                    .await;

                // current directory "/Users/markmw/Github/wlsp/rustwstp/target/release"
                // the wolfram path is /Users/markmw/Github/wlsp/wolfram
                let wolfram_path = current_dir.join("../../../wolfram/utils.wl");

                let input = format!("Get[\"{}\"]", wolfram_path.display());

                let _ = evaluate_in_kernel(&input, self.kernel.lock().unwrap().as_mut().unwrap().kernel_process.link());

            }
            Err(e) => {
                self.client
                    .log_message(
                        MessageType::ERROR,
                        format!("Failed to launch Wolfram kernel: {:?}", e),
                    )
                    .await;
            }
        }

    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        self.client.log_message(MessageType::INFO, format!("{:?}", params)).await;

        let text = params.text_document.text;

        let mut document = self.document.lock().unwrap();
        *document = Some(text);

        let directory = params.text_document.uri.path().to_string();

        let expr = format!("Unprotect[NotebookDirectory]; NotebookDirectory[] = FileNameJoin[
			URLParse[DirectoryName[\"{}\"]][\"Path\"]] <> $PathnameSeparator ;", directory);
        let _ = evaluate_in_kernel(&expr, self.kernel.lock().unwrap().as_mut().unwrap().kernel_process.link());


    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        // self.client.log_message(MessageType::INFO, "Hello Hover").await;
        // self.client.log_message(MessageType::INFO, format!("{:?}", params)).await;

        // HoverParams { text_document_position_params: TextDocumentPositionParams { text_document: TextDocumentIdentifier { uri: Url { scheme: "file", cannot_be_a_base: false, username: "", password: None, host: None, port: None, path: "/Users/markmw/Library/CloudStorage/OneDrive-IowaStateUniversity/General%20-%20Lignin%20HCA%20%28Patrick%29/Meta%20Analysis/resultsMarch18.wl", query: None, fragment: None } }, position: Position { line: 32, character: 9 } }, work_done_progress_params: WorkDoneProgressParams { work_done_token: None } }

        let expr = {
            let document = self.document.lock().unwrap();
            let position =  json!(params.text_document_position_params.position).to_string();
            format!("getWordAtPosition[{:?}, ImportString[{:?}, \"RawJSON\"]]", document.as_ref().unwrap(), position)
        };

        let string = evaluate_in_kernel(&expr, self.kernel.lock().unwrap().as_mut().unwrap().kernel_process.link()).unwrap();

        let response = string[0].clone().join("\n").trim_end_matches('\n').to_string();

        let result = evaluate_in_kernel(
            &format!("TimeConstrained[ExportString[ToExpression@{}, \"HTMLFragment\"], 10, \"Timed out\"]", response),
            self.kernel.lock().unwrap().as_mut().unwrap().kernel_process.link()).unwrap();

        

        let hover_message = result[0].clone().join("");

        // self.client.log_message(MessageType::INFO, hover_message.clone()).await;

        // hover_message contains an html image tag with a base64 jpg encoded image
        // we want to convert it to a markdown image tag
        // ![alt text](data:image/jpg;base64,base64_encoded_image)
        let hover_message_markdown = hover_message.replace("<img src=\"data:image/jpg;base64,", "![alt text](data:image/jpg;base64,").
            replace("class=\"img-responsive\"/>", ")"). replace("\" )", ")").trim_end_matches('"').to_string();
            self.client.log_message(MessageType::INFO, hover_message_markdown.to_string().trim_end_matches('"').to_string()).await;


        Ok(Some(Hover {
            contents: HoverContents::Scalar(MarkedString::String(hover_message_markdown.to_string())),
            range: None,
        }))
    }



    async fn shutdown(&self) -> Result<()> {
        let mut kernel = self.kernel.lock().unwrap();
        *kernel = None; // Drop the kernel, which will close the link
        Ok(())
    }
}

#[tokio::main]
pub async fn start() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let (service, socket) = LspService::build(|client| Backend {
        client,
        kernel: Arc::new(Mutex::new(None)),
        document: Arc::new(Mutex::new(Some("".to_string()))),
    })
    .custom_method("runInWolfram", Backend::run_in_wolfram)
    .finish();

    Server::new(stdin, stdout, socket)
        .serve(service)
        .await;

    Ok(())
}
