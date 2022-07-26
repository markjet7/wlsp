(* ::Package:: *)

(* a jupyter kernel for the wolfram language *)
Needs["ZeroMQLink`"];


Begin["`Private`"];

logger = OpenWrite["/Users/mark/Downloads/wlsp_kernel.log"];

Print["Hello"];
args = $ScriptCommandLine;
Print[args];
If[Length[args] > 1,
    config = ToString /@ Import[args[[2]], "RawJSON"],
    config = <|
        "control_port" -> 0,
        "hb_port" -> 0,
        "iopub_port" -> 0,
        "ip" -> "127.0.0.1",
        "key" -> ToString[RandomInteger[{100000,999999}]],
        "shell_port" -> 0,
        "signature_scheme" -> "hmac-sha256",
        "stdin_port" -> 0,
        "transport" -> "tcp"
    |>
];

Print[config];
connection = (*config["transport"] <> "://" <> *)config["ip"] <> ":";
keyString = config["key"];

(* heartbeat *)
heartbeatPort = connection <> config["hb_port"];
ioPubPort = connection <> config["iopub_port"];
controlPort = connection <> config["control_port"];
inputPort = connection <> config["stdin_port"];
shellPort = connection <> config["shell_port"];

ioPubSocket = SocketOpen[ioPubPort, {"ZMQ", "Publish"}];
controlSocket = SocketOpen[controlPort, {"ZMQ", "Router"}];
inputSocket = SocketOpen[inputPort, {"ZMQ", "Router"}];
shellSocket = SocketOpen[shellPort, {"ZMQ", "Router"}];

If[FailureQ[ioPubSocket] || FailureQ[controlSocket] || FailureQ[inputSocket] || FailureQ[shellSocket],
        Print[ioPubSocket];
        Print["Socket Open failure"];
		Quit[];
	];

Print["Sockets Opened"];

ReleaseHold[Replace[Hold@LocalSubmit[
    Get["ZeroMQLink`"];
    Print["Opening Heartbeat socket"];
    hearbeatSocket = SocketOpen[heartbeatPort0, {"ZMQ", "Reply"}];
    If[
        FailureQ[heartbeatSocket], Quit[];
    ];
    While[
        True,
        SocketWaitNext[{heartbeatSocket}];
        hearbeatRecv = SocketReadMessage[heartbeatSocket];
        Write[heartbeatSocket, hearbeatRecv];
    ];,
    HandlerFunctions -> <|"TaskFinished" -> Quit|>
], heartbeatPort0 -> heartbeatPort]];


socketWriteFunction = ZeroMQLink`ZMQSocketWriteMessage;

sendFrame[socket_, frame_Association] :=
    Module[{},
        socketWriteFunction[socket, frame["ident"], "Multipart" -> True
            ];
        socketWriteFunction[socket, StringToByteArray[Echo@#1], "Multipart"
             -> True]& /@ Lookup[frame, {"idsmsg", "signature", "header", "pheader",
             "metadata"}];
        socketWriteFunction[
            socket
            ,
            Echo@If[ByteArrayQ[frame["content"]],
                frame["content"]
                ,
                StringToByteArray[frame["content"]]
            ]
            ,
            "Multipart" -> False
        ];
    ];

hmac[key_String, message_String] :=
    Module[
        {method, blockSize, outputSize, baKey, baMessage, baKeyPrime,
             keyPrime, baOPadded, baIPadded}
        ,
        (* adapted from wikipedia article on HMAC's definition *)
        method = "SHA256";
        blockSize = 64;
        outputSize = 32;
        baKey = StringToByteArray[key];
        baMessage = StringToByteArray[message];
        If[Length[baKey] > blockSize,
            baKeyPrime = Hash[baKey, method, "ByteArray"];
        ];
        If[Length[baKey] < blockSize,
            baKeyPrime = Join[baKey, ByteArray[Table[0, {blockSize - 
                Length[baKey]}]]];
        ];
        keyPrime = Normal[baKeyPrime];
        baOPadded = ByteArray[BitXor[#1, 92]& /@ Normal[keyPrime]];
        baIPadded = ByteArray[BitXor[#1, 54]& /@ Normal[keyPrime]];
        Hash[Join[baOPadded, Hash[Join[baIPadded, baMessage], method,
             "ByteArray"]], method, "HexString"]
    ];

parseMsg[msg_String] :=
    Module[{identLen, header, pheader, metadata, content},
        {identLen, header, pheader, metadata, content} =
            First[
                      (* pick out the values using the expected form  
                    
                    
                    of the
                     frame *)(* see https://jupyter-client.readthedocs
    
    
    .io/en/stable/messaging
                    .html *)StringCases[
                    msg
                    ,
                    Shortest[ident1___] ~~ "<IDS|MSG>" ~~ Shortest[___
                        ] ~~ "{" ~~ Shortest[json2___] ~~ "}" ~~ "{" ~~ Shortest[json3___] ~~
                         "}" ~~ "{" ~~ Shortest[json4___] ~~ "}" ~~ "{" ~~ Shortest[json5___]
                         ~~ "}" ~~ EndOfString :>
                        Prepend[
                            (* add back in the brackets *)(Association[
                                ImportByteArray[StringToByteArray[StringJoin["{", #1, "}"]], "JSON"]]&
                                ) /@ {json2, json3, json4, json5}
                            ,
                            (* use the length of ident1 *)
                            StringLength[ident1]
                        ]
                ]
            ];
        Association["ident" -> StringTake[msg, {1, UpTo[identLen]}], 
            "header" -> header, "content" -> content]
    ];

createReplyFrame[sourceFrame_Association, replyType_String, replyContent
     : (_String | _ByteArray), branchOff : (True | False)] :=
    Module[{header, content, result},
        header = sourceFrame["header"];
        content = sourceFrame["content"];
        (* build reply message *)
                      (* see https://jupyter-client.readthedocs.io/en
            
            
            
                        
            /stable/messaging
            .html for why the following are set as they are *)
        result =
            Association[
                "ident" ->
                    If[KeyExistsQ[sourceFrame, "ident"],
                        sourceFrame["ident"]
                        ,
                        ByteArray[{0, 0, 0, 0, 0}]
                    ]
                ,
                "idsmsg" -> "<IDS|MSG>"
                ,
                "header" -> ExportString[Append[header, {"date" -> DateString[
                    "ISODateTime"], "msg_type" -> replyType, "msg_id" -> StringInsert[StringReplace[
                    CreateUUID[], "-" -> ""], "-", 9]}], "JSON", "Compact" -> True]
                ,
                "pheader" ->
                    If[branchOff,
                        "{}"
                        ,
                        ExportString[header, "JSON", "Compact" -> True
                            ]
                    ]
                ,
                "metadata" -> ExportString[{"text/html" -> {}}, "JSON",
                     "Compact" -> True]
                ,
                "content" -> replyContent
            ];
        (* generate the signature of the reply message *)
        AssociateTo[
            result
            ,
            "signature" ->
                hmac[
                    keyString
                    ,
                    StringJoin[
                        result["header"]
                        ,
                        result["pheader"]
                        ,
                        result["metadata"]
                        ,
                        If[StringQ[result["content"]],
                            result["content"]
                            ,
                            ByteArrayToString[result["content"]]
                        ]
                    ]
                ]
        ];
        (* return the built reply message frame *)
        Return[result];
    ];

handler[status_, state_] :=
    Module[{},
        Print[status];
        Merge[{state, <|"replyMsgType" -> "", "replyContent" -> ""|>},
             Last]
    ];

handler["kernel_info_request", state_] :=
    Module[{result},
        result = <||>;
        result["replyMsgType"] = "kernel_info_reply";
        result["replyContent"] = StringJoin["{\"protocol_version\": \"5.3.0\",\"implementation\": \"wlsp_kernel\",\"implementation_version\": \"0.0.1\",\"language_info\": {\"name\": \"wlsp_kernel\",\"version\": \"13.0\",\"mimetype\": \"application/vnd.wolfram.m\",\"file_extension\": \".m\",\"pygments_lexer\": \"mathematica\",\"codemirror_mode\": \"mathematica\"},\"banner\" : \"",
             "Banner Warning", "\"}"];
        sendFrame[ioPubSocket, createReplyFrame[state, "status", "{\"execution_state\":\"busy\"}", False]];
        Merge[{state, result}, Last]
    ];

handler["is_complete_request", state_] :=
    Module[{result, stringLength, syntaxLength},
        result = <||>;
        result["replyMsgType"] = "is_complete_reply";
        stringLength = StringLength[state["content"]["code"]];
        syntaxLength = SyntaxLength[state["content"]["code"]];
        Which[(* if the above values could not be correctly determined
            
            
            ,
					the completeness status of the code string is unknown *)
            !IntegerQ[stringLength] || !IntegerQ[syntaxLength],
                result["replyContent"] = "{\"status\":\"unknown\"}";
            ,
     (* if the SyntaxLength[] value for a code string is greater than
    
    
     its actual length,
					the code string is incomplete *)syntaxLength > stringLength,
                result["replyContent"] = "{\"status\":\"incomplete\"}"
                    ;
            ,
          (* if the SyntaxLength[] value for a code string is less than
    
    
     its actual length,
					the code string contains a syntax error (or is "invalid") *)syntaxLength
     < stringLength,
                result["replyContent"] = "{\"status\":\"invalid\"}";
            ,
       (* if the SyntaxLength[] value for a code string is equal to its
    
    
     actual length,
					the code string is complete and correct *)syntaxLength == stringLength,
    
                result["replyContent"] = "{\"status\":\"complete\"}";
                    
        ];
        Merge[{state, result}, Last]
    ];

handler["execute_request", state_] :=
    Module[{result, evaluation},
        result = <||>;
        evaluation = EvaluationData[state["content"]["code"]];
        result["replyMsgType"] = "execute_reply";
        result["replyContent"] =
            ExportString[
                Association[
                    "status" -> "ok"
                    ,
                    "execution_count" -> 1
                    ,
                    "user_expressions" -> {}
                    ,
                         (* see https://jupyter-client.readthedocs.io
                        
                        /en/stable
                        /messaging.html#payloads-deprecated *)
                          (* if the "askExit" flag is True, add an "ask_exit"
                        
                        
                         payload *)
                    (* NOTE: uses payloads *)
                    "payload" ->
                        If[False(*loopState["askExit"]*),
                            {Association["source" -> "ask_exit", "keepkernel"
                                 -> False]}
                            ,
                            {}
                        ]
                ]
                ,
                "JSON"
                ,
                "Compact" -> True
            ];
        ioPubReplyContent =
            ExportString[
                Association[
                    (* the first output index *)"execution_count" -> 
                        1
                    ,
                             (* HTML code to embed output uploaded to
                        
                         the Cloud
                         in the Jupyter notebook *)
                    "data" ->
                        {
                            "text/html" ->
                                StringJoin[
       (* display any generated
                                         messages
                                         as inlined PNG images encoded
    
     in base64 *)"<div><img alt=\"\" src=\"data:image/png;base64,"
                                    ,
         (* rasterize the 
                                        generated messages
                                         in a dark red color, and convert
    
     the resulting image to base64*)
                                    BaseEncode[ExportByteArray[Rasterize[
                                        Style[evaluation["Messages"], Darker[Red]]], "PNG"]]
                                    ,
                                    (* end image element *)
                                    "\">"
                                    ,
                                    ExportString[evaluation["Result"],
                                         "HTMLFragment"]
                                    ,
                                    (* end the whole element *)
                                    "</div>"
                                ]
                            ,
                            "text/plain" -> ExportString[evaluation["Result"
                                ], "Text"]
                        }
                    ,
                    (* no metadata *)
                    "metadata" -> {"text/html" -> {}, "text/plain" ->
                         {}}
                ]
                ,
                "JSON"
                ,
                "Compact" -> True
            ];
        ioPubReply = state;
        ioPubReply["replyMsgType"] = "execute_result";
        ioPubReply["replyContent"] = ioPubReplyContent;
        sendFrame[ioPubSocket, createReplyFrame[ioPubReply, ioPubReply[
            "replyMsgType"], ioPubReply["replyContent"], False]];
        Merge[{state, result}, Last]
    ];

readFrame[rawframe_] :=
    Module[{str, frame},
        Print["Message Received"];
        str = Quiet[ByteArrayToString[rawframe]];
        frame = parseMsg[str];
        response = handler[frame["header"]["msg_type"], frame];
        responseFrame = createReplyFrame[response, response["replyMsgType"
            ], response["replyContent"], False] // (Echo[
            #, "Handled"]&);
        Write[logger, responseFrame];
        responseFrame
    ];


While[
    True,
    Print["Reading Messages"];
    Switch[
        readySocket = First[SocketWaitNext[{shellSocket,controlSocket}]],
        (shellSocket | controlSocket),
        rawFrame = SocketReadMessage[readySocket, "Multipart" -> True];
        If[FailureQ[rawFrame], Quit[];];
        Echo@sendFrame[readySocket,readFrame[rawFrame]];,
        _,
        Continue[];
    ];
]


End[];
