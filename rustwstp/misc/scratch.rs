use std::sync::Mutex;
use wstp::Link;

// Define a static variable with a Mutex
static LINK: Mutex<Option<Link>> = Mutex::new(None);


fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut link = Link::new_loopback()?;

    // Write the expression Plus[2, 2]
    link.put_function("Plus", 2)?;
    link.put_f64(2.0)?;
    link.put_f64(2.0)?;
    
    // Read back the expression, adding the two integers together
    let mut buffer1 = String::new();
    for _ in 0 .. link.test_head("Plus")? {
        buffer1.push_str(&link.get_string_ref()?.as_str());
    }

    println!("The result of Plus[2, 2] is {}", buffer1);

// Write the expression {"a", "b", "c"}
link.put_function("System`List", 3)?;
link.put_str("a")?;
link.put_str("b")?;
link.put_str("c")?;

// Read back the expression, concatenating the elements as we go:
let mut buffer = String::new();

for _ in 0 .. link.test_head("System`List")? {
    buffer.push_str(link.get_string_ref()?.as_str())
}

assert_eq!(buffer, "abc");
println!("Success: The buffer is {}", buffer);


    Ok(())
}