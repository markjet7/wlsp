(* ::Package:: *)

BeginPackage["WolframKernel`"];
(* Kernel Start Section *)
(*$HistoryLength = 100;*)
 
(* $SyntaxHandler = Function[Null, Null, HoldAllComplete]; *)

(* ::Package:: *)
(**)


sendResponse[response_Association]:=Module[{byteResponse},
	CheckAbort[
		byteResponse = constructRPCBytes[Prepend[Replace[response, $Failed -> "Failed"],<|"jsonrpc"->"2.0"|>]];
		Map[
			Function[{client},
				If[Head[client] === SocketObject, 
					BinaryWrite[client, # , "Character32"] &/@ byteResponse;
				]
			],
			KERNELSERVER["ConnectedClients"]
		],
		<|"method"->"window/showMessage", "params"-><|"type"-> 1, "message" -> "The kernel tried to abort."|>|>;
		Print["response error"];
		Print[response];
	]
];

(* Off[General::stop]; *)
(* $MessagePrePrint = InputForm; *)

(* $MessagePrePrint = (sendResponse[<| "method" -> "window/showMessage", "params" -> <| "type" -> 4, "message" -> ToString[ReleaseHold@#, InputForm, TotalWidth -> 1000] |> |>]; InputForm@# &); *)
(* $PrePrint = ((sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[#, InputForm] |> |>]; ToString[#, InputForm, TotalWidth -> Infinity]) &); *)


If[Length[$ScriptCommandLine]>1,kernelport=ToExpression@Part[$ScriptCommandLine,2],port=6589];
If[Length[$ScriptCommandLine]>1,$path=Part[$ScriptCommandLine,1],$path=""];
(* Get[DirectoryName[$path] <> "lsp-handler.wl"]; *)
Get[DirectoryName[$path] <> "CodeFormatter.m"];
Get[DirectoryName[$path] <> "lsp-kernels.wl"];

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
SetSystemOptions["ParallelOptions" -> "RelaunchFailedKernels" -> False]; 

logfile = DirectoryName[$path] <> "kernel-wlsp.log";
logfile = DirectoryName[$path] <> "wlsp_kernel.txt";
handleMessage[msg_Association, state_]:=Module[{},
	Check[
		If[KeyMemberQ[msg, "method"],
			If[MemberQ[{"runInWolfram", "runExpression"}, msg["method"]],
				Check[
					handle[msg["method"],msg], 
					sendRespose@<|"method"->"onRunInWolfram", "output"-> "NA", "result" -> "Kernel error", "print" -> False, "document" -> msg["params", "textDocument"]["uri"] |>;
				],
 
				Check[handle[msg["method"], msg],

				Export[logfile, msg, "Text"];
					sendRespose@<|"id"->msg["id"], "result"-> "Kernel error" |>
				]
			]
		];,
		Nothing
		(*Print["Kernel error handling message"];
		Export[logfile, msg];*)
	];
	If[state === "Continue", {"Continue",state}, {"Continue", state}]
];

ReadMessages[x_]:={"Continue", "Continue"};
ReadMessages[client_SocketObject]:=ReadMessagesImpl[client,{{0,{}},{}}];
ReadMessagesImpl[client_SocketObject,{{0,_ByteArray|{}},msgs:{__Association}}]:=msgs;
ReadMessagesImpl[client_SocketObject,{{remainingLength_Integer,remainingByte:(_ByteArray|{})},{msgs___Association}}]:=ReadMessagesImpl[client,(If[remainingLength>0,(*Read Content*)If[Length[remainingByte]>=remainingLength,{{0,Drop[remainingByte,remainingLength]},{msgs,ImportByteArray[Take[remainingByte,remainingLength],"RawJSON"]}},(*Read more*){{remainingLength,ByteArray[remainingByte~Join~Check[SocketReadMessage[client], ByteArray[{}]]]},{msgs}}],(*New header*)Replace[SequencePosition[Normal@remainingByte,RPCPatterns["SequenceSplitPattern"],1],{{{end1_,end2_}}:>({{getContentLength[Take[remainingByte,end1-1]],Drop[remainingByte,end2]},{msgs}}),{}:>((*Read more*){{0,ByteArray[remainingByte~Join~(SocketReadMessage[client]/.x_Failure -> {})]},{msgs}})}]])];


getContentLength[header_ByteArray]:=getContentLength[ByteArrayToString[header,"ASCII"]];
getContentLength[header_String]:=(header//StringCases[RPCPatterns["ContentLengthRule"]]//Replace[{{len_String}:>ToExpression[len],_:>(Quit[1])}])

SetAttributes[wrapper, HoldRest];
wrapper[first_, fin_] := fin;
wrapper[first_, rest__] := wrapper[rest];

socketHandler[{stop_, state_}]:=Module[{},
	Print["Closing socket connection..."];
	Quit[1];
];

handlerWait = 0.02;
flush[socket_]:=While[SocketReadyQ@socket, SocketReadMessage[socket]];

connected2 = False;
$timeout = Now;
Get[DirectoryName[$path] <> "lsp-kernels.wl"]; 
socketHandler[state_]:=Module[{},
	Get[DirectoryName[$path] <> "lsp-kernels.wl"]; 
	Pause[handlerWait];
	If[
		Length@KERNELSERVER["ConnectedClients"] === 0 &&
		Now - $timeout > Quantity[10, "Minutes"],
		Print["Closing kernel connection..."]; Quit[];
	];

	If[Length@KERNELSERVER["ConnectedClients"] > 0,
		$timeout = Now;
	];
	Last[(Replace[
		handleMessageList[ReadMessages[#], state],
		{
			{"Continue", state2_} :> state2,
			{stop_, state2_} :> {stop, state2},
			{} :> state
		}
	] & /@ KERNELSERVER["ConnectedClients"]), "Continue"]
] // socketHandler;

Check[
	KERNELSERVER=SocketOpen[kernelport,"TCP"];
	Replace[KERNELSERVER,{$Failed:>(Print["Cannot start tcp KERNELSERVER."];Quit[1])}];,

	Quit[]];
(* Print[KERNELSERVER];
Print[kernelport]; *)
Print["Kernel ", KERNELSERVER, ": ", kernelport];

Block[{$IterationLimit = Infinity}, 
	socketHandler[state]
];

CloseKernels[];

EndPackage[];
