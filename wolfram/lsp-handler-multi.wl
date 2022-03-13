(* ::Package:: *)

BeginPackage["wolframLSP`"]


(* ::Package:: *)
(**)


Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];
Check[Needs["CodeInspector`"], PacletInstall["CodeInspector"]; Needs["CodeInspector`"]]; 

COMPLETIONS = Import[DirectoryName[path] <> "completions.json", "RawJSON"]; 
DETAILS =  Association[StringReplace[#["detail"]," details"->""]-># &/@Import[DirectoryName[path] <> "details.json","RawJSON"]];
 
(* scriptPath = DirectoryName@ExpandFileName[First[$ScriptCommandLine]]; *)
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
	"completionProvider"-> <|"resolveProvider"->False, "triggerCharacters" -> {".", "\\"}, "allCommitCharacters" -> {"]"}|> ,
	"documentSymbolProvider"->True,
	"codeActionProvider"->False,
	"codeLensProvider"-> <|"resolveProvider"->True|>,
	"renameProvider" -> <| "prepareProvider" -> True|>,
	"workspaceSymbolProvider" -> True,
	"definitionProvider" -> True,
	"colorProvider" -> True,
	"workspace" -><|
		"workspaceFolders" -> <|"supported"->True, "changeNotifications" -> True|>
	|>|>;

handle["initialize", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{response, builtins},
	Print["Initializing WLSP"];
    CONTINUE = True;

	labels = COMPLETIONS[[All, "label"]];
	symbolDefinitions = <||>;
	nearestLabel = Nearest[labels];
    
	documents = <||>;
	response = <|"id"->json["id"],"result"-><|"capabilities"->ServerCapabilities|>|>;
	
	sendResponse[response, client];
	
	builtinSymbols = {};
];

handle["workspace/symbol", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{response},
	response = <|"id" -> json["id"], "result"->{}|>;
	sendResponse[response, client];
];

workspaceFolders = {};

handle["workspace/didChangeWorkspaceFolders", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{added, removed},

	added = json["params"]["event"]["added"];
	removed = json["params"]["event"]["removed"];

	workspaceFolders = DeleteDuplicates@DeleteCases[Join[workspaceFolders, added], _?(MemberQ[removed, #] &)];
];

handle["builtInList", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{},
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

	sendResponse[response, client];
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

handle["symbolList", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{response, symbols, builtins, result1, result2, files, file},
	files = DeleteDuplicates@Flatten@Join[FileNames[{"*.wl", "*.wls", "*.nb"}, workspaceFolders], StringReplace[FileNameJoin[Rest@URLParse[URLDecode[#], "Path"]], ("#"~~___ ->"")] & /@ Keys@documents];
	sources = Check[Import[First@StringSplit[#, "#"], "Text"], ""] & /@ files;
	
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

	sendResponse[response, client];
	Close[file];
];

handle["textDocument/references", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{src, position, str, definitions, result},
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

	sendResponse[<|"id" -> json["id"], "result"-> result|>, client];
];

handle["textDocument/documentColor", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{src, rgbPattern, colors, result},
	src = documents[json["params"]["textDocument"]["uri"]];
	rgbPattern=c:(Shortest["RGBColor["~~r__~~","~~g__~~","~~b__~~("]"|("," ~~a__~~"]"))] | Shortest["RGBColor[" ~~ ___ ~~ "\"" ~~ WordCharacter.. ~~"\"" ~~ ___~~"]"]);
	colors=MapIndexed[{#2[[1]],StringPosition[#1,rgbPattern],StringCases[#1,rgbPattern:>ToExpression@c]}&,StringSplit[src,"\n",All]]//Select[#,#[[2]]!={}&]&;
	result = Map[
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
		|>&,
	colors
	];
	sendResponse[<|"id"->json["id"], "result" -> result |>, client];
];

handle["textDocument/colorPresentation", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{src, color, range, result},
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

	sendResponse[<|"id"->json["id"], "result" -> result |>, client];
];

handle["textDocument/definition", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{src, position, str, definitions, result},
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
	
	sendResponse[<|"id" -> json["id"], "result"-> result|>, client];
];

handle["wolframVersion", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{response},
	response = <|"id" -> json["id"], "result"-> <| "output" -> "$(check) Wolfram " <> ToString[$VersionNumber] |> |>;
	sendResponse[response, client];
];

handle["shutdown", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=(
	Print["LSP Goodbye"];
	state = "Stop";
	sendResponse[<|"id" -> json["id"], "result" -> Null|>, client];
	Close[SERVER];
	Quit[];
	Exit[];
);


handle["moveCursor", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{range, uri, src, end, code, newPosition},
	range = json["params", "range"];
	uri = json["params", "textDocument"]["uri", "external"];
	src = documents[json["params","textDocument","uri", "external"]];
	end = range["end"];
	code = getCode[src, range];
	newPosition = <|"line"->code["range"][[2,1]], "character"->0|>;
	sendResponse[<|"id" -> json["id"], "result" -> <|"position" -> newPosition|>|>, client]; 
];

handle["textDocument/foldingRange", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{document, src, lines, sectionPattern, ranges, functionSections, listSections, assocSections},
	If[
		StringContainsQ[json["params"]["textDocument"]["uri"], "vscode-notebook-cell"],
		sendResponse[<|"id"->json["id"], "result"->{}|>, client];,

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



		(* sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[response, InputForm, TotalWidth->100] |> |>, client]; *)

		(* Print[ToString[src, InputForm, TotalWidth->100]];*)
		(*sendResponse[response, client];*)
		sendResponse[<| "id" -> json["id"], "result"->Join[ranges, functionSections, listSections, assocSections]|>, client];
	]
];


handle["codeLens/resolve", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Print["resolve"]; 

getSections[src_, sectionPattern_]:=Module[{},
	BlockMap[StringTrim@Check[StringTake[src, {#[[1,1]], #[[2,2]]}], ""] &, Join[StringPosition[src, sectionPattern, Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]], 2,1]
];

handle["textDocument/codeLens", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=handle["textDocument/codeLens", json]=Module[{src, breaks, lens, lines, sections, sectionPattern},
	If[
		StringContainsQ[json["params"]["textDocument"]["uri"], "vscode-notebook-cell"],
		sendResponse[<|"id"->json["id"], "result"->{}|>, client];,

		Check[
			(* sectionPattern = Shortest["(*" ~~ WhitespaceCharacter.. ~~ "::" ~~ ___ ~~ "::" ~~ WhitespaceCharacter.. ~~ "*)"];
			lines = StringCount[Check[StringTake[src, {1, #[[2]]}], ""], "\n"] & /@ Join[StringPosition[src, sectionPattern, Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]];
			sections = BlockMap[StringTrim@Check[StringTake[src, {#[[1,1]], #[[2,2]]}], ""] &, Join[StringPosition[src, sectionPattern, Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]], 2,1]; 
			sections = StringPosition[src, "\n\n\n", Overlaps -> False];*)
			src = ImportString[documents[json["params","textDocument","uri"]],"Lines"];
			breaks=BlockMap[Identity,Join[{1},SequencePosition[src,{"","","", Except[""]}][[All,2]], {Length@src}+1],2,1];
			sections =Map[StringRiffle[src[[#[[1]];;#[[2]]-1]],"\n"]&,breaks];
			If[sections != {},
				lens = Table[
					<|
						"range" -> 
							<|
								"start" -><|"line"->l[[1, 1]]-1, "character"->0|>,
								"end" -><|"line"->l[[1, 1]]-1, "character"->0|>
							|>,
						"command" -> <|
							"title" -> "Run " <> ToString[StringCount[StringTrim@l[[2]], "\n"] +1] <> " line(s)",
							"command" -> "wolfram.runTextCell",
							"arguments" -> {<|
								"start" -><|"line"->l[[1, 1]]-1, "character"->0|>,
								"end" -><|"line"->l[[1, 1]]+StringCount[StringTrim@l[[2]], "\n"]-1, "character"->StringLength@Last[StringSplit[l[[2]], "\n"] /. {} -> {""}]+1|>
							|>}
							(*{StringReplace[l[[2]], sectionPattern ->""] , l[[1]] + StringCount[l[[2]], "\n"]-1, StringLength@l[[2]]} *)
						|>
					|>,
					{l, Transpose[{breaks, sections}]}
				];,
				lens = {}
			];
			sendResponse[<|"id"->json["id"], "result"->lens|>, client];,
			sendResponse[<|"id"->json["id"], "result"->{}|>, client]
		];
	];
];

handle["textDocument/prepareRename", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{pos, src, str, renames, result, response},
	pos = posFromVSCode@json["params", "position"];
	src = documents[json["params","textDocument","uri"]];
	str = getWordAtPosition[src, pos];
	renames = getWordsPosition[str, src];
	result = <|"range"-> renames[[1,2]]|>;
	response = <|"id"->json["id"],"result"->result |>;
	sendResponse[response, client]; 
]; 

handle["textDocument/rename", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{pos, src, newName, str, renames, edits, result, response, response3},
	pos = json["params", "position"];
	src = documents[json["params","textDocument","uri"]];
	newName = json["params", "newName"];

	str = getWordAtPosition[src, pos];
	renames = getWordsPosition[str, src];

	(* Only change in the current document for now *)
	edits = Table[<|"range" -> r[[2]], "newText" -> newName|>, {r, renames}];
	result = <|"changes" -> <|json["params","textDocument","uri"] -> edits |>|>;
	response = <|"id"->json["id"],"result"->result |>;
	sendResponse[response, client];

	response3 = <| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[result, InputForm, TotalWidth->100] |> |>;
	sendResponse[response3, client];
];

handle["textDocument/formatting", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{src, prn, out, lines, result, response}, 
	src = documents[json["params","textDocument","uri"]];
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
	sendResponse[response, client];

];

handle["textDocument/didOpen",json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{file},
	file = json["params"]["textDocument"]["uri"];
	(* Import[URLDecode@StringReplace[file, "file://"->""],"Text"] *)
];

handle["textDocument/codeAction", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{},
	src = documents[json["params","textDocument","uri"]];
	range = json["params","range"];

];

handle["completionItem/resolve", json_, client_:(First[SERVER["ConnectedClients"],{}])] := Module[{item, documentation, result, response}, 
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
	sendResponse[response, client];
];

handle["textDocument/completion", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{src, pos, symbol, names, items, result, response},
		src = documents[json["params","textDocument","uri"]];
		pos = json["params","position"];
		symbol = getWordAtPosition[src, pos] /. Null -> "";
		If[StringLength@symbol >= 2, 
			names = Select[labels, SmithWatermanSimilarity[#, symbol, IgnoreCase->True] >= StringLength@symbol &, 50];
			items = Table[
					<|
						"label" -> n,
						"kind" -> If[ValueQ@n, 12, 13],
						"commitCharacters" -> {"[", "\t"},
						"detail" -> extractUsage[n] (* DETAILS[n]["documentation"] *)
					|>, 
					{n,names}];
			
			result = <|
				"items" -> items,
				"isIncomplete" -> True
				|>;,

			result = <| "isIncomplete" -> True, "items" -> {}|>;
		];
		response = <|"id"->json["id"],"result"->(result /. Null -> "NA")|>;
		sendResponse[response, client];
];

balancedQ[str_String] := StringCount[str, "["] === StringCount[str, "]"];
handle["textDocument/documentSymbol", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{uri, text, funcs, defs, result, response, kind, ast},
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
					sendResponse[response, client];  

					response = <|"method"->"updatePositions", "params" -> <|"result" -> result|>|>;
					sendResponse[response, client]; 

			),
				response = <|"id"->json["id"],"result"->{}|>;
				sendResponse[response, client];  
				sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 1, "message" -> "Document symbol request failed due to parsing error." |> |>, client];
	]

];

signatureQueue = {};
handle["textDocument/signatureHelp", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{position, uri, src, symbol, activeParameter, activeSignature, value, opts, result, response, functionWithParams, signatures, function},
	Check[		
		position = json["params"]["position"];
		uri = json["params"]["textDocument"]["uri"];
		src = documents[json["params","textDocument","uri"]];
		function = getFunctionAtPosition[src, position];
		symbol = If[Or[function === "", MissingQ[function]], "", function];

		If[symbol == "",
			response = <|"id"->json["id"], "result"->""|>;
			sendResponse[response, client];
			Return[]
		];
		
		functionWithParams = Check[getFunctionAtPositionWithParams[src, position], ""];
		activeParameter = 0;
		activeSignature = 0;
		If[!MissingQ[json["params"]["context"]["activeSignatureHelp"]], 
			activeSignature = json["params"]["context"]["activeSignatureHelp"]["activeSignature"];
			activeParameter = json["params"]["context"]["activeSignatureHelp"]["activeParameter"];
		];
		activeParameter = Check[Length[CodeParse[functionWithParams][[2, 1, 2]]]-1, 0];

		value = Check[extractUsage[symbol], ""];
		signatures = StringCases[value, Shortest[symbol ~~ x1__ /; balancedQ[x1]]];
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
			"activeParameter" -> activeParameter
		|>;
		response = <|"id"->json["id"], "result"->(result /. Null -> symbol)|>;
		sendResponse[response, client];,

		
		response = <|
			"id"->json["id"],
			"result"-><|
				"signatures"->{},
				"activeSignature"->0,
				"activeParameter"->0|>
		|>;
		sendResponse[response, client]; 
	];
];

handle["textDocument/hover", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{position, v, uri, src, symbol, value, result, response},
	Check[
		position = json["params", "position"];
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
				"value" -> Check["```wolfram\n" <> value <> "\n```", ""]
			|>
		|>;

		response = <|"id"->json["id"], "result"->(result /. Null -> "")|>;
		sendResponse[response, client];,

		response = <|"id"->json["id"], "result"->""|>;
		sendResponse[response, client];
		
		sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Hover failed for: " <> symbol |> |>, client];
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

handle["clearTasks", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{},
	TaskRemove[Tasks[]];
	response = <|"id"->json["id"],"result"-><|"output"->"Tasks Cleared"|>|>;
	sendResponse[response, client];
	startEvaluators[];
];

handle["runCell", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{},
	uri = json["params", "textDocument"];
	src = json["params", "source"];

	newPosition = <|"line"->0, "character"->0|>;
	evaluate[<| "code" -> src, "range" -> <|
		"start" -> <|"line" -> 1, "character" -> 1 |>,
		"end" -> <|"line" -> 1, "character" -> 1 |>
	|> |>, json, newPosition];
];

handle["textDocument/didOpen", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{},
	lastChange = Now;
	documents[json["params","textDocument","uri"]] = json["params","textDocument","text"];
	(* validate[]; *)
];

handle["textDocument/didChange", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{},
	(* oldLength = StringLength[documents[json["params","textDocument","uri"]]];
	newLength = json["params","contentChanges"][[1]]["text"]; *)
	lastChange = Now;
	documents[json["params","textDocument","uri"]] = json["params","contentChanges"][[1]]["text"];
];

handle["textDocument/didSave", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{},
	validate[json, client];
];

handle["openNotebook", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{jupyterfile, response},
	jupyterfile = First[Notebook2Jupyter[json["params"]["path"]["path"]]];
	response = <|"id"->json["id"],"result"-><|"output"->jupyterfile|>|>;
	sendResponse[response, client];
];

handle["windowFocused", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{},
	If[json["params"],
		handlerWait = 0.01,
		handlerWait = 0.1
	]
];



handle["nb2html", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{id, inputs, html},
	id = json["id"];
	inputs = Import[json["params", "document", "uri", "fsPath"], "Notebook"];
	html = nb2html[inputs];
	sendResponse[<|"id"->id, "result"->html|>, client];
];

handle["html2nb", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{id, inputs, html, nb},
	id = json["id"];
	html = json["params", "html"];
	nb = html2nb[html];

	NotebookSave[nb, json["params", "document", "uri", "fsPath"]];
	NotebookClose[nb];
	sendResponse[<|"id"->id, "result"->True|>, client];
];

handle["serializeNotebook", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{id, inputs, json2, nb},
	inputs = json["params", "contents"];
	nb = json2nb[inputs, True];

	sendResponse[<|"id"->json["id"], "result"->ExportString[nb, "Text"]|>, client];
];

handle["deserializeNotebook", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{id, inputs, json2, nb},
	Check[
		inputs = Check[ImportString[json["params", "contents"], "Notebook"], ""];
		json2 = nb2json[inputs];
		sendResponse[<|"id"->json["id"], "result"->json2|>, client];,

		sendResponse[<|"id"->json["id"], "result"->""|>, client];
		sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> "Failed to open file." |> |>, client]
	]
];

handle["serializeScript", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{inputs, nb},
	inputs = json["params", "contents"];
	nb = StringJoin@json2wl[inputs];

	sendResponse[<|"id"->json["id"], "result"->nb|>, client];
];

handle["deserializeScript", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{inputs, json2},
	Check[
		inputs = json["params", "contents"];
		json2 = wl2json[inputs];
		sendResponse[<|"id"->json["id"], "result"->json2|>, client];,

		sendResponse[<|"id"->json["id"], "result"->""|>, client];
		sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> "Failed to open file." |> |>, client]
	]
];

handle["$/cancelRequest", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{response},
	DeleteCases[hoverQueue, x_/;x["id"] == json["params", "id"]];  
	response = <|"id" -> json["params", "id"], "result" -> "cancelled"|>; 
	sendResponse[response, client];
];

handle["abort", json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{},
	(* TaskRemove /@ Tasks[];
	AbortKernels[];
	startEvaluators[];
	startHover[]; *)

	Print["Aborting"];
	AbortKernels[];
];

validate[json_, client_:(First[SERVER["ConnectedClients"],{}])]:=Module[{src, lints, severities, msgs, response},
	Check[
		uri = json["params", "textDocument"]["uri"];
		src = documents[json["params","textDocument","uri"]];
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
		
		sendResponse[response, client];,
		sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "File diagnostics failed." |> |>, client]
	]
];

validate[]:=Module[{lints, severities, msgs, response},
		Check[
			KeyValueMap[
				Function[{uri, src},
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
			((x_LeafNode/;inCodeRangeQ[x[[-1]][Source], pos]) | (x_CallNode/;inCodeRangeQ[x[[-1]][Source], pos])),
			{2}], {}];
		
		result1 = If[call === {},
			<|"code"->"", "range"->{{pos["line"],0}, {pos["line"],0}}|>,
			<|"code"->getStringAtRange[src, call[[-1]][Source]+{{0, 0}, {0, 0}} ], "range"->call[[-1]][Source]|>
			
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

getFunctionAtPositionWithParams[src_, position_]:= Module[{functions, functionPositions, functionPositionsLineChar, thisFunctionPosition},
	functions = StringCases[src,x1:Shortest[WordCharacter..~~"["~~___~~"]"]/;balancedQ[x1]];
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
	symbol=SelectFirst[functions,IntervalMemberQ[Interval[#[[2]][[ All, 1]]],position["line"]+1] && IntervalMemberQ[Interval[#[[2]][[ All, 2]]],position["character"]+1]&,{""}][[1]];
	symbol
];

getStringAtLineChar[src_, position_]:=Module[{lines},
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

getWordAtPosition[src_, position_]:=Module[{srcLines, line, word},

	(*
	vals = {src, position};
	Save["/Users/Mark/Downloads/dump.wl", vals]; *)


	srcLines =StringSplit[src, EndOfLine, All];
	line = srcLines[[position["line"]+1]];

	word = First[Select[StringSplit[line, RegularExpression["\\W+"]], 
		IntervalMemberQ[
			Interval[
				First@StringPosition[line, WordBoundary~~#~~ WordBoundary, Overlaps->False]], position["character"]] &, 1], ""];
	
	word
];

getStringAtRange[string_, range_]:=Module[{sLines, sRanges},
	sLines = StringSplit[string, EndOfLine, All];
	sRanges=getSourceRanges[range];

	StringJoin@Table[Check[StringTake[sLines[[l[[1]]]], l[[2]]],""],{l, sRanges}]
];

getSourceRanges[{start_, end_}]:=Table[
	lineRange[l,start,end],
	{l,start[[1]],end[[1]]}
];

lineRange[line_,start_,end_]:= {line, Which[
	line == start[[1]] && line==end[[1]], {start[[2]], UpTo@end[[2]]},
	line == start[[1]] && line!=end[[1]], {start[[2]],-1},
	line != start[[1]] && line!=end[[1]], All,
	line != start[[1]] && line==end[[1]], {1, end[[2]]}
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
		name=StringCases[astStr,"$"... ~~ WordCharacter...][[1]];
		loc=node[[-1]][Source];
		rhs=FirstCase[{node},CallNode[LeafNode[Symbol, ("Set"|"SetDelayed"),___],{_,x_,___},___]:>x,Infinity];
		kind=If[Head@rhs == CallNode,
			rhs[[1,2]],
			rhs[[2]]
		];
		definition=getStringAtRange[src,loc+{{0,0},{0,0}}];
		<|"name"->name,"definition"->StringTrim[definition],"loc"->loc,"kind"->kind, "uri" -> uri|>];

	symbols = f /@Cases[ast, CallNode[LeafNode[Symbol,("Set"|"SetDelayed"),_],___],Infinity];
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
		(
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
	)
];
*)
EndPackage[];