BeginPackage["wolframLSP`"];


(* ::Package:: *)
(**)
Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];
Check[Needs["CodeInspector`"], PacletInstall["CodeInspector"]; Needs["CodeInspector`"]]; 
Needs["CodeParser`Scoping`"];


COMPLETIONS = Import[DirectoryName[path] <> "completions.json", "RawJSON"]; 
DETAILS =  Association[StringReplace[#["detail"]," details"->""]-># &/@Import[DirectoryName[path] <> "details.json","RawJSON"]];
 
scriptPath = DirectoryName@ExpandFileName[First[$ScriptCommandLine]]; 
(* Get[scriptPath <> "/CodeFormatter.m"]; *)


contentLengthPattern[] := "Content-Length: "~~length:NumberString~~"\r\n\r\n";
contentPattern[length_]:= (("Content-Length: "~~ToString@length~~"\r\n\r\n"~~content1:Repeated[_,{length}]) | (content2:Repeated[_,{length}]~~"Content-Length: "~~ToString@length~~"\r\n\r\n"));

(* handleMessage[content_String]:=Module[{},
	json=ImportString[ToString[content, OutputForm, CharacterEncoding -> "UTF8"],"RawJSON"];
	handle[json["method"],json];]; *)

ServerCapabilities=<|
	"textDocumentSync"->1,
	"hoverProvider"-><|"contentFormat"->"markdown"|>,
	"signatureHelpProvider"-><|"triggerCharacters" -> {"[", ","}, "retriggerCharacters"->{","}|>,
	"foldingRangeProvider" -> False, (* True*)
	"documentFormattingProvider" -> True,
	"completionProvider"-> <|"resolveProvider"->False, "triggerCharacters" -> {"@"}, "allCommitCharacters" -> {"["}|> ,
	"documentSymbolProvider"->True,
	"codeActionProvider"->False,
	"codeLensProvider"-> <|"resolveProvider"->True|>,
	"renameProvider" -> <| "prepareProvider" -> True|>,
	"definitionProvider" -> True,
	"colorProvider" -> True,
	"workspaceSymbolProvider" -> True,
	"workspace" -><|
		"workspaceFolders" -> <|"supported"->True, "changeNotifications" -> True|>
	|>,
	"semanticTokensProvider" -> <|
		"full" -> True,
		"legend" -> <|
			"tokenTypes" -> {"variable", "parameter", "keyword", "number", "string", "function"},
			"tokenModifiers" -> {"definition", "declaration"}
		|>
	|>
|>;

handle["initialize",json_]:=Module[{response2, builtins},
    CONTINUE = True;

	labels = COMPLETIONS[[All, "label"]];
	symbolDefinitions = <||>;
	nearestLabel = Nearest[labels];
    
	documents = <||>;
	response2 = <|"id"->json["id"],"result"-><|"capabilities"->ServerCapabilities|>|>;
	sendResponse[response2];	
	workspaceLintDecorationsFile = CreateFile[];
	
	builtinSymbols = {};
	symbolListFile = scriptPath <> "symbolList.js";
	cursorLocationsFile = scriptPath <> "cursorLocations.js";
	Export[cursorLocationsFile, <||>, "JSON"];

	messageHandler = If[Last[#],
		Save["/tmp/lsphandler.wl", Stack[]],
		Nothing
	];

	Internal`AddHandler["Message", messageHandler];

];

handle["initialized", json_]:=Module[{},
	Print["Initialized"];
];

handle["DocumentSymbolRequest", json_]:=Module[{},
	Print["ToDo: DocumentSymbolRequest"];
];

handle["workspace/symbol", json_]:=Module[{response},
	symbol = json["params"]["query"];
	AllSymbols = Import[symbolListFile, "RawJSON"];

	symbols = If[symbol != "", Flatten@Select[AllSymbols[[All, "children"]], StringContainsQ[ToString@#["name"], ToString@symbol] &], {}];

	response = <|"id" -> json["id"], "result"->symbols|>;
	sendResponse[response];
];

workspaceFolders = {};

handle["workspace/didChangeWorkspaceFolders", json_]:=Module[{added, removed},

	added = json["params"]["event"]["added"];
	removed = json["params"]["event"]["removed"];

	workspaceFolders = DeleteDuplicates@DeleteCases[Join[workspaceFolders, added], _?(MemberQ[removed, #] &)];
];

handle["builtInList", json_]:=Module[{},
	If[builtinSymbols === {},
		builtins = COMPLETIONS[[102;;-2, "label"]];
		builtinSymbols = Map[
			Function[{symbol},
				<|
					"name" -> symbol,
					"kind" -> "Variable",
					"location" -> <|
						"uri" -> "https://reference.wolfram.com/language/ref/" <> symbol <> ".html"
					|>
				|>
			],
			builtins
		]; 
	];  

	file = CreateFile[];
	WriteString[file, ExportString[<|"builtins" -> builtinSymbols|>, "JSON"]];

	response = <|"id"->json["id"],"result"->ToString@file|>;

	sendResponse[response];
	Close[file];
];

symbolToTreeItem[symbol_]:=Module[{},
	<|
		"name" -> ToString[symbol, InputForm, TotalWidth -> 150],
		"kind" -> "Variable"(* symbol["kind"] *),
		"definition" -> ToString[symbol, InputForm, TotalWidth -> 550]
	|>
];

symbolToTreeItem[symbol_List]:=Module[{},
	<|
		"name" -> "List",
		"kind" -> "Variable"(* symbol["kind"] *),
		"definition" -> "{}",
		"children" -> Map[symbolToTreeItem, symbol]
	|>
];

symbolToTreeItem[symbol_Association]:=Module[{},
	<|
		"name" -> "Association",
		"kind" -> "Variable"(* symbol["kind"] *),
		"definition" -> "<||>",
		"children" -> Map[symbolToTreeItem, Values@symbol]
	|>
];

handle["symbolList", json_]:=Module[{response, symbols, builtins, result1, result2, files, file},
	Print["symbol list"];
	files = DeleteDuplicates@Flatten@Join[FileNames[{"*.wl", "*.wls", "*.nb0"}, workspaceFolders], StringReplace[FileNameJoin[Rest@URLParse[URLDecode[#], "Path"]], ("#"~~___ ->"")] & /@ Keys@documents];
	sources = Check[Import[First@StringSplit[#, "#"], "Text"], ""] & /@ files;
	Print["symbol list"];
	symbols = SortBy[Flatten@MapThread[getSymbols[#1, URLBuild[<|"Scheme" -> "file", "Path" -> Join[{""}, FileNameSplit[#2]]|>]] &, {sources, files}], #1["name"] &];
	

	result1 = Map[
		Function[{symbol},
			<|
				"name" -> symbol["name"],
				"kind" -> "Variable"(* symbol["kind"] *),
				"definition" -> symbol["definition"],
				"location" -> <|
					"uri" -> symbol["uri"],
					"range" -> <|
						"start" -> <|"line" -> symbol["loc"][[1, 1]]-1, "character"->symbol["loc"][[1,2]]-1|>,
						"end" -> <|"line" -> symbol["loc"][[2, 1]]-1, "character"->symbol["loc"][[2,2]]-1|>
					|>
				|>,
				"children" -> If[Length[ToExpression[symbol["name"]]] > 1, Map[symbolToTreeItem, ToExpression[symbol["name"]]], {}]
			|>
		],
		symbols
	];

	If[builtinSymbols === {},
		builtins = COMPLETIONS[[102;;-2, "label"]];
		builtinSymbols = Map[
			Function[{symbol},
				<|
					"name" -> symbol,
					"kind" -> "Variable",
					"location" -> <|
						"uri" -> "https://reference.wolfram.com/language/ref/" <> symbol <> ".html"
					|>
				|>
			],
			builtins
		]; 
	];

	file = CreateFile[];
	WriteString[file, ExportString[<|"workspace" -> result1|>, "JSON"]];

	response = <|"id"->json["id"],"result"->ToString@file|>;

	sendResponse[response];
	Close[file];
];

handle["textDocument/references", json_]:=Module[{src, position, str, definitions, result},
	src = documents[json["params"]["textDocument"]["uri"]];
	position = json["params"]["position"];

	str = getWordAtPosition[src, position];
	

	definitions = Select[Flatten@KeyValueMap[getSymbols[#2, #1] &, documents], StringMatchQ[#["name"], str] &];
	result = Table[<|
		"uri" -> d["uri"], 
		"range" -> <|
			"start" -> <|"line" -> d["loc"][[1, 1]]-1, "character"->d["loc"][[1,2]]-1|>,
			"end" -> <|"line" -> d["loc"][[2, 1]]-1, "character"->d["loc"][[2,2]]-1|>
		|>|>, {d, definitions}];

	sendResponse[<|"id" -> json["id"], "result"-> result|>];
];

handle["textDocument/documentColor", json_]:=Module[{src, rgbPattern, colors, result},

	If[!KeyMemberQ[documents, json["params"]["textDocument"]["uri"]],
		sendResponse[<|"id"->json["id"], "result" -> {} |>];
		Return[]
	];

	src = Check[documents[json["params"]["textDocument"]["uri"]], ""];
	If[StringCases[src, "RGBColor"] == {},
		sendResponse[<|"id"->json["id"], "result" -> {} |>];
		Return[]
	];

	TimeConstrained[
		rgbPattern=c:(Shortest["RGBColor["~~r__~~","~~g__~~","~~b__~~("]"|("," ~~a__~~"]"))] | Shortest["RGBColor[" ~~ ___ ~~ "\"" ~~ WordCharacter.. ~~"\"" ~~ ___~~"]"]);
		If[Unequal[Head@rgbPattern, String], rgbPattern = ""]; 
		colors=MapIndexed[{#2[[1]],StringPosition[#1,rgbPattern],StringCases[#1,rgbPattern:>ToExpression@c]}&,StringSplit[src,"\n",All]]//Select[#,#[[2]]!={}&]&;
		result = Map[
			If[AnyTrue[#, FailureQ],
				Nothing,
			<|
				"range"-><|
					"start"-><|"line"->#[[1]]-1, "character"->#[[2,1,1]]-1|>,
					"end"-><|"line"->#[[1]]-1, "character"->#[[2,1,2]]|>
				|>,
			"color"-><|
				"red"->#[[3,1,1]],
				"green"->#[[3,1,2]],
				"blue"->#[[3,1,3]],
				"alpha"->If[Length@#[[3,1]] >3, #[[3,1,4]] ,1]
				|>
			|>]&,
			colors
		];
		sendResponse[<|"id"->json["id"], "result" -> result |>];,

		Quantity[0.1, "Seconds"],
		sendResponse[<|"id"->json["id"], "result" -> {} |>];
	]
];

handle["textDocument/colorPresentation", json_]:=Module[{src, color, range, result},
	src = documents[json["params"]["textDocument"]["uri"]];
	color = json["params"]["color"];
	range = json["params"]["range"];

	result = {<|
		"label"-> ToString@{color["red"], color["green"], color["blue"], color["alpha"]},
		"textEdit" -> <|
			"range" -> range,
			"newText" -> ToString@RGBColor[color["red"], color["green"], color["blue"], color["alpha"]]
		|>
	|>};

	sendResponse[<|"id"->json["id"], "result" -> result |>];
];

handle["textDocument/definition", json_]:=Module[{src, position, str, definitions, result},
		src = documents[json["params"]["textDocument"]["uri"]];
		position = json["params"]["position"];

		str = getWordAtPosition[src, position];
		definitions = Select[Flatten@KeyValueMap[getSymbols[#2, #1] &, documents], StringMatchQ[#["name"], str] &];
		result = Table[<|
			"uri" -> d["uri"], 
			"range" -> <|
				"start" -> <|"line" -> d["loc"][[1, 1]]-1, "character"->d["loc"][[1,2]]-1|>,
				"end" -> <|"line" -> d["loc"][[2, 1]]-1, "character"->d["loc"][[2,2]]-1|>
			|>|>, {d, definitions}];
		
		sendResponse[<|"id" -> json["id"], "result"-> result|>];
];

handle["wolframVersion", json_]:=Module[{response},
	response = <|"id" -> json["id"], "result"-> <| "output" -> "$(check) Wolfram " <> ToString[$VersionNumber] |> |>;
	sendResponse[response];
];

handle["shutdown", json_]:=(
	Print["LSP Goodbye"];
	state = "Stop";
	sendResponse[<|"id" -> json["id"], "result" -> Null|>];
	Close[SERVER];
	Quit[];
	Exit[];
);


handle["moveCursor", json_]:=Module[{range, uri, src, end, code, newPosition, ast,next, functions, input},
	range = json["params", "range"];
	uri = Check[json["params", "textDocument"]["uri", "external"],""];
	src = Check[documents[json["params","textDocument","uri", "external"]],""];

	ast = CodeParse[StringReplace[src, ";" -> " "]];
	functions = Cases[ast, (
		CallNode[LeafNode[Symbol,(_),_],___] |
		LeafNode[_,_,_]
	),{2}];

	{prev, next} = Last[BlockMap[Function[{f12} , (
			If[
    			And[(f12[[1, 3]][Source][[1, 1]]-1 <= range[["start", "line"]]), range[["start", "line"]] <= f12[[2, 3]][Source][[1, 1]]-1],
				{
					f12[[1, 3]][Source], 
					f12[[2, 3]][Source][[1, 1]]-1
				},
   				Nothing
   			])], 
			functions, 2, 1], 
		   	{range, range["end"]["line"]+1}
		];


	input = ReplaceAll[<|
		"start" -> <|"line" -> prev[[1,1]]-1, "character" -> prev[[1, 2]]-1 |>,
		"end" -> <|"line" -> prev[[2,1]]-1, "character" -> prev[[2, 2]]-1 |>
		|>, x_/;x<0 -> 0];
	newPosition = <|"line"->If[next > range["end"]["line"], next, range["end"]["line"]+1], "character"->0|>;
	sendResponse[<|"id" -> json["id"], "result" -> <|"position" -> newPosition, "input" -> input|>|>];
];

handle["textDocument/foldingRange", json_]:=Module[{document, src, lines, sectionPattern, ranges, functionSections, listSections, assocSections},
	If[
		StringContainsQ[json["params"]["textDocument"]["uri"], "vscode-notebook-cell"],
		sendResponse[<|"id"->json["id"], "result"->{}|>];,

		document = json["textDocument"]["uri"];
		src = documents[json["params","textDocument","uri"]];

		sectionPattern = (Shortest["(*" ~~ WhitespaceCharacter.. ~~ "::" ~~ ___ ~~ "::" ~~ WhitespaceCharacter.. ~~ "*)"]);
		lines = StringCount[Check[StringTake[src, {1, #[[2]]}], ""], "\n"] & /@ Join[StringPosition[src, sectionPattern, Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]];
		sections = getSections[src, sectionPattern];
		If[Length@sections === Length@Most@lines,
			ranges = MapThread[Function[{l, s}, <|"startLine" -> l, "endLine" -> l + StringCount[s, "\n"]-1 |>], {Most@lines, sections}];,
			ranges = {};
		];

		functionSections = Select[
			Map[
				positionToLineChar[src, #] &,
				StringPosition[src, RegularExpression["(\[(?:[^\[\]]+|(?1))*\])"]]],
			#["startLine"] < #["endLine"] &
		];

		listSections = Select[
			Map[
				positionToLineChar[src, #] &,
				StringPosition[src, RegularExpression["(\{(?:[^\{\}]+|(?1))*\})"]]],
			#["startLine"] < #["endLine"] &
		];

		assocSections = Select[
			Map[
				positionToLineChar[src, #] &,
				StringPosition[src, RegularExpression["(<(?:[^<\>]+|(?1))*\>)"]]],
			#["startLine"] < #["endLine"] &
		];



		(* sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[response, InputForm, TotalWidth->100] |> |>]; *)

		(* Print[ToString[src, InputForm, TotalWidth->100]];*)
		(*sendResponse[response];*)
		sendResponse[<| "id" -> json["id"], "result"->Join[ranges, functionSections, listSections, assocSections]|>];
	]
];


handle["codeLens/resolve", json_]:=Print["resolve"]; 

getSections[src_, sectionPattern_]:=Module[{},
	BlockMap[StringTrim@Check[StringTake[src, {#[[1,1]], #[[2,2]]}], ""] &, Join[StringPosition[src, sectionPattern, Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]], 2,1]
];

handle["textDocument/codeLens", json_]:=handle["textDocument/codeLens", json]=Module[{src, starts, ends, breaks, lens, lines, sections, sectionPattern},

	If[
		!KeyMemberQ[documents, json["params"]["textDocument"]["uri"]],
		sendResponse[<|"id"->json["id"], "result"->{}|>];
		Return[];
	];

	If[
		StringContainsQ[json["params"]["textDocument"]["uri"], "vscode-notebook-cell"],
		sendResponse[<|"id"->json["id"], "result"->{}|>];,

		Check[
			(* sectionPattern = Shortest["(*" ~~ WhitespaceCharacter.. ~~ "::" ~~ ___ ~~ "::" ~~ WhitespaceCharacter.. ~~ "*)"];
			lines = StringCount[Check[StringTake[src, {1, #[[2]]}], ""], "\n"] & /@ Join[StringPosition[src, sectionPattern, Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]];
			sections = BlockMap[StringTrim@Check[StringTake[src, {#[[1,1]], #[[2,2]]}], ""] &, Join[StringPosition[src, sectionPattern, Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]], 2,1]; 
			sections = StringPosition[src, "\n\n\n", Overlaps -> False];*)

			src = ImportString[documents[json["params","textDocument","uri"]],"Lines"];
			breaks=BlockMap[Identity,Join[{1},SequencePosition[src,{"","", Except[""]}][[All,2]], {Length@src}+1],2,1];
			sections = Map[StringRiffle[src[[#[[1]];;#[[2]]-1]],"\n"]&,breaks];
			starts = Map[<|"line" -> #[[1]], "character" -> 0|> &, breaks];
			ends = MapThread[<|
				"line" -> #1[[1]] + StringCount[StringTrim@#2, "\n"],
				"character" -> StringLength@Last[StringSplit[#2, "\n"] /. {} -> {""}]+1|> &, 
				{breaks, sections}];

			If[sections != {},
				lens = Flatten@Table[
					{
						<|
							"range" -> 
								<|
									"start" -><|"line"->starts[[i, "line"]]-1, "character"->0|>,
									"end" -><|"line"->ends[[i, "line"]]-1, "character"->0|>
								|>,
							"command" -> <|
								"title" -> "Run cell (" <> ToString[ends[[i, "line"]] - starts[[i, "line"]]+1] <> " line(s))",
								"command" -> "wolfram.runTextCell",
								"arguments" -> {<|
									"start" -><|"line"->starts[[i, "line"]]-1, "character"->0|>,
									"end" -><|"line"->ends[[i, "line"]]-1, "character"->ends[[i, "character"]]|>
								|>}
							|>
						|>,
						<|
							"range" -> 
								<|
									"start" -><|"line"->starts[[i, "line"]]-1, "character"->0|>,
									"end" -><|"line"->ends[[i, "line"]]-1, "character"->0|>
								|>,
							"command" -> <|
								"title" -> "Run above "(* <> ToString[starts[[i, "line"]]] <> " line(s))"*),
								"command" -> "wolfram.runTextCell",
								"arguments" -> {<|
									"start" -><|"line"->0, "character"->0|>,
									"end" -><|"line"->starts[[i, "line"]], "character"->starts[[i, "character"]]|>
								|>}
							|>
						|>,
						<|
							"range" -> 
								<|
									"start" -><|"line"->starts[[i, "line"]]-1, "character"->0|>,
									"end" -><|"line"->ends[[i, "line"]]-1, "character"->0|>
								|>,
							"command" -> <|
								"title" -> "Run below " (* <> ToString[Length[src] - starts[[i, "line"]]] <> " line(s))" *),
								"command" -> "wolfram.runTextCell",
								"arguments" -> {<|
									"start" -><|"line"->starts[[i, "line"]]-1, "character"->0|>,
									"end" -><|"line"->Length[src], "character"-> ends[[-1, "character"]]|>
								|>}
							|>
						|>

					},
					{i, Length@starts}
				];,
				lens = {}
			];
			sendResponse[<|"id"->json["id"], "result"->lens|>];,
		sendResponse[<|"id"->json["id"], "result"->{}|>];]
	];
	updateCursorLocations[json];
];

handle["textDocument/prepareRename", json_]:=Module[{pos, src, str, renames, result, response},
	pos = posFromVSCode@json["params", "position"];
	src = documents[json["params","textDocument","uri"]];
	str = getWordAtPosition[src, pos];
	renames = getWordsPosition[str, src];
	result = <|"range"-> renames[[1,2]]|>;
	response = <|"id"->json["id"],"result"->result |>;
	sendResponse[response]; 
]; 

handle["textDocument/rename", json_]:=Module[{pos, src, newName, str, renames, edits, result, response, response3},
	pos = json["params", "position"];
	src = documents[json["params","textDocument","uri"]];
	newName = json["params", "newName"];

	str = getWordAtPosition[src, pos];
	renames = getWordsPosition[str, src];

	(* Only change in the current document for now *)
	edits = Table[<|"range" -> r[[2]], "newText" -> newName|>, {r, renames}];
	result = <|"changes" -> <|json["params","textDocument","uri"] -> edits |>|>;
	response = <|"id"->json["id"],"result"->result |>;
	sendResponse[response];

	response3 = <| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[result, InputForm, TotalWidth->100] |> |>;
	sendResponse[response3];
];

handle["textDocument/formatting", json_]:=Module[{src, prn, out, lines, result, response}, 
	src = Check[documents[json["params","textDocument","uri"]],""];
    prn = Cell[BoxData[#], "Input"] &;
    out = UsingFrontEnd[First[FrontEndExecute[FrontEnd`ExportPacket[prn@CodeFormatter`FullCodeFormat@src, "InputText"]]]];

	lines = Length@StringSplit[src, EndOfLine, All];
	result = {<|
		"range" -> <|
			"start" -> <|"line" -> 0, "character" -> 0 |>,
			"end" -> <|"line" -> lines, "character" -> 0 |>
		|>,
		"newText" -> out
	|>};

	response = <|"id"->json["id"],"result"->(result /. Null -> "NA") |>;
	sendResponse[response];

];

handle["textDocument/didOpen",json_]:=Module[{file},
	file = json["params"]["textDocument"]["uri"];
	updateCursorLocations[json];

	(* Import[URLDecode@StringReplace[file, "file://"->""],"Text"] *)
];

handle["textDocument/codeAction", json_]:=Module[{},
	src = documents[json["params","textDocument","uri"]];
	range = json["params","range"];

];

handle["completionItem/resolve", json_] := Module[{item, documentation, result, response}, 
	item = json["params"];
	(* If[
		MemberQ[COMPLETIONS[[All, "label"]], item["label"]],
		documentation = DETAILS[item["label"]]["documentation"] (*ToString[DETAILS[[SelectFirst[COMPLETIONS, #["label"] == item["label"] &]["data"]+1]]["documentation"]] *),
		documentation = ""
	]; *)

	documentation = extractUsage[item["label"]];

	result = <|
		"label" -> item["label"],
		"kind" -> item["kind"],
		"documentation" -> documentation
	|>;
	response = <|"id"->json["id"],"result"->(result /. Null -> "NA")|>;
	sendResponse[response];
];

handle["textDocument/completion", json_]:=Module[{src, pos, symbol, names, items, result, response, position, missingCloser, functionArguments, candidates},
		TimeConstrained[
			src = documents[json["params","textDocument","uri"]];
			pos = json["params","position"];
			symbol = getWordAtPosition[src, pos] /. Null -> "";
			ast = CodeParse[src];
			keys = Cases[ast,
				CallNode[LeafNode[Symbol,"Rule",<||>],{LeafNode[String,k_,<|Source->_|>],LeafNode[Integer,v_,<|Source->_|>]},<|Source->_|>]:>k,
				Infinity
			];

			position = <|"line" -> pos["line"], "character" -> pos["character"]|>;
			missingCloser = FirstCase[ast,
				CallMissingCloserNode[___,source_]/;inCodeRangeQ[source[Source], position], {}, Infinity];

			If[missingCloser === {},
				functionArguments = {},
				functionArguments = Options[ToExpression[missingCloser[[1, 2]]]][[All, 1]]
			];

			(* SmithWatermanSimilarity *)
			(*names = Select[Join[keys,labels], EditDistance[#, symbol, IgnoreCase->True] >= StringLength@symbol &, 15]; *)

			(* names = Nearest[Select[Join[keys,labels], StringLength@#>3&], symbol,20,DistanceFunction-> (EditDistance[#1,#2, IgnoreCase->True] &)]; *)

			If[StringTrim@symbol === "",
				candidates = {"Table", "Module", "Block", "With", "ListPlot", "Association"},
				candidates = Select[Join[keys,labels], StringTake[#,UpTo[StringLength@symbol]]===symbol&]
			];

			names = PadRight[Join[functionArguments, candidates],
				20,
				Select[Join[keys,labels],EditDistance[ StringTake[#, UpTo[StringLength@symbol]],symbol,IgnoreCase->True] <=2&]];

			items = Table[
					<|
						"label" -> ToString@n,
						"kind" -> If[ValueQ@n, 12, 13],
						"commitCharacters" -> {"[", "\t"},
						"detail" -> "test" (* ToString@Check[extractUsage[n], n] *)(* DETAILS[n]["documentation"] *)
					|>, 
					{n,names}];
			
			result = <|
				"items" -> items,
				"isIncomplete" -> True
				|>;

			response = <|"id"->json["id"],"result"->(result /. Null -> "NA")|>;
			sendResponse[response];,

			Quantity[5, "Seconds"],
			(
				response = <|"id"->json["id"],"result"-><| "isIncomplete" -> True, "items" -> {}|>|>;
				sendResponse[response];
			)
		]
];

balancedQ[str_String] := StringCount[str, "["] === StringCount[str, "]"];
handle["textDocument/documentSymbol", json_]:=handle["textDocument/documentSymbol", json]=Module[{uri, text, funcs, defs, result, response, kind, ast},
	Check[
				(
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

					uri = json["params"]["textDocument"]["uri"];
					text = documents[json["params", "textDocument", "uri"]];
					(*ast = AST`ParseFile@Export[FileNameJoin[{$TemporaryDirectory, "wolf-lsp"<> ToString@RandomReal[] <> ".txt"}], src];*)
					ast = CodeParse[text, SourceConvention -> "SourceCharacterIndex"];

					funcs=Cases[ast,CallNode[LeafNode[Symbol,"SetDelayed",_],{CallNode[_,_,x_],y_,___},src_]:><|
						"name"->StringTake[text,x[Source]],
						"kind"->FirstCase[y,LeafNode[_,h_,_]:>kind[ToString@h],"Symbol",Infinity,Heads->True],
						"detail"->StringTake[text,src[Source]],
						"location"-><|
						"uri"->uri,
						"range"->positionToRange[text,src[Source]]|>
						|>,Infinity];

					defs = Cases[ast,CallNode[LeafNode[Symbol,"Set",_],{(LeafNode[_,_,x_]),y_,___},src_]:><|
						"name"->StringTake[text,x[Source]],
						"kind"->FirstCase[y,LeafNode[_,h_,_]:>kind[ToString@h],"Symbol",Infinity,Heads->True],
						"detail"->StringTake[text,src[Source]],
						"location"-><|
						"uri"->uri,
						"range"->positionToRange[text,src[Source]]|>
						|>,Infinity];


					result = Join[funcs, defs];

					Map[Function[{x}, symbolDefinitions[x["name"]] = x], result];

					response = <|"id"->json["id"],"result"->result|>;
					sendResponse[response];  

					response = <|"method"->"updatePositions", "params" -> <|"result" -> result|>|>;
					sendResponse[response]; 

			),
				response = <|"id"->json["id"],"result"->{}|>;
				sendResponse[response];  
				sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 1, "message" -> "Document symbol request failed due to parsing error." |> |>];
	]

];

updateCursorLocations[json_]:=Module[{src, ast, functions, l},
	locations = Import[cursorLocationsFile, "RawJSON"];
	src = documents[json["params","textDocument","uri"]];
	ast = CodeParse[src];
	functions = Cases[ast, (
		_CallNode |
		_LeafNode
	),{2}];

	locations[json["params","textDocument","uri"]] = DeleteCases[Table[
		l = Last[Cases[f, <|Source -> x_, ___|> :> x, 3], {{-1,-1},{-1,-1}}];
		<|
			"start" -> <|"line"->l[[1,1]]-1, "character" -> l[[1,2]]-1|>,
			"end" -> <|"line"->l[[2,1]]-1, "character" -> l[[2,2]]-1|> 
		|>,
		{f, functions}
	], <|
			"start" -> <|"line"->-1, "character" -> -1|>,
			"end" -> <|"line"->-1, "character" -> -1|> 
		|>];
	Export[cursorLocationsFile, locations, "JSON"];
];


signatureQueue = {};
handle["textDocument/signatureHelp", json_]:=Module[{position, uri, src, symbol, activeparam, activeSignature, value, opts, result, response, functionWithParams, signatures, function, ast, positions},
	Check[		
		position = json["params"]["position"];
		uri = json["params"]["textDocument"]["uri"];
		src = documents[json["params","textDocument","uri"]];

		ast = CodeParse[src];
		pos = <|"line" -> position["line"]+1, "character" -> position["character"]|>;

	 	function=FirstCase[ast,(UnterminatedCallNode[LeafNode[___],p:List[___],source_]|CallNode[LeafNode[___],p:List[___],source_])/;inCodeRangeQ[source[Source],pos],{},Infinity];

		symbol = FirstCase[function, LeafNode[_,s_,_]:>s,""];

		params =DeleteCases[FirstCase[function, List[___], {}],LeafNode[Alternatives@@(Symbol/@Names["Token`*"]),_,_]];

		positions = Flatten[Cases[params,<|Source->x_,___|>:>x,{2}],1];

		If[positions === {},
			activeparam = 1,
			activeparam = First[Flatten@Position[positions, Check[First@Nearest[positions, Values@pos], 1]]-1,1];
		];

		activeSignature = 1;
		If[!MissingQ[json["params"]["context"]["activeSignatureHelp"]], 
			activeSignature = json["params"]["context"]["activeSignatureHelp"]["activeSignature"];
			activeparam = json["params"]["context"]["activeSignatureHelp"]["activeParameter"];
		];

		value = Check[If[symbol==="","",extractUsage[symbol]], ""];
		signatures = StringCases[value, Shortest[symbol ~~ x1__ /; balancedQ[x1]]];

		(*
		If[Length@signatures == 0,
			signatures = getFunctionSignature[src, function]
		];
		*)

		activeSignature = If[Length@signatures >= activeparam, 
			activeparam-1,
			0
		];

		opts = Information[symbol, "Options"] /. {
			Rule[x_, y_] :> ToString[x, InputForm] <> "->" <> ToString[y, InputForm], 
			RuleDelayed[x_, y_] :> ToString[x, InputForm] <> ":>" <> ToString[y, InputForm]
			};
	
		result = <|
			"signatures" -> Table[
				ast = CodeParse[v, SourceConvention -> "SourceCharacterIndex"];
				<|
					"label" -> ToString@v, 
					"documentation" -> Check[value <> "\n" <> StringRiffle[opts /. {None -> {}, Null->""}, "\n"], ""] ,
					"parameters" -> (<|"label" -> #|> & /@ (StringTake[v, #] & /@ Cases[ast[[2, 1, 2]], KeyValuePattern[Source -> x_] :> x, {2}]))
				|>, {v, signatures}],
			"activeSignature" -> activeSignature,
			"activeParameter" -> activeparam
		|>;
		response = <|"id"->json["id"], "result"->(result /. Null -> symbol)|>;
		sendResponse[response];,

		response = <|
			"id"->json["id"],
			"result"-><|
				"signatures"->{},
				"activeSignature"->0,
				"activeParameter"->0|>
		|>;
		sendResponse[response]; 
	];
];

handle["textDocument/hover", json_]:=handle["textDocument/hover", json]=Module[{position, v, uri, src, symbol, value, result, response, f},
	Check[
		position = json["params", "position"];
		position["character"] = position["character"]+1;
		uri = json["params"]["textDocument"]["uri"];
		src = documents[json["params","textDocument","uri"]];
		symbol = ToString@getWordAtPosition[src, position];
		value = Which[
			symbol === "",
				"",
			MemberQ[Keys@symbolDefinitions, symbol],
				Check[symbolDefinitions[symbol]["detail"], ""],
			True,
				Check[
					extractUsage[symbol],
					symbol					
				]
		];

		result = <|"contents"-><|
				"kind" -> "markdown",
				"value" -> Check["```wolfram\n" <> (value) <> "\n```", value]
			|>
		|>;

		response = <|"id"->json["id"], "result"->(result /. Null -> "")|>;
		sendResponse[response];,

		response = <|"id"->json["id"], "result"->"-"|>;
		sendResponse[response];
		
		sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Hover failed for: " <> ToString[symbol, InputForm, TotalWidth -> 250] |> |>];
	];
];

boxRules={StyleBox[f_,"TI"]:>{"",f,""},StyleBox[f_,___]:>{f},RowBox[l_]:>{l},SubscriptBox[a_,b_]:>{a,"_",b,""},SuperscriptBox[a_,b_]:>{a,"<sup>",b,"</sup>"},RadicalBox[x_,n_]:>{x,"<sup>1/",n,"</sup>"},FractionBox[a_,b_]:>{"(",a,")/(",b,")"},SqrtBox[a_]:>{"&radic;(",a,")"},CheckboxBox[a_,___]:>{"<u>",a,"</u>"},OverscriptBox[a_,b_]:>{"Overscript[",a,b,"]"},OpenerBox[a__]:>{"Opener[",a,"]"},RadioButtonBox[a__]:>{"RadioButton[",a,"]"},UnderscriptBox[a_,b_]:>{"Underscript[",a,b,"]"},UnderoverscriptBox[a_,b_,c_]:>{"Underoverscript[",a,b,c,"]"},SubsuperscriptBox[a_,b_,c_]:>{a,"_<small>",b,"</small><sup><small>",c,"</small></sup>"},
ErrorBox[f_]:>{f}};

convertBoxExpressionToHTML[boxexpr_]:=StringJoin[ToString/@Flatten[ReleaseHold[MakeExpression[boxexpr,StandardForm]//.boxRules]]];

extractUsage[str_]:=With[{usg=Function[expr, Quiet@Check[StringReplace[expr::usage, "::usage" -> ""],ToString@expr],HoldAll]@@MakeExpression[ToString@str,StandardForm]},StringReplace[If[StringQ@usg, usg, ToString@usg],{Shortest["\!\(\*"~~content__~~"\)"]:>convertBoxExpressionToHTML[content]}]];

extractUsage[a_Null]:="";

printLanguageData[symbol_]:=printLanguageData[symbol]=Module[{},
	StringTrim@StringJoin@StringSplit[WolframLanguageData[symbol, "PlaintextUsage"],( n:ToString@symbol):>"\n"<>n]
];

handle["clearTasks", json_]:=Module[{},
	TaskRemove[Tasks[]];
	response = <|"id"->json["id"],"result"-><|"output"->"Tasks Cleared"|>|>;
	sendResponse[response];
	startEvaluators[];
];

handle["runCell", json_]:=Module[{},
	uri = json["params", "textDocument"];
	src = json["params", "source"];

	newPosition = <|"line"->0, "character"->0|>;
	evaluate[<| "code" -> src, "range" -> <|
		"start" -> <|"line" -> 1, "character" -> 1 |>,
		"end" -> <|"line" -> 1, "character" -> 1 |>
	|> |>, json, newPosition];
];

handle["textDocument/didOpen", json_]:=Module[{},
	lastChange = Now;
	documents[json["params","textDocument","uri"]] = json["params","textDocument","text"];
	(* validate[]; *)
];

handle["textDocument/didChange", json_]:=Module[{},
	(* oldLength = StringLength[documents[json["params","textDocument","uri"]]];
	newLength = json["params","contentChanges"][[1]]["text"]; *)
	lastChange = Now;
	documents[json["params","textDocument","uri"]] = json["params","contentChanges"][[1]]["text"];
];

handle["textDocument/semanticTokens", json_]:=Module[{},
	Print["semanticTokens"];
];

types[form_] := Switch[
  form,
  "Defined", "variable",
  "SetDelayed", "parameter",
  "Module", "parameter",
  "SlotFunction", "parameter",
  "RuleDelayed", "parameter",
  _, "variable"
];

tokenTypes[type_]:=Switch[
	type,
	"variable",0,
	"parameter",1,
	"keyword",2,
	"number",3,
	"string",4,
	"function",5,
	_,0
];

modifiers[mod_]:=FromDigits[Table[
	If[MemberQ[mod, d],1,0],
		{
			d,
			{"definition",
			"declaration"}
		}
	],
2];

mods[form_] := List@Switch[
   form,
   "definition", "definition",
   "unused", "declaration",
   "shadowed", "declaration",
   _, "declaration"
   ];

mods[] := {};

tokenize[scopingDataObject[range_,{scope___}, {type___}, name_]]:=<|
	"line"->range[[1,1]]-1,
	"startCharacter"->range[[1,2]]-1,
	"length"->range[[2,2]]-range[[1,2]],
	"tokenType"->types[scope],
	"tokenModifiers"->mods[type],
	"name"->name
|>;

handle["textDocument/semanticTokens/full", json_]:=Module[{src, ast, tokens, digits, result},
	src = documents[json["params","textDocument","uri"]];
	ast = CodeParse[src];

	tokens = tokenize /@ ScopingData[ast] // SortBy[{"line", "startCharacter"}];

	If[tokens === {}, Return[]];

	digits = Flatten[Values/@Join[
		{<|
		"deltaLine"->First[tokens]["line"],
		"deltaStartChar"->First[tokens]["startCharacter"],
		"length"->First[tokens]["length"],
		"tokenType"->tokenTypes[First[tokens]["tokenType"]],
		"tokenModifiers"->modifiers[First[tokens]["tokenModifiers"]]
		|>},
		BlockMap[
		Function[{ins},
		{t1,t2} = ins;
		<|
		"deltaLine"->t2["line"]-t1["line"],
		"deltaStartChar"->If[t2["line"]===t1["line"],
		t2["startCharacter"]-t1["startCharacter"],
		t2["startCharacter"]
		],
		"length"->t2["length"],
		"tokenType"->tokenTypes[t2["tokenType"]],
		"tokenModifiers"->modifiers[t2["tokenModifiers"]]
		|>
		],tokens,2,1]]];

	sendResponse[<|"id" -> json["id"], "result" -> <|"data" -> digits[[1;;]] |>|>];

];

handle["textDocument/didSave", json_]:=Module[{},
	validate[json];
];

handle["openNotebook", json_]:=Module[{jupyterfile, response},
	jupyterfile = First[Notebook2Jupyter[json["params"]["path"]["path"]]];
	response = <|"id"->json["id"],"result"-><|"output"->jupyterfile|>|>;
	sendResponse[response];
];

handle["windowFocused", json_]:=Module[{},
	If[First[json["params"], True],
		handlerWait = 0.01,
		handlerWait = 1.0
	]
];



handle["nb2html", json_]:=Module[{id, inputs, html},
	id = json["id"];
	inputs = Import[json["params", "document", "uri", "fsPath"], "Notebook"];
	html = nb2html[inputs];
	sendResponse[<|"id"->id, "result"->html|>];
];

handle["html2nb", json_]:=Module[{id, inputs, html, nb0},
	id = json["id"];
	html = json["params", "html"];
	nb0 = html2nb[html];

	NotebookSave[nb0, json["params", "document", "uri", "fsPath"]];
	NotebookClose[nb0];
	sendResponse[<|"id"->id, "result"->True|>];
];

handle["serializeNotebook", json_]:=Module[{id, inputs, json2, nb0},
	inputs = json["params", "contents"];
	nb0 = json2nb[inputs, True];

	sendResponse[<|"id"->json["id"], "result"->ExportString[nb0, "Text"]|>];
];

handle["deserializeNotebook", json_]:=Module[{id, inputs, json2, nb0},
	Check[
		inputs = Check[ImportString[json["params", "contents"], "Notebook"], ""];
		json2 = nb2json[inputs];
		sendResponse[<|"id"->json["id"], "result"->json2|>];,

		sendResponse[<|"id"->json["id"], "result"->""|>];
		sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> "Failed to open file." |> |>]
	]
];

handle["serializeScript", json_]:=Module[{inputs, nb0},
	inputs = json["params", "contents"];
	nb0 = StringJoin@json2wl[inputs];

	sendResponse[<|"id"->json["id"], "result"->nb0|>];
];

handle["deserializeScript", json_]:=Module[{inputs, json2},
	Check[
		inputs = json["params", "contents"];
		json2 = wl2json[inputs];
		sendResponse[<|"id"->json["id"], "result"->json2|>];,

		sendResponse[<|"id"->json["id"], "result"->""|>];
		sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> "Failed to open file." |> |>]
	]
];

handle["$/cancelRequest", json_]:=Module[{response},
	DeleteCases[hoverQueue, x_/;x["id"] == json["params", "id"]];  
	(* response = <|"id" -> json["params", "id"], "result" -> "cancelled"|>; 
	sendResponse[response]; *)
];

handle["abort", json_]:=Module[{},
	(* TaskRemove /@ Tasks[];
	AbortKernels[];
	startEvaluators[];
	startHover[]; *)

	Print["Aborting"];
	AbortKernels[];
];

validate[json_]:=Module[{src, lints, severities, msgs, response},
	Check[
		workspaceLintDecorations = <||>;
		uri = json["params", "textDocument"]["uri"];
		src = documents[json["params","textDocument","uri"]];
		lints = CodeInspect[src];
		severities = <| "Error"->1, "Warning"->2, "Information"->3, "Hint"->4 |>;
		msgs = Map[<|  
			"message"->#[[2]], 
			"range"-><|
				"start" -> <| "line" -> #[[4, 1, 1, 1]]-1, "character" -> #[[4, 1, 1, 2]]-1 |>,
				"end" -> <| "line" -> #[[4, 1, 2, 1]]-1, "character" -> #[[4, 1, 2, 2]]-1 |>
			|>,
			"severity" -> If[MemberQ[Keys@severities,#[[3]]],severities[#[[3]]], 2] |> &, lints];
		
		response = <| "method" -> "textDocument/publishDiagnostics", "params" -> <|"uri" -> uri, "diagnostics" -> msgs |>|>;
		sendResponse[response];
		
		(* Decorations *)
		decorations = Map[lintToDecoration, lints];
		workspaceLintDecorations[uri] = decorations;

		Export[workspaceLintDecorationsFile, workspaceLintDecorations, "JSON"];
		response = <| "method" -> "updateLintDecorations", "params"-> ToString@workspaceLintDecorationsFile|>;
		sendResponse[response];
		,
		sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "File diagnostics failed." |> |>]
	]
];

lintToDecoration[lint_]:=Module[{},
	<|
		"range"-><|
			"start" -> <| "line" -> lint[[4, 1, 1, 1]]-1, "character" -> lint[[4, 1, 2, 2]]+1096 |>,
			"end" -> <| "line" -> lint[[4, 1, 2, 1]]-1, "character" -> lint[[4, 1, 2, 2]]+1196 |>
		|>,
		"renderOptions" -> <|
			"after" -> <|
				"contentText" -> lint[[2]],
				"backgroundColor" -> "editor.background",
				"foregroundColor" -> "editor.foreground",
				"color" -> Switch[lint[[3]], "Error", "red", "Warning", "orange", "Information","white", "Hint","blue", _, "orange"],
				"opacity" -> "0.4",
				"fontStyle" -> "italic",
				"margin" -> "0 0 0 10px",
				"rangeBehavior" -> 4
			|>,
			"rangeBehavior"->4
		|>
	|>
];


validate[]:=Module[{lints, severities, msgs, response},
		Check[
			KeyValueMap[
				Function[{uri, src},
					Print["validating"];
					lints = CodeInspect[src];
					severities = <| "Fatal"->0, "Warning"->1, "Information"->2, "Hint"->3 |>;
					msgs = Map[<|
						"message"->#[[2]],
						"range"-><|
							"start" -> <| "line" -> #[[4, 1, 1, 1]]-1, "character" -> #[[4, 1, 1, 2]]-1 |>,
							"end" -> <| "line" -> #[[4, 1, 2, 1]]-1, "character" -> #[[4, 1, 2, 2]]-1 |>
						|>,
						"severity" -> If[MemberQ[Keys@severities,#[[3]]],severities[#[[3]]],0] |> &, lints];
					
					response = <| "method" -> "textDocument/publishDiagnostics", "params" -> <|"uri" -> uri, "diagnostics" -> msgs |>|>;
					
					sendResponse[response];
				],
				documents
			];,

		response = <| "method" -> "textDocument/publishDiagnostics", "params" -> <|"uri" -> uri, "diagnostics" -> {} |>|>;
		sendResponse[response];
		sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "File diagnostics failed." |> |>];
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

posFromVSCode[pos_]:=Module[{},
	<|"line" -> pos["line"], "character" -> pos["character"] + 1|>
]

rangeFromVSCode[range_]:=Module[{}, 
	<|
		"start"-><|"line"->range["start", "line"]+1,"character"->range["start", "character"]+ 1|>,
		"end"-><|"line"->range["end", "line"]+ 1,"character"->range["end", "character"]+ 1|>
	|>
];

toRange[{start_, end_}]:=Module[{},
	<|
		"start"-><|"line"->start[[1]]-1,"character"->start[[2]]|>,
		"end"-><|"line"->end[[1]]-1,"character"->end[[2]]|>
	|>
];

getWordsPosition[word_, src_]:=Module[{sLines, lines, character, range},
	sLines = StringSplit[src, EndOfLine, All];
	lines = Flatten@Position[sLines,x_/;StringMatchQ[x, ___~~word~~___], Heads->False];
	Table[
		character = StringPosition[sLines[[l]],word];
		range = <|
			"start" -> <|"line" -> l-1, "character"->character[[1,1]]-2|>,
			"end" -> <|"line" -> l-1, "character"->character[[1,2]]-1|>
		|>;
		{word, range}, {l, lines}]
];

getCodeAtPosition[src_, position_]:= Module[{tree, pos, call, result1},
		(* SetDirectory[$TemporaryDirectory];
		Export["srcFile.wl", src, "Text"];
		tree=CodeParse["srcFile.wl"];
		ResetDirectory[]; *)
		tree = CodeParse[src]; 
		pos = <|"line" -> position["line"]+1, "character" -> position["character"]|>;
		
		call = First[Cases[tree, 
			((x_LeafNode/;inCodeRangeQ[x[[3]][Source], pos]) | (x_CallNode/;inCodeRangeQ[x[[3]][Source], pos])),
			{2}], {}];
		
		result1 = If[call === {},
			<|"code"->"", "range"->{{pos["line"],0}, {pos["line"],0}}|>,
			<|"code"->getStringAtRange[src, call[[3]][Source]+{{0, 0}, {0, 0}} ], "range"->call[[3]][Source]|>
			
		];
		result1
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

getFunctionSignature[src_, function_]:=Module[{ast, functions},
	ast = CodeParse[src];
	functions = Cases[ast,CallNode[
					LeafNode[Symbol,"SetDelayed",_],
					{
						CallNode[
							LeafNode[Symbol,name_,_],
							params:{___},
							_],
						___
					},
					_]:>{name, Cases[params, LeafNode[Symbol, l_/;!MemberQ[{"Pattern", "Blank", "Optional"},l],_]:>l,Infinity]},Infinity];
	Map[
		StringJoin[#[[1]], StringRiffle[#[[2]], {"[", "_, ", "]"}]]&,
		Select[functions, #[[1]] == function &]]
];


getFunctionAtPositionWithParams[src_, position_]:= Module[{functions, functionPositions, functionPositionsLineChar, thisFunctionPosition},

	functions = StringCases[src,Shortest[(x1:Shortest[WordCharacter..~~"["~~__~~"]"]/;balancedQ[x1]) ~~ ":="]];
	functionPositions = Flatten[StringPosition[src, #] & /@ functions, 1];
	functionPositionsLineChar =Check[positionToLineChar[src, #], Print@#] & /@ functionPositions;
	thisFunctionPosition = First[Select[functionPositionsLineChar, #["startLine"] <= position["line"] && position["line"] <= #["endLine"] &], <|"startLine" -> 1, "endLine" -> 1, "startCharacter" -> 1, "endCharacter" -> 1|>];	
	getStringAtLineChar[src, thisFunctionPosition]
];

getActiveParam[src_, functionPosition_, position_]:= Module[{function, char},
	function = getStringAtLineChar[src, functionPosition];
	char = getStringAtLineChar[src, position];
];

getFunctionAtPosition[src_,position_]:=Module[{symbol, functions},
	functions = Cases[CodeParse[src],CallNode[LeafNode[Symbol,f:Except["List"|"Association"],_],___,<|Source->loc_|>]:>{f, loc}, Infinity];
	symbol=SelectFirst[functions,IntervalMemberQ[Interval[#[[2]][[All, 1]]],position["line"]+1] && IntervalMemberQ[Interval[#[[2]][[All, 2]]], position["character"]+1]&,{""}][[1]];
	symbol
];

getStringAtLineChar[src_String, position_]:=Module[{lines},
	lines = StringSplit[src, EndOfLine, All][[position["startLine"]+1;;position["endLine"]+1]];
	Which[
		position["startLine"] == position["endLine"],
		StringTake[lines[[1]], {position["startCharacter"], UpTo[position["endCharacter"]+1]}],
		position["startLine"]+1 == position["endLine"],
		StringJoin[
			StringTake[lines[[1]], {position["startCharacter"], -1}],
			StringTake[lines[[2]], {1, UpTo[position["endCharacter"]+1]}]
		],
		True,
		StringJoin[
			StringTake[lines[[1]], {position["startCharacter"], -1}],
			StringJoin@lines[[2;;-2]],
			StringTake[lines[[-1]], {1, UpTo[position["endCharacter"]+1]}]
		]
	]
];

getWordAtPosition[_,_]:="";
getWordAtPosition[src_String, position_]:=Module[{srcLines, line, word},

	srcLines =StringSplit[src, EndOfLine, All];
	line = Check[srcLines[[position["line"]+1]],Print["Error: line not found"];Return[""];];
	If[line === "", Return[""]];
	(*
	word = First[Select[StringSplit[line, RegularExpression["\\W+"]], 
		IntervalMemberQ[
		Interval[
				First@StringPosition[line, WordBoundary~~#~~ WordBoundary, Overlaps->False]], position["character"]] &, 1], ""]; 
	*)
	word=StringTake[line,
		Replace[
			First@Nearest[
				StringPosition[line, Replace[TextWords[line], {} -> {""}]],
				{position["character"],position["character"]}],
			Rule[{},{0,0}]]];
	word
];

getStringAtRange[string_String, range_]:=Module[{sLines, sRanges},
	sLines = StringSplit[string, EndOfLine, All];
	sRanges=getSourceRanges[range];

	StringJoin@Table[Check[StringTake[sLines[[l[[1]]]], l[[2]]],""],{l, sRanges}]
];

getSourceRanges[{start_, end_}]:=Table[
	lineRange[l,start,end],
	{l,start[[1]],end[[1]]}
];

lineRange[line_,start_,end_]:= {line, Which[
	line == start[[1]] && line==end[[1]], {start[[2]], UpTo[end[[2]]+1]},
	line == start[[1]] && line!=end[[1]], {start[[2]],-1},
	line != start[[1]] && line!=end[[1]], All,
	line != start[[1]] && line==end[[1]], {1, UpTo[end[[2]]+1]}
]};

constructRPCBytes[_Missing]:= Module[{}, ""];
constructRPCBytes[msg_Association]:=Module[{headerBytes,jsonBytes},
	jsonBytes=Check[ExportByteArray[msg,"RawJSON"], Print["Export Byte Array failed"]; ExportByteArray[<||>,"RawJSON"]];
	headerBytes=StringToByteArray["Content-Length: " <> ToString[Length[jsonBytes], CharacterEncoding->"ASCII"]<>"\r\n\r\n"];
	{headerBytes,jsonBytes}

];

positionToLineChar[text_,range_]:=Module[{beforeText, selectedText, afterText},
	beforeText = StringTake[text,{1, range[[1]]}];
	selectedText = StringTake[text,{range[[1]], range[[2]]}];
	afterText = StringTake[text,{range[[2]], -1}];
	<|
		"startLine"->StringCount[beforeText,EndOfLine]-1,
		"startCharacter"->StringLength[Last@StringSplit[beforeText,EndOfLine]]-1,
		"endLine"->StringCount[beforeText,EndOfLine] + StringCount[selectedText,EndOfLine]-2,
		"endCharacter" -> StringLength[Last@StringSplit[beforeText<>selectedText,EndOfLine]]-1
	|>
];

positionToRange[text_,range_]:=Module[{beforeText, selectedText, afterText},
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
			"character" -> StringLength[Last@StringSplit[beforeText<>selectedText,EndOfLine]]-1 
		|>
	|>
];

getSymbols[src_, uri_:""]:=getSymbols[src, uri]=Module[{ast, f, symbols},
	ast = CodeParse[src];

	f[node_]:=Module[{astStr,name,loc,kind,rhs},
		astStr=ToFullFormString[node[[2,1]]];
		If[Head@astStr===String, astStr, astStr = ""];
		name=First[StringCases[astStr,"$"... ~~ WordCharacter...],""];
		loc=FirstCase[node, <|Source -> x_, ___|> :> x, {{0,0},{0,0}}, 3];
		rhs=FirstCase[{node},CallNode[LeafNode[Symbol, ("Set"|"SetDelayed"),___],{_,x_,___},___]:>x,Infinity];
		kind=If[Head@rhs == CallNode,
			rhs[[1,2]],
			rhs[[2]]
		];
		definition=getStringAtRange[src,loc+{{0,0},{0,0}}];
		<|"name"->name,"definition"->StringTrim[definition],"loc"->loc,"kind"->kind, "uri" -> uri|>];

	symbols = f /@ Cases[ast, CallNode[LeafNode[Symbol,("Set"|"SetDelayed"),_],___],Infinity];
	symbols
];

getCode[src_, range_]:=Module[{},
	Which[
		range["start"] === range["end"], (* run line or group of lines *)
			getCodeAtPosition[src, range["start"]],
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
	]
];

(*
handle["textDocument/documentSymbol", json_]:=Module[{uri, src, tree, symbols, functions, result, response, kind},
	TimeConstrained[(
		Print["documentSymbol"];
		kind[s_]:= Switch[
					ToExpression@s[[1]], 
					Symbol, 13, 
					Integer, 16, 
					Real, 16,
					Complex, 16,
					Rational, 16,
					List, 18,
					Association, 23,
					Function, 12, 
					String, 15, 
					_, 19];

		uri = json["params"]["textDocument"]["uri"];
		src = documents[json["params", "textDocument", "uri"]];
		functions = StringCases[src,Shortest[expr:(name:WordCharacter...~~"["~~Except["]"]...~~"]"~~Whitespace...~~(":="|"="))~~Except["="]]:>{name,expr}];
		symbols = StringCases[src, Shortest[expr:(name:WordCharacter..~~Whitespace...~~(":="|"="))~~Except["="]]:>{name, expr}];

		symbolsAndRanges=MapAt[StringReplace[{":"->"","="->""}],
			DeleteDuplicates[Flatten[getWordsPosition[#[[2]],src]&/@Join[functions,symbols],1]],{All,1}];

		result = Table[
			TimeConstrained[
			<|
				"name" -> s[[1]],
				"kind" -> kind[s[[1]]],
				"detail"-> Quiet[ToString@Definition[s[[1]]]],
				"location"-><|
					"uri"->uri,
					"range"->s[[2]]
					|>
			|>, 0.05, 
			<|
				"name" -> s[[1]],
				"kind" -> 19,
				"detail"-> "",
				"location"-><|
					"uri"->uri,
					"range"->s[[2]]
					|>
			|>, 2], {s, symbolsAndRanges}];
			
		response = <|"id"->json["id"],"result"->(result /. Null -> "NA")|>;
		sendResponse[response];

		AppendTo[labels, DeleteCases[(#[[2]] & /@ symbols), Null]];
		AppendTo[labels, DeleteCases[(#[[2]] & /@ functions), Null]];
		labels = DeleteDuplicates[labels];
		),
		Quantity[0.1, "Seconds"],
		response = <|"id"->json["id"],"result"->{}|>;
		sendResponse[response];
	]
];

*)

EndPackage[];