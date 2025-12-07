BeginPackage["wolframLSP`"];

log = OpenWrite["/Users/mark/Downloads/porttest2.txt", TotalWidth->Infinity];
$Output = log;
$process = StartProcess[$SystemShell];
contentPattern = "Content-Length: " ~~ x:DigitCharacter.. ~~ "\r\n\r\n";

sendResponse[res_Association]:=Module[{byteResponse, json, header, msg},
	json = ExportString[Prepend[res, <|"jsonrpc" -> "2.0"|>], "RawJSON", Compact -> False];
	header = "Content-Length: " <> ToString[StringLength[json], CharacterEncoding->"ASCII"] <> "\r\n\r\n";
	msg = header <> json;

	(*Write[stro, msg];*)
	Write[log, msg];
	
	byteResponse = constructRPCBytes[Prepend[res,<|"jsonrpc"->"2.0"|>]];

	str = OpenWrite["!cat"];
	Write["stderr", BinaryWrite[str, #]] &/@ byteResponse;
	Close[str];
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

(* $MessagePrePrint = ((sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[#, InputForm] |> |>];) &); *)
(* $PrePrint = ((sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 4, "message" -> ToString[#, InputForm] |> |>]; ToString[#, InputForm, TotalWidth -> Infinity]) &); *)

If[Length[$ScriptCommandLine]>0,path=Part[$ScriptCommandLine,1],path=""];
(* Get[DirectoryName[path] <> "lsp-handler.wl"]; *)
Get[DirectoryName[path] <> "lsp-handler.wl"];
Get[DirectoryName[path] <> "CodeFormatter.m"];
Get[DirectoryName[path] <> "notebook2jupyter.m"];



RPCPatterns=<|"HeaderByteArray"->PatternSequence[__,13,10,13,10],"SequenceSplitPattern"->{13,10,13,10},"ContentLengthRule"->"Content-Length: "~~length:NumberString:>length,"ContentTypeRule"->"Content-Type: "~~type_:>type|>;

Unprotect[FoldWhile];
FoldWhile[f_,x_,list_List,test_]:=FoldWhile[f,Prepend[list,x],test];
FoldWhile[f_,list_List,test_]:=First[NestWhile[Prepend[Drop[#,2],f@@Take[#,2]]&,list,Length[#]>1&&test[First[#]]&]];
Protect[FoldWhile];

handleMessageList[msgs:{___Association}, state_]:=(FoldWhile[(handleMessage[#2, Last[#1]])&,{"Continue", state},msgs,MatchQ[{"Continue", _}]]);

lastChange = Now;

SetSystemOptions["ParallelOptions" -> "MathLinkTimeout" -> 120.];
SetSystemOptions["ParallelOptions" -> "RelaunchFailedKernels" -> True]; 
logfile = DirectoryName[path] <> "wlsp.txt";

handleMessage[msg_Association, state_]:=Module[{},
	Check[
		handle[msg["method"],msg],
		(*Print["LSP error handling message"];
		Export[logfile, msg];*)
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

ReadMessages[_]:={"Continue", "Continue"};
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
	Quit[1];
];

Get[DirectoryName[path] <> "lsp-handler.wl"];
handlerWait = 1.0;
flush[socket_]:=While[SocketReadyQ@socket, SocketReadMessage[socket]];

connected = False;
$timeout = Now;
Get[DirectoryName[path] <> "lsp-handler.wl"]; 
Get[DirectoryName[path] <> "file-transforms.wl"]; 
msgs = "";


(*Write[log, port];
Close[log];*)

socketHandler[state_]:=Module[{},
Get[DirectoryName[path] <> "lsp-handler.wl"]; 
	Pause[handlerWait];
	str = OpenRead["!cat"];
	m = ReadString[str, EndOfBuffer];
	Close[str];

	If[Head@m === String,
		msgs = StringJoin[msgs, m];
	];
	If[
		Length@StringCases[msgs, contentPattern]>0,
		Write["stderr", "got message"];
		header = First[StringCases[msgs, contentPattern], ""];
		Write["stderr", header];
		length = First[StringCases[msgs, contentPattern :>ToExpression@x], 0];
		msgs = StringReplace[msgs, header->""];
		msg = StringTake[msgs, UpTo@length];
		msgs = StringDrop[msgs, length];

		If[StringLength[msg] === length && length > 0,
			json = Quiet@ImportString[msg, "RawJSON"];
			Write["stderr", json["method"]];
			handle[json["method"], json];
		];

	];
	"Continue"
] // socketHandler;



MemoryConstrained[
	Block[{$IterationLimit = 1000}, 
		socketHandler["Continue"]
	],
	8*1024^3
];
Close[str];
CloseKernels[];

EndPackage[];


