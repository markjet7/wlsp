use std::path::PathBuf;
use wolfram_expr::{Expr, Symbol, ExprKind};
use wstp::{kernel::WolframKernelProcess, Link, TokenType};

// Custom error type for our application
#[derive(Debug)]
pub enum AppError {
    WolframError(String),
    WstpError(wstp::Error),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::WolframError(msg) => write!(f, "Wolfram error: {}", msg),
            AppError::WstpError(err) => write!(f, "WSTP error: {}", err),
        }
    }
}

impl std::error::Error for AppError {}

impl From<wstp::Error> for AppError {
    fn from(err: wstp::Error) -> Self {
        AppError::WstpError(err)
    }
}

// Helper function to launch the kernel with proper arguments
pub fn launch_kernel_with_args(path: &PathBuf) -> Result<WolframKernelProcess, AppError> {
    // Add specific WSTP arguments that help with proper context handling
    let mut process = WolframKernelProcess::launch(path)
        .map_err(|e| AppError::WolframError(format!("{:?}", e)))?;

    // process.link().put_function("EvaluatePacket", 1)?;
    // process.link().put_function("ToExpression", 1)?;
    // process.link().put_str("1+4")?;
    // process.link().end_packet()?;

    Ok(process)
}

pub fn put_user_input(link: &mut wstp::Link, input: &str) -> Result<(), AppError> {
    link.put_function("ToExpression", 1)?;
    link.put_str(input)?;
    link.end_packet()?;
    Ok(())
}

// Helper function to read expressions with proper context handling
pub fn read_expr_with_context_handling(link: &mut wstp::Link) -> Result<String, AppError> {
    match link.get_type() {
        Ok(TokenType::Integer) => {
            let value = link.get_i64()?;
            Ok(value.to_string())
        },
        Ok(TokenType::Real) => {
            let value = link.get_f64()?;
            Ok(value.to_string())
        },
        Ok(TokenType::String) => {
            let value = link.get_string()?;
            Ok(format!("\"{}\"", value))
        },
        Ok(TokenType::Symbol) => {
            let symbol_ref = link.get_symbol_ref()?;
            let symbol = symbol_ref.as_str();
            if !symbol.contains('`') {
                Ok(format!("System`{}", symbol))
            } else {
                Ok(symbol.to_string())
            }
        },
        Ok(TokenType::Function) => {
            // Get the arg count directly
            let arg_count = link.get_arg_count()?;
            
            // Get the head symbol
            let head = read_expr_with_context_handling(link)?;
            
            // Add System` context if needed
            let function_name = if !head.contains('`') {
                format!("System`{}", head)
            } else {
                head
            };
            
            let mut result = format!("{}[", function_name);
            
            // Process each argument
            for i in 0..arg_count {
                let arg = read_expr_with_context_handling(link)?;
                result.push_str(&arg);
                if i < arg_count - 1 {
                    result.push_str(", ");
                }
            }
            
            result.push(']');
            Ok(result)
        },
        Ok(_) => {
            Ok(format!("Unknown type"))
        },
        Err(e) => Err(AppError::WstpError(e)),
    }
}

// Helper function to format expressions with proper context handling
pub fn pretty_print_expr(expr: &Expr) -> String {
    match expr.kind() {
        ExprKind::Symbol(sym) => {
            // Handle symbols that might be missing context
            let name = sym.to_string();  // Use to_string() instead of name()
            if !name.contains('`') && !name.starts_with("$") {
                format!("System`{}", name)
            } else {
                name
            }
        },
        _ => format!("{:?}", expr)
    }
}


#[derive(Debug)]
#[derive(serde::Serialize)]
pub enum KernelError {
    EvaluationError(String),
    PacketError(String),
}

struct LocalWolframKernelProcess {
    link: wstp::Link,
}

// Helper function to evaluate expressions in the kernel
pub fn evaluate_in_kernel(expression: &str, link: &mut wstp::Link) -> std::result::Result<String, KernelError> {
    put_user_input(link, expression)
        .map_err(|e| KernelError::PacketError(format!("Error putting user input: {}", e)))?;

        let mut pkt_type = link.raw_next_packet().map_err(|e| KernelError::PacketError(format!("Error getting next packet: {}", e)))?;

        while pkt_type != wstp::sys::RETURNPKT {
            // println!("Skipping packet of type: {}", pkt_type);
            link.new_packet().map_err(|e| KernelError::PacketError(format!("Error creating new packet: {}", e)))?;
            pkt_type = link.raw_next_packet().map_err(|e| KernelError::PacketError(format!("Error getting next packet: {}", e)))?;
        }

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