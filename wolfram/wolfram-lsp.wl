BeginPackage["wolframLSP`"];

(* ::Package:: *)


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
Get[DirectoryName[path] <> "lsp-handler.wl"];
Get[DirectoryName[path] <> "CodeFormatter.m"];

(* log = OpenWrite["/Users/mark/Downloads/porttest.txt"];
Write[log, port];
Close[log];*)

RPCPatterns=<|"HeaderByteArray"->PatternSequence[__,13,10,13,10],"SequenceSplitPattern"->{13,10,13,10},"ContentLengthRule"->"Content-Length: "~~length:NumberString:>length,"ContentTypeRule"->"Content-Type: "~~type_:>type|>;

FoldWhile[f_,x_,list_List,test_]:=FoldWhile[f,Prepend[list,x],test];
FoldWhile[f_,list_List,test_]:=First[NestWhile[Prepend[Drop[#,2],f@@Take[#,2]]&,list,Length[#]>1&&test[First[#]]&]];

handleMessageList[msgs:{___Association}, state_]:=(FoldWhile[(handleMessage[#2, Last[#1]])&,{"Continue", state},msgs,MatchQ[{"Continue", _}]]);

lastChange = Now;
handleMessage[msg_Association, state_]:=Module[{},

	If[KeyMemberQ[msg, "method"],
		handle[msg["method"],msg];
	];
	If[state === "Continue", {"Continue",state}, {"Stop", state}]];

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

Block[{$IterationLimit = Infinity}, socketHandler[state]];












(* MSGBUFFER = "";
COMPLETIONS = Import[DirectoryName[path] <> "completions.json", "RawJSON"];
DETAILS = Import[DirectoryName[path] <> "details.json", "RawJSON"];
SERVER = SocketOpen[port, "TCP"];
client = SocketConnect[SERVER];
  Reap[While[SocketReadyQ[client], Sow[readMesssage[ByteArrayToString@SocketReadMessage[client]]]; 
    Pause[0.01]]];
*)
listener = SocketListen[
	port,
	Function[{assoc},
		With[{
			data = assoc["Data"]
		},
			Get[DirectoryName[path] <> "lsp-handler.wl"];
			SERVER = assoc["SourceSocket"];
			readMessage[data];
		]
	],
	CharacterEncoding -> "UTF8"
];
*)
(* SetOptions[listener,HandlerFunctionsKeys->{"DataBytes"}]; *)

(* task = ZeroMQLink`Private`$AsyncState["Task"];
WaitAsynchronousTask[task];
Print["Exiting..."]; *)

(*
startServer[port_]:=Module[{},
	If[Head@SERVER==SocketObject, Close@SERVER];
	<<lsp-handler.wl;
	MSGBUFFER = "";
	SERVER=SocketOpen[port];
	CONTINUE = True;
	NestWhile[
		(If[Length@SERVER["ConnectedClients"]>0, <<lsp-handler.wl; Pause[0.1]; readMessage[SocketReadMessage[First[SERVER["ConnectedClients"]]]]]; CONTINUE ) &, 
		CONTINUE, 
		TrueQ];
];

startListener[port_]:=Module[{},
	If[Head@SERVER==SocketObject, Close@SERVER];
	MSGBUFFER = "";
	listener = SocketListen[port,readMessage[ByteArray@#DataBytes]&];
	SERVER=listener["Socket"];
	SetOptions[listener,HandlerFunctionsKeys->{"DataBytes"}];
];
*)
(* If[Length[$ScriptCommandLine] > 0,
	startServer[ToExpression[$ScriptCommandLine[[2]]]]; Print["Starting Server"],
	startServer[6579]
];  *)
(* startServer[6579]; *)

(*startListener[6589];*)
EndPackage[];