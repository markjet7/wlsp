(* ::Package:: *)

BeginPackage["wolframLSP`"];

(*$SyntaxHandler = Function[Null, Null, HoldAllComplete];*)
$MessagePrePrint = (ToString["Message: " <> ToString@#, TotalWidth->500, CharacterEncoding->"ASCII"] &);

sendResponse[response_Association]:=Module[{byteResponse},
	Check[
		byteResponse = constructRPCBytes[Prepend[response,<|"jsonrpc"->"2.0"|>]];
		Map[
			Function[{client},
				If[Head[client] === SocketObject, 
					BinaryWrite[client, # , "Character32"] &/@ byteResponse;
				]
			],
			SERVER["ConnectedClients"]
		],
		Print["response error"];
		Print[response];
	]
];

sendResponse[response_Association, client_SocketObject]:=Module[{byteResponse},
	Check[
		byteResponse = constructRPCBytes[Prepend[response,<|"jsonrpc"->"2.0"|>]];
		BinaryWrite[client, # , "Character32"] &/@ byteResponse;
		Print["response error"];
		Print[response];
	]
];

(* Off[General::stop]; *)
(* $MessagePrePrint = InputForm; *)

(* $MessagePrePrint = ((sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[#, InputForm] |> |>];) &); *)
(* $PrePrint = ((sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[#, InputForm] |> |>]; ToString[#, InputForm, TotalWidth -> Infinity]) &); *)


If[Length[$ScriptCommandLine]>1,port=ToExpression@Part[$ScriptCommandLine,2],port=6589];
If[Length[$ScriptCommandLine]>1,$path=Part[$ScriptCommandLine,1],$path=""];
(* Get[DirectoryName[$path] <> "lsp-handler.wl"]; *)
Get[DirectoryName[$path] <> "lsp-handler.wl"];
Get[DirectoryName[$path] <> "CodeFormatter.m"];
Get[DirectoryName[$path] <> "notebook2jupyter.m"];

(* log = OpenWrite["/Users/mark/Downloads/porttest.txt"];
Write[log, port];
Close[log];*)

RPCPatterns=<|"HeaderByteArray"->PatternSequence[__,13,10,13,10],"SequenceSplitPattern"->{13,10,13,10},"ContentLengthRule"->"Content-Length: "~~length:NumberString:>length,"ContentTypeRule"->"Content-Type: "~~type_:>type|>;

Unprotect[FoldWhile];
FoldWhile[f_,x_,list_List,test_]:=FoldWhile[f,Prepend[list,x],test];
FoldWhile[f_,list_List,test_]:=First[NestWhile[Prepend[Drop[#,2],f@@Take[#,2]]&,list,Length[#]>1&&test[First[#]]&]];
Protect[FoldWhile];

handleMessageList[msgs:{___Association}, state_]:=(FoldWhile[(handleMessage[#2, Last[#1]])&,{"Continue", state},msgs,MatchQ[{"Continue", _}]]);
handleMessageList[{"Continue", "Continue"}, state_]:={"Continue", state};

lastChange = Now;

SetSystemOptions["ParallelOptions" -> "MathLinkTimeout" -> 120.];
SetSystemOptions["ParallelOptions" -> "RelaunchFailedKernels" -> True]; 
logfile = DirectoryName[$path] <> "wlsp.txt";

handleMessage[msg_Association, state_]:=Module[{},
	Check[
		handle[msg["method"], msg],
		(*Print["LSP error handling message"];
		Export[logfile, msg];*)
		sendRespose[<|"id"->msg["id"], "result"-> "Failed" |>]
	];
	{"Continue", state}
];

handleMessage[msg_Association, state_, client_]:=Module[{},
	Check[
		handle[msg["method"], msg, client],
		sendRespose[<|"id"->msg["id"], "result"-> "Failed" |>, client]
	];
	{"Continue", state}
];

ReadMessages[_]:={"Continue", "Continue"};
ReadMessages[client_SocketObject]:=ReadMessagesImpl[client,{{0,{}},{}}];
ReadMessagesImpl[client_SocketObject,{{0,_ByteArray|{}}, msgs:{__Association}}]:=msgs;
ReadMessagesImpl[client_SocketObject,{{remainingLength_Integer,remainingByte:(_ByteArray|{})},{msgs___Association}}]:=ReadMessagesImpl[client,(If[remainingLength>0,(*Read Content*)If[Length[remainingByte]>=remainingLength,{{0,Drop[remainingByte,remainingLength]},{msgs,ImportByteArray[Take[remainingByte,remainingLength],"RawJSON"]}},(*Read more*){{remainingLength,ByteArray[remainingByte~Join~Check[SocketReadMessage[client], ByteArray[{}]]]},{msgs}}],(*New header*)Replace[SequencePosition[Normal@remainingByte,RPCPatterns["SequenceSplitPattern"],1],{{{end1_,end2_}}:>({{getContentLength[Take[remainingByte,end1-1]],Drop[remainingByte,end2]},{msgs}}),{}:>((*Read more*){{0,ByteArray[remainingByte~Join~Check[SocketReadMessage[client], ByteArray[{}]]]},{msgs}})}]])];

getContentLength[header_ByteArray]:=getContentLength[ByteArrayToString[header,"ASCII"]];
getContentLength[header_String]:=(header//StringCases[RPCPatterns["ContentLengthRule"]]//Replace[{{len_String}:>ToExpression[len],_:>(Quit[1])}])

SetAttributes[wrapper, HoldRest];
wrapper[first_, fin_] := fin;
wrapper[first_, rest__] := wrapper[rest];

socketHandler[{stop_, state_}]:=Module[{},
	Print["Closing socket connection..." <> ToString@state];
	Quit[1];
];

Get[DirectoryName[$path] <> "lsp-handler.wl"];
handlerWait = 0.01;
handlerWait = 0.05;
flush[socket_]:=While[SocketReadyQ@socket, SocketReadMessage[socket]];

connected = False;
timeout = Now;
Get[DirectoryName[$path] <> "lsp-handler.wl"]; 
Get[DirectoryName[$path] <> "file-transforms.wl"]; 
socketHandler[state_]:=Module[{},
	Get[DirectoryName[$path] <> "lsp-handler.wl"]; 
	Pause[handlerWait];
	If[
		Length@SERVER["ConnectedClients"] === 0 &&
		((Now - timeout) > Quantity[20, "Minutes"]),
		Print["Closing kernel connection..."]; Quit[];
	];

	If[Length@SERVER["ConnectedClients"] > 0,
		timeout = Now;
	];
	Last[(Replace[
		handleMessageList[ReadMessages[#], state],
		{
			{"Continue", state2_} :> state2,
			{stop_, state2_} :> {stop, state2},
			{} :> state
		}
	] & /@ SERVER["ConnectedClients"]), "Continue"]
] // socketHandler;

connect[]:=Check[
	Print[port];
	SERVER=SocketOpen[port,"TCP"];
	Replace[SERVER,{$Failed:>(Print["Cannot start tcp server."]; Quit[1])}];
	Print["LSP ", SERVER, ": ", port];,

	Quit[]];

connect[];

MemoryConstrained[
	Block[{$IterationLimit = Infinity}, 
		CheckAbort[
			socketHandler["Continue"],
			Print["LSP aborted"]; connect[]; socketHandler["Continue"]
		];
	],
	8*1024^3
];
CloseKernels[];

EndPackage[];
