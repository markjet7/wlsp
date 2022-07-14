BeginPackage["WolframKernel`"]
(* ::Package:: *)
 
Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];
Check[Needs["CodeInspector`"], PacletInstall["CodeInspector"]; Needs["CodeInspector`"]]; 

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


handle["initialize",json_]:=Module[{response, response2},
	Print["Initializing Kernel"];
	SetSystemOptions["ParallelOptions" -> "MathLinkTimeout" -> 15.];
	SetSystemOptions["ParallelOptions" -> "RelaunchFailedKernels" -> False];
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
	workspaceDecorations = Quiet@Check[Import[decorationFile,"RawJSON"], <||>];
	symbolDefinitions = <||>;
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
handle["runCell", json_]:=Module[{},
	uri = json["params", "textDocument"];
	src = json["params", "source"];

	newPosition = <|"line"->0, "character"->0|>;
	AppendTo[evals, {<| "code" -> src, "range" -> <|
		"start" -> <|"line" -> 1, "character" -> 1 |>,
		"end" -> <|"line" -> 1, "character" -> 1 |>
	|> |>, json, newPosition}];
];

handle["$/cancelRequest", json_]:=Module[{response},
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

handle["runInWolfram", json_]:=Module[{range, uri, src, end, workingfolder, code, string, output, newPosition, decorationLine, decorationChar, response, response2, response3, decoration},
	Check[
		start = Now;
		(*Print["Running: " <> ToString@start];*)
		range = json["params", "range"];
		uri = json["params", "textDocument"]["uri", "external"];
		src = documents[json["params","textDocument","uri", "external"]];
		code = getCode[src, range];
		newPosition = <|"line"->code["range"][[2,1]], "character"->0|>;
		
		decoration = <|
					"range" -> 	<|
						"start"-><|"line"->code["range"][[2,1]]-1,"character"->code["range"][[2,2]]+1096|>,
						"end"-><|"line"->code["range"][[2,1]]-1,"character"->code["range"][[2,2]]+1196|>
					|>,
					"renderOptions"-><|
						"after" -> <|
							"contentText" -> " ... ",
							"backgroundColor" -> "editor.background",
							"foregroundColor" -> "editor.foreground",
							"margin" -> "0 0 0 10px",
							"borderRadius" -> "2px",
							"border" -> "2px solid blue",
							"color" -> "foreground",
							"rangeBehavior" -> 4,
							"textDecoration" -> "none; white-space: pre; border-top: 0px; border-right: 0px; border-bottom: 0px; border-radius: 2px"
						|>,
						"rangeBehavior" -> 4
					|>
				|>;

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

		Print["Decorations " <> ToString[Now - start]];
		(* Add the evaluation to the evaluation queue *)
		evaluateFromQueue[code, json, newPosition];
		,
		workingfolder = DirectoryName[StringReplace[URLDecode@uri, "file:" -> ""]];
	];
];

resultPatterns = {x_Failure :> x[[1]] <> ": " <> ToString@(x[[2,3,2]])};

Inputs = {};
Outputs = {};
evaluateFromQueue[code2_, json_, newPosition_]:=Module[{ast, id,  decorationLine, decorationChar, string, output, successQ, decoration, response, response4, r, result, values, f, maxWidth, time, stack},
	$busy = True;
	(* sendResponse[<|"method" -> "wolframBusy", "params"-> <|"busy" -> True |>|>]; *)
	Unprotect[NotebookDirectory];
	NotebookDirectory[] = FileNameJoin[
		URLParse[DirectoryName[json["params","textDocument","uri", "external"]]]["Path"]] <> "/";
	string = StringTrim[code2["code"]];

	Which[
		string == "",
		r = <|
			"AbsoluteTiming" -> "0",
			"Result" -> {""},
			"Success" -> True,
			"Messages" -> {}
		|>;
		output = transforms[Null],

		SyntaxQ[string],
		r = evaluateString[Echo[string, "Evaluating: "]];
		Print["Evaluated " <> ToString[Now - start]];
		AppendTo[Inputs, string];
		output = transforms[ReleaseHold[Last[r["Result"]]]];
		Print["Transformed " <> ToString[Now - start]];,

		True,
		r = <|
			"AbsoluteTiming" -> "NA",
			"Result" -> {"Syntax error"},
			"Success" -> False,
			"Messages" -> {}
		|>;
		output = transforms["Syntax error"];
	];

	{time, {result, successQ, stack}} = {r["AbsoluteTiming"], {ReleaseHold[Last[r["Result"]]], r["Success"], r["Result"]}};
	ans = result;
	AppendTo[Outputs, ans];
	
	maxWidth = 8192;
	response = If[KeyMemberQ[json, "id"],
		<|
		"id" -> json["id"],
		"result" -> <|
			"output"-> ToString[output, InputForm, TotalWidth->maxWidth], 
			"result"-> ToString[result /. {Null ->"", "Null" -> ""}, InputForm, TotalWidth -> maxWidth], 
			"position"-> newPosition,
			"print" -> False,
			"document" ->  ""|>,
		"params"-><|
			"input" -> string,
			"output"-> ExportString[output, "JSON"], 
			"result"-> ToString[result /. {Null ->"", "Null" -> ""}, InputForm, TotalWidth -> maxWidth], 
			"position"-> newPosition,
			"print" -> False,
			"document" ->  ""|>
		|>,

		<|
		"method"->"onRunInWolfram", 
		"params"-><|
			"input" -> string,
			"output"-> output, 
			"result"-> ToString[result, InputForm, TotalWidth -> maxWidth, CharacterEncoding -> "ASCII"], 
			"position"-> newPosition,
			"print" -> json["params", "print"],
			"document" -> json["params", "textDocument"]["uri"]
			|>
		|>
	];
	Print["Response " <> ToString[Now - start]];
	evalnumber = evalnumber + 1;

	file = CreateFile[];
	Check[WriteString[file, ExportString[response, "JSON"]], Print["Error saving result"]];
	If[KeyMemberQ[json, "id"],
		sendResponse[<|"id"->json["id"], "params" -> <|
		"input" -> string,
		"file"->ToString@file|>|>];,
		sendResponse[<|"method"->"onRunInWolfram", "params" -> <|
		"input" -> string,
		"file"->ToString@file|>|>];
	];
	Close[file];
	Print["Response exported " <> ToString[Now - start]];


	decorationLine = code2["range"][[2, 1]];
	decorationChar = code2["range"][[2, 2]];

	If[!json["params", "print"],
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
							ToString[result /. Null ->"-", InputForm, TotalWidth->8192, CharacterEncoding -> "ASCII"],
						"backgroundColor" -> If[Length[r["Messages"]] == 0,"editor.background", "red"],
						"foregroundColor" -> "editor.foreground",
						"margin" -> "0 0 0 10px",
						"borderRadius" -> "2px",
						"border" -> If[Length[r["Messages"]] == 0, "2px solid blue", "2px solid red"],
						"color" -> "foreground",
						"rangeBehavior" -> 4,
						"textDecoration" -> "none; white-space: pre; border-top: 0px; border-right: 0px; border-bottom: 0px; border-radius: 2px"
					|>,
					"rangeBehavior" -> 4
				|>,
				"hoverMessage" -> StringRiffle[Map[ToString[#, InputForm, TotalWidth -> 8192] &, stack], "\n"]
			|>;

		workspaceDecorations[
			json["params", "textDocument", "uri", "external"]
		] = If[
			KeyMemberQ[workspaceDecorations, json["params", "textDocument", "uri", "external"]],
			Append[
				workspaceDecorations[json["params", "textDocument", "uri", "external"]], 
				<|ToString@decoration["range"]["start"]["line"]-> decoration|>],
			<|ToString@decoration["range"]["start"]["line"]-> decoration|>
		];
		Print["Decorations " <> ToString[Now - start]];
		
		Export[decorationFile, workspaceDecorations, "JSON"];
		Print["Decorations exported " <> ToString[Now - start]];

		response4 = <| "method" -> "updateDecorations", "params"-> ToString@decorationFile|>;
		sendResponse[response4];	

		getWorkspaceSymbols[];
		Print["Got workspace symbols " <> ToString[Now - start]];
	];

	
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

	values = Association@Table[v["name"] -> ToString[v["definition"], InputForm, TotalWidth->150], {v, symbols}];

	

	(* values = Echo@Association@Table[v -> ToString[ToExpression[v], InputForm, TotalWidth->150], {v, Names["Global`*"]}];*)

	Check[
		Export[varTableFile, values, "JSON"],
		Print["Error saving variables"]
	];

	result = <| "method"->"updateVarTable", "params" -> <|"values" -> varTableFile |> |>;
	
	sendResponse[
		result
	]; 

	$busy = False;
	(* sendResponse[<| "method" -> "wolframBusy", "params"-> <|"busy" -> False |>|>]; *)
];

storageUri = "";
handle["storageUri", json_]:=Module[{},
	sendResponse[
		<|"id" -> json["id"], "result" -> DirectoryName[CreateFile[]] |>
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
	RemoteEvaluate[
		(function = Echo[First[json["params"],"{}"],"params"];
		result = Echo@ToExpression@function;
		file = CreateFile[];
		OpenWrite[file];
		WriteString[file, Check[ExportString[result, "JSON"], "[]"]];
		Close[file];
		sendResponse[<|"id" -> json["id"], "result" -> file|>];)
		]
];

handle["runDocumentLive", json_]:=Module[{e, r, uri, functions, locations, lineColumns, ast, chaIndeces, evaluations, decorations},
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
	
	evaluateFromQueue[code, json, position];
	
];

handle["didChangeWorkspaceFolders", json_]:=Module[{dir, files},
	files = json["params"][[1]];
	Table[
		documents[f["external"]] = Import[f["path"], "Text"],
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
	
	oldtext = documents[json["params","textDocument","uri"]];

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
		uri = json["params"]["textDocument"]["uri"];
		src = documents[json["params","textDocument","uri"]];
		symbol = ToString@getWordAtPosition[src, position];
		value = Which[
			symbol === "",
				"",
			If[!(Names[symbol] == {}), Or[graphicsQ@Symbol[symbol], MemberQ[graphicHeads, Head[Symbol[symbol]]]], False],
				Check["<img src=\"data:image/png;base64," <> ExportString[Symbol[symbol], {"Base64", "PNG"}] <> "\" width=\"200\" />", "-Error-"],
			True,
				ToString[symbol, InputForm, TotalWidth -> 8192]
		];

		result = <|"contents"-><|
				"kind" -> "markdown",
				"value" ->  value 
			|>
		|>;

		response = <|"id"->json["id"], "result"->(result /. Null -> "")|>;
		sendResponse[response];,

		response = <|"id"->json["id"], "result"->""|>;
		sendResponse[response];
		
		sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Hover failed for: " <> symbol |> |>];
	];
];


getChildren[symbol_]:={};

symbolToTreeItem2[symbol_List]:=Table[
     <|
      "name" -> ToString[rows] <> " ... " <> ToString[If[(rows + 9) < Length@symbol, (rows + 9), Length@symbol]],
	  "definition" -> ToString[rows] <> " ... " <> ToString[If[(rows + 9) < Length@symbol, (rows + 9), Length@symbol]],
      "kind" -> "List",
      "children" -> {},
	  "lazyload" -> "Map[symbolToTreeItem2," <> ToString[Take[symbol, {rows, UpTo[rows+9]}], InputForm] <> "]",
	  "icon" -> "symbol-array",
	  "collapsibleState" -> 1
      |>
     , {rows, Range[1, Length@symbol, 10]}];

getChildren[symbol_Association]:= KeyValueMap[<|
      "name" -> ToString[#1, InputForm, TotalWidth -> 50] <> " -> " <> ToString[#2, InputForm, TotalWidth->50],
	  "definition" -> ToString[#2, InputForm, TotalWidth -> 50],
      "kind" -> "Association",
      "children" -> {},
      "lazyload" ->  "getChildren[" <> ToString[#2, InputForm] <> "]",
	  "icon" -> "symbol-struct"
      |> &, symbol];

symbolToTreeItem2[symbol_Association]:= ({<|
	"name" -> ToString[symbol, InputForm, TotalWidth -> 250],
	"kind" -> ToString[Head@symbol, InputForm],
	"definition" -> ToString[symbol, InputForm, TotalWidth -> 50] <> ": " <> ToString[symbol, InputForm, TotalWidth -> 300],
	"children" -> {},
    "lazyload" ->  ToString[KeyValueMap[symbolToTreeItem2, symbol], InputForm],
    "icon" -> If[KeyExistsQ[symbolIcons, Head@symbol], symbolIcons[Head@symbol], "symbol-struct"],
	"collapsibleState" -> 1
|>});

symbolToTreeItem2[key_, value_]:=(<|
	"name" -> ToString[key, InputForm] <> ": " <> ToString[value, InputForm, TotalWidth -> 150],
	"kind" -> ToString[Head@value, InputForm],
	"definition" -> ToString[key, InputForm] <> ": " <> ToString[value, InputForm, TotalWidth -> 150],
	"children" -> {},
    "lazyload" ->  "symbolToTreeItem2[" <> ToString[value, InputForm] <> "]",
    "icon" -> If[KeyExistsQ[symbolIcons, Head@value], symbolIcons[Head@value], "symbol-variable"],
	"collapsibleState" -> 1
|>);

symbolToTreeItem2[symbol_String]:={<|
	"name" -> ToString[symbol, InputForm, TotalWidth ->150],
	"kind" -> ToString[Head@symbol, InputForm, TotalWidth -> 150],
	"definition" -> ToString[symbol, InputForm, TotalWidth -> 300],
	"children" -> {},
    "lazyload" -> "",
    "icon" -> "symbol-string",
	"collapsibleState" -> 0
|>};

symbolToTreeItem2[(symbol_Real| symbol_Integer)]:={<|
	"name" -> ToString@symbol,
	"kind" -> ToString@Head@symbol,
	"definition" -> ToString@Short[symbol],
	"children" -> {},
    "lazyload" ->  "",
    "icon" -> "symbol-numeric",
	"collapsibleState" -> 0
|>};

symbolToTreeItem2[symbol_Failure]:=<|
	"name" -> ToString[SymbolName@symbol],
	"kind" -> ToString@Head@symbol,
	"definition" -> ToString@Short[symbol],
	"children" -> {},
    "lazyload" ->  "",
    "icon" -> "warning",
	"collapsibleState" -> 0
|>;
(*
symbolToTreeItem2[symbol_String]:=<|
	"name" -> ToString[SymbolName@symbol],
	"kind" -> ToString@Head@symbol,
	"definition" -> ToString[symbol, InputForm, TotalWidth ->150],
	"children" -> {},
    "lazyload" ->  "symbolToTreeItem2[" <> ToString[SymbolName@symbol] <> "]",
   "icon" -> If[KeyExistsQ[symbolIcons, Head@symbol], symbolIcons[Head@symbol], "symbol-variable"]
|>;
*)
symbolToTreeItem2[symbol_]:=<|
	"name" -> ToString[symbol, InputForm, TotalWidth -> 300],
	"kind" -> ToString[Head@symbol, InputForm],
	"definition" -> ToString[symbol, InputForm, TotalWidth -> 500],
	"children" -> {},
	"lazyload" -> "",
    "icon" -> If[KeyExistsQ[symbolIcons, Head@symbol], symbolIcons[Head@symbol], "symbol-variable"],
	"collapsibleState" -> 0
|>;

symbolToTreeItem2[symbol : Association[Rule["name", _], ___]] := Module[{expr},
  expr = Symbol@symbol["name"];
  <|"name" -> 
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
		RemoteEvaluate[(
			AllSymbols = Flatten@DeleteCases[
				KeyValueMap[{key, value} |->
					<|
						"name" -> FileBaseName@key,
						"kind" -> ToString[String, InputForm],
						"definition" -> ToString[key, InputForm, TotalWidth -> 500],
						"children" -> Map[symbolToTreeItem2, getSymbols[value, key]],
						"lazyload" -> "Map[symbolToTreeItem2, getSymbols[" <> ToString[value, InputForm] <> ", " <> ToString[key,InputForm] <> "]]",
						"icon" -> "file-code",
						"location" -> <|
							"uri" -> key
						|>,
						"collapsibleState" -> 1
					|>,
					documents
				], 
			_Missing];
			OpenWrite[symbolListFile];
			Check[
				WriteString[
					symbolListFile,
					Replace[ExportString[AllSymbols, "JSON"], $Failed -> {}]
				],
				Print["Error saving tree items"]
			];
			Close[symbolListFile];
			)
		];
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

evaluateString[string_, width_:10000]:= Module[{res, r1, r2, f}, 
		res = EvaluationData[Trace@ToExpression[string]];
		If[
			res["Success"], 
			(
				res
			),

			(
				(* f[msg_,val__]:=Apply[StringTemplate[msg /. Messages[Evaluate@FirstCase[msg,_Symbol, Infinity]]],val]; *)
				Table[
					msgs = {Apply[StringTemplate[r[[1, 1]] /. Messages[Evaluate[r[[1, 1, 1]]]]], r[[1, 2]]]};
					
					Table[
						sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> TextString[r2] |>|>];
						sendResponse[<|"method" -> "window/logMessage", "params" -><|"type" -> 4, "message" -> TextString[r2]|>|>];,
						{r2, msgs}
					],
					{r, Take[DeleteDuplicates@res["MessagesExpressions"],UpTo[3]]}];
				res
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
]

(* getCodeAtPosition[src_, position_]:= Module[{tree, pos, call, result1}, *)
getCodeAtPosition[src_, position_]:= Module[{tree, pos, call, result1, result2, str},

		tree = CodeParse[src]; 
		pos = <|"line" -> position["line"]+1, "character" -> position["character"]|>;
		
		call = First[Cases[tree, 
			((x_LeafNode/;inCodeRangeQ[x[[-1]][Source], pos]) | (x_CallNode/;inCodeRangeQ[x[[-1]][Source], pos])),
			{2}], {}];


		result1 = If[call === {},
			<|"code"->"", "range"->{{pos["line"],0}, {pos["line"],0}}|>,
			
			str = getStringAtRange[src, call[[-1]][Source]];
			<|"code"->StringReplace[str, {
 				Shortest[StartOfLine ~~ "(*" ~~ WhitespaceCharacter .. ~~ "::" ~~ ___ ~~ "::" ~~ WhitespaceCharacter .. ~~ "*)"] -> "",
 				Shortest["(*" ~~ ___ ~~ "*)"] -> ""}], "range"->call[[-1]][Source]|>
			
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
			# < 50] &
	];
	symbol
];

getWordAtPosition[src_, position_]:=Module[{srcLines, line, word},


	srcLines =StringSplit[src, EndOfLine, All];
	line = srcLines[[position["line"]+1]];


	word = First[Select[StringSplit[line, RegularExpression["\\W+"]], 
		IntervalMemberQ[Interval[First@StringPosition[line, WordBoundary~~#~~ WordBoundary, Overlaps->False]], position["character"]] &, 1], ""];
	
	word
];

getStringAtRange[string_, range_]:=Module[{sLines, sRanges},
	sLines = StringSplit[string, EndOfLine, All];
	sRanges= getSourceRanges[range];

	StringJoin@Table[
		StringTake[
			StringReplace[
				sLines[[l[[1]]]],
				"\n"->"\n"], 
			l[[2]]],
		{l, sRanges}]
];

getSourceRanges[{start_, end_}]:=Table[
	lineRange[l,start,end],
	{l,start[[1]],end[[1]]}];

lineRange[line_,start_,end_]:= {line, Which[
	line == start[[1]] && line==end[[1]], {start[[2]], UpTo[end[[2]]+1]},
	line == start[[1]] && line!=end[[1]], {start[[2]],-1},
	line != start[[1]] && line!=end[[1]], All,
	line != start[[1]] && line==end[[1]], {1, UpTo[end[[2]]]}
]};

constructRPCBytes[_Missing]:= Module[{}, ""];
constructRPCBytes[msg_Association]:=Module[{headerBytes,jsonBytes},
	jsonBytes=ExportByteArray[msg,"RawJSON"];
	headerBytes=StringToByteArray["Content-Length: " <> ToString[Length[jsonBytes], CharacterEncoding->"ASCII"]<>"\r\n\r\n"];
	{headerBytes,jsonBytes}

];

cellToSymbol[node_]:=Module[{astStr,name,loc,kind,rhs},
	astStr=ToFullFormString[node[[2,1]]];
	name=First[StringCases[astStr,"$"... ~~ WordCharacter...],""];
	loc=node[[-1]][Source];
	rhs=FirstCase[{node},CallNode[LeafNode[Symbol, ("Set"|"SetDelayed"),___],{_,x_,___},___]:>x,Infinity];
	kind=If[Head@rhs == CallNode,
		rhs[[1,2]],
		rhs[[2]]
	];
	definition=getStringAtRange[src,loc+{{0,0},{0,0}}];
	<|
	"name"->name,
	"definition"->StringTrim[definition],
	"loc"->loc,
	"kind"->kind, 
	"uri" -> uri|>];

getSymbols[src_, uri_:""]:=getSymbols[src, uri]=Module[{ast, f, symbols},
	ast = CodeParse[src];



	symbols = cellToSymbol /@Cases[ast, CallNode[LeafNode[Symbol,("Set"|"SetDelayed"),_],___],3];
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

EndPackage[]