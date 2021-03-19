(* ::Package:: *)

Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];
Check[Needs["CodeInspector`"], PacletInstall["CodeInspector"]; Needs["CodeInspector`"]]; 

COMPLETIONS = Import[DirectoryName[path] <> "completions.json", "RawJSON"]; 
DETAILS =  Association[StringReplace[#["detail"]," details"->""]-># &/@Import[DirectoryName[path] <> "details.json","RawJSON"]];
 
(* scriptPath = DirectoryName@ExpandFileName[First[$ScriptCommandLine]]; *)
(* Get[scriptPath <> "/CodeFormatter.m"]; *)

imageToPNG[graphic_]:=Module[{}, 
	(* Export[workingfolder <> ToString@responseID[] <> ".jpg", graphic]; *)
	("<img alt='Output' src='data:image/png;base64," <> BaseEncode@ExportByteArray[graphic,"PNG"] <> "'>")];
(* $DisplayFunction = imageToPNG; *)
(* DefaultOptions-> {Graphics->{DisplayFunction->imageToPNG}}; *)
 
contentLengthPattern[] := "Content-Length: "~~length:NumberString~~"\r\n\r\n";
contentPattern[length_]:= (("Content-Length: "~~ToString@length~~"\r\n\r\n"~~content1:Repeated[_,{length}]) | (content2:Repeated[_,{length}]~~"Content-Length: "~~ToString@length~~"\r\n\r\n"));

(* handleMessage[content_String]:=Module[{},
	json=ImportString[ToString[content, OutputForm, CharacterEncoding -> "UTF8"],"RawJSON"];
	handle[json["method"],json];]; *)

ServerCapabilities=<|
	"textDocumentSync"->1,
	"hoverProvider"-><|"contentFormat"->"markdown"|>,
	"signatureHelpProvider"-><|"triggerCharacters" -> {"[", ","}, "retriggerCharacters"->{","}|>,
	"documentFormattingProvider" -> False,
	"completionProvider"-> <|"resolveProvider"->False, "triggerCharacters" -> {"."}, "allCommitCharacters" -> {"["}|> ,
	"documentSymbolProvider"->True,
	"codeActionProvider"->False,
	"codeLensProvider"-> <|"resolveProvider"->True|>,
	"renameProvider" -> <| "prepareProvider" -> True|>|>;
		
handle["initialize",json_]:=Module[{response, response2},
	Print["Initializing"];
    CONTINUE = True;

	labels = COMPLETIONS[[All, "label"]];
	symbolDefinitions = <||>;
	nearestLabel = Nearest[labels];
    
	documents = <||>;
	response = <|"id"->json["id"],"result"-><|"capabilities"->ServerCapabilities|>|>;
	sendResponse[response];

	response2 = <|"method" -> "wolframVersion", "params"-> <| "output" -> "$(check) Wolfram " <> ToString[$VersionNumber] |> |>;
	sendResponse[response2];
];


handle["shutdown", json_]:=Module[{},
	state = "Stop";
	Close[SERVER];
	Quit[1];
	Abort[];
	Exit[];
];

handle["codeLens/resolve", json_]:=Module[{},
	Print["resolve"];
];

handle["textDocument/codeLens", json_]:=Module[{src, positions, lens, lines, sections},
	src = documents[json["params","textDocument","uri"]];
	lines = StringCount[StringTake[src, {1, #[[2]]}], "\n"] & /@ Join[StringPosition[src, "(*  *)", Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]];
	sections = BlockMap[StringTrim@StringTake[src, {#[[1,1]], #[[2,2]]}] &, Join[StringPosition[src, "(*  *)", Overlaps -> False], StringPosition[src, EndOfString, Overlaps -> False]], 2,1];
	If[sections != {},
		lens = Table[
			<|
				"range" -> 
					<|
						"start" -><|"line"->l[[1]], "character"->0|>,
						"end" -><|"line"->l[[1]], "character"->20|>
					|>,
				"command" -> <|
					"title" -> "Run " <> ToString@StringCount[StringTrim[l[[2]], WhitespaceCharacter...~~"(*  *)"], "\n"] <> " lines",
					"command" -> "wolfram.runExpression",
					"arguments" -> {StringReplace[l[[2]], "(*  *)" ->""] , l[[1]] + StringCount[l[[2]], "\n"]-1, StringLength@l[[2]]}
				|>
			|>,
			{l, Transpose[{Most@lines, sections}]}
		];,
		lens = {}
	];
	
	sendResponse[<|"id"->json["id"], "result"->lens|>];
];

handle["textDocument/prepareRename", json_]:=Module[{pos, src, str, renames, result, response},
	pos = rangeFromVSCode@json["params", "textDocument", "position"];
	src = documents[json["params","textDocument","uri"]];
	str = getWordAtPosition[src, pos];

	renames = getWordsPosition[str, src];
	result = <|"range"-> renames[[1,2]]|>;
	response = <|"id"->json["id"],"result"->result |>;
	sendResponse[response]; 
]; 

handle["textDocument/rename", json_]:=Module[{},
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
	sendResponse[response];

];

handle["textDocument/didOpen",json_]:=Module[{file},
	file = json["params"]["textDocument"]["uri"];
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

handle["textDocument/completion", json_]:=Module[{src, pos, symbol, names, items, result, response},
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
		sendResponse[response];
];

balancedQ[str_String] := StringCount[str, "["] === StringCount[str, "]"];
handle["textDocument/documentSymbol", json_]:=Module[{uri, src, tree, symbols, functions, result, response, kind, f, ast},
	
				(

					kind[s_]:= Switch[
								s, 
								"Symbol", 13, 
								"Integer", 16, 
								"Real", 16,
								"Complex", 16,
								"Rational", 16,
								"List", 18,
								"Association", 23,
								"Function", 12, 
								"String", 15, 
								"Module", 12,
								_, 19];

					uri = json["params"]["textDocument"]["uri"];
					src = documents[json["params", "textDocument", "uri"]];
					(*ast = AST`ParseFile@Export[FileNameJoin[{$TemporaryDirectory, "wolf-lsp"<> ToString@RandomReal[] <> ".txt"}], src];*)
					ast = CodeParse[src];


					f[node_]:=Module[{astStr,name,fullStr,loc,kind,rhs},
						astStr=ToFullFormString[node[[2,1]]];
						name=StringCases[astStr,"$"... ~~ WordCharacter...][[1]];
						loc=node[[-1]][Source];
						rhs=FirstCase[{node},CallNode[LeafNode[Symbol, ("Set"|"SetDelayed"),___],{_,x_,___},___]:>x,Infinity];
						If[Head@rhs ==CallNode,
						kind = rhs[[1,2]],
						kind = rhs[[2]]
						];
						definition=getStringAtRange[src,loc+{{0,0},{0,0}}];
						<|"name"->name,"definition"->StringTrim[definition],"loc"->loc,"kind"->kind|>];

					symbols = f /@Cases[ast, CallNode[LeafNode[Symbol,("Set"|"SetDelayed"),_],___],Infinity];

					result = Table[
						symbolDefinitions[s["name"]] = s;
						TimeConstrained[
						<|
							"name" -> s["name"] /. ""->"-",
							"kind" -> kind[s["kind"]],
							"detail"-> (StringReplace[If[StringQ[s["definition"]], s["definition"], ""] , "$"->""]) ,
							"location"-><|
								"uri"-> uri,
								"range"->toRange[s["loc"]]
								|>
						|>, 0.05, 
						<|
							"name" -> s["name"] ,
							"kind" -> 19,
							"detail"-> "",
							"location"-><|
								"uri"->uri,
								"range"->toRange[s["loc"]]
								|>
						|>], {s, symbols[[1;;]]}];


				response = <|"id"->json["id"],"result"->(result /. Null -> "NA")|>;
				sendResponse[response];  
			)
];

signatureQueue = {};
handle["textDocument/signatureHelp", json_]:=Module[{position, uri, src, symbol, activeParameter, activeSignature, value, params, opts, result, response},
	Check[		
		position = json["params"]["position"];
		uri = json["params"]["textDocument"]["uri"];
		src = documents[json["params","textDocument","uri"]];
		symbol = getFunctionAtPosition[src, position];

		activeParameter = 0;
		activeSignature = 0;
		If[!MissingQ[json["params"]["context"]["activeSignatureHelp"]], 
			activeParameter = json["params"]["context"]["activeSignatureHelp"]["activeParameter"];
		];

		If[json["params"]["context"]["triggerCharacter"] === ",", 
			If[
				MemberQ[Keys[json["params"]["context"]], "activeSignatureHelp"] &&
				MemberQ[Keys[json["params"]["context"]["activeSignatureHelp"]], "activeParameter"],
				activeParameter = json["params"]["context"]["activeSignatureHelp"]["activeParameter"] + 1;
			activeSignature = json["params"]["context"]["activeSignatureHelp"]["activeSignature"];
			];
		];

		value = extractUsage[symbol];
		params = Flatten[StringCases[#,RegularExpression["(?:[^,{}]|\{[^{}]*\})+"]] &/@StringCases[StringSplit[value, "\n"], Longest["["~~i__~~"]"]:>i],1];
		opts = Information[symbol, "Options"] /. {
			Rule[x_, y_] :> ToString[x, InputForm] <> "->" <> ToString[y, InputForm], 
			RuleDelayed[x_, y_] :> ToString[x, InputForm] <> ":>" <> ToString[y, InputForm]};
	
		result = <|
			"signatures" -> Table[
				<|
					"label" -> StringRiffle[v, ", "], 
					"documentation" -> value <> "\n" <> StringRiffle[opts /. None -> {}, "\n"],
					"parameters" -> (<|"label" -> #|> & /@ v)
				|>, {v, params}],
			"activeSignature" -> activeSignature,
			"activeParameter" -> activeParameter
		|>;
		
		response = <|"id"->json["id"], "result"->(result /. Null -> symbol)|>;
		sendResponse[response];,

		response = <|
			"signatures" -> {},
			"activeSignature" -> activeSignature,
			"activeParameter" -> activeParameter
		|>;
		sendResponse[response];
	]
];

handle["textDocument/hover", json_]:=Module[{position, uri, src, symbol, value, result, response},
	Check[
		position = json["params", "position"];
		uri = json["params"]["textDocument"]["uri"];
		src = documents[json["params","textDocument","uri"]];
		symbol = getWordAtPosition[src, position];

		value = Which[
			MemberQ[Keys@symbolDefinitions, symbol],
				symbolDefinitions[symbol]["definition"],
			True,
				Check[extractUsage[symbol], symbol]
		];

		result = <|"contents"-><|
				"kind" -> "markdown",
				"value" -> "```wolfram\n" <> value <> "\n```"
			|>
		|>;

		response = <|"id"->json["id"], "result"->(result /. Null -> "")|>;
		sendResponse[response];,

		response = <|"id"->json["id"], "result"->""|>;
		sendResponse[response];
	];
];

boxRules={StyleBox[f_,"TI"]:>{"",f,""},StyleBox[f_,___]:>{f},RowBox[l_]:>{l},SubscriptBox[a_,b_]:>{a,"_",b,""},SuperscriptBox[a_,b_]:>{a,"<sup>",b,"</sup>"},RadicalBox[x_,n_]:>{x,"<sup>1/",n,"</sup>"},FractionBox[a_,b_]:>{"(",a,")/(",b,")"},SqrtBox[a_]:>{"&radic;(",a,")"},CheckboxBox[a_,___]:>{"<u>",a,"</u>"},OverscriptBox[a_,b_]:>{"Overscript[",a,b,"]"},OpenerBox[a__]:>{"Opener[",a,"]"},RadioButtonBox[a__]:>{"RadioButton[",a,"]"},UnderscriptBox[a_,b_]:>{"Underscript[",a,b,"]"},UnderoverscriptBox[a_,b_,c_]:>{"Underoverscript[",a,b,c,"]"},SubsuperscriptBox[a_,b_,c_]:>{a,"_<small>",b,"</small><sup><small>",c,"</small></sup>"},
ErrorBox[f_]:>{f}};

convertBoxExpressionToHTML[boxexpr_]:=StringJoin[ToString/@Flatten[ReleaseHold[MakeExpression[boxexpr,StandardForm]//.boxRules]]];
convertBoxExpressionToHTML[Information[BarChart]];

extractUsage[str_]:=With[{usg=Function[expr,expr::usage,HoldAll]@@MakeExpression[str,StandardForm]},StringReplace[If[Head[usg]===String,usg,""],{Shortest["\!\(\*"~~content__~~"\)"]:>convertBoxExpressionToHTML[content]}]];

printLanguageData[symbol_]:=printLanguageData[symbol]=Module[{},
	StringTrim@StringJoin@StringSplit[WolframLanguageData[symbol, "PlaintextUsage"],( x:ToString@symbol):>"\n"<>x]
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
	validate[];
];

handle["textDocument/didChange", json_]:=Module[{},
	(* oldLength = StringLength[documents[json["params","textDocument","uri"]]];
	newLength = json["params","contentChanges"][[1]]["text"]; *)
	lastChange = Now;
	documents[json["params","textDocument","uri"]] = json["params","contentChanges"][[1]]["text"];
];

handle["textDocument/didSave", json_]:=Module[{},
	validate[];
];

handle["windowFocused", json_]:=Module[{},
	If[json["params"],
		handlerWait = 0.01,
		handlerWait = 0.1
	]
];

handle["$/cancelRequest", json_]:=Module[{},
	DeleteCases[hoverQueue, x_/;x["id"] == json["params", "id"]];  
	(* response = <|"id" -> json["params", "id"], "result" -> "cancelled"|>; *)
	(*sendResponse[response];*)
];

handle["abort", json_]:=Module[{},
	(* TaskRemove /@ Tasks[];
	AbortKernels[];
	startEvaluators[];
	startHover[]; *)

	Print["Aborting"];
	AbortKernels[];
];

validate[]:=Module[{lints, severities, msgs, response},
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
			];
];


evaluateString[string_, width_:10000]:= Module[{res, r, start}, 
	start = Now;
	While[!(Head@evaluationKernel === KernelObject),
		CloseKernels[];
		(evaluationKernel = First@LaunchKernels[1]); 
		Pause[1];
		If[QuantityMagnitude[DateDifference[start,Now],"Minutes"] > 2, 
			sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> "Failed to launch evaluation kernel" |> |>];
			Break[]
		];
	];
	res = ParallelEvaluate[EvaluationData[ToExpression[string]], evaluationKernel];
	If[
		res["Success"], 
		(
			(* sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Success: " <> ToString[res["Result"], InputForm, TotalWidth->1000] |> |>]; *)
			{res["Result"], True}
		),

		(
			sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> ToString[StringRiffle[res["Messages"], "\n"], OutputForm, TotalWidth -> 200, CharacterEncoding->"ASCII"] |> |>];
			Table[
				sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 1, "message" -> ToString[r, InputForm, TotalWidth->500, CharacterEncoding->"ASCII"] |> |>];,
				{r, res["Messages"]}];
				
			{res["Result"], False}
		)
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


getFunctionAtPosition[src_,position_]:=Module[{symbol,p,r,lbs,rbs},
	p=position;
	symbol="";
	lbs=0;
	rbs=0;
	NestWhile[(
		p["character"]=p["character"]-1;
		Which[(p["line"]===0)&&(p["character"]<=0),
			0,
			p["character"]===0,
			p["line"]=p["line"]-1;p["character"]=StringLength[StringSplit[src,"\n"][[p["line"]-1]]];p["character"],
			True,
			#-1
		]
		)&, p["character"],
		(Switch[
			getCharAtPosition[src,p],
			"[",
			lbs=lbs+1,
			"]",
			rbs=rbs+1,_,Identity];
			Which[
				lbs > rbs,
				p["character"] = p["character"]-1;
				symbol=getWordAtPosition[src, p];
				False,
				(p["line"]===0)&&(p["character"]===1),
				False,
				True,
			True])
	&];
	symbol
];

getCharAtPosition[src_,position_]:=Module[{}, 
	If[src === "", 
		"",
		StringTake[StringSplit[src,"\n"][[position["line"]+1]],{position["character"]}]]
];


getWordAtPosition[src_, position_]:=Module[{srcLines, line, word},

	(*
	vals = {src, position};
	Save["/Users/Mark/Downloads/dump.wl", vals]; *)


	srcLines =StringSplit[src, EndOfLine, All];
	line = srcLines[[position["line"]+1]];


	word = First[Select[StringSplit[line, RegularExpression["\\W+"]], 
		IntervalMemberQ[Interval[First@StringPosition[StringTrim@line, WordBoundary~~#~~ WordBoundary, Overlaps->False]], position["character"]] &, 1], ""];
	
	word
];

getStringAtRange[string_, range_]:=Module[{sLines, sRanges},
	sLines = StringSplit[string, EndOfLine, All];
	sRanges=getSourceRanges[range];

	StringJoin@Table[StringTake[StringReplace[sLines[[l[[1]]]],"\n"->"\n"], l[[2]]],{l, sRanges}]
];

getSourceRanges[{start_, end_}]:=Table[
	lineRange[l,start,end],
	{l,start[[1]],end[[1]]}];

lineRange[line_,start_,end_]:= {line, Which[
	line == start[[1]] && line==end[[1]], {start[[2]], UpTo@end[[2]]},
	line == start[[1]] && line!=end[[1]], {start[[2]],-1},
	line != start[[1]] && line!=end[[1]], All,
	line != start[[1]] && line==end[[1]], {1, end[[2]]}
]};

constructRPCBytes[_Missing]:= Module[{}, ""];
constructRPCBytes[msg_Association]:=Module[{headerBytes,jsonBytes},
	jsonBytes=Check[ExportByteArray[msg,"RawJSON"], Print["Export Byte Array failed"]; Print[msg]; ExportByteArray[<||>,"RawJSON"]];
	headerBytes=StringToByteArray["Content-Length: " <> ToString[Length[jsonBytes], CharacterEncoding->"ASCII"]<>"\r\n\r\n"];
	{headerBytes,jsonBytes}

];

(*
handle["textDocument/documentSymbol", json_]:=Module[{uri, src, tree, symbols, functions, result, response, kind},
		(

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
