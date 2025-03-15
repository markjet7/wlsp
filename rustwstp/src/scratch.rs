use std::sync::Mutex;
use wstp::Link;

// Define a static variable with a Mutex
static LINK: Mutex<Option<Link>> = Mutex::new(None);

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize the link inside the Mutex
    {
        let mut link_guard = LINK.lock().unwrap();
        *link_guard = Some(Link::new_loopback()?);
    }

    // Access the link inside the Mutex
    {
        let mut link_guard = LINK.lock().unwrap();
        let link = link_guard.as_mut().unwrap();

        // Write the expression {"a", "b", "c"}
        link.put_function("System`List", 3)?;
        link.put_str("a")?;
        link.put_str("b")?;
        link.put_str("c")?;

        // Read back the expression, concatenating the elements as we go:
        let mut buffer = String::new();

        for _ in 0..link.test_head("System`List")? {
            buffer.push_str(link.get_string_ref()?.as_str());
        }

                // Print the result to stdout
        if buffer == "abc" {
            println!("Success: The buffer is 'abc'");
        } else {
            println!("Failure: The buffer is '{}'", buffer);
        }
    }

    Ok(())
}