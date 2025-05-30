(* ::Package:: *)

Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];

getStringAtRange[string_, rangejs_String]:=Module[{sLines, sRanges, range},
	range = ImportString[rangejs, "JSON"];
	If[range[[1]] == range[[2]], Return[""]];

	sLines = StringSplit[string, EndOfLine, All];

	sRanges= getSourceRanges[range];

	result = StringJoin@Table[
		StringTake[
				sLines[[l[[1]]]],
			l[[2]]],
		{l, sRanges}];

	If[StringTake[result, 1] == "(" && StringTake[result, -1] != ")",
		result = StringDrop[result, 1];
	];
	result
];

getStringAtRange[string_, range_]:=Module[{sLines, sRanges, result},
	If[range[[1]] == range[[2]], Return[""]];

	sLines = StringSplit[string, EndOfLine, All];

	sRanges= getSourceRanges[range];

	result = StringJoin@Table[
		Quiet@Check[StringTake[
				sLines[[l[[1]]]],
			l[[2]]], ""],
		{l, sRanges}];
	
	If[StringTake[result, 1] == "(" && StringTake[result, -1] != ")", 
		result = StringDrop[result, 1];
	];
	result
];

getSourceRanges[{start_, end_}]:=Table[
	lineRange[l,start,end],
	{l,start[[1]],end[[1]]}];

lineRange[line_,start_,end_]:= ({line, Which[
	line == start[[1]] && line==end[[1]], {start[[2]], UpTo[end[[2]]]},
	line == start[[1]] && line!=end[[1]], {start[[2]],-1},
	line != start[[1]] && line!=end[[1]], All,
	line != start[[1]] && line==end[[1]], {1, UpTo[end[[2]]]}
]});

charIndexFromLineColumn[src_, {line_, column_}]:=Module[{sLines, charIndex},
	sLines = StringSplit[src, EndOfLine, All];
	charIndex = Total[StringLength/@Take[sLines, line-1]] + column
];

escapes[string_]:=StringReplace[string, {
	"\""->"\\\"",
	"\\"->"\\\\"
}];


graphicsQ = 
  FreeQ[Union @@ ImageData @ Image[Graphics[#], ImageSize -> 30], 
    x_ /; x == {1.`, 0.9176470588235294`, 0.9176470588235294`}] &;

graphicHeads = {Point, PointBox, Line, LineBox, Arrow, ArrowBox, Rectangle, RectangleBox, Parallelogram, Triangle, JoinedCurve, Grid, Graph, Column, Row, JoinedCurveBox, FilledCurve, FilledCurveBox, StadiumShape, DiskSegment, Annulus, BezierCurve, BezierCurveBox, BSplineCurve, BSplineCurveBox, BSplineSurface, BSplineSurface3DBox, SphericalShell, CapsuleShape, Raster, RasterBox, Raster3D, Raster3DBox, Polygon, PolygonBox,PredictorFunction, RegularPolygon, Disk, DiskBox, Circle, CircleBox, Sphere, SphereBox, Ball, Ellipsoid, Cylinder, CylinderBox, Tetrahedron, TetrahedronBox, Cuboid, CuboidBox, Parallelepiped, Hexahedron, HexahedronBox, Prism, PrismBox, Pyramid, PyramidBox, Simplex, ConicHullRegion, ConicHullRegionBox, Hyperplane, HalfSpace, AffineHalfSpace, AffineSpace, ConicHullRegion3DBox, Cone, ConeBox, InfiniteLine, InfinitePlane, HalfLine, InfinitePlane, HalfPlane, Tube, TubeBox, GraphicsComplex, Image, GraphicsComplexBox, GraphicsGroup, GraphicsGroupBox, GeoGraphics, Graphics, GraphicsBox, Graphics3D, Graphics3DBox, MeshRegion, BoundaryMeshRegion, GeometricTransformation, GeometricTransformationBox, Rotate, Translate, Scale, SurfaceGraphics, Text, TextBox, Inset, InsetBox, Inset3DBox, Panel, PanelBox, Legended, Placed, LineLegend, Texture};

evaluateInKernel[code_]:=Module[{json, result, formatted},
		CheckAbort[
			result=EvaluationData[ToExpression[StringTake[code, SyntaxLength[code]]]];
			
			If[
				(graphicsQ[result["Result"]]) || (MemberQ[graphicHeads, Head[result["Result"]]]),
				result["Result"] = CheckAbort[
					Rasterize[result["Result"]], 
					result["Result"]];,
				Nothing
			];	

			json ="{
				\"Result\": \""<>CheckAbort[escapes[ExportString[result["Result"],"HTMLFragment"]], "Failed to format output"] <> "\", 
				\"Errors\": ["<>If[Length@result["MessagesText"]>0,"\"" <>escapes[StringRiffle[Take[result["MessagesText"], UpTo[5]],"\n"]]<>"\"",""] <> "]
			}";
			json,
			
			json = "{
				\"Result\": \"$Failed\",
				\"Errors\":  ["<>"\"" <>escapes[StringRiffle[Take[result["MessagesText"], UpTo[5]],"\n"]]<>"\""<> "]
				}";
			json
		]
];
SetAttributes[evaluateInKernel, HoldFirst];

updateCursorLocations[src_]:=Module[{ ast, functions, l, locations},
	ast = CodeParse[src];
	functions = Cases[ast, (
		_CallNode |
		_LeafNode
	),{2}];

	locations = DeleteCases[Table[
		l = Last[Cases[f, <|Source -> x_, ___|> :> x, 3], {{-1,-1},{-1,-1}}];
		<|
			"start" -> <|"line"->l[[1,1]], "character" -> l[[1,2]]-1|>,
			"end" -> <|"line"->l[[2,1]], "character" -> l[[2,2]]+1 |> 
		|>,
		{f, functions}
	], <|
			"start" -> <|"line"->-1, "character" -> -1|>,
			"end" -> <|"line"->-1, "character" -> -1|> 
		|>];
	
	ExportString[
		locations, "RawJSON", "Compact" -> True]
];


createCell[starts_, ends_]:=<|"range"-><|"start"-><|"line"->starts-1,"character"->0|>,"end"-><|"line"->ends-1,"character"->0|>|>,"command"-><|"title"->"Run cell ("<>ToString[ends-starts+1]<>" line(s))","command"->"wolfram.runTextCell","arguments"->{<|"start"-><|"line"->starts-1,"character"->0|>,"end"-><|"line"->ends-1,"character"->100|>|>}|>|>;

getSections[src_, sectionPattern_]:=Module[{},
	BlockMap[StringTrim@Check[StringTake[src, {#[[1,1]], #[[2,2]]}], ""] &, Join[StringPosition[src, sectionPattern, Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]], 2,1]
];


emptyLineQ[line_] := StringMatchQ[line, StartOfString ~~ WhitespaceCharacter ... ~~ EndOfString];

codeLens[src_]:=Module[{starts, ends, breaks, lens, lines, sections, sectionPattern, ast, isEmptyLines, tripleEmptyPositions, gap, functions},
		Check[
			
			ast = CodeParse[src];
			
			lines = StringSplit[src, EndOfLine, All];
			isEmptyLines = emptyLineQ /@ lines; 
			tripleEmptyPositions = SequencePosition[isEmptyLines, {True, True, True}];
			startLines = Prepend[tripleEmptyPositions[[All, 1]]+1, 1];
			endLines = Append[tripleEmptyPositions[[All, 2]], Length@lines];
			cellRanges = Select[Transpose[{startLines, endLines}], #[[1]] < #[[2]] &];

			functions=Cases[ast,(CallNode[LeafNode[Symbol,(_),_],___]|LeafNode[_,_,_]),{2}];

			If[Length@functions < 2,
				lens = {};
				Return[ExportString[lens, "RawJSON", "Compact" -> True]],

				start = 1;
				lens = BlockMap[
					Function[{f},
						gap=f[[2]][[-1]][Source][[1,1]]-f[[1]][[-1]][Source][[2,1]];
						If[
							gap>=3,
							c = createCell[
								start,
								f[[2]][[-1]][Source][[1,1]]-3];
								start = f[[2]][[-1]][Source][[1,1]];
							c,
						Nothing
						]
					],
					functions,
					2,
				1];
				Return[ExportString[lens, "RawJSON", "Compact" -> True]];
			],

			lens = {};
			Return[ExportString[lens, "RawJSON", "Compact" -> True]];
		]


];



getCodeString[src_, rangejs_]:=Module[{range, result, result2},
	range = ImportString[rangejs, "RawJSON"];
	result = getCode[src, range];
	result2 = <|"code" -> result["code"], "range" -> <|"start" -> <|"line" -> result["range"][[1,1]], "character" -> result["range"][[1,2]]|>, "end" -> <|"line" -> result["range"][[2,1]], "character" -> result["range"][[2,2]]|>|>|>;
	ExportString[result2, "RawJSON", "Compact"->True]
];

getWordAtPosition[src_, position_]:=Module[{srcLines, line, word},
	srcLines =StringSplit[src, EndOfLine, All];
	line = srcLines[[position["line"]+1]];
	word = First[Select[StringSplit[line, RegularExpression["\\W+"]], 
		IntervalMemberQ[Interval[First@StringPosition[line, WordBoundary~~#~~ WordBoundary, Overlaps->False]], position["character"]+1] &], ""];
	
	word
];

getCode[src_, range_, section_:False]:=Module[{ result},
	result = Which[
		range["start"] === range["end"], (* run line or group of lines *)
			If[section,
				getSectionLevelCodeAtPosition[src, range["start"]],
				getTopLevelCodeAtPosition[src, range["start"]]
			],
		!(range["start"] === range["end"]),
			<|
				"code" -> getStringAtRange[src, rangeToStartEnd[range]], "range" -> <|
					"start" -> <|"line" -> range["start"]["line"] + 1, "character" -> range["start"]["character"]+1 |>,
					"end" -> <|"line" -> range["end"]["line"] + 1, "character" -> range["end"]["character"]+1 |>
				|>
			|>,
		True,
		<|
			"code" -> "", "range" -> <|
				"start" -> <|"line" -> range["start"]["line"] + 1, "character" -> range["start"]["character"] |>,
				"end" -> <|"line" -> range["end"]["line"] + 1, "character" -> range["end"]["character"] |>
			|>
		|>
	];
	result
];

getSectionLevelCodeAtPosition[src_, position_]:= Module[{tree, pos, call, result1, str},
	tree = CheckAbort[CodeParse[src], Print["Code Parsing Failed"];Return[<|"code"->"input error", "range"->{{position["line"],0}, {position["line"],0}}|>]];
	pos = <|"line" -> position["line"]+1, "character" -> position["character"]|>;

	Check[
		call = First[Cases[tree, x_CallNode /; 
		inCodeRangeQ[
		FirstCase[x, <|Source -> s_, ___|> :> s, {{1, 1}, {1, 1}}, 1], 
		pos], -2], {}];


		result1 = If[call === {},
			<|"code"->"null", "range"->{{pos["line"],0}, {pos["line"],0}}|>,
			
			str = Check[getStringAtRange[src, FirstCase[call, <|Source -> s_, ___|> :> s, {{0, 0}, {0, 0}}, 1]], ToFullFormString[call]];

			<|"code"->If[Head@str === String, StringTrim[str], "Failed"], "range"->call[[3]][Source]|>
		];
		result1,
	
		<|"code"->"input error", "range"->{{position["line"],0}, {position["line"],0}}|>
	]
];

getTopLevelCodeAtPosition[src_, position_]:= Module[{tree, pos, call, result1, result2, str},

		tree = CheckAbort[CodeParse[src], Print["Code Parsing Failed"];Return[<|"code"->"input error", "range"->{{position["line"],0}, {position["line"],0}}|>]];
		pos = <|"line" -> position["line"]+1, "character" -> position["character"]|>;

		Check[
			call = First[Cases[tree, ((x_LeafNode /; 
			inCodeRangeQ[
			FirstCase[x, <|Source -> s_, ___|> :> s, {{1, 1}, {1, 1}}, 1], 
			pos]) | (x_CallNode /; 
			inCodeRangeQ[
			FirstCase[x, <|Source -> s_, ___|> :> s, {{1, 1}, {1, 1}}, 1], 
			pos])), {2}], {}];


		result1 = If[call === {},
			<|"code"->"null", "range"->{{pos["line"],0}, {pos["line"],0}}|>,
			
			str = Check[getStringAtRange[src, FirstCase[call, <|Source -> s_, ___|> :> s, {{0, 0}, {0, 0}}, 1]], ToFullFormString[call]];

			<|"code"->If[Head@str === String, StringTrim[str], "Failed"], "range"->call[[3]][Source]|>
		];
		;
		result1,
		
		<|"code"->"input error", "range"->{{position["line"],0}, {position["line"],0}}|>
	]
];

inCodeRangeQ[source_, pos_] := Module[{start, end},
  	start = source[[1]];
  	end = source[[2]];

	Which[
		(start[[1]] == pos[[1]] && start[[2]] <= pos[[2]] && end[[1]] == pos[[1]] && end[[2]] <= pos[[2]]),
		(* Position is in the same line as function *)
		True,
		(start[[1]] <= pos[[1]] && end[[1]] >= pos[[1]]),
		(* Selection is in the same range as function *)
		True,
		(start[[1]] <= pos[[1]] && end[[1]] >= pos[[1]] && end[[2]] <= pos[[2]]),
		True,
		True,
		False
	]
];


rangeToStartEnd[range_List]:=Module[{},
	{
		{range[[1]]["line"]+1, range[[1]]["character"]},
		{range[[2]]["line"]+1, range[[2]]["character"]+1}
	}
];

rangeToStartEnd[range_]:=Module[{},
	{
		{range["start", "line"]+1, range["start", "character"]},
		{range["end", "line"]+1, range["end", "character"]+1}
	}
];

symbolDefinitions = <||>;
documentSymbols[src_, json_]:=Module[{},

	ast = CheckAbort[CodeParse[src], Return[{}]];
	result = funcsDefs[src, ast, json];

	Map[Function[{x}, symbolDefinitions[x["name"]] = x], result];
	ExportString[result, "RawJSON", "Compact"->True]
];

funcsDefs[text_, ast_, json_]:=Module[{funcs, defs, kind, uri},
					kind[s_]:= Switch[
								s, 
								"Symbol", 13, 
								"Integer", 16, 
								"Real", 16,
								"Complex", 16,
								"Rational", 16,
								"List", 18,
								"Map", 18,
								"Table", 18,
								"Association", 23,
								"Function", 12, 
								"String", 15, 
								"Module", 12,
								_, 19];
	uri = Lookup[json,"uri", ""];
	funcs=Cases[ast,CallNode[LeafNode[Symbol,"SetDelayed",_],{CallNode[_,_,x_],y_,___},src_]:>
		CheckAbort[<|
		"name"->getStringAtRange[text,x[Source]],
		"kind"->FirstCase[y,LeafNode[_,h_,_]:>kind[ToString@h],"Symbol",Infinity,Heads->True],
		"detail"->getStringAtRange[text,src[Source]],
		"location"-><|
		"uri"->uri,
		"range"->positionToRange[src[Source]]|>
		|>, Nothing],Infinity];

	defs = Cases[ast,CallNode[LeafNode[Symbol,"Set",_],{(LeafNode[_,_,x_]),y_,___},src_]:>CheckAbort[<|
		"name"->getStringAtRange[text,x[Source]],
		"kind"->FirstCase[y,LeafNode[_,h_,_]:>kind[ToString@h],"Symbol",Infinity,Heads->True],
		"detail"->getStringAtRange[text,src[Source]],
		"location"-><|
		"uri"->uri,
		"range"->positionToRange[src[Source]]|>
		|>, Nothing],Infinity];

	Join[funcs, defs]
];

positionToRange[text_String,range_]:=Module[{beforeText, selectedText, afterText},
	beforeText = StringTake[text,{1, range[[1]]}];
	selectedText = StringTake[text,{range[[1]], range[[2]]}];
	afterText = StringTake[text,{range[[2]], -1}];

	<|
		"start"-><|
			"line" -> StringCount[beforeText,EndOfLine]-1, 
			"character"->StringLength[Last@StringSplit[beforeText,EndOfLine]]-1
		|>,
		"end"-><|
			"line" -> StringCount[beforeText,EndOfLine] + StringCount[selectedText,EndOfLine]-2,
			"character" -> StringLength[
				Last@
					StringSplit[
						beforeText<>selectedText,
						EndOfLine]
			]-1
		|>
	|>
];

positionToRange[range_]:=Module[{},
	<|
		"start" -> <|
			"line" -> range[[1,1]]-1,
			"character" -> range[[1,2]]-1
		|>,
		"end" -> <|
			"line" -> range[[2,1]]-1,
			"character" -> range[[2,2]]-1
		|>
	|>
]; 