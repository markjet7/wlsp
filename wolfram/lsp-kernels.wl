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
	SetSystemOptions["ParallelOptions" -> "MathLinkTimeout" -> 120.];
	SetSystemOptions["ParallelOptions" -> "RelaunchFailedKernels" -> True];
    CONTINUE = True;
    
	documents = <||>;
	sendResponse@<|"id"->json["id"],"result"-><|"capabilities"->ServerCapabilities|>|>;
];


handle["shutdown", json_]:=Module[{},
	state = "Stop";
	CloseKernels[];
	Close[SERVER];
	Quit[1];
	Abort[];
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

handle["runInWolfram", json_]:=Module[{range, uri, src, end, workingfolder, code, string, output, newPosition, decorationLine, decorationChar, response, response2, response3},
	range = json["params", "range"];
	uri = json["params", "textDocument"]["uri", "external"];
	src = documents[json["params","textDocument","uri", "external"]];
	end = range["end"];
	workingfolder = DirectoryName[StringReplace[URLDecode@uri, "file:" -> ""]];

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
	(* Add the evaluation to the evaluation queue *)
	evaluateFromQueue[code, json, newPosition]
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
		
		response = <|"method"->"onRunInWolfram", 
			"params"-><|"output"->ToString[output, TotalWidth->5000000], 
				"result"->ToString[result, InputForm, TotalWidth -> 5000000], 
				"position"-> newPosition,
				"print" -> json["params", "print"],
				"document" ->  json["params", "textDocument"]["uri"]|>
			|>;
		
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

evaluateString[string_, width_:10000]:= Module[{res, r}, 
			
		res = EvaluationData[ToExpression[string]];
		If[
			res["Success"], 
			(
				(* sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Success: " <> ToString[res["Result"], InputForm, TotalWidth->1000] |> |>]; *)
				{res["Result"], True}
			),

			(
				
				sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 1, "message" -> ToString[res["Messages"], OutputForm, TotalWidth -> 200, CharacterEncoding->"ASCII"] |> |>];
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
	jsonBytes=ExportByteArray[msg,"RawJSON"];
	headerBytes=StringToByteArray["Content-Length: " <> ToString[Length[jsonBytes], CharacterEncoding->"ASCII"]<>"\r\n\r\n"];
	{headerBytes,jsonBytes}

];

(* Kernel Start Section *)


(* ::Package:: *)
$MessagePrePrint = (ToString[#, TotalWidth->500, CharacterEncoding->"ASCII"] &);

sendResponse[res_Association]:=Module[{byteResponse},
		byteResponse = constructRPCBytes[Prepend[res,<|"jsonrpc"->"2.0"|>]];
		If[Head[client] === SocketObject, 
			BinaryWrite[client, # , "Character32"] &/@ byteResponse;
		]

];

(* Off[General::stop]; *)
(* $MessagePrePrint = InputForm; *)

(* $MessagePrePrint = ((sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[#, InputForm] |> |>];) &); *)
(* $PrePrint = ((sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[#, InputForm] |> |>]; ToString[#, InputForm, TotalWidth -> Infinity]) &); *)


If[Length[$ScriptCommandLine]>1,port=ToExpression@Part[$ScriptCommandLine,2],port=6589];
If[Length[$ScriptCommandLine]>1,path=Part[$ScriptCommandLine,1],path=""];
(* Get[DirectoryName[path] <> "lsp-handler.wl"]; *)
Get[DirectoryName[path] <> "CodeFormatter.m"];

(* log = OpenWrite["/Users/mark/Downloads/porttest.txt"];
Write[log, port];
Close[log];*)

RPCPatterns=<|"HeaderByteArray"->PatternSequence[__,13,10,13,10],"SequenceSplitPattern"->{13,10,13,10},"ContentLengthRule"->"Content-Length: "~~length:NumberString:>length,"ContentTypeRule"->"Content-Type: "~~type_:>type|>;

Unprotect[FoldWhile];
FoldWhile[f_,x_,list_List,test_]:=FoldWhile[f,Prepend[list,x],test];
FoldWhile[f_,list_List,test_]:=First[NestWhile[Prepend[Drop[#,2],f@@Take[#,2]]&,list,Length[#]>1&&test[First[#]]&]];
Protect[FoldWhile];

handleMessageList[msgs:{___Association}, state_]:=(FoldWhile[(handleMessage[#2, Last[#1]])&,{"Continue", state},msgs,MatchQ[{"Continue", _}]]);

lastChange = Now;

SetSystemOptions["ParallelOptions" -> "MathLinkTimeout" -> 120.];
SetSystemOptions["ParallelOptions" -> "RelaunchFailedKernels" -> True]; 

handleMessage[msg_Association, state_]:=Module[{},
	If[KeyMemberQ[msg, "method"],
		If[MemberQ[{"runInWolfram", "runExpression"}, msg["method"]],
			Check[
				Get[DirectoryName[path] <> "transforms.wl"];
				handle[msg["method"],msg], 
				sendRespose@<|"method"->"onRunInWolfram", "output"-> "NA", "result" -> "NA", "print" -> False, "document" -> msg["params", "textDocument"]["uri"] |>;
			],

			Check[handle[msg["method"],msg],
				sendRespose@<|"id"->msg["id"], "result"-> "NA" |>
			]
		]		
	];
	If[state === "Continue", {"Continue",state}, {"Stop", state}]
];

ReadMessages[client_SocketObject]:=ReadMessagesImpl[client,{{0,{}},{}}];
ReadMessagesImpl[client_SocketObject,{{0,{}},msgs:{__Association}}]:=msgs;
ReadMessagesImpl[client_SocketObject,{{remainingLength_Integer,remainingByte:(_ByteArray|{})},{msgs___Association}}]:=ReadMessagesImpl[client,(If[remainingLength>0,(*Read Content*)If[Length[remainingByte]>=remainingLength,{{0,Drop[remainingByte,remainingLength]},{msgs,ImportByteArray[Take[remainingByte,remainingLength],"RawJSON"]}},(*Read more*){{remainingLength,ByteArray[remainingByte~Join~SocketReadMessage[client]]},{msgs}}],(*New header*)Replace[SequencePosition[Normal@remainingByte,RPCPatterns["SequenceSplitPattern"],1],{{{end1_,end2_}}:>({{getContentLength[Take[remainingByte,end1-1]],Drop[remainingByte,end2]},{msgs}}),{}:>((*Read more*){{0,ByteArray[remainingByte~Join~SocketReadMessage[client]]},{msgs}})}]])];


getContentLength[header_ByteArray]:=getContentLength[ByteArrayToString[header,"ASCII"]];
getContentLength[header_String]:=(header//StringCases[RPCPatterns["ContentLengthRule"]]//Replace[{{len_String}:>ToExpression[len],_:>(Quit[1])}])

SetAttributes[wrapper, HoldRest];
wrapper[first_, fin_] := fin;
wrapper[first_, rest__] := wrapper[rest];

socketHandler[{stop_, state_}]:=Module[{},
	Print["Closing socket connection..."];
	Quit[1];
];

handlerWait = 0.001;
flush[socket_]:=While[SocketReadyQ@socket, SocketReadMessage[socket]];

socketHandler[state_]:=Module[{},
	If[SocketReadyQ@client,
		Replace[
			handleMessageList[ReadMessages[client], state],
			{
				{"Continue", state2_} :> state2,
				{stop_, state2_} :> {stop, state2},
				{} :> state
			}
	],
	Pause[handlerWait];
	(* flush[client]; *)
	state
	]
] // socketHandler;

SERVER=SocketOpen[port,"TCP"];
Replace[SERVER,{$Failed:>(Print["Cannot start tcp server."];Quit[1])}];
Print[SERVER];
Print[port];

Block[ {$IterationLimit=Infinity},
	client={};
	While[SameQ[client,{}],
		client=First[SERVER["ConnectedClients"], {}];

		state="Continue";
		
	];
];

Print["Client connected: "];
Print[client];

Block[{$IterationLimit = Infinity}, 

	socketHandler[state]];

listener = SocketListen[
	port,
	Function[{assoc},
		With[{
			data = assoc["Data"]
		},
			SERVER = assoc["SourceSocket"];
			Check[readMessage[data], 
				sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Unhandled Error" |> |>];
			];
		]
	],
	CharacterEncoding -> "UTF8"
];
CloseKernels[];
