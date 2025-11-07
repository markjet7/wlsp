// transform.js
// import * as d3 from "./d3.min.js";
// const { exit } = require("process");

// const { image } = require("d3");

const parser = new DOMParser();

let outputs = {};

function openOutputInNewDocument(output) {

  vscode.postMessage({
    text: "open",
    // data: span1.textContent || span1.innerText
    data: output.textContent,
  });
}

function pasteOutput(output) {
  vscode.postMessage({
    text: "paste",
    // data: span1.textContent || span1.innerText
    data: output.textContent,
  });
}

  // Function to create a download button for the given image element
  const createDownloadButton = (imageElement) => {
    // Create a button element
    const button = document.createElement("button");
    button.id = "download-link";

    // Set the button's text
    button.textContent = "⇩";

    // Add a click event listener to the button
    button.addEventListener("click", () => handleImageClick(imageElement));

    // Insert the button after the image element
    // imageElement.insertAdjacentElement("afterend", button);

      // Apply styles to position the button
    button.style.position = "absolute";
    button.style.top = "2px";
    button.style.right = "10px";
    // button.style.height = "40px";

    // reduce opacity
    button.style.opacity = 0.3;

    // on hover increase opacity
    button.addEventListener("mouseover", () => {
      button.style.opacity = 1;
    })

    button.addEventListener("mouseout", () => {
      button.style.opacity = 0.3;
    })

    // Ensure the image element's parent is positioned relatively
    // const parent = imageElement.parentElement;
    // imageElement.parentNode.style.position = "relative";

    // Insert the button into the parent of the image element
    imageElement.parentNode.appendChild(button);
  };

  const handleImageClick = (imageElement) => {
    // Create an anchor element
    const link = document.createElement("a");

    // Set the image source as the link's href and specify the download attribute
    link.href = imageElement.src;
    link.download = "image.png";

    // Trigger the click event on the link element to start the download
    link.click();
  };

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const createFullOutputButton = (imageElement) => {
    // check if the button already exists
    if (imageElement.querySelector("#full-output-link")) {
      return;
    }

    // Create a button element that replaces the output content with the content in the data-content attribute
    const button = document.createElement("button");
    button.id = "full-output-link"; 
    // Set the button's text
    button.textContent = "🔍"
    // Add a click event listener to the button
    button.addEventListener("click", () => {
      if (!outputs[imageElement.id]) {
        console.error("No output found for image element with id:", imageElement.id);
        return;
      }

      // Get the content from the data-content attribute
      const shortQ = imageElement.getAttribute('short');
      // Get the subdiv with class 'content' inside the imageElement
      let contentDiv = imageElement.querySelector('.content');
      if (!contentDiv) {
        console.error("No content div found in the image element");
        return;
      }



      if (shortQ && shortQ === "1") {
        console.log("Short content: ", outputs[imageElement.id]["short"]);
        console.log("Full content: ", outputs[imageElement.id]["full"]);
        // Replace the current output with the full content
        let fullContent = outputs[imageElement.id]["full"];
        // escape HTML so the full content doesn't break surrounding markup
        contentDiv.innerHTML = fullContent;
        // Scroll to the bottom of the output div
        contentDiv.scrollTop = contentDiv.scrollHeight; 
        // Toggle the short attribute
        imageElement.setAttribute('short', "0");
      } else {
        // Replace the current output with the full content
        let shortContent = outputs[imageElement.id]["short"];
        contentDiv.innerHTML = shortContent;
        // Scroll to the bottom of the output div
        contentDiv.scrollTop = contentDiv.scrollHeight; 
        // Toggle the short attribute
        imageElement.setAttribute('short', "1");
      }
    });

    button.style.position = "absolute";
    button.style.top = "2px";
    button.style.right = "110px";
    button.style.opacity = 0.3;

    // on hover increase opacity
    button.addEventListener("mouseover", () => {
      button.style.opacity = 1;
    }
    )

    button.addEventListener("mouseout", () => {
      button.style.opacity = 0.3;
    }
    ) 

    // Ensure the image element's parent is positioned relatively
    imageElement.style.position = "relative";
    // Insert the button into the parent of the image element
    imageElement.appendChild(button);
  }

  const createOpenButton = (imageElement) => {
    // Create a button element
    const button = document.createElement("button");
    button.id = "open-link";

    // Set the button's text
    button.textContent = "📝";

    // Add a click event listener to the button
    button.addEventListener("click", () => openOutputInNewDocument(imageElement));

    // Insert the button after the image element
    // imageElement.insertAdjacentElement("afterend", button);

      // Apply styles to position the button
    button.style.position = "absolute";
    button.style.top = "2px";
    button.style.right = "40px";
    // button.style.height = "40px";

    // reduce opacity
    button.style.opacity = 0.3;

    // on hover increase opacity
    button.addEventListener("mouseover", () => {
      button.style.opacity = 1;
    })

    button.addEventListener("mouseout", () => {
      button.style.opacity = 0.3;
    })

    // Ensure the image element's parent is positioned relatively
    // const parent = imageElement.parentElement;
    imageElement.style.position = "relative";

    // Insert the button into the parent of the image element
    imageElement.appendChild(button);
  };

  const createPasteButton = (imageElement) => {
    // Create a button element
    const button = document.createElement("button");
    button.id = "paste-link";

    // Set the button's text
    button.textContent = "📋";

    // Add a click event listener to the button
    button.addEventListener("click", () => pasteOutput(imageElement));

    // Insert the button after the image element
    // imageElement.insertAdjacentElement("afterend", button);

      // Apply styles to position the button
    button.style.position = "absolute";
    button.style.top = "2px";
    button.style.right = "75px";
    // button.style.height = "40px";

    // reduce opacity
    button.style.opacity = 0.3;

    // on hover increase opacity
    button.addEventListener("mouseover", () => {
      button.style.opacity = 1;
    })

    button.addEventListener("mouseout", () => {
      button.style.opacity = 0.3;
    })

    // Ensure the image element's parent is positioned relatively
    // const parent = imageElement.parentElement;
    imageElement.style.position = "relative";

    // Insert the button into the parent of the image element
    imageElement.appendChild(button);
  }

  // const openOutputInNewDocument = (output) => {
  //   test = vscode.postMessage({
  //     text: "open",
  //     // data: span1.textContent || span1.innerText
  //     data: output,
  //   });
  // }
  
  // function pasteOutput(output) {
  //   test = vscode.postMessage({
  //     text: "paste",
  //     // data: span1.textContent || span1.innerText
  //     data: output,
  //   });
  // }

const vscode = acquireVsCodeApi();
(function () {
  var viewState = vscode.getState() || [];
  // results = [];
  var index = 0;


  

  function scrollToBottom() {
    window.scrollTo(0, document.body.scrollHeight);

    var color = "";
    var fontFamily = "";
    var fontSize = "";
    var theme = "";
    var fontWeight = "";
    try {
      computedStyle = window.getComputedStyle(document.body);
      color = computedStyle.color + "";
      backgroundColor = computedStyle.backgroundColor + "";
      fontFamily = computedStyle.fontFamily;
      fontSize = computedStyle.fontSize;
      fontWeight = computedStyle.fontWeight;
      theme = document.body.className;
    } catch (ex) {}
  }

  function run(input) {
    if (event.key === "Enter") {
      if (event.shiftKey) {
        vscode.postMessage({
          text: input.value,
        });
        input.value = "";
      }
    }
  }

  var lastInput = "";
  window.addEventListener("message", (event) => {
    // var start = new Date().getTime();
    // console.log("onRunInWolfram")
    // const svg = d3.select("svg");
    // console.log(
    //   "onRunInWolfram",
    //   processArray(["Graphics", ["Disk", ["List", 0, 0], 100]], svg)
    // );
    const message = event.data;

    if ("command" in message && message.command === "clear") {
      vscode.setState([]);
      clearOutputs();
      return;
    }

    if ("command" in message && message.command === "fontSize") {
      let styleSheet = document.getElementById("_style");
      if (!styleSheet) {
        styleSheet = document.createElement("style");
        styleSheet.id = "_style";
        document.head.appendChild(styleSheet);
      }

      let rules = styleSheet.cssRules || styleSheet.rules;

      if (styleSheet && styleSheet.insertRule) {
        styleSheet.insertRule(`.output_row { font-size: ${message.size}px; }`, rules.length);
      }
      return;
    }

    if ("command" in message && message.command === "background") {

      let styleElement = document.createElement('style');
      styleElement.innerHTML = `#outputs { background: ${message.background}; }`;
      try {
        document.head.appendChild(styleElement);
      } catch (error) {
        console.error("Failed to append style element:", error);
      }
      return;
    }

    const outputDiv = document.getElementById("outputs");
    if (message.input ) {

      outputs["o" + message.row] = {
        input: message.input,
        full: "",
        short: ""
      }

      let progress = document.getElementById("progress");
      if (progress && progress.classList.contains("loading")) {
        progress.classList.remove("loading");
      } 
        progress.classList.add(["loading"]);

      if (message.input.length > 210) {
        message.input = message.input.substring(0, 100) + " ... " + message.input.substring(message.input.length - 100, message.input.length);
      }

      // check if there is a previous input with the same row id
      let previousInput = document.getElementById(message.row);
      if (previousInput) {
        // previousInput.innerHTML = "<hr>In[" +
        // index +
        // "]: " +
        // message.input +
        // "<hr>";
        // replace the input in the previous input
        let innerDiv = previousInput.getElementsByTagName("div")[0];
        innerDiv.innerHTML = message.input;

      } else if (document.getElementById('outputs').innerHTML === "<p>In: ... </p>") {
        // if there is no previous input, add the first input
        lastInput =
          "<div class='input_row' id='" + message.row + "'><hr>In[" +
          index +
          "]: <div class='input_text'>" +
          message.input +
          "</div><hr></div><div class='output_row' short='1' id='o" + message.row + "'><div class='content'>Loading...</div>";
        index++;
        outputDiv.innerHTML = lastInput;
      } else {

      lastInput =
        "<div class='input_row' id='" + message.row + "'><hr>In[" +
       index+
        "]: <div class='input_text'>" +
        message.input +
        "</div><hr></div><div class='output_row' short='1' id='o" + message.row + "'><div class='content'>Loading...</div></div>";
        index++;
      outputDiv.innerHTML = lastInput + outputDiv.innerHTML;

    //   let table = new DataTable('#myTable', {
    //     // options
    // });
      }
    }
    
    var width, height;
    
    if (message.output) {
      let progress = document.getElementById("progress");
      if (progress && progress.classList.contains("loading")) {
        progress.classList.remove("loading");
      }

      let fullOutput = message.output;
      let summary = ""
      if (fullOutput.length > 1000 && !(fullOutput.includes("<img"))) {
        summary = fullOutput.substring(0, 300) + " ... " + fullOutput.substring(fullOutput.length - 300, fullOutput.length);
      } else {
        summary = fullOutput;
      }

      let output = `<div class="output_row" id="o${index}" short="1"><div class='content'>` +
       summary + "</div></div>";

      if (message.row in outputs) {
        outputs["o" + message.row].full = fullOutput;
        outputs["o" + message.row].short = summary;
      } else {
        outputs["o" + message.row] = {
          input: "",
          full: fullOutput,
          short: summary
        }
      }

      let doc = parser.parseFromString(output, "text/html");

      let existingOutput = document.getElementById("o"+message.row);
      if (existingOutput) {
        existingOutput.innerHTML = doc.body.getElementsByClassName("output_row")[0].innerHTML;
        // existingOutput.setAttribute('data-content', message.output.replace(/"/g, '&quot;'));      
      } else {
        let newCell = "<div class='input_row' id='" + message.row + "'><hr>In[" +
        index +
         "]: " +
         message.input +
         "<hr></div><div class='output_row' short='1' id='o" + message.row + "'><div class='content'>Loading...</div>";
         outputDiv.innerHTML = newCell + outputDiv.innerHTML;
      }

      let inputRows = document.getElementsByClassName("input_row");
      if (inputRows.length > 99) {
        let lastInputRow = inputRows[inputRows.length - 1];
        lastInputRow.remove();
      }

      let outputRows = document.getElementsByClassName("output_row");
      if (outputRows.length > 99) {
        let lastOutputRow = outputRows[outputRows.length - 1];
        lastOutputRow.remove();
      }

      vscode.setState(outputDiv.innerHTML);
     
    }

    if ("command" in message && message.command === "save") {
      vscode.setState(outputDiv.innerHTML);
      return;
    }

    outputDiv.scrollTop = outputDiv.scrollHeight;

    // Add a download button for each image element
    updateOutputs();
    updateImageElements();

    // 
  });

  // Get all image elements on the page
  // const imageElements = document.getElementsByTagName("img");

  const updateOutputs = () => {
    let openlinks = document.querySelectorAll("#open-link");
    for (const openlink of openlinks) {
      openlink.remove();
    }

    let pastelinks = document.querySelectorAll("#paste-link");
    for (const pastelink of pastelinks) {
      pastelink.remove();
    }

    let outs = document.getElementsByClassName("output_row");
    for (const o of outs) {
      createOpenButton(o);
      createPasteButton(o);
      createFullOutputButton(o);
    }

  }

  const updateImageElements = () => {
    var downloadlinks = document.querySelectorAll("#download-link");
    // for (const downloadlink of downloadlinks) {
    //   downloadlink.remove();
    // }

    // Get all image elements on the page
    var imageElements = document.getElementsByClassName("output_row");

    // Add a download button for each image element
    for (const imageElement of imageElements) {
      // get the image tag inside the output_row
      const img = imageElement.getElementsByTagName("img")[0];

      if (!img) {
        continue;
      }
      // Check if a download button already exists
      if (!img.parentNode.querySelector("#download-link")) {
        createDownloadButton(img);
      }
      // createOpenButton(imageElement);
      // createPasteButton(imageElement);
    }
  };


  const outputDiv = document.getElementById("outputs");
  outputDiv.innerHTML = viewState;

  outputDiv.scrollTop = outputDiv.scrollHeight;

  // Add a download button for each image element
  // updateImageElements();

  // Create a function to handle the click event
    updateOutputs();
    updateImageElements();




  var clearButton = document.getElementById("btn_clear");
  function clearOutputs() {
    index = 0;
    vscode.setState([]);
    const outputDiv = document.getElementById("outputs");
    outputDiv.innerHTML = "<p>In: ... </p>";
  }

  var restartButton = document.getElementById("btn_restart");
  function restart() {
    console.log("Restarting kernel 1");
    test = vscode.postMessage({
      text: "restart",
    });
    console.log(test);
  }

})();
