

// Create a zoom behavior
// const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", zoomed);

// function zoomed(event) {
//   const { transform } = event;
//   g.attr("transform", transform);
//   g.attr("stroke-width", 1 / transform.k);
// }


// Graphics Primitives
// AASTriangle[\[Alpha],\[Beta],a]	angle-angle-side triangle
// Arrow[{{Subscript[x, 1],Subscript[y, 1]},\[Ellipsis]}]	arrow
// ASATriangle[\[Alpha],c,\[Beta]]	angle-side-angle triangle
// BezierCurve[{Subscript[pt, 1],Subscript[pt, 2],\[Ellipsis]}]	Bézier curve
// BSplineCurve[{Subscript[pt, 1],Subscript[pt, 2],\[Ellipsis]}]	B-spline curve
// Circle[{x,y},r]	circle
// Circumsphere[{Subscript[pt, 1],\[Ellipsis]}]	circumcircle specified by three points
// ConicHullRegion[\[Ellipsis]]	linear cone
// Disk[{x,y},r]	filled disk
// FilledCurve[{Subscript[seg, 1],Subscript[seg, 2],\[Ellipsis]}]	filled curve
// GraphicsComplex[pts,prims]	complex of graphics objects
// GraphicsGroup[{Subscript[g, 1],Subscript[g, 2],\[Ellipsis]}]	objects selectable as a group
// HalfLine[{Subscript[pt, 1],Subscript[pt, 2]}]	half-infinite line, or ray
// HalfPlane[{Subscript[pt, 1],Subscript[pt, 2]},v]	half-infinite plane
// Image[\[Ellipsis]]	an image object
// InfiniteLine[{Subscript[pt, 1],Subscript[pt, 2]}]	infinite line
// Inset[obj,\[Ellipsis]]	inset object
// JoinedCurve[{Subscript[seg, 1],Subscript[seg, 2],\[Ellipsis]}]	joined curve segments
// Line[{Subscript[pt, 1],\[Ellipsis]}]	line segments
// Locator[{x,y}]	dynamic locator
// Parallelogram[pt,{Subscript[v, 1],Subscript[v, 2]}]	parallelogram
// Point[{x,y}]	point
// Polygon[{Subscript[pt, 1],\[Ellipsis]}]	polygon
// Raster[array]	array of gray or colored squares
// Rectangle[{Subscript[x, min],Subscript[y, min]},{Subscript[x, max],Subscript[y, max]}]	rectangle
// SASTriangle[a,\[Gamma],b]	side-angle-side triangle
// Simplex[{Subscript[pt, 1],\[Ellipsis]}]	simplex
// SSSTriangle[a,b,c]	side-side-side triangle
// Text[expr,{x,y}]	text
// Triangle[{Subscript[pt, 1],\[Ellipsis]}]	triangle
var svg;

function graphicToSVG(svg0, graphicsJSON) {
  svg = svg0; 
  // Initialize an empty SVG string
  console.log("graphicToSVG", graphicsJSON);
  // if graphicsJSON is not an array, return an SVG element
  if (!Array.isArray(graphicsJSON) || graphicsJSON.length == 1) {
    console.log("Not an array", graphicsJSON);
    return d3.create("g");
  }

  function processElement(svg, element) {
    // Check the type of the element
    console.log("Element", element[0]);
    if (isPrimitive(element)) {
      // If it's a primitive, convert it to SVG and add it to the SVG string
      primitiveToSVG(svg, element);
    } else if (isDirective(element)) {
      // If it's a directive, apply it to the SVG string
      applyDirective(svg, element);
    } else if (isWrapper(element)) {
      // If it's a wrapper, wrap the SVG string
      wrapSVG(svg, element);
    } else if (isOption(element)) {
      // If it's an option, apply it to the SVG string
      applyOption(svg, element);
    } else if (element[0] === "List") {
      // If it's a list, process each element in the list
      element.slice(1).forEach((e) => {
        processElement(svg, e);
      });
    }
  }

  // Process each element in the graphicsJSON
  graphicsJSON.slice(1).forEach((element) => {
    processElement(svg, element);
  });

  // try{

  //   svg.node().append(childSVG.node());
  // } catch (e) {
  //   console.error("Error adding child SVG", e);
  //   console.log("Child SVG", childSVG);
  // }
  console.log("SVG out", svg);
  return svg;
}

function isPrimitive(element) {
  // check if the first element is part of the primitives list
  const primitives = [
    "AASTriangle",
    "Arrow",
    "ASATriangle",
    "BezierCurve",
    "BSplineCurve",
    "Circle",
    "Circumsphere",
    "ConicHullRegion",
    "Disk",
    "FilledCurve",
    "GraphicsComplex",
    "GraphicsGroup",
    "HalfLine",
    "HalfPlane",
    "Image",
    "InfiniteLine",
    "Inset",
    "JoinedCurve",
    "Line",
    "Locator",
    "Parallelogram",
    "Point",
    "Polygon",
    "Raster",
    "Rectangle",
    "SASTriangle",
    "Simplex",
    "SSSTriangle",
    "Text",
    "Triangle",
    "Graphics",
  ];
  return primitives.includes(element[0]);
}

function primitiveToSVG(parent, primitive) {
  // Implement this function to convert a primitive to SVG
  const primitiveType = primitive[0];
  const primitiveArgs = primitive.slice(1);
  console.log("Primitive to SVG", primitiveType);
  // let svg = d3.create("g");
  switch (primitiveType) {
    case "AASTriangle":
      svg = AASTriangleToSVG(primitiveArgs);
      break;
    case "Arrow":
      svg = ArrowToSVG(primitiveArgs);
      break;
    case "ASATriangle":
      svg = ASATriangleToSVG(primitiveArgs);
      break;
    case "BezierCurve":
      svg = BezierCurveToSVG(primitiveArgs);
      break;
    case "BSplineCurve":
      svg = BSplineCurveToSVG(primitiveArgs);
      break;
    case "Circle":
      svg = CircleToSVG(primitiveArgs);
      break;
    case "Circumsphere":
      svg = CircumsphereToSVG(primitiveArgs);
      break;
    case "ConicHullRegion":
      svg = ConicHullRegionToSVG(primitiveArgs);
      break;
    case "Disk":
      svg = DiskToSVG(primitiveArgs);
      break;
    case "FilledCurve":
      svg = FilledCurveToSVG(primitiveArgs);
      break;
    case "GraphicsComplex":
      svg = GraphicsComplexToSVG(primitiveArgs);
      break;
    case "GraphicsGroup":
      svg = GraphicsGroupToSVG(primitiveArgs);
      break;
    case "HalfLine":
      svg = HalfLineToSVG(primitiveArgs);
      break;
    case "HalfPlane":
      svg = HalfPlaneToSVG(primitiveArgs);
      break;
    case "Image":
      svg = ImageToSVG(primitiveArgs);
      break;
    case "InfiniteLine":
      svg = InfiniteLineToSVG(primitiveArgs);
      break;
    case "Inset":
      svg = InsetToSVG(primitiveArgs);
      break;
    case "JoinedCurve":
      svg = JoinedCurveToSVG(primitiveArgs);
      break;
    case "Line":
      svg = LineToSVG(primitiveArgs);
      break;
    case "Locator":
      svg = LocatorToSVG(primitiveArgs);
      break;
    case "Parallelogram":
      svg = ParallelogramToSVG(primitiveArgs);
      break;
    case "Point":
      svg = PointToSVG(primitiveArgs);
      break;
    case "Polygon":
      svg = PolygonToSVG(primitiveArgs);
      break;
    case "Raster":
      svg = RasterToSVG(primitiveArgs);
      break;
    case "Rectangle":
      svg = RectangleToSVG(primitiveArgs);
      break;
    case "SASTriangle":
      svg = SASTriangleToSVG(primitiveArgs);
      break;
    case "Simplex":
      svg = SimplexToSVG(primitiveArgs);
      break;
    case "SSSTriangle":
      svg = SSSTriangleToSVG(primitiveArgs);
      break;
    case "Text":
      svg = TextToSVG(primitiveArgs);
      break;
    case "Triangle":
      svg = TriangleToSVG(primitiveArgs);
      break;
    case "Graphics":
      svg = graphicToSVG(primitiveArgs);
      break;
    case "List":
      if (primitiveArgs.length > 1) {
        primitiveArgs.forEach((p) => {
          svg = graphicToSVG(svg, p);
        });
      } else {
        svg = d3.create("g");
      }
      break;
    case "Directive":
      svg = applyDirective(svg, primitiveArgs);
      break;
    default:
      if (primitiveArgs.length > 1) {
        primitiveArgs.forEach((p) => {
          svg = graphicToSVG(svg, p);
        });
      } else {
        console.log("Primitive not found", primitiveType);
        svg = d3.create("g");
      }
      break;
  }
  // parent.node().append(svg.node());
  // console.log("Primitive append", parent);
  return svg;
}

function AASTriangleToSVG(primitiveArgs) {
  const [A, angle, side] = primitiveArgs;

  // Convert the angle from degrees to radians
  const angleRad = angle * (Math.PI / 180);

  // Calculate the coordinates of the other two vertices
  const B = [A[0] + side, A[1]]; // assuming horizontal side
  const C = [
    A[0] + side * Math.cos(angleRad),
    A[1] + side * Math.sin(angleRad),
  ];

  // Create a D3.js SVG path
  const svg = d3
    .create("svg:svg")
    .attr("width", Math.max(A[0], B[0], C[0]) + 10)
    .attr("height", Math.max(A[1], B[1], C[1]) + 10);

  svg
    .append("path")
    .attr("d", `M ${A[0]} ${A[1]} L ${B[0]} ${B[1]} L ${C[0]} ${C[1]} Z`)
    .attr("fill", "none")
    .attr("stroke", "black");

  return svg;
}

function ArrowToSVG(primitiveArgs) {
  const [start, end, headSize] = primitiveArgs;

  svg
    .append("path")
    .attr("d", `M ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`)
    .attr("stroke", "black")
    .attr("fill", "none");

  svg
    .append("path")
    .attr(
      "d",
      `M ${end[0]} ${end[1]} l -${headSize} ${headSize} l ${headSize} ${
        -headSize * 2
      } Z`
    )
    .attr("stroke", "black")
    .attr("fill", "black");

  return svg;
}

function ASATriangleToSVG(primitiveArgs) {
  const [A, angle1, side, angle2] = primitiveArgs;
  const B = [A[0] + side, A[1]];
  const angle1Rad = angle1 * (Math.PI / 180);
  const angle2Rad = angle2 * (Math.PI / 180);
  const oppositeSideLength =
    (side * Math.sin(angle1Rad)) / Math.sin(Math.PI - angle1Rad - angle2Rad);
  const C = [
    A[0] + oppositeSideLength * Math.cos(angle1Rad),
    A[1] + oppositeSideLength * Math.sin(angle1Rad),
  ];

  

  svg
    .append("path")
    .attr("d", `M ${A[0]} ${A[1]} L ${B[0]} ${B[1]} L ${C[0]} ${C[1]} Z`)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function BezierCurveToSVG(primitiveArgs) {
  const points = primitiveArgs;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 3) {
    d += ` C ${points[i][0]} ${points[i][1]}, ${points[i + 1][0]} ${
      points[i + 1][1]
    }, ${points[i + 2][0]} ${points[i + 2][1]}`;
  }

  

  svg.append("path").attr("d", d).attr("stroke", "black").attr("fill", "none");

  return svg;
}

function BSplineCurveToSVG(primitiveArgs) {
  const points = primitiveArgs;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` S ${points[i][0]} ${points[i][1]}`;
  }

  

  svg.append("path").attr("d", d).attr("stroke", "black").attr("fill", "none");

  return svg;
}

function CircumsphereToSVG(primitiveArgs) {
  const [center, radius] = primitiveArgs;

  

  svg
    .append("circle")
    .attr("cx", center[1])
    .attr("cy", center[2])
    .attr("r", radius)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function ConicHullRegionToSVG(primitiveArgs) {
  const points = primitiveArgs;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }
  d += " Z";

  

  svg.append("path").attr("d", d).attr("stroke", "black").attr("fill", "none");

  return svg;
}

function DiskToSVG(primitiveArgs) {
  // primitiveArgs can be ["Disk", ["List", x, y], r] or ["Disk", ["List", x, y]]
  console.log("DiskToSVG", primitiveArgs);
  if (primitiveArgs.length === 2) {
    const [[l2, x, y], r] = primitiveArgs;
    

    svg.append("circle").attr("cx", x).attr("cy", y).attr("r", r);
    //  .attr("stroke", "black")
    //  .attr("fill", "none");
    // svg.call(zoom)

    return svg;
  } else {
    const [l2, x, y] = primitiveArgs;
    

    svg.append("circle").attr("cx", x).attr("cy", y).attr("r", 1);
    //  .attr("stroke", "black")
    //  .attr("fill", "black");
    svg.call(zoom)

    return svg;
  }
}

function FilledCurveToSVG(primitiveArgs) {
  const points = primitiveArgs;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }
  d += " Z";

  

  svg.append("path").attr("d", d).attr("stroke", "black").attr("fill", "none");

  return svg;
}

function GraphicsComplexToSVG(primitiveArgs) {
  const primitives = primitiveArgs;

  

  primitives.forEach((primitive) => {
    const primitiveSVG = primitiveToSVG(svg, primitive);
    svg.node().appendChild(primitiveSVG);
  });

  return svg;
}

function GraphicsGroupToSVG(primitiveArgs) {
  const primitives = primitiveArgs;

  

  primitives.forEach((primitive) => {
    const primitiveSVG = primitiveToSVG(svg, primitive);
    svg.node().appendChild(primitiveSVG);
  });

  return svg;
}

function HalfLineToSVG(primitiveArgs) {
  const [start, direction] = primitiveArgs;
  const end = [start[0] + direction[0] * 1000, start[1] + direction[1] * 1000];

  

  svg
    .append("path")
    .attr("d", `M ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function HalfPlaneToSVG(primitiveArgs) {
  const [point, normal] = primitiveArgs;
  const x1 = point[0] - 1000 * normal[1];
  const y1 = point[1] + 1000 * normal[0];
  const x2 = point[0] + 1000 * normal[1];
  const y2 = point[1] - 1000 * normal[0];

  

  svg
    .append("path")
    .attr(
      "d",
      `M ${x1} ${y1} L ${x2} ${y2} L ${x2 + normal[0] * 1000} ${
        y2 + normal[1] * 1000
      } L ${x1 + normal[0] * 1000} ${y1 + normal[1] * 1000} Z`
    )
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function ImageToSVG(primitiveArgs) {
  const [position, width, height, href] = primitiveArgs;

  

  svg
    .append("image")
    .attr("x", position[0])
    .attr("y", position[1])
    .attr("width", width)
    .attr("height", height)
    .attr("href", href);

  return svg;
}

function InfiniteLineToSVG(primitiveArgs) {
  const [point, direction] = primitiveArgs;
  const x1 = point[0] - direction[0] * 1000;
  const y1 = point[1] - direction[1] * 1000;
  const x2 = point[0] + direction[0] * 1000;
  const y2 = point[1] + direction[1] * 1000;

  

  svg
    .append("path")
    .attr("d", `M ${x1} ${y1} L ${x2} ${y2}`)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function InsetToSVG(primitiveArgs) {
  const [position, width, height, content] = primitiveArgs;

  

  svg
    .append("foreignObject")
    .attr("x", position[0])
    .attr("y", position[1])
    .attr("width", width)
    .attr("height", height)
    .html(content);

  return svg;
}

function JoinedCurveToSVG(primitiveArgs) {
  const points = primitiveArgs;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }

  

  svg.append("path").attr("d", d).attr("stroke", "black").attr("fill", "none");

  return svg;
}

function LocatorToSVG(primitiveArgs) {
  const [position] = primitiveArgs;

  

  svg
    .append("circle")
    .attr("cx", position[0])
    .attr("cy", position[1])
    .attr("r", 5)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function ParallelogramToSVG(primitiveArgs) {
  const [point1, point2, point3] = primitiveArgs;
  const point4 = [
    point1[0] + (point3[0] - point2[0]),
    point1[1] + (point3[1] - point2[1]),
  ];

  

  svg
    .append("path")
    .attr(
      "d",
      `M ${point1[0]} ${point1[1]} L ${point2[0]} ${point2[1]} L ${point3[0]} ${point3[1]} L ${point4[0]} ${point4[1]} Z`
    )
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function PolygonToSVG(primitiveArgs) {
  const points = primitiveArgs;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }
  d += " Z";

  

  svg.append("path").attr("d", d).attr("stroke", "black").attr("fill", "none");

  return svg;
}

function RasterToSVG(primitiveArgs) {
  const [position, width, height, href] = primitiveArgs;

  

  svg
    .append("image")
    .attr("x", position[0])
    .attr("y", position[1])
    .attr("width", width)
    .attr("height", height)
    .attr("href", href);

  return svg;
}

function SASTriangleToSVG(primitiveArgs) {
  const [A, side1, angle, side2] = primitiveArgs;
  const B = [A[0] + side1, A[1]];
  const angleRad = angle * (Math.PI / 180);
  const C = [
    B[0] + side2 * Math.cos(angleRad),
    B[1] + side2 * Math.sin(angleRad),
  ];

  

  svg
    .append("path")
    .attr("d", `M ${A[0]} ${A[1]} L ${B[0]} ${B[1]} L ${C[0]} ${C[1]} Z`)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function SimplexToSVG(primitiveArgs) {
  const points = primitiveArgs;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }
  d += " Z";

  

  svg.append("path").attr("d", d).attr("stroke", "black").attr("fill", "none");

  return svg;
}

function SSSTriangleToSVG(primitiveArgs) {
  const [A, B, C] = primitiveArgs;

  

  svg
    .append("path")
    .attr("d", `M ${A[0]} ${A[1]} L ${B[0]} ${B[1]} L ${C[0]} ${C[1]} Z`)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function TriangleToSVG(primitiveArgs) {
  const [A, B, C] = primitiveArgs;

  

  svg
    .append("path")
    .attr("d", `M ${A[0]} ${A[1]} L ${B[0]} ${B[1]} L ${C[0]} ${C[1]} Z`)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function CircleToSVG(primitiveArgs) {
  console.log("CircleToSVG", primitiveArgs);
  const [type, center, radius] = primitiveArgs;

  

  svg
    .append("circle")
    .attr("cx", center[0])
    .attr("cy", center[1])
    .attr("r", radius)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function RectangleToSVG(primitiveArgs) {
  const [corner1, corner2] = primitiveArgs;
  const width = Math.abs(corner2[0] - corner1[0]);
  const height = Math.abs(corner2[1] - corner1[1]);

  

  svg
    .append("rect")
    .attr("x", Math.min(corner1[0], corner2[0]))
    .attr("y", Math.min(corner1[1], corner2[1]))
    .attr("width", width)
    .attr("height", height)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function PointToSVG(primitiveArgs) {
  const [point] = primitiveArgs;

  

  svg
    .append("circle")
    .attr("cx", point[0])
    .attr("cy", point[1])
    .attr("r", 1)
    .attr("stroke", "black")
    .attr("fill", "none");

  return svg;
}

function TextToSVG(primitiveArgs) {
  const [position, content] = primitiveArgs;

  

  svg
    .append("text")
    .attr("x", position[0])
    .attr("y", position[1])
    .text(content)
    .attr("stroke", "black")
    .attr("fill", "black");

  return svg;
}

function LineToSVG(primitiveArgs) {
  const startPoint = primitiveArgs[0];

  let d = `M ${startPoint[0]} ${startPoint[1]}`;
  for (let i = 1; i < primitiveArgs.length; i++) {
    const endPoint = primitiveArgs[i];
    d += ` L ${endPoint[0]} ${endPoint[1]}`;
  }

  

  svg.append("path").attr("d", d).attr("stroke", "black").attr("fill", "none");

  return svg;
}

// Directives
//   AbsoluteDashing[{Subscript[w, 1],\[Ellipsis]}]	absolute line dashing specification
//   AbsolutePointSize[d]	absolute point size specification
//   AbsoluteThickness[w]	absolute line thickness specification
//   Arrowheads[specs]	arrowheads specification
//   CapForm[type]	line cap specification
//   CMYKColor[c,m,y,k]	color specification
//   Dashing[{Subscript[w, 1],\[Ellipsis]}]	line dashing specification
//   Directive[Subscript[g, 1],Subscript[g, 2],\[Ellipsis]]	composite graphics directive
//   EdgeForm[g]	edge drawing specification
//   FaceForm[g]	face drawing specification
//   GrayLevel[i]	intensity specification
//   Hue[h]	hue specification
//   JoinForm[type]	line joining specification
//   Opacity[a]	opacity specification
//   PointSize[d]	point size specification
//   RGBColor[r,g,b]	color specification
//   Texture[obj]	texture specification
//   Thickness[w]	line thickness specification

function isDirective(element) {
  // Implement this function to check if an element is a directive
  const directives = [
    "AbsoluteDashing",
    "AbsolutePointSize",
    "AbsoluteThickness",
    "Arrowheads",
    "CapForm",
    "CMYKColor",
    "Dashing",
    "Directive",
    "EdgeForm",
    "FaceForm",
    "GrayLevel",
    "Hue",
    "JoinForm",
    "Opacity",
    "PointSize",
    "RGBColor",
    "Texture",
  ];
  return directives.includes(element[0]);
}

function applyDirective(svg, directive) {
  // Implement this function to apply a directive to an SVG element using D3.js
  // A directive is a list of graphics directives
  // Each directive can be applied to the SVG element as attributes
  console.log("Applying Directive", directive);

  switch (directive[0]) {
    case "AbsoluteDashing":
      svg.attr("stroke-dasharray", directive.slice(1).join(","));
      break;
    case "AbsolutePointSize":
    case "AbsoluteThickness":
    case "Thickness":
      svg.attr("stroke-width", directive[1]);
      break;
    case "Arrowheads":
      // Implement d3js logic for arrowheads
      break;
    case "CapForm":
      svg.attr("stroke-linecap", directive[1]);
      break;
    case "CMYKColor":
      // Convert CMYK to RGB and apply as fill color
      const [c, m, y, k] = directive.slice(1);
      const r = 255 * (1 - c) * (1 - k);
      const g = 255 * (1 - m) * (1 - k);
      const b = 255 * (1 - y) * (1 - k);
      svg.attr("fill", `rgb(${r},${g},${b})`);
      break;
    case "Dashing":
      svg.attr("stroke-dasharray", directive.slice(1).join(","));
      break;
    case "EdgeForm":
      // Implement d3js logic for edge form
      break;
    case "FaceForm":
      // Implement d3js logic for face form
      break;
    case "GrayLevel":
      const gray = Math.round(directive[1] * 255);
      svg.attr("fill", `rgb(${gray},${gray},${gray})`);
      break;
    case "Hue":
      // Implement d3js logic for hue
      break;
    case "JoinForm":
      svg.attr("stroke-linejoin", directive[1]);
      break;
    case "Opacity":
      svg.attr("opacity", directive[1]);
      break;
    case "PointSize":
      svg.attr("stroke-width", directive[1]);
      break;
    case "RGBColor":
      // Change the fill color of the SVG path to the RGB color
      svg.style(
        "fill",
        `rgb(${directive
          .slice(1)
          .map((u) => {
            return 255 * u;
          })
          .join(",")})`
      );
      break;
    case "Texture":
      // Implement d3js logic for texture
      break;
  }
}

// Wrappers
//   Annotation[obj,label]	give an annotation
//   Button[obj,action]	make obj act as a button
//   Dynamic[obj]	use the dynamically updated current value
//   EventHandler[obj,\[Ellipsis]]	attach an event handler
//   Hyperlink[obj,URI]	make obj a hyperlink
//   Mouseover[obj,over]	specify a mouseover form
//   PopupWindow[obj,cont]	attach a popup window
//   StatusArea[obj,label]	specify a label to appear in the status area
//   Style[obj,opts]	specify a style
//   Tooltip[obj,label]	attach a tooltip

function isWrapper(element) {
  // Implement this function to check if an element is a wrapper
  const wrappers = [
    "Annotation",
    "Button",
    "Dynamic",
    "EventHandler",
    "Hyperlink",
    "Mouseover",
    "PopupWindow",
    "StatusArea",
    "Style",
    "Tooltip",
  ];
  return wrappers.includes(element[0]);
}

function wrapSVG(svg, wrapper) {
  // Implement this function to wrap an SVG string
  // A wrapper is a list where the first element is the wrapper type
  // and the rest of the elements are the arguments for the wrapper
  console.log("Wrapping SVG", wrapper);
  const wrapperType = wrapper[0];
  const wrapperArgs = wrapper.slice(1);
  switch (wrapperType) {
    case "Annotation":
      svg = AnnotationWrapper(svg, wrapperArgs);
      break;
    case "Button":
      svg = ButtonWrapper(svg, wrapperArgs);
      break;
    case "Dynamic":
      svg = DynamicWrapper(svg, wrapperArgs);
      break;
    case "EventHandler":
      svg = EventHandlerWrapper(svg, wrapperArgs);
      break;
    case "Hyperlink":
      svg = HyperlinkWrapper(svg, wrapperArgs);
      break;
    case "Mouseover":
      svg = MouseoverWrapper(svg, wrapperArgs);
      break;
    case "PopupWindow":
      svg = PopupWindowWrapper(svg, wrapperArgs);
      break;
    case "StatusArea":
      svg = StatusAreaWrapper(svg, wrapperArgs);
      break;
    case "Style":
      svg = StyleWrapper(svg, wrapperArgs);
      break;
    case "Tooltip":
      svg = TooltipWrapper(svg, wrapperArgs);
      break;
  }
  return svg;
}

function AnnotationWrapper(svg, wrapperArgs) {
  console.log("Annotation Wrapper", wrapperArgs);
  const group = d3.create("svg:g");

  if (wrapperArgs.length == 2 && wrapperArgs[1][0] == "String") {
    const [obj, label] = wrapperArgs;
    primitiveToSVG(group, obj); // primitiveToSVG returns an SVG element, or a list of SVG elements
  } else if (wrapperArgs.length == 2 && wrapperArgs[1][0] == "Association") {
    const [obj, association] = wrapperArgs;
    primitiveToSVG(group, obj);
    // const ul = d3.create("svg:ul");
    // Object.entries(association).forEach(([key, value]) => {
    //     const li = d3.create("svg:li");
    //     primitiveToSVG(li, value);
    //     ul.node().appendChild(li.node());
    // });
    // group.node().appendChild(ul.node());
  } else if (wrapperArgs.length == 3) {
    const [obj, assoc, label] = wrapperArgs;
    primitiveToSVG(group, obj);
    // const ul = d3.create("svg:ul");
    // assoc.slice(1).forEach((item) => {
    //     const li = d3.create("svg:li");
    //     li.attr()
    //     ul.node().appendChild(li.node());
    // });
    // group.node().appendChild(ul.node());
  }
  console.log("Annotation Wrapper Group", group);
  svg.node().appendChild(group.node());
  return svg;
}

function ButtonWrapper(svg, wrapperArgs) {
  const [obj, action] = wrapperArgs;

  const link = d3.create("svg:a").attr("href", action);
  const child = primitiveToSVG(link, obj); // primitiveToSVG returns an SVG element, or a list of SVG elements
  svg.append(child);

  return svg;
}

function DynamicWrapper(svg, wrapperArgs) {
  const [dynamicAttributes] = wrapperArgs;

  Object.entries(dynamicAttributes).forEach(([attr, value]) => {
    svg.attr(attr, value);
  });

  return svg;
}

function EventHandlerWrapper(svg, wrapperArgs) {
  const [event, handler] = wrapperArgs;

  const group = d3.create("svg:g").attr(event, handler);
  group.node().appendChild(svg);

  return group.node();
}

function HyperlinkWrapper(svg, wrapperArgs) {
  const [url] = wrapperArgs;

  const link = d3
    .create("svg:a")
    .attr("xlink:href", url)
    .attr("target", "_blank");
  link.node().appendChild(svg);

  return link.node();
}

function MouseoverWrapper(svg, wrapperArgs) {
  const [mouseoverAction, mouseoutAction] = wrapperArgs;

  const group = d3
    .create("svg:g")
    .attr("onmouseover", mouseoverAction)
    .attr("onmouseout", mouseoutAction);
  group.node().appendChild(svg);

  return group.node();
}

function PopupWindowWrapper(svg, wrapperArgs) {
  const [popupContent] = wrapperArgs;

  const group = d3.create("svg:g").attr("onclick", `alert('${popupContent}')`);
  group.node().appendChild(svg);

  return group.node();
}

function StatusAreaWrapper(svg, wrapperArgs) {
  const [statusText] = wrapperArgs;

  const group = d3
    .create("svg:g")
    .attr(
      "onmouseover",
      `document.getElementById('status').innerHTML='${statusText}'`
    )
    .attr("onmouseout", `document.getElementById('status').innerHTML=''`);
  group.node().appendChild(svg);

  return group.node();
}

function StyleWrapper(svg, wrapperArgs) {
  const [styles] = wrapperArgs;
  let styleString = "";
  for (const [key, value] of Object.entries(styles)) {
    styleString += `${key}:${value};`;
  }

  const group = d3.create("svg:g").attr("style", styleString);
  group.node().appendChild(svg);

  return group.node();
}

function TooltipWrapper(svg, wrapperArgs) {
  const [tooltipText] = wrapperArgs;

  const group = d3.create("svg:g");
  group.append("title").text(tooltipText);
  group.node().appendChild(svg);

  return group.node();
}

//Options
// AlignmentPoint 	Center	the default point in the graphic to align with
// AspectRatio 	Automatic	ratio of height to width
// Axes 	False	whether to draw axes
// AxesLabel 	None	axes labels
// AxesOrigin 	Automatic	where axes should cross
// AxesStyle 	{}	style specifications for the axes
// Background 	None	background color for the plot
// BaselinePosition 	Automatic	how to align with a surrounding text baseline
// BaseStyle 	{}	base style specifications for the graphic
// ContentSelectable 	Automatic	whether to allow contents to be selected
// CoordinatesToolOptions	Automatic	detailed behavior of the coordinates tool
// Epilog 	{}	primitives rendered after the main plot
// FormatType 	TraditionalForm	the default format type for text
// Frame 	False	whether to put a frame around the plot
// FrameLabel 	None	frame labels
// FrameStyle 	{}	style specifications for the frame
// FrameTicks 	Automatic	frame ticks
// FrameTicksStyle 	{}	style specifications for frame ticks
// GridLines 	None	grid lines to draw
// GridLinesStyle 	{}	style specifications for grid lines
// ImageMargins 	0.	the margins to leave around the graphic
// ImagePadding 	All	what extra padding to allow for labels etc.
// ImageSize 	Automatic	the absolute size at which to render the graphic
// LabelStyle 	{}	style specifications for labels
// Method 	Automatic	details of graphics methods to use
// PlotLabel 	None	an overall label for the plot
// PlotRange 	All	range of values to include
// PlotRangeClipping 	False	whether to clip at the plot range
// PlotRangePadding 	Automatic	how much to pad the range of values
// PlotRegion 	Automatic	the final display region to be filled
// PreserveImageOptions	Automatic	whether to preserve image options when displaying new versions of the same graphic
// Prolog 	{}	primitives rendered before the main plot
// RotateLabel 	True	whether to rotate y labels on the frame
// Ticks 	Automatic	axes ticks
// TicksStyle 	{}	style specifications for axes ticks

function isOption(element) {
  // Implement this function to check if an element is an option
  const options = [
    "AlignmentPoint",
    "AspectRatio",
    "Axes",
    "AxesLabel",
    "AxesOrigin",
    "AxesStyle",
    "Background",
    "BaselinePosition",
    "BaseStyle",
    "ContentSelectable",
    "CoordinatesToolOptions",
    "Epilog",
    "FormatType",
    "Frame",
    "FrameLabel",
    "FrameStyle",
    "FrameTicks",
    "FrameTicksStyle",
    "GridLines",
    "GridLinesStyle",
    "ImageMargins",
    "ImagePadding",
    "ImageSize",
    "LabelStyle",
    "Method",
    "PlotLabel",
    "PlotRange",
    "PlotRangeClipping",
    "PlotRangePadding",
    "PlotRegion",
    "PreserveImageOptions",
    "Prolog",
    "RotateLabel",
    "Ticks",
    "TicksStyle",
  ];
  return options.includes(element[0]);
}

function applyOption(svg, option) {
  // Implement this function to apply an option to an SVG string
  // An option is a list where the first element is "Rule" or "RuleDelayed", the second element is the option name, and the rest of the elements are the option value
  console.log("Applying Option", option);
  const optionType = option[0];
  const optionName = option[1];
  const optionValue = option.slice(2);

  switch (optionType) {
    case "Rule":
      switch (optionName) {
        case "AlignmentPoint":
          // Implement d3js logic for AlignmentPoint
          d3.select(svg)
            .attr("alignment-baseline", optionValue[0])
            .attr("text-anchor", optionValue[1]);
          break;
        case "AspectRatio":
          // Implement d3js logic for AspectRatio
          d3.select(svg).attr("preserveAspectRatio", optionValue[0]);
          break;
        case "Axes":
          // Implement d3js logic for Axes
          const xScale = d3
            .scaleLinear()
            .domain(optionValue[0])
            .range([0, optionValue[1]]);
          const yScale = d3
            .scaleLinear()
            .domain(optionValue[2])
            .range([optionValue[3], 0]);

          const xAxis = d3.axisBottom(xScale);
          const yAxis = d3.axisLeft(yScale);

          d3.select(svg)
            .append("g")
            .attr("transform", `translate(0,${optionValue[3]})`)
            .call(xAxis);

          d3.select(svg).append("g").call(yAxis);
          break;
        case "AxesLabel":
          // Implement d3js logic for AxesLabel
          d3.select(svg)
            .append("text")
            .attr("x", optionValue[0])
            .attr("y", optionValue[1])
            .text(optionValue[2]);
          break;
        case "AxesOrigin":
          // Implement d3js logic for AxesOrigin
          d3.select(svg)
            .append("line")
            .attr("x1", optionValue[0][0])
            .attr("y1", optionValue[0][1])
            .attr("x2", optionValue[1][0])
            .attr("y2", optionValue[1][1])
            .attr("stroke", "black");
          break;
        case "AxesStyle":
          // Implement d3js logic for AxesStyle
          d3.select(svg)
            .selectAll("g.axis line, g.axis path")
            .style("stroke", optionValue[0])
            .style("stroke-width", optionValue[1]);
          break;
        case "Background":
          // Implement d3js logic for Background
          d3.select(svg)
            .insert("rect", ":first-child")
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("fill", optionValue[0]);
          break;
        // Implement other cases similarly...
        case "GridLines":
          // Implement d3js logic for GridLines
          const xGrid = d3
            .axisBottom(xScale)
            .tickSize(-optionValue[0])
            .tickFormat("");

          const yGrid = d3
            .axisLeft(yScale)
            .tickSize(-optionValue[1])
            .tickFormat("");

          d3.select(svg).append("g").attr("class", "grid").call(xGrid);

          d3.select(svg).append("g").attr("class", "grid").call(yGrid);
          break;
        case "LabelStyle":
          // Implement d3js logic for LabelStyle
          d3.select(svg)
            .selectAll("text")
            .style("font-family", optionValue[0])
            .style("font-size", optionValue[1]);
          break;
        case "Ticks":
          // Implement d3js logic for Ticks
          const xTicks = d3.axisBottom(xScale).ticks(optionValue[0]);
          const yTicks = d3.axisLeft(yScale).ticks(optionValue[1]);

          d3.select(svg).selectAll("g.axis.x").call(xTicks);
          d3.select(svg).selectAll("g.axis.y").call(yTicks);
          break;
        case "TicksStyle":
          // Implement d3js logic for TicksStyle
          d3.select(svg)
            .selectAll("g.axis .tick line")
            .style("stroke", optionValue[0])
            .style("stroke-width", optionValue[1]);
          break;
      }
  }
  return svg;
}
