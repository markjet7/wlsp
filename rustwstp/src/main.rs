// use std::path::PathBuf;
use wolfram_app_discovery::WolframApp;
// use wstp::{kernel::WolframKernelProcess, Link, TokenType};
// use wolfram_expr::{Expr, Symbol, ExprKind};

// https://github.com/ebkalderon/tower-lsp

mod kernel;
use kernel::{AppError, launch_kernel_with_args, read_expr_with_context_handling, put_user_input};

mod lsp;
use lsp::start;

fn main() -> Result<(), Box<dyn std::error::Error>> {

    lsp::start();

    Ok(())
}



    // // Wait for user input and send the expression to the kernel for evaluation
    // while true {
    //     let mut input = String::new();
    //     println!("Enter an expression to evaluate:");
    //     std::io::stdin().read_line(&mut input)?;
    //     let input = input.trim();

    //     if input == "Exit[]" {
    //         // Send Exit to close the kernel cleanly
    //         link.put_function("System`Exit", 0)?;
    //         println!("Sending Quit...");
    //         break
    //     } else if input.is_empty() {
    //         continue
    //     }
    //     // Send the user input to the kernel
    //     put_user_input(link, input);

    //     // // Process packets until we get a return packet
    //     let mut pkt_type = link.raw_next_packet()?;
    //     while pkt_type != wstp::sys::RETURNPKT {
    //         println!("Skipping packet of type: {}", pkt_type);
    //         link.new_packet()?;
    //         pkt_type = link.raw_next_packet()?;
    //     }

    // let result = read_expr_with_context_handling(link)?;
    // println!("Result: {}", result);

    // }   
    
    // if let Err(e) = link.end_packet() {
    //     eprintln!("Error ending packet: {}", e);
    //     return Err(Box::new(AppError::WstpError(e)));
    // }

    // println!("Kernel process ended successfully");