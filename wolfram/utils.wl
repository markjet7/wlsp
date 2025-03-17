(* ::Package:: *)

Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];

getStringAtRange[string_, rangejs_String]:=Module[{sLines, sRanges, range},
	range = ImportString[rangejs, "RawJSON"];
	If[range[[1]] == range[[2]], Return[""]];

	sLines = StringSplit[string, EndOfLine, All];

	sRanges= getSourceRanges[range];

	StringJoin@Table[
		StringTake[
				sLines[[l[[1]]]],
			l[[2]]],
		{l, sRanges}]
];

getStringAtRange[string_, range_]:=Module[{sLines, sRanges},
	If[range[[1]] == range[[2]], Return[""]];

	sLines = StringSplit[string, EndOfLine, All];

	sRanges= getSourceRanges[range];

	StringJoin@Table[
		StringTake[
				sLines[[l[[1]]]],
			l[[2]]],
		{l, sRanges}]
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

getCodeString[src_, rangejs_]:=Module[{range, result, result2},
	range = ImportString[rangejs, "RawJSON"];
	result = getCode[src, range];
	result2 = <|"code" -> result["code"], "range" -> <|"start" -> <|"line" -> result["range"][[1,1]], "character" -> result["range"][[1,2]]|>, "end" -> <|"line" -> result["range"][[2,1]], "character" -> result["range"][[2,2]]|>|>|>;
	ExportString[result2, "RawJSON", "Compact"->True]
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
					"start" -> <|"line" -> range["start"]["line"] + 1, "character" -> range["start"]["character"] |>,
					"end" -> <|"line" -> range["end"]["line"] + 1, "character" -> range["end"]["character"] |>
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
		{range[[1]]["line"]+1, range[[1]]["character"]+1},
		{range[[2]]["line"]+1, range[[2]]["character"]+1}
	}
];

rangeToStartEnd[range_]:=Module[{},
	{
		{range["start", "line"]+1, range["start", "character"]+1},
		{range["end", "line"]+1, range["end", "character"]+1}
	}
];
