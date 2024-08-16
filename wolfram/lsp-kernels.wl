BeginPackage["WolframKernel`"];
Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];
Check[Needs["CodeInspector`"], PacletInstall["CodeInspector"]; Needs["CodeInspector`"]]; 
(* ::Package:: *)
Get[DirectoryName[$path] <> "transforms.wl"];

scriptPath = DirectoryName@ExpandFileName[First[$ScriptCommandLine]]; 
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
	"workspace" -><|
		"workspaceFolders" -> <|"supported"->True, "changeNotifications" -> True|>
	|>,
	"hoverProvider" -> <|"contentFormat"->"markdown", "supportHtml"->True|>
|>;


handle["initialize",json_]:=Module[{response, response2, messageHandler},
	Print["Initializing Kernel"];
	SetSystemOptions["ParallelOptions" -> "MathLinkTimeout" -> 15.];
	SetSystemOptions["ParallelOptions" -> "RelaunchFailedKernels" -> True];
    CONTINUE = True;
    
	documents = <||>;
	sendResponse@<|"id"->json["id"],"result"-><|"capabilities"->ServerCapabilities|>|>;
	Needs["JLink`"];
	(* 
	<<JavaGraphics`;
	ReinstallJava[CommandLine -> "java", JVMArguments -> "-Xmx4096m"];
	 *)
	evalnumber = 1;


	decorationFile = CreateFile[];
	symbolListFile = scriptPath <> "symbolList.js"; (* CreateFile[]; *)
	varTableFile = scriptPath <> "varTable.js";
	workspaceDecorations =  <||>;
	symbolDefinitions = <||>;

	(*sendResponse[<|"method"->"pulse", "params"->"1"|>];*)

	(*
		LocalSubmit[
			ScheduledTask[
				If[responded === True,
					responded = False;
					Print["pulse"];
					sendResponse[<|"method"->"pulse", "params"->"1"|>],

					Quit[1]
				],
				Quantity[0.5, "Minutes"]
			],
			HandlerFunctions-><|"PrintOutputGenerated"->Print|>,
			HandlerFunctionsKeys->"PrintOutput"
		];
	*)
];

handle["pulse", json_]:=Module[{},
	responded = True;
	sendResponse[<|"id" -> json["id"], "result"->1|>];
];


handle["windowFocused", json_]:=Module[{},
	If[First[json["params"], True],
		handlerWait = 0.01,
		handlerWait = 1.0
	];
];

handle["shutdown", json_]:=Module[{},
	Print["Stopping Kernels"];
	state = "Stop";
	sendResponse[<|"id" -> json["id"], "result" -> Null|>];
	CloseKernels[];
	Close[KERNELSERVER];
	Quit[];
	Exit[]; 
];

boxRules={StyleBox[f_,"TI"]:>{"",f,""},StyleBox[f_,___]:>{f},RowBox[l_]:>{l},SubscriptBox[a_,b_]:>{a,"_",b,""},SuperscriptBox[a_,b_]:>{a,"<sup>",b,"</sup>"},RadicalBox[x_,n_]:>{x,"<sup>1/",n,"</sup>"},FractionBox[a_,b_]:>{"(",a,")/(",b,")"},SqrtBox[a_]:>{"&radic;(",a,")"},CheckboxBox[a_,___]:>{"<u>",a,"</u>"},OverscriptBox[a_,b_]:>{"Overscript[",a,b,"]"},OpenerBox[a__]:>{"Opener[",a,"]"},RadioButtonBox[a__]:>{"RadioButton[",a,"]"},UnderscriptBox[a_,b_]:>{"Underscript[",a,b,"]"},UnderoverscriptBox[a_,b_,c_]:>{"Underoverscript[",a,b,c,"]"},SubsuperscriptBox[a_,b_,c_]:>{a,"_<small>",b,"</small><sup><small>",c,"</small></sup>"},
ErrorBox[f_]:>{f}};

convertBoxExpressionToHTML[boxexpr_]:=StringJoin[ToString/@Flatten[ReleaseHold[MakeExpression[boxexpr,StandardForm]//.boxRules]]];
convertBoxExpressionToHTML[Information[BarChart]];

extractUsage[str_]:=With[{usg=Function[expr,expr::usage,HoldAll]@@MakeExpression[str,StandardForm]},StringReplace[If[Head[usg]===String,usg,""],{Shortest["\!\(\*"~~content__~~"\)"]:>convertBoxExpressionToHTML[content]}]];
handle["runCell", json_]:=Module[{uri, src, newPosition},
	uri = json["params", "textDocument"];
	src = json["params", "source"];

	newPosition = <|"line"->0, "character"->0|>;
	AppendTo[evals, {<| "code" -> src, "range" -> <|
		"start" -> <|"line" -> 1, "character" -> 1 |>,
		"end" -> <|"line" -> 1, "character" -> 1 |>
	|> |>, json, newPosition}];
];

canceledRequests = {};
handle["$/cancelRequest", json_]:=Module[{response},
	canceledRequests = AppendTo[canceledRequests, json["params", "id"]];
	TaskRemove[Tasks[]];
	response = <|"id" -> json["params", "id"], "result" -> "cancelled"|>; 
	sendResponse[response];
];

handle["moveCursor", json_]:=Module[{range, uri, src, end, code, newPosition},
	range = json["params", "range"];
	uri = json["params", "textDocument"]["uri", "external"];
	src = documents[json["params","textDocument","uri", "external"]];
	end = range["end"];
	code = getcode[src, range];
	newPosition = <|"line"->code["range"][[2,1]], "character"->0|>;
	(* sendResponse[<|"method" -> "moveCursor", "params" -> newPosition|>]; *)
];

handle["runNB", json_]:=Module[{id, html, inputID, inputs, expr, line, end, position, code},
	id = json["id"];
	html = ImportString[nb2html[ImportString[json["params", "document"], "Notebook"]], {"HTML", "XMLObject"}];
	inputID = json["params", "input"];
	
	inputs = First[Cases[html,XMLElement["textarea", {___, "id"->inputID, ___}, content_]:>content,Infinity],{""}];

	expr = inputs;
	line = 1;
	end = 1;
	position = <|"line" -> line, "character" -> end |>;

	code = <|
		"code" -> ToString@expr, "range" -> <|
			"start" -> position,
			"end" -> position
		|>
	|>;

	evaluateFromQueue[code, json, position];
];

handle["runInWolfram", json_]:=Module[{range, uri, src, end, workingfolder, code, codeBlock, codeBlocks, c, s, string, output, newPosition, decorationLine, decorationChar, response, response2, response3, decoration, newLines, codeLines},

	Check[
		start = Now;
		range = json["params", "range"];
		uri = json["params", "textDocument"]["uri", "external"];
		src = documents[json["params","textDocument","uri", "external"]];
		code = getCode[src, range];
		newPosition = <|"line"->code["range"][[2,1]]+1, "character"->1|>;
		sendResponse[<|"method" -> "wolframBusy", "params"-> <|"busy" -> True, "position"->newPosition, "text" -> "..." |>|>];

		(* Split string into code blocks *)
		codeBlocks = Select[
			Cases[CodeParse[src 
				(*, SourceConvention -> "SourceCharacterIndex" *)
				],
				(
				CallNode[LeafNode[Symbol,(_),_],___] |
				CallNode[CallNode[_, (_), _], ___] |
				LeafNode[_,_,_]
			),{2}],
			#[[-1]][Source][[1,1]] >= code["range"][[1,1]] && #[[-1]][Source][[2,1]] <= code["range"][[2,1]] &
		];

		(* Evaluate each code block *)

		Table[
			s = StringTake[src, {
				charIndexFromLineColumn[src, c[[-1]][Source][[1]]], 
				UpTo@charIndexFromLineColumn[src, c[[-1]][Source][[2]]]}];
			codeLines = StringCount[StringTrim@s,"\n"];
			codeBlock = <|
				"code" -> s, "range" -> <|
					"start" -> <|"line" ->c[[-1]][Source][[1,1]], "character" -> 1 |>,
					"end" -> <|"line" -> c[[-1]][Source][[2,1]], "character" -> 100 |>
				|>
			|>;

			newPosition = <|"line"->c[[-1]][Source][[2,1]], "character"->1|>;
			(* Add each code block to the evaluation queue *)
			evaluateFromQueue[codeBlock, json, newPosition];,
			{c, codeBlocks}];
		,
		workingfolder = DirectoryName[StringReplace[URLDecode@uri, "file:" -> ""]];
	];
];

handle["runInWolframIO", json_]:=Module[{start, range, uri, src, code, newPosition, r, output, result},
	Check[

		Unprotect[NotebookDirectory];
		NotebookDirectory[] = FileNameJoin[
			URLParse[DirectoryName[json["params","textDocument","uri", "external"]]]["Path"]] <> $PathnameSeparator;
		start = Now;
		range = json["params", "range"];
		uri = json["params", "textDocument"]["uri", "external"];
		src = documents[json["params","textDocument","uri", "external"]];
		code = Check[getCode[src, range], <|"code"->"Get code failed", "range"-><|
			"start" -> <|"line" -> range["start"]["line"]+1, "character" -> range["start"]["character"]+1 |>,
			"end" -> <|"line" -> range["end"]["line"]+1, "character" -> range["end"]["character"]+1 |>
		|>|>];
		newPosition = <|"line"->code["range"][[2,1]], "character"->1|>;
		sendResponse[<|"method" -> "wolframBusy", "params"-> <|"busy" -> True, "position"->newPosition, "text" -> "..."  |>|>];
		
		If[!SyntaxQ@code["code"],
			sendResponse[<|"method" -> "onRunInWolframIO", "params" -> <|"output" -> "Syntax error", "input" -> code["code"], "result" -> "Syntax error", "load" -> False, "position" -> newPosition, "print" -> json["params", "print"], "hover" -> "Syntax error", "messages" -> {}, "time" -> 0, "decoration" -> "Syntax error", "document" -> json["params", "textDocument", "uri"]|>|>];
			Return[];
		];
		r = evaluateString[code["code"]];
		output = transformsIO[ReleaseHold[r["Result"]], Lookup[r,"FormattedMessages",{}]];
		result = <|
			"method" -> "onRunInWolframIO",
			"params" -> <|
				"output" -> output,
				"input" -> code["code"],
				"result" -> $myShort[ToString@ReleaseHold[r["Result"]]],
				"load" -> False,
				"position" -> newPosition,
				"print" -> json["params", "print"],
				"messages" -> Lookup[r, "FormattedMessages", {}],
				"time" -> Lookup[r, "AbsoluteTiming", 0],
				"document" -> json["params", "textDocument", "uri"]
				|>
			|>;
		sendResponse[result];,

		sendResponse[<|"method" -> "onRunInWolframIO", "params" -> <|"output" -> ToString[$MessageList, InputForm], "input" -> code["code"], "result" -> "Run failed", "load" -> False, "position" -> newPosition, "print" -> json["params", "print"], "hover" -> "Run failed", "messages" -> {}, "time" -> 0, "decoration" -> "Run failed", "document" -> json["params", "textDocument", "uri"]|>|>];
	]
];

resultPatterns = {x_Failure :> x[[1]] <> ": " <> ToString@(x[[2,3,2]])};

Inputs = {};
Outputs = {};
$myShort[expr_, n_:50] := (
	If[StringLength[ToString[expr]] > 2*n,
		StringTake[ToString[expr], n] <> "..." <> StringTake[ToString[expr], -n],
		ToString[expr]
	]
);
evaluateFromQueue[code2_, json_, newPosition_]:=Module[{ast, id,  decorationLine, decorationChar, string, output, successQ, decoration, response, response4, r, result, values, f, maxWidth, time, stack, hoverMessage, file},
	$busy = True;
	Unprotect[NotebookDirectory];
	NotebookDirectory[] = FileNameJoin[
		URLParse[DirectoryName[json["params","textDocument","uri", "external"]]]["Path"]] <> $PathnameSeparator;
	string = code2["code"];


	Which[
		string == "",
		r = <|
			"AbsoluteTiming" -> "0",
			"Result" -> {""},
			"Success" -> True,
			"Messages" -> {},
			"FormattedMessages" -> {}
		|>;
		output = transforms[Null],

		SyntaxQ[string],
		r = evaluateString[Echo[string, "Evaluating: "]];
		output = CheckAbort[
			Which[
				And[Lookup[json["params"], "output", False], KeyExistsQ[r, "FormattedMessages"]],
				(* transforms[ReleaseHold[r["Result"]], r["FormattedMessages"]],*)
				transformsIO[ReleaseHold[r["Result"]], r["FormattedMessages"]],
				Lookup[json["params"], "output", False], 
				transformsIO[ReleaseHold[r["Result"]], {}],
				(* transforms@ReleaseHold[r["Result"]],*)
				True,
				ToString[ReleaseHold[r["Result"]], InputForm, TotalWidth -> 1000]
			], 
			
			Print@"Output evaluation aborted";
			transforms["Aborted"]
		];,
		True,
		r = <|
			"AbsoluteTiming" -> "NA",
			"Result" -> {"Syntax error"},
			"Success" -> False,
			"Messages" -> {},
			"FormattedMessages" -> {}
		|>;
		output = transformsIO["Syntax error", {}];
	];

	{time, {result, successQ, stack}} = {r["AbsoluteTiming"], {CheckAbort[ReleaseHold[r["Result"]], "Aborted on result"], r["Success"], r["Result"]}};
	ans = result;
	hoverMessage = If[
		Or[!KeyExistsQ[r, "FormattedMessages"], Length@r["FormattedMessages"] === 0], 
			TimeConstrained[
				Check["<img src=\"data:image/png;base64," <> 
				ExportString[Rasterize@Short[result,10], {"Base64", "PNG"}, ImageSize->5*72] <> 
				"\" style=\"max-height:190px;max-width:120px;width:100vw\" />", "-Error-"], 

				Quantity[0.5, "Seconds"],

				ToString[result, InputForm, TotalWidth -> 100]
				],
			StringRiffle[Map[ToString[Short[#, 3], InputForm] &, r["FormattedMessages"]], "\n"]
	];
	maxWidth = 8192;
	response = If[KeyMemberQ[json, "id"],
		<|
		"id" -> json["id"],
		"result" -> <|
			"output"-> ToString[output, InputForm], 
			"load" -> Lookup[json["params"], "output", False], (*If[json["params", "output"], True, False],*)
			"result"-> ToString[result /. {Null ->"", "Null" -> ""}, InputForm], 
			"position"-> newPosition,
			"print" -> False,
			"hover" -> StringTake[hoverMessage, 1;;-1],
			"messages" -> r["FormattedMessages"],
			"time" -> time,
			"decoration" -> ToString@time <> ": " <> $myShort[result],
			"document" ->  ""|>,
		"params"-><|
			"input" -> string,
			"output"-> ExportString[output, "JSON"],  
			"load" -> Lookup[json["params"], "output", False], (*If[json["params", "output"], True, False],*)
			"result"-> ToString[result /. {Null ->"", "Null" -> ""}, InputForm], 
			"position"-> newPosition,
			"print" -> False,
			"hover" -> StringTake[hoverMessage, 1;;],
			"messages" -> r["FormattedMessages"],
			"time" -> time,
			"decoration" -> ToString@time <> ": " <> $myShort[result],
			"document" ->  ""|>
		|>,
		<|
		"method"->"onRunInWolfram", 
		"params"-><|
			"input" -> string,
			"output"-> output,  
			"load" -> False, (*Lookup[json["params"], "output", False],*) (*If[json["params", "output"], True, False],*)
			"result"-> "", (* ToString[result, InputForm, CharacterEncoding -> "ASCII"], *)
			"position"-> newPosition,
			"print" -> json["params", "print"],
			"hover" -> StringTake[hoverMessage, 1;;-1],
			"messages" -> r["FormattedMessages"],
			"time" -> time,
			"decoration" -> ToString@time <> ": " <> $myShort[result],
			"document" -> json["params", "textDocument"]["uri"]
			|>
		|>
	];
	evalnumber = evalnumber + 1;
	file = CreateFile[];
	
	Check[BinaryWrite[file, ExportString[response , "JSON"]], Print["Error saving result"]];
	
	Close[file];
	Which[
		KeyMemberQ[json["params"], "expression"],
		sendResponse[<|"id"->json["id"], "result" -> <|
			"input" -> StringReplace[string, {"\\n"->"<br>"}],
			"file"->ToString@file,
			"output"-> output,
			"result" -> ToString[result, InputForm, CharacterEncoding -> "ASCII"]
		|>|>],

		KeyMemberQ[json, "id"],
		sendResponse[<|"id"->json["id"], "params" -> <|
			"input" -> StringReplace[string, {"\\n"->"<br>"}],
			"file"->ToString@file
			|>|>],

		True,
		sendResponse[response]
	];

	(*
	decorationLine = code2["range"][[2, 1]];
	decorationChar = code2["range"][[2, 2]];

	If[!json["params", "print"],
		(* hoverMessage = If[Or[!KeyExistsQ[r, "FormattedMessages"], Length@r["FormattedMessages"] == 0], 
								TimeConstrained[
									Check["<img src=\"data:image/png;base64," <> 
									ExportString[Rasterize@Short[Check[r["Result"], ""],7], {"Base64", "PNG"}, ImageSize->10*72] <> 
									"\" style=\"max-height:190px\" />", "-Error-"], 
									Quantity[2, "Seconds"],
									"Large output"],
					StringRiffle[Map[ToString[#, InputForm, TotalWidth -> 500] &, r["FormattedMessages"]], "\n"]]; *)

		decoration = 
			<|
				"range" -> 	<|
					"start"-><|"line"->decorationLine-1,"character"->decorationChar+10|>,
					"end"-><|"line"->decorationLine-1,"character"->decorationChar+110|>
				|>,
				"renderOptions"-><|
					"after" -> <|
						"contentText" -> "> " <> 
							ToString@time <> 
							"s: " <> 
							ToString[output /. Null ->"-", InputForm, TotalWidth->150, CharacterEncoding -> "ASCII"],
						"backgroundColor" -> If[Length[r["FormattedMessages"]] == 0,"white", "red"],
						"foregroundColor" -> "editorInfo.foreground",
						"margin" -> "0 0 0 10px",
						"borderRadius" -> "2px",
						"border" -> If[Length[r["FormattedMessages"]] == 0, "2px solid blue", "2px solid red"],
						"color" -> "foreground",
						"rangeBehavior" -> 3,
						"textDecoration" -> "none; white-space: pre; border-top: 0px; border-right: 0px; border-bottom: 0px; border-radius: 2px"
					|>,
					"rangeBehavior" -> 4
				|>,
				"hoverMessage" -> hoverMessage(*hoverMessage*),
				"options" -> <| "hoverMessage" -> <|
					"value"-> "Hello" (*hoverMessage*)
				|>|>
			|>;
		*)

		(* 
		workspaceDecorations[
			json["params", "textDocument", "uri", "external"]
		] = If[
			KeyMemberQ[workspaceDecorations, json["params", "textDocument", "uri", "external"]],
			Append[
				workspaceDecorations[json["params", "textDocument", "uri", "external"]], 
				<|ToString@decoration["range"]["start"]["line"]-> decoration|>],
			<|ToString@decoration["range"]["start"]["line"]-> decoration|>
		];
		
		Export[decorationFile, workspaceDecorations, "JSON"]; 

		response4 = <| "method" -> "updateDecorations", "params"-> ToString@decorationFile|>;
		sendResponse[response4];	
		*)

		(* getWorkspaceSymbols[];  *)
	(*]; *)

	
	ast = CodeConcreteParse[string];

	f[node_]:=Module[{},
		symbol = FirstCase[node, LeafNode[Symbol, name_, _] :> name, "var", Infinity, Heads->True];
		(* sourcestart = FirstCase[node, {___, LeafNode[Token`Equal, ___], start_, ___} :> start[[3]][Source][[1]], Infinity]+{0, 1};
		sourceend = node[[3]][Source][[2]];
		definition = getStringAtRange[src, {sourcestart, sourceend}]; *)
		definition = ToExpression[symbol];
		kind = Head@value;
		<|"name" -> symbol, "definition" -> definition, "kind" -> kind|>
	];
	
	symbols = f /@ Cases[ast, BinaryNode[___, {___, LeafNode[Token`Equal, ___], ___}, ___], Infinity];

	values = Association@Table[v["name"] -> ToString[v["definition"], InputForm, TotalWidth->200], {v, symbols}];

	

	(* values = Association@Table[v -> ToString[ToExpression[v], InputForm, TotalWidth->100], {v, Names["Global`*"]}];*)

	Check[
		Export[varTableFile, values, "RawJSON"],
		Print["Error saving variables"]
	];

	result = <| "method"->"updateVarTable", "params" -> <|"values" -> varTableFile |> |>;
	
	sendResponse[
		result
	]; 
	$busy = False;
	sendResponse[<| "method" -> "wolframBusy", "params"-> <|"busy" -> False, "text" -> ""  |>|>];
];

storageUri = "";
handle["storageUri", json_]:=Module[{},
	storageUri = DirectoryName[CreateFile[]];
	sendResponse[
		<|"id" -> json["id"], "result" -> storageUri |>
	]
];

handle["updateConfiguration", json_]:=Module[{messageHandler},
	(* https://mathematica.stackexchange.com/questions/1512/how-to-abort-on-any-message-generated *)
	Internal`AddHandler["Message", (# &)];
	
	messageHandler = If[Last[#], 
		Abort[];Exit[1]
		] &;

	If[json["params", "abortOnError"],
		Quiet@Internal`AddHandler["Message", messageHandler];,
		Quiet@Internal`RemoveHandler["Message", messageHandler];
	]
];

handle["workspace/symbol", json_]:=Module[{response, symbol, symbols},
	symbol = json["params"]["query"];

	symbols = If[symbol != "", Flatten@Select[AllSymbols[[All, "children"]], StringContainsQ[ToString@#["name"], ToString@symbol] &], {}];

	response = <|"id" -> json["id"], "result"->symbols|>;
	sendResponse[response];
];

handle["getFunctionRanges", json_]:=Module[{uri, functions, locations},
	uri = json["params", "external"];
	ast = CodeParse[documents[uri]];

	functions = Cases[ast,CallNode[LeafNode[Symbol,("Set"|"SetDelayed"),_],___,<|Source->s_,"Definitions"->{_}|>]:>s,{1,4}];

	locations = (#-1)&/@functions;
	sendResponse[<|"id"-> json["id"], "result" -> <| "ranges" -> locations |>|>]
];

handle["getChildren", json_]:=Module[{function, result, file},
		(
			function = First[json["params"],"{}"];
			result = TimeConstrained[ToExpression@function, Quantity[10, "Seconds"], {}]/. $Failed -> {};
			file = CreateFile[];
			OpenWrite[file];
			WriteString[file, ExportString[result, "JSON", "Compact" -> True] /. $Failed -> "[]"];
			Close[file];
			sendResponse[<|"id" -> json["id"], "result" -> file|>];
		)
];

handle["runDocumentLive", json_]:=Module[{e, r, uri, functions, locations, lineColumns, ast, charIndeces, evaluations, decorations},
	uri = json["params", "external"];
	ast = CodeParse[documents[uri], SourceConvention -> "LineColumn"];

	lineColumns = Cases[ast,
		CallNode[_,___,<|Source->s_, ___|>]:>s,
		{1,3}];

	ast = CodeParse[documents[uri], SourceConvention -> "SourceCharacterIndex"];

	charIndeces = Cases[ast,
		CallNode[_,___,<|Source->s_, ___|>]:>s,
		{1,3}];

	locations = (#-1)&/@charIndeces;

	functions = (StringTake[documents[uri], #]&/@charIndeces);

	evaluations = (EvaluationData[ToExpression@#])&/@functions;

	decorations = Table[<|
					e = values[[1]];
					r = values[[2]];
					"range" -> 	<|
						"start"-><|"line"->r[[2,1]]-1,"character"->r[[2,2]]+10|>,
						"end"-><|"line"->r[[2,1]]-1,"character"->r[[2,2]]+110|>
					|>,
					"renderOptions"-><|
						"after" -> <|
							"contentText" -> ToString[(ToString[e["Result"] /. Null -> "-"]) <> " (" <> ToString[e["AbsoluteTiming"]] <> " s)", InputForm, TotalWidth->8192, CharacterEncoding -> "ASCII"],
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
				|>, {values, Transpose@{evaluations, lineColumns}}];
	sendResponse[<|
		"method" -> "updateDecorations", "params"-> {decorations}
	|>]
];

handle["runExpression", json_]:=Module[{expr, range, position, newPosition, code, response},
	expr = json["params", "expression"];
	line = json["params", "line"];
	end = json["params", "end"];
	position = <|"line" -> line, "character" -> end |>;

	code = <|
		"code" -> expr, "range" -> <|
			"start" -> position,
			"end" -> position
		|>
	|>;
	(* Add the evaluation to the evaluation queue *)
	Check[
	evaluateFromQueue[code, json, position];
	,
	(
		response = <|"id" -> json["id"], "result" -> <|"error" -> "Error evaluating expression"|>|>;
		sendResponse[response];
	)
	]
	
];

modified = <||>;
handle["didChangeWorkspaceFolders", json_]:=Module[{dir, files},
	files = json["params"][[1]];
	Table[
		If[
			!KeyMemberQ[modified, f["external"]] || 
			(modified[f["external"]] < Information[f]["LastModificationDate"]),
			(
				modified[f["external"]] = Information[f]["LastModificationDate"];
				documents[f["external"]] = Import[f["path"], "Text"];
			)
		],
		{f, files}
	];
];

handle["textDocument/didOpen", json_]:=Module[{},
	lastChange = Now;
	documents[json["params","textDocument","uri"]] = json["params","textDocument","text"];
];

handle["textDocument/didChange", json_]:=Module[{range, oldKeys, oldtext, newtext, changedLines, changedPosition, newLength},
	(* oldLength = StringLength[documents[json["params","textDocument","uri"]]];
	newLength = json["params","contentChanges"][[1]]["text"]; *)
	lastChange = Now;
	
	oldtext = Lookup[documents, json["params","textDocument","uri"], ""];

	newtext = FoldWhile[StringJoin, 
		StringSplit[json["params","contentChanges"][[1]]["text"], "\n"->"\n", All],
		StringContainsQ[oldtext, #1]&];

	changedPosition = Length@StringSplit[newtext, "\n"];

	If[KeyMemberQ[workspaceDecorations, json["params","textDocument"]["uri"]],

		oldKeys = Select[
			Keys@workspaceDecorations[json["params","textDocument"]["uri"]], 
			ToExpression[#] > changedPosition-1 &];

		workspaceDecorations[json["params","textDocument"]["uri"]] = KeyDrop[
			workspaceDecorations[json["params","textDocument"]["uri"]],
			oldKeys
		];
		Export[decorationFile, workspaceDecorations, "JSON"];
	];
	documents[json["params","textDocument","uri"]] = json["params","contentChanges"][[1]]["text"];
	sendResponse[<|"method"->"updateDecorations", "params" -> ToString@decorationFile|>];
];

handle["textDocument/didSave", json_]:=Module[{},
	validate[];
];


handle["textDocument/hover", json_]:=Module[{position, v, uri, src, symbol, value, result, response},
	Check[
		position = json["params", "position"];
		src = documents[json["params","textDocument","uri"]];

		symbol = ToExpression@getWordAtPosition[src, position];
		If[Or[symbol === Null, src === ""],
			sendResponse[<|"id"->Lookup[json["params"], "id", 0], "result"-><|"contents"-><|
				"kind" -> "markdown",
				"value" ->  "No value for symbol: " <> ToString@symbol 
				|>
			|>|>];
			Return[]
		];
		value = TimeConstrained[
			"<img src=\"data:image/png;base64," <> ExportString[Rasterize@Short[symbol,7], {"Base64", "PNG"}] <> "\" width=\"400px\" />", 
			Quantity[0.5, "Seconds"],
			ToString[symbol, TotalWidth->50]];

		result = <|"contents"-><|
				"kind" -> "markdown",
				"value" ->  value 
			|>
		|>;

		If[MemberQ[canceledRequests, json["id"]],
			canceledRequests = DeleteCases[canceledRequests, json["id"]];
			response = <|"error"-><|"code" -> -32800, "message" -> "Request cancelled"|>|>;
			sendResponse[response];
			Return[]
		];
		response = <|"id"->Lookup[json["params"], "id", 0], "result"->(result /. Null -> "")|>;
		sendResponse[response];,

		(
			response = <|"id" -> Lookup[json, "id", 0], "result" -> <|"contents"-><|
				"kind" -> "markdown",
				"value" ->  "Error getting hover" 
				|>
			|>|>;
			sendResponse[response];
		)
	]
];

(* ToDO Fix getChildren for general symbols *)
getChildren[symbol_]:=Map[
	<|
		"label" -> ToString[#],
		"kind" -> 5,
		"children" -> {},
		"lazyload" -> "Map[symbolToTreeItem2, Level[" <> ToString[symbol, InputForm] <> ", {1}]]",
		"icon" -> "symbol-array",
		"collapsibleState" -> 1
	|>&,
	symbol
];

symbolToTreeItem2[symbol_List]:=Table[
     <|
      "label" -> ToString[rows] <> " ... " <> ToString[If[(rows + 9) < Length@symbol, (rows + 9), Length@symbol]],
	  "definition" -> ToString[rows] <> " ... " <> ToString[If[(rows + 9) < Length@symbol, (rows + 9), Length@symbol]],
      "kind" -> "List",
      "children" -> {},
	  "lazyload" -> "Flatten[Map[symbolToTreeItem2, " <> ToString[Take[symbol, {rows, UpTo[rows+9]}], InputForm] <> "], 1]",
	  "icon" -> "symbol-array",
	  "collapsibleState" -> 1
      |>
     , {rows, Range[1, Length@symbol, 10]}];

getChildren[symbol_Association]:= KeyValueMap[<|
      "label" -> ToString[#1, InputForm, TotalWidth -> 500] <> " -> " <> ToString[#2, InputForm, TotalWidth->500],
	  "definition" -> ToString[#2, InputForm, TotalWidth -> 500],
      "kind" -> "Association",
      "children" -> {},
      "lazyload" ->  "getChildren[" <> ToString[#2, InputForm] <> "]",
	  "icon" -> "symbol-struct"
      |> &, symbol];

symbolToTreeItem2[symbol_Association]:= <|
	"label" -> ToString[symbol, InputForm, TotalWidth -> 2500],
	"kind" -> ToString[Head@symbol, InputForm],
	"definition" -> ToString[symbol, InputForm, TotalWidth -> 500] <> ": " <> ToString[symbol, InputForm, TotalWidth -> 300],
	"children" -> {},
    "lazyload" ->  "KeyValueMap[symbolToTreeItem2," <> ToString[symbol] <> "]",
    "icon" -> If[KeyExistsQ[symbolIcons, Head@symbol], symbolIcons[Head@symbol], "symbol-struct"],
	"collapsibleState" -> 1
|>;

symbolToTreeItem2[key_, value_]:=<|
	"label" -> ToString[key, InputForm] <> ": " <> ToString[value, InputForm, TotalWidth -> 1500],
	"kind" -> ToString[Head@value, InputForm],
	"definition" -> ToString[key, InputForm] <> ": " <> ToString[value, InputForm, TotalWidth -> 1500],
	"children" -> {},
    "lazyload" ->  Which[Head@value === List,
		"Map[symbolToTreeItem2," <> ToString@value <> "]",
		Head@value === Association,
		"KeyValueMap[symbolToTreeItem2, " <> ToString@value <> "]",
		True,
		"symbolToTreeItem2[" <> ToString[value, InputForm] <> "]"
	],
    "icon" -> If[KeyExistsQ[symbolIcons, Head@value], symbolIcons[Head@value], "symbol-variable"],
	"collapsibleState" -> 1
|>;

symbolToTreeItem2[symbol_String]:={<|
	"label" -> ToString[symbol, InputForm, TotalWidth ->1500],
	"kind" -> ToString[Head@symbol, InputForm, TotalWidth -> 1500],
	"definition" -> ToString[symbol, InputForm, TotalWidth -> 300],
	"children" -> {},
    "lazyload" -> "",
    "icon" -> "symbol-string",
	"collapsibleState" -> 0
|>};

symbolToTreeItem2[(symbol_Real| symbol_Integer)]:=<|
	"label" -> ToString@symbol,
	"kind" -> ToString@Head@symbol,
	"definition" -> ToString@Short[symbol],
	"children" -> {},
    "lazyload" ->  "",
    "icon" -> "symbol-numeric",
	"collapsibleState" -> 0
|>;

symbolToTreeItem2[symbol_Failure]:=<|
	"label" -> ToString[SymbolName@symbol],
	"kind" -> ToString@Head@symbol,
	"definition" -> ToString@Short[symbol],
	"children" -> {},
    "lazyload" ->  "",
    "icon" -> "warning",
	"collapsibleState" -> 0
|>;
(*
symbolToTreeItem2[symbol_String]:=<|
	"label" -> ToString[SymbolName@symbol],
	"kind" -> ToString@Head@symbol,
	"definition" -> ToString[symbol, InputForm, TotalWidth ->1500],
	"children" -> {},
    "lazyload" ->  "symbolToTreeItem2[" <> ToString[SymbolName@symbol] <> "]",
   "icon" -> If[KeyExistsQ[symbolIcons, Head@symbol], symbolIcons[Head@symbol], "symbol-variable"]
|>;
*)
symbolToTreeItem2[symbol_]:=<|
	"label" -> ToString[symbol, InputForm, TotalWidth -> 300],
	"kind" -> ToString[Head@symbol, InputForm],
	"definition" -> ToString[symbol, InputForm, TotalWidth -> 5000],
	"children" -> {},
	"lazyload" -> "getChildren[" <> ToString[symbol, InputForm] <> "]",
    "icon" -> If[KeyExistsQ[symbolIcons, Head@symbol], symbolIcons[Head@symbol], "symbol-variable"],
	"collapsibleState" -> 0
|>;

symbolToTreeItem2[symbol : Association[Rule["name", _], ___]] := Module[{expr},
  expr = Symbol@symbol["name"];
  <|"label" -> 
    symbol["name"],
   "kind" -> ToString[Head@expr],
   "definition" -> Check[symbol["definition"], ToString@Short[expr]],
   "location" -> <|"uri" -> symbol["uri"], 
     "range" -> <|
       "start" -> <|"line" -> symbol["loc"][[1, 1]] - 1, 
         "character" -> symbol["loc"][[1, 2]] - 1|>, 
       "end" -> <|"line" -> symbol["loc"][[2, 1]] - 1, 
         "character" -> symbol["loc"][[2, 2]] - 1|>|>|>, 
   "children" -> {},
   "lazyload" -> "symbolToTreeItem2[" <> symbol["name"] <> "]",
   "icon" -> If[KeyExistsQ[symbolIcons, Head@expr], symbolIcons[Head@expr], "symbol-variable"],
	"collapsibleState" -> 1
   |>
];

symbolIcons = <|
	List -> "symbol-array",
	Symbol -> "symbol-variable",
	Real -> "symbol-numeric",
	Integer -> "symbol-numeric",
	Complex -> "symbol-numeric",
	String -> "symbol-string"
|>;

getWorkspaceSymbols[]:=Module[{},
		AllSymbols = Flatten@KeyValueMap[Function[{key, value},
			Check[
				<|
					"label" -> FileBaseName@key,
					"kind" -> ToString[String, InputForm],
					"definition" -> ToString[key, InputForm, TotalWidth -> 5000],
					"children" -> Map[symbolToTreeItem2, getSymbols[value, key]],
					"lazyload" -> "Map[symbolToTreeItem2, getSymbols[" <> ToString[value,InputForm] <> ", " <> ToString[key,InputForm] <> "]]",
					"icon" -> "file-code",
					"location" -> <|
						"uri" -> key
					|>,
					"collapsibleState" -> 1
				|>, 
				Nothing]],
				documents
		];
		OpenWrite[symbolListFile];
		Check[
			WriteString[
				symbolListFile,
				Replace[ExportString[AllSymbols, "JSON", CharacterEncoding -> "ASCII"], $Failed -> {}]
			],
			Print["Error saving tree items"]
		];
		Close[symbolListFile];
	sendResponse[<|"method"->"updateTreeItems", "params" -> <|"file"->ToString@symbolListFile|>|>];
];

handle["abort", json_]:=Module[{},
	(* TaskRemove /@ Tasks[];
	AbortKernels[];
	startEvaluators[];
	startHover[]; *)

	Print["Aborting"];
	AbortKernels[];
];

evaluateString["", width_:10000]:={"Failed", False};

evaluateString[string_, width_:10000]:= Module[{r1, r2, f, msgs, msgToStr, msgStr, response, oldContext},

	sendResponse[<|"method" -> "updateInputs", "params" -> <|"input" -> ToString@string|>|>];
	(* Begin["VSCode`"]; *)

		$result = Replace[

					EvaluationData[Trace[ToExpression[string], TraceDepth -> 3]],
					
					$Aborted -> <|"Result" :> "Aborted", "Success" -> False, "FailureType" -> None, 
					"OutputLog" -> {}, "Messages" -> {}, "MessagesText" -> {}, 
					"MessagesExpressions" -> {"Kernel aborted"}, "Timing" -> 0.`, 
					"AbsoluteTiming" -> 0.`, 
					"InputString" :> string|>];
		


		(*$result["Result"] = ($result["Result"] /. Null -> "null"); *)
	(* End[]; *)
	response = StringTake[ToString@ReleaseHold@Last[$result["Result"]], {1, UpTo[8192]}];
	If[response === $Failed, response = "Failed"];
	If[
		$result["Success"], 
		(
			(*
			If[ByteCount[response] > 1*^4, 
				Print@"Output too large to display",
				Print[response];
			];
			*)
			
			
			
			(*sendResponse[<|"method"->"onResult", "params"-><||>|>];*)
			$result["FormattedMessages"] = {};
			$result["Result"] = Last[$result["Result"]];
			$result
		),

		(
			(*
			msgs = $result["MessagesExpressions"];
			msgToStr[name_MessageName, params___]:=Apply[
			StringTemplate[
				If[
					Head@name === MessageName,
					name/.Messages[Evaluate[First[name,General]]],
					First[$result["MessagesText"], "Unknown error"]
				]],params];

			msgToStr[_,_]:="An unknown error was generated";
			msgStr = Quiet@StringTake[Table[
				msgToStr[m[[1,1]],m[[1,2;;]]]<>"<br>",
			{m, msgs}], {1, UpTo@8912}];
			*)
			
			$result["FormattedMessages"] = Map[
				$myShort[OutputForm[#], 200] &, 
				Take[$result["MessagesText"], UpTo[5]]];
			$result["Result"] = Last[$result["Result"]];
			Print["Failed"];
			Print[response];

			(*sendResponse[<|"method"->"window/showMessage", "params"-><|"type"-> 1, 
				"message" -> StringTake[StringRiffle[$result["FormattedMessages"], "\n"], UpTo[500]]|>|>];*)


			$result
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

getCodeAtPosition[src_, position_]:= Module[{tree, pos, call, result1, result2, str},

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

getFunctionAtPosition[src_, position_]:=Module[{symbol, p},
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
			# < 500] &
	];
	symbol
];

getWordAtPosition["", position_]:= "";

getWordAtPosition[src_, position_]:=Module[{srcLines, line, word},
	srcLines =StringSplit[src, EndOfLine, All];
	line = srcLines[[position["line"]+1]];
	word = First[Select[StringSplit[line, RegularExpression["\\W+"]], 
		IntervalMemberQ[Interval[First@StringPosition[line, WordBoundary~~#~~ WordBoundary, Overlaps->False]], position["character"]+1] &], ""];
	
	word
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

constructRPCBytes[_Missing]:= Module[{}, ""];
constructRPCBytes[msg_Association]:=Module[{headerBytes,jsonBytes},
	jsonBytes=ExportByteArray[msg,"RawJSON"];
	headerBytes=StringToByteArray["Content-Length: " <> ToString[Length[jsonBytes], CharacterEncoding->"ASCII"]<>"\r\n\r\n"];
	{headerBytes,jsonBytes}

];

cellToSymbol[node_, uri_]:=Module[{astStr,name,loc,kind,rhs, n},
	n = Check[node[[2,1]], ""];
	If[Head@n === String, 
		Return[<|
			"label"->"na",
			"definition"->"Failed",
			"tooltip"->"Failed",
			"location"->{{0, 0}, {0, 0}},
			"kind"->"symbol-struct", 
			"resourceUri" -> uri,
			"icon" -> "symbol-struct",
			"children" -> {},
			"lazyload" -> "symbolToTreeItem2[" <> "na" <> "]",
			"uri" -> uri
		|>]
	];
	astStr=ToFullFormString[];
	name=First[StringCases[astStr,"$"... ~~ WordCharacter...],""];
	loc=FirstCase[node, <|CodeParser`Source -> x_, ___|>:>x, {{0, 0}, {0, 0}}, Infinity];
	
	(*If[KeyMemberQ[node[[-1]], CodeParser`Source], node[[-1]][CodeParser`Source], Print["missing"]; Print[ToString@node[[-1]]]; {{0,0}, {0, 0}}];*)

	rhs = Check[FirstCase[{node},CodeParser`CallNode[CodeParser`LeafNode[Symbol, ("Set"|"SetDelayed"),___],{_,x_,___},___]:>x, {Missing, "symbol-struct"}, Infinity], {Missing, "symbol-struct"}];

	kind = Check[If[Head@rhs == CodeParser`CallNode,
		rhs[[1,2]],
		rhs[[2]]
	]/.{_If -> "symbol-struct", _CodeParser`CallNode -> "symbol-struct", _CodeParser`LeafNode -> "symbol-struct"}, "symbol-struct"];

	definition = astStr (*getStringAtRange[src,loc+{{0,0},{0,0}}]*);
	<|
		"label"->name,
		"definition"->StringTrim[definition],
		"tooltip"->StringTrim[definition],
		"location"->loc,
		"kind"->kind, 
		"resourceUri" -> uri,
		"icon" -> If[KeyExistsQ[symbolIcons, Head@ToExpression[name]], symbolIcons[Head@symbol], "symbol-struct"],
		"children" -> {},
		"lazyload" -> "symbolToTreeItem2[" <> name <> "]",
		"uri" -> uri
	|>
];

handle["getSymbols", json_]:=Module[{},
	(* ToExpression[json["params"]] *)
	sendResponse[<|"id" -> json["id"], "params" -> <||>|>]
];

getFileSymbols[file_, uri_:""]:=Module[{f, symbols, src},
	src = Import[file, "Text"];
	ast = CodeParse[src]; 
	symbols = cellToSymbol[#, uri] & /@ Cases[ast, CodeParser`CallNode[CodeParser`LeafNode[Symbol,("Set"|"SetDelayed"),_],___],Infinity];
	symbols
];

graphicsQ = 
  FreeQ[Union @@ ImageData @ Image[Graphics[#], ImageSize -> 30], 
    x_ /; x == {1.`, 0.9176470588235294`, 0.9176470588235294`}] &;

graphicHeads = {Point, PointBox, Line, LineBox, Arrow, ArrowBox, Rectangle, RectangleBox, Parallelogram, Triangle, JoinedCurve, Grid, Column, Row, JoinedCurveBox, FilledCurve, FilledCurveBox, StadiumShape, DiskSegment, Annulus, BezierCurve, BezierCurveBox, BSplineCurve, BSplineCurveBox, BSplineSurface, BSplineSurface3DBox, SphericalShell, CapsuleShape, Raster, RasterBox, Raster3D, Raster3DBox, Polygon, PolygonBox, RegularPolygon, Disk, DiskBox, Circle, CircleBox, Sphere, SphereBox, Ball, Ellipsoid, Cylinder, CylinderBox, Tetrahedron, TetrahedronBox, Cuboid, CuboidBox, Parallelepiped, Hexahedron, HexahedronBox, Prism, PrismBox, Pyramid, PyramidBox, Simplex, ConicHullRegion, ConicHullRegionBox, Hyperplane, HalfSpace, AffineHalfSpace, AffineSpace, ConicHullRegion3DBox, Cone, ConeBox, InfiniteLine, InfinitePlane, HalfLine, InfinitePlane, HalfPlane, Tube, TubeBox, GraphicsComplex, Image, GraphicsComplexBox, GraphicsGroup, GraphicsGroupBox, GeoGraphics, Graphics, GraphicsBox, Graphics3D, Graphics3DBox, MeshRegion, BoundaryMeshRegion, GeometricTransformation, GeometricTransformationBox, Rotate, Translate, Scale, SurfaceGraphics, Text, TextBox, Inset, InsetBox, Inset3DBox, Panel, PanelBox, Legended, Placed, LineLegend, Texture};


SetAttributes[compressWithDefinitions, HoldFirst];
compressWithDefinitions[expr_] := With[
    {def = Language`ExtendedFullDefinition[expr]},

    Compress @ Unevaluated[
        Language`ExtendedFullDefinition[] = def;
        expr
    ]
];

EndPackage[];