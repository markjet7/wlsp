BeginPackage["wolframLSP`"];

(* ::Package:: *)
$MessagePrePrint = (ToString["Message: " <> ToString@#, TotalWidth->500, CharacterEncoding->"ASCII"] &);

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
Get[DirectoryName[path] <> "lsp-handler.wl"];
Get[DirectoryName[path] <> "CodeFormatter.m"];
Get[DirectoryName[path] <> "notebook2jupyter.m"];

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
	Print[msg];
	If[KeyMemberQ[msg, "method"],
		If[MemberQ[{"runInWolfram", "runExpression"}, msg["method"]],
			Check[
				handle[msg["method"],msg], 
				sendRespose@<|"method"->"onRunInWolfram", "output"-> "NA", "result" -> "NA", "print" -> False, "document" -> msg["params", "textDocument"]["uri"] |>;
			],

			Check[handle[msg["method"],msg],
				Print[msg];
				(* sendRespose@<|"id"->msg["id"], "result"-> "NA" |> *)
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

Get[DirectoryName[path] <> "lsp-handler.wl"];
handlerWait = 0.01;
flush[socket_]:=While[SocketReadyQ@socket, SocketReadMessage[socket]];

socketHandler[state_]:=Module[{},
	If[Head@client === SocketObject,
		If[SocketReadyQ@client,
			Get[DirectoryName[path] <> "lsp-handler.wl"]; 
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
		],
		Pause[0.1];
		client=First[SERVER["ConnectedClients"], {}];
		If[Head[client] === SocketObject, 
			Print["LSP client connected: " <> ToString@client];
		];
	];
] // socketHandler;

SERVER=SocketOpen[port,"TCP"];
Replace[SERVER,{$Failed:>(Print["Cannot start tcp server."];Quit[1])}];
Print[SERVER];
Print[port];

MemoryConstrained[
	Block[{$IterationLimit = Infinity}, 
			socketHandler[state]
	];,
	8*1024^3
];

(*
listener = SocketListen[
	port,
	Function[{assoc},
		With[{
			data = assoc["Data"]
		},
			(* Get[DirectoryName[path] <> "lsp-handler.wl"]; *)
			SERVER = assoc["SourceSocket"];
			Check[readMessage[data], 
				Print["Unhandled error"];
				sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> "Unhandled Error" |> |>];
			];
		]
	],
	CharacterEncoding -> "UTF8"
];
*)
CloseKernels[];

EndPackage[];