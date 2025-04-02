// use std::path::PathBuf;
use wolfram_app_discovery::WolframApp;
// use wstp::{kernel::WolframKernelProcess, Link, TokenType};
// use wolfram_expr::{Expr, Symbol, ExprKind};

// https://github.com/ebkalderon/tower-lsp

mod kernel;
use kernel::{AppError, launch_kernel_with_args, read_expr_with_context_handling, put_user_input};

mod lsp;
use lsp::start;
use std::env;
use std::fs;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    {
        // check if Wolfram Mathematica is installed by checking the folder 
        // C:\Program Files\Wolfram Research\Mathematica
        // and figure out the version number
        let wolfram_directory_exists = fs::metadata("C:\\Program Files\\Wolfram Research\\Mathematica").is_ok();
        if wolfram_directory_exists {
            let wolfram_version = fs::read_dir("C:\\Program Files\\Wolfram Research\\Mathematica")?;
            for entry in wolfram_version {
                let entry = entry?;
                let path = entry.path();
                let version = path.file_name().unwrap().to_str().unwrap();

                env::set_var("WOLFRAM_APP_DIRECTORY", format!("C:\\Program Files\\Wolfram Research\\Mathematica\\{}", version));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // Set environment variables for macOS
        // WOLFRAM_APP_DIRECTORY = "/Applications/Wolfram.app"
        env::set_var("WOLFRAM_APP_DIRECTORY", "/Applications/Wolfram.app");
    }
    
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