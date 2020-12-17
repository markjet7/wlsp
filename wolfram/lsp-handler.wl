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
	"completionProvider"-> <|"resolveProvider"->False, "triggerCharacters" -> {"."}|> ,
	"documentSymbolProvider"->True,
	"codeActionProvider"->False,
	"renameProvider" -> <| "prepareProvider" -> True|>|>;
		
handle["initialize",json_]:=Module[{response, response2},
	Print["Initializing"];
	SetSystemOptions["ParallelOptions" -> "MathLinkTimeout" -> 120.];
	(* SetSystemOptions["ParallelOptions" -> "RelaunchFailedKernels" -> True]; *)
    CONTINUE = True;

	labels = COMPLETIONS[[All, "label"]];
	symbolDefinitions = <||>;
	nearestLabel = Nearest[labels];

	hoverTask = None;
	evaluationTask = None;

	evaluationKernel = None;
	hoverKernel = None;
    
	documents = <||>;
	response = <|"id"->json["id"],"result"-><|"capabilities"->ServerCapabilities|>|>;
	sendResponse[response];

	response2 = <|"method" -> "wolframVersion", "params"-> <| "output" -> "$(check) Wolfram " <> ToString[$VersionNumber] |> |>;
	sendResponse[response2];

	startEvaluators[];
	startHover[];
];


handle["shutdown", json_]:=Module[{},
	state = "Stop";
	Close[SERVER];
	Quit[1];
	Abort[];
	Exit[];
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
	
			SessionSubmit[
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
							"detail"-> (StringReplace[s["definition"] , "$"->""]) ,
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
			)];
];

signatureQueue = {};
handle["textDocument/signatureHelp", json_]:=Module[{},
	AppendTo[signatureQueue, json];
];

hoverQueue = {};
handle["textDocument/hover", json_]:=Module[{position, uri, src, symbol, value, result, response},
	AppendTo[hoverQueue, json];
];

boxRules={StyleBox[f_,"TI"]:>{"",f,""},StyleBox[f_,___]:>{f},RowBox[l_]:>{l},SubscriptBox[a_,b_]:>{a,"_",b,""},SuperscriptBox[a_,b_]:>{a,"<sup>",b,"</sup>"},RadicalBox[x_,n_]:>{x,"<sup>1/",n,"</sup>"},FractionBox[a_,b_]:>{"(",a,")/(",b,")"},SqrtBox[a_]:>{"&radic;(",a,")"},CheckboxBox[a_,___]:>{"<u>",a,"</u>"},OverscriptBox[a_,b_]:>{"Overscript[",a,b,"]"},OpenerBox[a__]:>{"Opener[",a,"]"},RadioButtonBox[a__]:>{"RadioButton[",a,"]"},UnderscriptBox[a_,b_]:>{"Underscript[",a,b,"]"},UnderoverscriptBox[a_,b_,c_]:>{"Underoverscript[",a,b,c,"]"},SubsuperscriptBox[a_,b_,c_]:>{a,"_<small>",b,"</small><sup><small>",c,"</small></sup>"},
ErrorBox[f_]:>{f}};

convertBoxExpressionToHTML[boxexpr_]:=StringJoin[ToString/@Flatten[ReleaseHold[MakeExpression[boxexpr,StandardForm]//.boxRules]]];
convertBoxExpressionToHTML[Information[BarChart]];

extractUsage[str_]:=With[{usg=Function[expr,expr::usage,HoldAll]@@MakeExpression[str,StandardForm]},StringReplace[If[Head[usg]===String,usg,""],{Shortest["\!\(\*"~~content__~~"\)"]:>convertBoxExpressionToHTML[content]}]];

startHover[]:=Module[{result, value, json, position, uri, src, symbol, response, code, params, opts, activeParameter, activeSignature},
	hoverTask = SessionSubmit[
		ScheduledTask[
			If[Length@hoverQueue > 0, 
				{json, hoverQueue} = {First@hoverQueue, Rest@hoverQueue};
				position = json["params", "position"];
				uri = json["params"]["textDocument"]["uri"];
				src = documents[json["params","textDocument","uri"]];
				symbol = getWordAtPosition[src, position];

				value = Which[
					MemberQ[Keys@symbolDefinitions, symbol],
						symbolDefinitions[symbol]["definition"],
					True,
						extractUsage[symbol]
						
						(*,
					MemberQ[COMPLETIONS[[All, "label"]], symbol],
						SelectFirst[DETAILS, #["detail"] == symbol <> " details" &]["documentation"],
					True,
						symbol *)
				];

				result = <|"contents"-><|
						"kind" -> "markdown",
						"value" -> "```wolfram\n" <> value <> "\n```"
					|>
				|>;

				(* result = <|"contents"-><|
						"language" -> "wolfram",
						"value" -> <| "kind" -> "markdown", "value" -> value |>
					|>
				|>; *)

				response = <|"id"->json["id"], "result"->(result /. Null -> symbol)|>;
				sendResponse[response];
			];
			
			If[Length@signatureQueue > 0, 
				{json, signatureQueue} = {First@signatureQueue, Rest@signatureQueue};
			
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
				sendResponse[response];
			],
			Quantity[0.001, "Seconds"]
		],
		HandlerFunctions -> <|
			"MessageGenerated" -> (Print[#MessageOutput] &) (* Message[#MessageOutput] & *),
			"PrintOutputGenerated" -> (Print[ToString@#PrintOutput] &)
			|>, 
		HandlerFunctionsKeys -> {"EvaluationExpression", "MessageOutput", "PrintOutput"}
	];
];

printLanguageData[symbol_]:=printLanguageData[symbol]=Module[{},
	StringTrim@StringJoin@StringSplit[WolframLanguageData[symbol, "PlaintextUsage"],( x:ToString@symbol):>"\n"<>x]
];

handle["clearTasks", json_]:=Module[{},
	TaskRemove[Tasks[]];
	response = <|"id"->json["id"],"result"-><|"output"->"Tasks Cleared"|>|>;
	sendResponse[response];
	startEvaluators[];
];

responseNumber = 1;
responseID[] := Module[{}, 
	responseNumber = responseNumber + 1;
	responseNumber
];

handle["runCell", json_]:=Module[{},
	uri = json["params", "textDocument"];
	src = json["params", "source"];

	newPosition = <|"line"->0, "character"->0|>;
	AppendTo[evals, {<| "code" -> src, "range" -> <|
		"start" -> <|"line" -> 1, "character" -> 1 |>,
		"end" -> <|"line" -> 1, "character" -> 1 |>
	|> |>, json, newPosition}];
];

handle["runInWolfram", json_]:=Module[{range, uri, src, end, workingfolder, code, string, output, newPosition, decorationLine, decorationChar, response, response2, response3},
		
		range = json["params", "range"];
		uri = json["params", "textDocument"]["uri", "external"];
		src = documents[json["params","textDocument","uri", "external"]];
		end = range["end"];
		workingfolder = DirectoryName[StringReplace[URLDecode@uri, "file:" -> ""]];

		Print[range["start"]];
		Print[range["end"]];

		code = Which[
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
		];


		newPosition = <|"line"->code["range"][[2,1]], "character"->0|>;

		response = <|"method"->"moveCursor","params"-><|"position"->newPosition|>|>;
		sendResponse[response];

		decoration = {
			<|"range" -> <|
				"start" -> <|"line" -> code["range"][[2, 1]]-1, "character" -> code["range"][[2, 2]] |>,
				"end" -> <|"line" -> code["range"][[2, 1]]-1, "character" -> code["range"][[2, 2]] |>
				|>,
				"renderOptions" -> <|
					"after" -> <|
						"contentText" -> "...",
						(* "backgroundColor" -> "background", *)
						"color" -> "foreground",
						"margin" -> "20px",
						"borderSpacing" -> "20px",
						"borderRadius" -> "5px"
					|>
				|>
			|>
		};

		response4 = <| "method" -> "updateDecorations", "params"-> {decoration}|>;
		
		sendResponse[response4];	

		(* Add the evaluation to the evaluation queue *)
		AppendTo[evals, {code, json, newPosition}];
		
];

handle["runExpression", json_]:=Module[{expr, range, position, newPosition, code, response},
	expr = json["params", "expression"];
	position = <|"line" -> 0, "character" -> 0 |>;

	code = <|
		"code" -> expr, "range" -> <|
			"start" -> position,
			"end" -> position
		|>
	|>;
	(* Add the evaluation to the evaluation queue *)
	AppendTo[evals, {code, json, position}];
	
	response = <|"id"->json["id"],"result"-><|"output"->"...", "position"->position|>|>;
	sendResponse[response];
];

transforms[output_Graphics]:=Module[{}, 
	(*imageToPNG[output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_Image]:=Module[{}, 
	(*imageToPNG[output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_Legended]:=Module[{}, 
	(*imageToPNG[output];*)
	ExportString[Graphics@output, "HTMLFragment"]
];
transforms[output_Grid]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_Column]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_Row]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_GraphicsRow]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_GraphicsColumn]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_GeoGraphics]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_]:=Module[{}, 
	output
];

evaluateFromQueue[code2_, json_, newPosition_]:=Module[{decorationLine, decorationChar, string, output, successQ, decoration, response4, result},
	
		$busy = True;
		sendResponse[<|"method" -> "wolframBusy", "params"-> <|"busy" -> True |>|>];
		string = StringReplace[StringTrim[code2["code"]], ";" ~~ EndOfString -> ""];

		{result, successQ} = evaluateString[string];

		If[
			successQ,  
			output = transforms[result] /. Null ->"",
			output = result;
		];
		
		response = <|"id"->json["id"],"result"-><|"output"->ToString[output, TotalWidth->5000000], "result"->ToString[result, InputForm, TotalWidth -> 5000000], "position"-><|"line"->1, "character"->1|>|>|>;
		sendResponse[response];

		decorationLine = code2["range"][[2, 1]];
		decorationChar = code2["range"][[2, 2]];

		(* response2 = <|(*"id"->responseID[], *)"method" -> "wolframResult", 
			"params"-><|"output"->ToString[output /. Null -> "NA", InputForm], "position"->newPosition, "print"->json["params", "print"]|>|>;
		
		sendResponse[response2]; *)

		(*response3 = <| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> output (*ToString[(output /. Null -> "NA"), InputForm]*) |> |>;
		sendResponse[response3];*)

		If[!json["params", "print"],
			decoration = List[
				<|
					"range" -> 	<|
						"start"-><|"line"->decorationLine-1,"character"->decorationChar+10|>,
						"end"-><|"line"->decorationLine-1,"character"->decorationChar+110|>
					|>,
					"renderOptions"-><|
						"after" -> <|
							"contentText" -> ToString[result /. Null ->"-", InputForm, TotalWidth->120, CharacterEncoding -> "ASCII"],
							(*"backgroundColor" -> "background",*)
							"borderRadius" -> "5px",
							"borderSpacing" -> "20px",
							"border" -> "foreground",
							"color" -> "foreground",
							"margin"-> "20px",
							"rangeBehavior" -> 4
						|>,
						"rangeBehavior" -> 4
					|>
				|>
			];

			response4 = <| "method" -> "updateDecorations", "params"-> {decoration}|>;
			sendResponse[response4];	
		];

		$busy = False;
		sendResponse[<| "method" -> "wolframBusy", "params"-> <|"busy" -> False |>|>];
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
		SessionSubmit[
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
			], Method -> "Idle"
		];
];

launchKernel[attempts_]:=Module[{},
	CloseKernels[];
	evaluationKernel = First[LaunchKernels[1], False];
	If[evaluationKernel === False, 
		If[
			attempts < 5,
			launchKernel[attempts+1],
			evaluationKernel = False
		],
		evaluationKernel
	]
];

handle["launchKernel", json_]:=Module[{},

	CloseKernels[];
	launchKernel[1];


	response = If[SameQ[Head@evaluationKernel, KernelObject],
		<|"id" -> json["id"], "result" -> <|"launched" -> True |>|>,

		<|"id" -> json["id"], "result" -> <|"launched" -> False |>|>;
	];
	sendResponse[response];
];

evaluateString[string_, width_:10000]:= Module[{res, r}, 
	DistributeDefinitions[];
			
	If[SameQ[Head@evaluationKernel,KernelObject],
		res = ParallelEvaluate[EvaluationData[ToExpression[string]], evaluationKernel];
		If[
			res["Success"], 
			(
				(* sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Success: " <> ToString[res["Result"], InputForm, TotalWidth->1000] |> |>]; *)
				{res["Result"], True}
			),

			(
				sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> ToString[Last[res["MessagesText"]], TotalWidth -> 1000, CharacterEncoding->"ASCII"] |> |>];
				sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString["Error: " <> StringRiffle[res["MessagesText"][[-3;;-1]], "\n"], TotalWidth->1000, CharacterEncoding->"ASCII"] |> |>];
				{res["Result"], False}
			)
		],  

		launchKernel[1];
		If[SameQ[Head@evaluationKernel,KernelObject],

			(* sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> ToString[evaluationKernel] |> |>]; *)
			evaluateString[string],

			sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> "Kernel failed to launch." |> |>];
			{"Kernel failed to launch.", False}
		]
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
			<|"code"->getStringAtRange[src, call[[-1]][Source]+{{0, 0}, {0, 1}} ], "range"->call[[-1]][Source]|>
			
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

getFunctionAtPosition[src_, position_]:=Module[{symbol, p, r},
	p = position;
	symbol = "";
	NestWhile[
		(
			p["character"] = p["character"] - #;
			#+1) &,
		0,
		And[
			(
				symbol = getWordAtPosition[src, p];
				!NameQ[symbol]
			),
			# < 50] &
	];
	symbol
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

getStringAtRange[string_,range_]:=Module[{sLines, sRanges},
	sLines = StringSplit[string, EndOfLine, All];
	sRanges=getSourceRanges[range];

	StringJoin@Table[StringTake[StringReplace[sLines[[l[[1]]]],"\n"->"\n"], l[[2]]],{l,sRanges}]
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

startEvaluators[]:=Module[{format, count},
	evals = {};
	$busy = False;
	(*
	CloseKernels[];
	evaluationKernel = First[LaunchKernels[1], None];
	hoverKernel = First[LaunchKernels[1], None];

	
	If[!SameQ[Head@evaluationKernel , KernelObject], 
		sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 4, "message" -> "Failed to launch kernel. Please try again."|> |>]
	];
	*)

	format[msg_] := Module[{tmp, params}, (
		tmp = msg[["MessageOutput", 1]][[ "MessageTemplate"]];
		params = msg[["MessageOutput", 1]][["MessageParameters"]];
		Message @@ Append[tmp, params]
		)];

	evaluationTask = SessionSubmit[
		ScheduledTask[
			If[
				Length@evals > 0 && $busy == False,
				{f0, evals} = {First@evals, Rest@evals};
				evaluateFromQueue[f0[[1]], f0[[2]], f0[[3]]]
			],
			Quantity[0.00001, "Seconds"]
		],
		HandlerFunctions -> <|
			"MessageGenerated" -> ("Error" &),
			"PrintOutputGenerated" -> (# &) (*(sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Kernel: " <> ToString[#PrintOutput, InputForm,TotalWidth->1000, CharacterEncoding-> "ASCII"] |> |>] &) *)
			|>, 
		HandlerFunctionsKeys -> { "MessageOutput", "PrintOutput"}
	];

];

constructRPCBytes[_Missing]:= Module[{}, ""];
constructRPCBytes[msg_Association]:=Module[{headerBytes,jsonBytes},
	jsonBytes=ExportByteArray[msg,"RawJSON"];
	headerBytes=StringToByteArray["Content-Length: " <> ToString[Length[jsonBytes], CharacterEncoding->"ASCII"]<>"\r\n\r\n"];
	{headerBytes,jsonBytes}

];

(*
handle["textDocument/documentSymbol", json_]:=Module[{uri, src, tree, symbols, functions, result, response, kind},
	SessionSubmit[
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
	)];
];
*)
