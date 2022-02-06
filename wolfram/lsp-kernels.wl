BeginPackage["WolframKernel`"]
(* ::Package:: *)
 
Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];
Check[Needs["CodeInspector`"], PacletInstall["CodeInspector"]; Needs["CodeInspector`"]]; 

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
	"textDocumentSync"->1
	|>;


handle["initialize",json_]:=Module[{response, response2},
	Print["Initializing Kernel"];
	SetSystemOptions["ParallelOptions" -> "MathLinkTimeout" -> 15.];
	SetSystemOptions["ParallelOptions" -> "RelaunchFailedKernels" -> False];
    CONTINUE = True;
    
	documents = <||>;
	sendResponse@<|"id"->json["id"],"result"-><|"capabilities"->ServerCapabilities|>|>;
	Print["Starting Java"];
	Needs["JLink`"];
	(* 
	<<JavaGraphics`;
	ReinstallJava[CommandLine -> "java", JVMArguments -> "-Xmx4096m"];
	 *)
	evalnumber = 1;
];


handle["shutdown", json_]:=Module[{},
	Print["Stopping Kernels"];
	(* state = "Stop";
	CloseKernels[];
	Close[KERNELSERVER];
	Quit[1];
	Abort[];
	Exit[]; *)
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
	Print["Aborting Kernel"];
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

handle["runInWolfram", json_]:=Module[{range, uri, src, end, workingfolder, code, string, output, newPosition, decorationLine, decorationChar, response, response2, response3},
	range = json["params", "range"];
	uri = json["params", "textDocument"]["uri", "external"];
	src = documents[json["params","textDocument","uri", "external"]];
	end = range["end"];
	workingfolder = DirectoryName[StringReplace[URLDecode@uri, "file:" -> ""]];

	code = getCode[src, range];
	newPosition = <|"line"->code["range"][[2,1]], "character"->0|>;
	(* sendResponse[<|"method" -> "moveCursor", "params" -> <|"position" -> newPosition |>|>]; *)

	(* Add the evaluation to the evaluation queue *)

	evaluateFromQueue[code, json, newPosition]
];

evaluateFromQueue[code2_, json_, newPosition_]:=Module[{id,  decorationLine, decorationChar, string, output, successQ, decoration, response, response4, result, values, f, maxWidth},
		$busy = True;
		sendResponse[<|"method" -> "wolframBusy", "params"-> <|"busy" -> True |>|>];
		Unprotect[NotebookDirectory];
		NotebookDirectory[] = FileNameJoin[
			URLParse[DirectoryName[json["params","textDocument","uri", "external"]]]["Path"]];
		string = StringTrim[code2["code"]];
		If[string=="", 
			{result, successQ} = {"-", True},
			{result, successQ} = evaluateString[string] //. {Short[x_]:> ToString[x, InputForm, TotalWidth->8192]};	
		];

		If[
			successQ,  
			output = transforms[result] /. {Null ->"", "Null" -> ""},
			output = result;
		];
		
		maxWidth = 8192;
		response = If[KeyMemberQ[json, "id"],
			<|
			"id" -> json["id"],
			"result" -> <|
				"output"-> ToString[output, InputForm, TotalWidth->maxWidth], 
				"result"->ToString[result /. {Null ->"", "Null" -> ""}, InputForm, TotalWidth -> maxWidth], 
				"position"-> newPosition,
				"print" -> False,
				"document" ->  ""|>,
			"params"-><|
				"input" -> string,
				"output"-> ToString[output], 
				"result"->ToString[result /. {Null ->"", "Null" -> ""}, InputForm, TotalWidth -> maxWidth], 
				"position"-> newPosition,
				"print" -> False,
				"document" ->  ""|>
			|>,
			<|
			"method"->"onRunInWolfram", 
			"params"-><|
				"input" -> string,
				"output"-> ToString[output], 
				"result"->ToString[result /. {Null ->"", "Null" -> ""}, InputForm, TotalWidth -> maxWidth], 
				"position"-> newPosition,
				"print" -> json["params", "print"],
				"document" ->  json["params", "textDocument"]["uri"]|>
			|>
		];
		evalnumber = evalnumber + 1;
		sendResponse[response];

		decorationLine = code2["range"][[2, 1]];
		decorationChar = code2["range"][[2, 2]];

		If[!json["params", "print"],
			decoration = List[
				<|
					"range" -> 	<|
						"start"-><|"line"->decorationLine-1,"character"->decorationChar+10|>,
						"end"-><|"line"->decorationLine-1,"character"->decorationChar+110|>
					|>,
					"renderOptions"-><|
						"after" -> <|
							"contentText" -> ToString[result /. Null ->"-", InputForm, TotalWidth->8192, CharacterEncoding -> "ASCII"],
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

		src = string; (* documents[json["params", "textDocument", "uri", "external"]]; *)
		ast = CodeConcreteParse[string];


		(* f[node_]:=Module[{astStr,name,fullStr,loc,kind,rhs},
			astStr=ToFullFormString[node[[2,1]]];
			name=StringCases[astStr,"$"... ~~ WordCharacter...][[1]];
			loc=node[[-1]][Source];
			rhs=FirstCase[{node},CallNode[LeafNode[Symbol, ("Set"|"SetDelayed"),___],{_,x_,___},___]:>x,Infinity];
			If[Head@rhs ==CallNode,
			kind = rhs[[1,2]],
			kind = rhs[[2]]
			];
			definition=getStringAtRange[src,loc+{{0,0},{0,0}}];
			<|"name"->name,"definition"->StringTrim[definition],"loc"->loc,"kind"->kind|>]; *)
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

		values = Table[{v["name"], ToString[v["definition"], InputForm, TotalWidth->8192]}, {v, symbols}];
		result = <| "method"->"updateVarTable", "params" -> <|"values" -> values |> |>;
		sendResponse[
			result
		]; 

		$busy = False;
		sendResponse[<| "method" -> "wolframBusy", "params"-> <|"busy" -> False |>|>];
];

handle["getFunctionRanges", json_]:=Module[{uri, functions, locations},
	uri = json["params", "external"];
	ast = CodeParse[documents[uri]];

	functions = Cases[ast,CallNode[LeafNode[Symbol,("Set"|"SetDelayed"),_],___,<|Source->s_,"Definitions"->{_}|>]:>s,{1,4}];

	locations = (#-1)&/@functions;
	sendResponse[<|"id"-> json["id"], "result" -> <| "ranges" -> locations |>|>]
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


handle["textDocument/didOpen", json_]:=Module[{},
	lastChange = Now;
	documents[json["params","textDocument","uri"]] = json["params","textDocument","text"];
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
			
		res = EvaluationData[ToExpression[string]];
		If[
			res["Success"], 
			(
				(* sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Success: " <> ToString[res["Result"], InputForm, TotalWidth->1000] |> |>]; *)
				r1 = {res["Result"], True};
				If[Length@r1 > 2,
					r1 = {Most[r1], True}
				];
				r1
			),

			(
				
				(* sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> ToString[res["Messages"], OutputForm, TotalWidth -> 200, CharacterEncoding->"ASCII"] |> |>]; *)
				f[msg_,val__]:=StringTemplate[msg /. Messages[Evaluate@FirstCase[msg,_Symbol, General]]][val];
				Table[
					r2 = ToString@ReleaseHold[r //. Message :> f];
					sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> ToString[r2, InputForm, TotalWidth->8192, CharacterEncoding->"ASCII"] |> |>];,
					{r, Take[res["MessagesExpressions"],UpTo[3]]}];
								 
				(* {ToString[StringRiffle[Take[res["Messages"],UpTo[3]], "\n"] <> "\n" <> "...", InputForm, TotalWidth -> 1000], False} *)
				{
					(* Check[
						StringRiffle[Join[ToString@ReleaseHold[# //. Message :> f] & /@ Take[res["MessagesExpressions"],UpTo[3]], 
						List@res["Result"]], "\n"], 
					"Errors"],  *)
					res["Result"],
					True
				}
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
		(* SetDirectory[$TemporaryDirectory];
		Export["srcFile.wl", src, "Text"];
		tree=CodeConcreteParse["srcFile.wl"];
		ResetDirectory[]; *)
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
	line == start[[1]] && line==end[[1]], {start[[2]], UpTo@end[[2]]},
	line == start[[1]] && line!=end[[1]], {start[[2]],-1},
	line != start[[1]] && line!=end[[1]], All,
	line != start[[1]] && line==end[[1]], {1, UpTo@end[[2]]}
]};

constructRPCBytes[_Missing]:= Module[{}, ""];
constructRPCBytes[msg_Association]:=Module[{headerBytes,jsonBytes},
	jsonBytes=ExportByteArray[msg,"RawJSON"];
	headerBytes=StringToByteArray["Content-Length: " <> ToString[Length[jsonBytes], CharacterEncoding->"ASCII"]<>"\r\n\r\n"];
	{headerBytes,jsonBytes}

];
EndPackage[]