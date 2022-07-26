(* ::Package:: *)
BeginPackage["wolframLSP`"];
If[Length[$ScriptCommandLine]>1,port=ToExpression@Part[$ScriptCommandLine,2],port=6589];
If[Length[$ScriptCommandLine]>1,path=Part[$ScriptCommandLine,1],path=""];

SERVER = SocketConnect[port, "TCP"];
If[(Head@SERVER === SocketObject),
	connected = True;
	handleMessageList[ReadMessages[SERVER], "Continue"];
	Print["Connected: ", ToString@connected];
];
Print["Server: ", ToString@SERVER];


If[StringContainsQ[ToString@SERVER, "Connection refused"],
	Quit[1];
];

If[connected === False,
    Print["Cannot connect to symbols"];
    Quit[1];
];

Replace[SERVER,{$Failed:>(Print["Cannot start tcp server."]; Quit[1])}];

EKernel = First[LaunchKernel[1], Print["Cannot start evaluation kernel."]; Quit[1]];



logfile = "/Users/mark/Downloads/wlsp.txt";
s = OpenAppend[logfile];
WriteString[s, "WolframLSP started at " <> DateString[] <> "\n"];
Close[s];


(* $MessagePrePrint = (ToString["Message: " <> ToString@#, TotalWidth->500, CharacterEncoding->"ASCII"] &); *)

constructRPCBytes[_Missing]:= Module[{}, ""];
constructRPCBytes[msg_Association]:=Module[{headerBytes,jsonBytes},
	jsonBytes=Check[ExportByteArray[msg,"RawJSON"], Print["Export Byte Array failed"]; ExportByteArray[<||>,"RawJSON"]];
	headerBytes=StringToByteArray["Content-Length: " <> ToString[Length[jsonBytes], CharacterEncoding->"ASCII"]<>"\r\n\r\n"];
	{headerBytes,jsonBytes}

];

sendResponse[res_Association]:=Module[{byteResponse},
	Check[
        (*Print["Sending response: " <> ToString[res, CharacterEncoding->"ASCII"]];*)
		byteResponse = constructRPCBytes[Prepend[res,<|"jsonrpc"->"2.0"|>]];
        If[Head[SERVER] === SocketObject, 
            BinaryWrite[SERVER, # , "Character32"] &/@ byteResponse;
        ],
		Print["response error"];
		Print[res];
	]
];

sendResponse[res_Association, client_SocketObject]:=Module[{byteResponse},
	Check[
		byteResponse = constructRPCBytes[Prepend[res,<|"jsonrpc"->"2.0"|>]];
		BinaryWrite[client, # , "Character32"] &/@ byteResponse;
		Print["response error"];
		Print[res];
	]
];

(* Off[General::stop]; *)
(* $MessagePrePrint = InputForm; *)

(*
$MessagePrePrint = ((sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[#, InputForm] |> |>];) &); 
$PrePrint = ((sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[#, InputForm] |> |>]; ToString[#, InputForm, TotalWidth -> Infinity]) &); 
*)



(* Get[DirectoryName[path] <> "lsp-handler.wl"]; *)
Get[DirectoryName[path] <> "lsp-handler.wl"];
(*Get[DirectoryName[path] <> "notebook2jupyter.m"];*)

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
	OpenAppend[logfile];
	Write[logfile, "handleMessage: " <> ToString[msg["method"], CharacterEncoding->"ASCII"]];
	Close[logfile];
	Check[
		handle[msg["method"], msg],
		sendRespose[<|"id"->msg["id"], "result"-> "Failed" |>]
	];
	{"Continue", state}
];

handleMessage[msg_Association, state_, client_]:=Module[{},
	Check[
		handle[msg["method"],msg, client],
		sendRespose[<|"id"->msg["id"], "result"-> "Failed" |>, client]
	];
	{"Continue", state}
];

ReadMessages[x_]:={"Continue", "Continue"};
ReadMessages[client_SocketObject]:=ReadMessagesImpl[client,{{0,{}},{}}];
ReadMessagesImpl[client_SocketObject,{{0,{}}, msgs:{__Association}}]:=msgs;
ReadMessagesImpl[client_SocketObject,{{remainingLength_Integer,remainingByte:(_ByteArray|{})},{msgs___Association}}]:=ReadMessagesImpl[client,(If[remainingLength>0,(*Read Content*)If[Length[remainingByte]>=remainingLength,{{0,Drop[remainingByte,remainingLength]},{msgs,ImportByteArray[Take[remainingByte,remainingLength],"RawJSON"]}},(*Read more*){{remainingLength,ByteArray[remainingByte~Join~SocketReadMessage[client]]},{msgs}}],(*New header*)Replace[SequencePosition[Normal@remainingByte,RPCPatterns["SequenceSplitPattern"],1],{{{end1_,end2_}}:>({{getContentLength[Take[remainingByte,end1-1]],Drop[remainingByte,end2]},{msgs}}),{}:>((*Read more*){{0,ByteArray[remainingByte~Join~SocketReadMessage[client]]},{msgs}})}]])];

getContentLength[header_ByteArray]:=getContentLength[ByteArrayToString[header,"ASCII"]];
getContentLength[header_String]:=(header//StringCases[RPCPatterns["ContentLengthRule"]]//Replace[{{len_String}:>ToExpression[len],_:>(Quit[1])}])

SetAttributes[wrapper, HoldRest];
wrapper[first_, fin_] := fin;
wrapper[first_, rest__] := wrapper[rest];

socketHandler[{stop_, state_}]:=Module[{},
	Print["Closing socket connection..." <> ToString@state];
	(*Quit[1];*)
];

handlerWait = 0.01;
flush[socket_]:=While[SocketReadyQ@socket, SocketReadMessage[socket]];

connected = False;
Get[DirectoryName[path] <> "lsp-handler.wl"]; 
Get[DirectoryName[path] <> "file-transforms.wl"]; 
socketHandler[state_]:=Module[{},
	Pause[handlerWait];
	Get[DirectoryName[path] <> "lsp-handler.wl"]; 
	Get[DirectoryName[path] <> "file-transforms.wl"]; 

	(*
    Last[(Replace[
		handleMessageList[ReadMessages[#], state],
		{
			{"Continue", state2_} :> state2,
			{stop_, state2_} :> {stop, state2},
			{} :> state
		}
	] & /@ SERVER["ConnectedClients"]), "Continue"]
    *)
    Last[
        Replace[
                handleMessageList[ReadMessages[SERVER], state],
            {
                {"Continue", state2_} :> state2,
                {stop_, state2_} :> {stop, state2},
                {} :> state
            }
        ], 
    "Continue"]
] // socketHandler;

(*SERVER=SocketOpen[port,"TCP"];
Replace[SERVER,{$Failed:>(Print["Cannot start tcp server."]; Quit[1])}];*)
connected = False;


Print["Symbols ", SERVER, ": ", port];
Print[Now];

MemoryConstrained[
	Block[{$IterationLimit = Infinity}, 
		socketHandler[state]
	],
	8*1024^3
];
CloseKernels[];

EndPackage[];


