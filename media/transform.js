// transform.js
// import * as d3 from "./d3.min.js";

function processArray(array, parentSelection = undefined) {
  // console.log("processArray", array);
  const tag = array[0];
  const children = array.slice(1);

  var selection;

  if (!parentSelection) {
    console.error("No parent selection found");
    parentSelection = d3.select("#mysvg");
    return;
  }

  if (!parentSelection) {
  }

  switch (tag) {
    case "Graphics":
      selection = createGraphics(parentSelection, array);
      break;

    case "Disk":
      selection = createDisk(parentSelection, children);
      break;

    case "List":
      selection = createList(parentSelection, children);
      break;

    case "Column":
      selection = createColumn(parentSelection, children);
      break;

    default:
      console.log("Unrecognized tag: ", tag);
      selection = createDefault(parentSelection, children);
      break;
  }
  return selection;
}

function createDefault(parentSelection, children) {
  const selection = parentSelection;
  // console.log("createDefault", children);
  createList(selection, children);
}

function createColumn(parentSelection, children) {
  const selection = parentSelection.append("g").attr("class", "column");

  children.forEach((child, index) => {
    if (typeof child === "string" || typeof child === "number") {
      selection
        .append("text")
        .attr("class", "column-item")
        .attr("x", 0)
        .attr("y", index * 20)
        .text(child);
    }

    // check if child is a nested array
    if (Array.isArray(child) && typeof child[0] === "string") {
      selection
        .append("g")
        .attr("class", "column-item")
        .attr("x", 0)
        .attr("y", index * 20);
      processArray(child, selection);
    }
  });
  return selection;
}

function createGraphics(parentSelection, children) {
  let selection = parentSelection.append("g").attr("class", "graphics");

  selection = graphicToSVG(selection, children);
  return selection;
}

function createDisk(parentSelection, children) {
  let cx = 100,
    cy = 100,
    r = 10;

  if (
    children &&
    children.length > 1 &&
    Array.isArray(children[0]) &&
    children[0].length > 2
  ) {
    cx = children[0][1];
    cy = children[0][2];
    r = children[1];
  }

  return parentSelection
    .append("circle")
    .attr("class", "disk")
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", r)
    .style("fill", "red");
}

function createList(parentSelection, children) {
  const selection = parentSelection;
  // console.log("createList", children);

  // Check if all children are strings or numbers
  const allText = children.every(
    (child) => typeof child === "string" || typeof child === "number"
  );
  // Append text elements for each list item
  if (allText) {
    let text = children.reduce((acc, child) => acc + child + ", ", "");
    // console.log("text", text);
    selection
      .append("text")
      .attr("class", "list-item")
      .text(text)
      .attr("x", 0)
      .attr("y", "50%");
    return selection;
  } else {
    children.forEach((child, index) => {
      if (typeof child === "string" || typeof child === "number") {
        selection
          .append("text")
          .attr("class", "list-item")
          .attr("x", 0)
          .attr("y", index * 20)
          .text(child);
      }

      // check if child is a nested array
      if (Array.isArray(child) && typeof child[0] === "string") {
        processArray(child, selection);
      }
    });
    return selection;
  }
}

(function () {
  const vscode = acquireVsCodeApi();
  var viewState = vscode.getState() || [];
  // results = [];
  var index = 0;

  function loaded() {
    index = 0; // results.length;
    // results = vscode.getState() || [];
    // results = [];

    const outputDiv = document.getElementById("outputs");
    outputDiv.innerHTML = viewState;

    outputDiv.scrollTop = outputDiv.scrollHeight;

    // Add a download button for each image element
    updateImageElements();
  }

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
    // console.log("onRunInWolfram")
    // const svg = d3.select("svg");
    // console.log(
    //   "onRunInWolfram",
    //   processArray(["Graphics", ["Disk", ["List", 0, 0], 100]], svg)
    // );
    const message = event.data;

    if ("command" in message && message.command === "clear") {
      clearOutputs();
      return;
    }

    if ("command" in message && message.command === "fontSize") {
      const outputDivs = document.getElementsByClassName("output_row");
      for (const outputDiv of outputDivs) {
        outputDiv.style.fontSize = message.size + "px";
      }
      return;
    }

    const outputDiv = document.getElementById("outputs");
    if (message.input && message.input.length > 0) {
      index += 1;
      lastInput =
        "<div class='input_row'><hr>In[" +
        index +
        "]: " +
        message.input +
        "<hr></div><div class='output_row'>Loading...</div>";
      outputDiv.innerHTML = lastInput + outputDiv.innerHTML;
    }
    var width, height;
    if (message.output.length > 0) {
      outputDiv.innerHTML = outputDiv.innerHTML.replace(
        '<div class="output_row">Loading...</div>',
        `<div class="output_row">` +
        // <svg id="svg${index}"></svg>` +
          message.output +
          "</div>" +
          "<br><button type='button' name='open' textContent='Open' onclick='openOutputInNewDocument(`" +
          message.output +
          "`)'>Open</button>" +
          "<button type='button' name='paste' textContent='Paste' onclick='pasteOutput(`" +
          message.output +
          "`)'>Insert</button><br>"
      );

      // // Create a zoom behavior
      // const zoom = d3.zoom().scaleExtent([0.1, 8]).on("zoom", zoomed);

      // var svg = d3.select(`#svg${index}`);
      // svg.attr("viewBox", [-50, -50, 200, 200])
      // var g = svg.append("g");
      // // g.attr("viewBox", [-20, -20, 200, 200]);
      // // var selection = processArray(
      // //   ["Graphics", ["Disk", ["List", 0, 0], 100]],
      // //   output
      // // );
      // // var selection = processArray(
      // //   ["List",1,2,3,4,5,6,7,8,9,10],
      // //   output
      // // );
      // var selection = processArray(JSON.parse(message.output), g);
      // // Center and zoom to see all elements inside the output SVG

      // const bbox = selection.node().getBBox();
      // svg.attr("viewBox", [bbox.x, bbox.y, bbox.width, bbox.height]);
      // width = bbox.width + 1;
      // height = bbox.height + 1;
      // const midX = bbox.x + width / 2 + 1;
      // const midY = bbox.y + height / 2 + 1;
      // const svgWidth = selection.attr("width") + 1;
      // const svgHeight = selection.attr("height") + 1;
      // var scale = Math.min(svgWidth / width, svgHeight / height);
      // if (isNaN(scale)) {
      //   scale = 1;
      // }
      // scale = 1;

      // console.log(
      //   "bbox",
      //   bbox,
      //   width,
      //   height,
      //   midX,
      //   midY,
      //   svgWidth,
      //   svgHeight,
      //   scale
      // );

      // function zoomed(event) {
      //   console.log("zoomed");
      //   const { transform } = event;
      //   svg.attr("transform", transform);
      //   svg.attr("stroke-width", 1 / transform.k);
      // }

      // function reset() {
      //   console.log("reset");
      //   svg
      //     .transition()
      //     .duration(750)
      //     .call(
      //       zoom.transform,
      //       d3.zoomIdentity,
      //       d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
      //     );
      // }

      // svg.call(zoom);
      // svg.on("click", reset);
      // svg.call(zoom.transform, transform);
    }

    vscode.setState(outputDiv.innerHTML);

    // outputDiv.scrollTop = outputDiv.scrollHeight;

    // Add a download button for each image element
    updateImageElements();
  });

  // Get all image elements on the page
  // const imageElements = document.getElementsByTagName("img");

  const updateImageElements = () => {
    var downloadlinks = document.querySelectorAll("#download-link");
    for (const downloadlink of downloadlinks) {
      downloadlink.remove();
    }

    // Get all image elements on the page
    var imageElements = document.getElementsByTagName("img");

    // Add a download button for each image element
    for (const imageElement of imageElements) {
      createDownloadButton(imageElement);
    }
  };

  // Create a function to handle the click event
  const handleImageClick = (imageElement) => {
    // Create an anchor element
    const link = document.createElement("a");

    // Set the image source as the link's href and specify the download attribute
    link.href = imageElement.src;
    link.download = "image.png";

    // Trigger the click event on the link element to start the download
    link.click();
  };

  // Function to create a download button for the given image element
  const createDownloadButton = (imageElement) => {
    // Create a button element
    const button = document.createElement("button");
    button.id = "download-link";

    // Set the button's text
    button.textContent = "Download";

    // Add a click event listener to the button
    button.addEventListener("click", () => handleImageClick(imageElement));

    // Insert the button after the image element
    imageElement.insertAdjacentElement("afterend", button);
  };

  var clearButton = document.getElementById("btn_clear");
  function clearOutputs() {
    index = 0;
    vscode.setState("");
    const outputDiv = document.getElementById("outputs");
    outputDiv.innerHTML = "";
  }

  var restartButton = document.getElementById("btn_restart");
  function restart() {
    console.log("Restarting kernel 1");
    test = vscode.postMessage({
      text: "restart",
    });
    console.log(test);
  }

  function openOutputInNewDocument(output) {
    test = vscode.postMessage({
      text: "open",
      // data: span1.textContent || span1.innerText
      data: output,
    });
  }

  function pasteOutput(output) {
    test = vscode.postMessage({
      text: "paste",
      // data: span1.textContent || span1.innerText
      data: output,
    });
  }
})();
