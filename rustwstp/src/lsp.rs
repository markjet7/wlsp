use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};

use wolfram_app_discovery::WolframApp;
use wstp::kernel;

use crate::kernel::{AppError, launch_kernel_with_args, read_expr_with_context_handling, put_user_input};

#[derive(Debug)]
struct Backend {
    client: Client,
    kernel: Arc<Mutex<Option<WolframKernel>>>,
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
    fn evaluate(&mut self, expr: &str) -> Result<String> {
        evaluate_in_kernel(expr, self.kernel_process.link())
            .map_err(|e| tower_lsp::jsonrpc::Error {
                code: tower_lsp::jsonrpc::ErrorCode::InternalError,
                message: format!("Kernel evaluation error: {:?}", e).into(),
                data: None,
            })
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                ..Default::default()
            },
            server_info: Some(ServerInfo {
                name: "Wolfram Language Server".to_string(),
                version: Some(env!("CARGO_PKG_VERSION").to_string()),
            }),
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Initializing Wolfram Language Server...")
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

    async fn hover(&self, _: HoverParams) -> Result<Option<Hover>> {
        self.client.log_message(MessageType::INFO, "Hello Hover").await;
        Ok(None)
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

    let (service, socket) = LspService::new(|client| Backend {
        client,
        kernel: Arc::new(Mutex::new(None)),
    });

    Server::new(stdin, stdout, socket)
        .serve(service)
        .await;

    Ok(())
}

#[derive(Debug)]
enum KernelError {
    EvaluationError(String),
    PacketError(String),
}

struct LocalWolframKernelProcess {
    link: wstp::Link,
}

// Helper function to evaluate expressions in the kernel
fn evaluate_in_kernel(expression: &str, link: &mut wstp::Link) -> std::result::Result<String, KernelError> {
    put_user_input(link, expression)
        .map_err(|e| KernelError::PacketError(format!("Error putting user input: {}", e)))?;

    let result = read_expr_with_context_handling(link);

    if let Err(e) = link.end_packet() {
        return Err(KernelError::PacketError(format!("Error ending packet: {}", e)));
    }

    match result {
        Ok(result) => Ok(result),
        Err(e) => {
            eprintln!("Error evaluating expression: {}", e);
            Err(KernelError::EvaluationError(format!("Error evaluating expression: {}", e)))
        }
    }
}