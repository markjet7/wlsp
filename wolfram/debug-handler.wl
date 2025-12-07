(* ::Package:: *)

BeginPackage["wolframDebugger`"];


(* ::Package:: *)
(**)


Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];
Check[Needs["CodeInspector`"], PacletInstall["CodeInspector"]; Needs["CodeInspector`"]]; 
Needs["CodeParser`Scoping`"];
 
scriptPath = DirectoryName@ExpandFileName[First[$ScriptCommandLine]]; 
(* Get[scriptPath <> "/CodeFormatter.m"]; *)


contentLengthPattern[] := "Content-Length: "~~length:NumberString~~"\r\n\r\n";
contentPattern[length_]:= (("Content-Length: "~~ToString@length~~"\r\n\r\n"~~content1:Repeated[_,{length}]) | (content2:Repeated[_,{length}]~~"Content-Length: "~~ToString@length~~"\r\n\r\n"));


handle["initialize", json_]:=Module[{response},
    $source = "";
    $currentFile = "";
    $breakpoints = <||>;
    $breakAddresses = <||>;
    $output0 = "";
    $currentLine = 1;
    $currentChar = 1;
    $currentExpression = 1;
    $currentLevel = 2;
    $variablesReference = 1;
    $variableReferences = <||>;
    $sourceLines = {};
    $scopes = {};
    $SymbolTable = <|"wolframDebugger`" -> {}|>;
    $stackFrames = {};
    $ReferenceTable = <||>;
    $variableReferences["Global"] = <|
            "variables"-><|
                "indexed"->{},
                "named"->{}
            |>
        |>;
    $NewSymbol = (($SymbolTable =
        Merge[{$SymbolTable, <|#2 -> #1|>}, Flatten]
    )&);
    CONTINUE = True;
    response = <|
        "type"->"response", 
        "request_seq"->json["seq"],
        "command"->json["command"],
        "success"->True,
        "body"-><|
			"supportsConfigurationDoneRequest" -> True,
			"supportsEvaluateForHovers" -> True
        |>|>;
	sendResponse[response];	

    sendResponse[<|
        "type"->"event",
        "event"->"initialized"|>];
];

handle["configurationDone", json_]:=(
    sendResponse[<|
        "type"->"response", 
        "request_seq"->json["seq"],
        "command"->json["command"],
        "success"->True,
        "body"-><||>|>];
    sendResponse[<|
        "type"->"event",
        "event"->"stopped",
        "body"-><|
            "reason"->"pause",
            "threadId"->1,
            "allThreadsStopped"->True
        |>|>];
);

handle["launch", json_]:=(
    sendResponse[<|
        "type"->"response", 
        "request_seq"->json["seq"],
        "command"->json["command"],
        "success"->True,
        "body"-><||>|>];

    loadSource[json];

    scopes0 = DeleteDuplicates@$scopingData[[All, 2, 1]];

    varRef = 1;

    $scopes = {<|
            "name"->"Global",
            "variablesReference"->varRef,
            "expensive"->False,
            "namedVariables" -> Length[Names["wlsp`*"]],
            "indexedVariables" -> 0
        |>};
    varRef = varRef + 1;

    $variableReferences["Global"] = <|
            "varRef" -> 1,
            "name" -> "Global",
            "variables"-><|
                "indexed"->{},
                "named"->Names["wlsp`*"]
            |>
        |>; 


    $stackFrames = {
        <|
            "id"->Length@$stackFrames,
            "name"->ToSourceCharacterString@expr,
            "source"-><|"name"->FileBaseName@$currentFile, "path"->$currentFile|>,
            "line"->expr[[-1]][Source][[1, 1]],
            "column"->expr[[-1]][Source][[1, 2]],
            "endLine"->expr[[-1]][Source][[2, 1]],
            "endColumn"->expr[[-1]][Source][[2, 2]]
        |>
    };
    $currentExpression = $currentExpression + 1; 

    If[
        json["arguments"]["stopOnEntry"] === True,
        step["stopOnEntry"];,

        (* run to breakpoint or end of file *)
        $breakpoints[$currentFile] = {};
        step["stopOnBreakpoint"];
        (* ToDo: run file *)
    ];
);

handle["attach", json_]:=(
    sendResponse[<|
        "type"->"response", 
        "request_seq"->json["seq"],
        "command"->json["command"],
        "success"->True,
        "body"-><||>|>];

    sendResponse[<|
        "type"->"event",
        "event"->"process",
        "body"-><|
            "name"->"wolframscript",
            "systemProcessId"->"7777",
            "isLocalProcess"->True,
            "startMethod"->"attach"
        |>|>];

    sendResponse[<|
        "type"->"event",
        "event"->"thread",
        "body"-><|
            "reason"->"wolframscript",
            "threadId"->1
        |>|>];
);

loadSource[json_]:=Module[{},

    If[KeyExistsQ[json["arguments"], "program"],
        $currentFile = json["arguments"]["program"]
    ];

	Unprotect[NotebookDirectory];
    NotebookDirectory[] = DirectoryName@$currentFile;
    $source = Import[$currentFile, "Text"];
    $codeConcreteParse = CodeConcreteParse[$source];
    $expressions = Cases[
        $codeConcreteParse, 
        x:(_CallNode|_BinaryNode), 
        {$currentLevel, $currentLevel+2}];
    expr = $expressions[[$currentExpression]];

    $codeParse = CodeParse[$source];
    $scopingData = ScopingData[$codeParse];
];

handle["loadSource", json_]:=Module[{},
    If[FileExistsQ[json["arguments"]["program"]],


        $source = Import[json["arguments"]["program"], "Text"];
        $sourceLines = StringSplit[$source, EndOfLine];
    ]
];

handle["verifyBreakpoints", json_]:=Module[{},
    bps = If[
        KeyMemberQ[$breakpoints, json["arguments"]["program"]],
        $breakpoints[json["arguments"]["program"]],
        {}
    ];

    Table[
        If[
            bp["line"] < Length@$sourceLines,
            srcLine = $sourceLines[[bp["line"]]];

            If[
                StringLength[srcLine[[bp["line"]]]] === 0,
                bp["line"] = bp["line"] + 1,
                bp["verified"] = True;
                sendResponse[<|"method"->"breakpointValidated", "arguments"->bp|>];

            ];,
            Nothing
        ],
        {bp, bps}
    ];

];

handle["step", json_]:=Module[{},
    handle["run", json];
];

handle["run", json_]:=Module[{},
    If[json["arguments"]["reverse"] === True,
        Table[
            If[
                fireEventsForExpression[ln, json["arguments"]["stepEvent"]],
                $currentLine = ln;
                Return["Exit", Table]
            ],
            {ln, Range[$currentLine, 1, -1]}
        ];
        $currentLine = 1;
        sendResponse[<|"method"->"stopOnEntry", "arguments"->{}|>];,

        Table[
            If[
                fireEventsForExpression[ln, json["arguments"]["stepEvent"]],
                $currentLine = ln;
                Return["Exit", Table]
            ],
            {ln, Range[$currentLine, Length@StringSplit[$source, EndOfLine], 1]}
        ];
        sendResponse[<|"method"->"end", "arguments"->{}|>];
    ];
];

handle["continue", json_]:=Module[{},
    step["stopOnBreakpoint"];
];

handle["stack", json_]:=Module[{},
    (* 
        frames = {
            <|
                "index" -> 0,
                "name" -> "main",
                "source" -> $source,
                "line" -> $currentLine
            |>
        }
    *)
    Nothing

];

handle["getBreakpoints", json_]:=Module[{},
    l = $sourceLines[[json["arguments"]["line"]]];
    bps = StringPosition[l, " "][[All, 1]];
];

handle["setBreakPoint", json_]:=Module[{},
    bp = <|"line"->json["arguments"]["line"], "verified"->False|>;
    bps = If[KeyExistsQ[$breakpoints,json["arguments"]["program"]],
        $breakpoints[json["arguments"]["program"]],
        $breakpoints[json["arguments"]["program"]] = {};
        {}
    ];

    AppendTo[bps, bp];
    $breakpoints[json["arguments"]["program"]] = bps;

    handle["verifyBreakpoints", json];

];

handle["setBreakpoints", json_]:=Module[{},
    loadSource[json];
    $breakpoints[json["arguments"]["source"]["path"]] = json["arguments"]["breakpoints"];

    sendResponse[
        <|
        "type"->"response", 
        "request_seq"->json["seq"],
        "success"->True,
        "command"->json["command"],
        "body"-><|"breakpoints"->json["arguments"]["breakpoints"]|>|>
    ];
];

handle["threads", json_]:=(
    sendResponse[<|
        "type"->"response", 
        "request_seq"->json["seq"],
        "command"->json["command"],
        "success"->True,
        "body"-><|"threads"->{<|"id"->1, "name"->"wolframscript"|>}|>|>];
);

handle["stackTrace", json_]:=(
    sendResponse[<|
        "type"->"response", 
        "request_seq"->json["seq"],
        "command"->json["command"],
        "success"->True,
        "body"-><|"stackFrames"->$stackFrames|>|>];
);

handle["next", json_]:=(
    sendResponse[
        <|
        "type"->"response", 
        "request_seq"->json["seq"],
        "command"->json["command"],
        "success"->True,
        "body"-><||>|>];
    step["stopOnStep"];

);

handle["evaluate", json_]:=(
    sendResponse[<|
        "type"->"response", 
        "request_seq"->json["seq"],
        "command"->json["command"],
        "success"->True,
        "body"-><|
            "result"->ToString@ToExpression[json["arguments"]["expression"]], "variablesReference"->0|>|>];
);

handle["clearBreakPoint", json_]:=Module[{},
    bps = If[KeyExistsQ[$breakpoints,json["arguments"]["program"]],
        $breakpoints[json["arguments"]["program"]],
        $breakpoints[json["arguments"]["program"]] = {};
        {}
    ];

    bps = DeleteCases[bps, <|"line"->json["arguments"]["line"], "verified"-> _|>];
    $breakpoints[json["arguments"]["program"]] = bps;

    handle["verifyBreakpoints", json];
];

handle["clearBreakPoints", json_]:=Module[{},
    $breakpoints[json["arguments"]["program"]] = {};
];

handle["setDataBreakPoint", json_]:=Module[{},
    AppendTo[$breakAddresses, json["arguments"]["address"]];

];

handle["clearAllDataBreakPoints", json_]:=Module[{},
    $breakAddresses = {};
];

handle["disconnect", json_]:=(
    Quit[]
);


start[program_, stopOnEntry_]:=(
    $currentLine = 1;
    $scopes = {};
    (* ToDo: verify breakpoints *)
    If[
        stopOnEntry,
        step["stopOnStep"],
        step["stopOnBreakpoint"]
    ];
);

step["stopOnEntry"]:=(
    $currentLine = 1;
    $currentChar = 1;
    $currentExpression = 1;
    sendResponse[
        <|
            "type"->"event",
            "event"->"stopped",
            "body"-><|"reason"->"entry", "threadId"->1|>
        |>
    ]
);

step["stopOnStep"]:=Module[{},
    If[
        $currentLine > Length@StringSplit[$source, EndOfLine],
        sendResponse[
            <|"method"->"end", "arguments"->{}|>
            ];
        Return[];
    ];
    
    If[$currentExpression > Length@$expressions,
        sendResponse[<|"method"->"end", "arguments"->{}|>];
        Return[];
    ];

    $currentLine = $expressions[[$currentExpression]][[-1]][Source][[2, 1]];
    $currentChar = $expressions[[$currentExpression]][[-1]][Source][[2, 2]];

    fireEventsForExpression[$expressions[[$currentExpression]], "stopOnStep"];
];

step["stopOnBreakpoint"]:=Module[{},
    nextBreakpoint = SelectFirst[
        SortBy[$breakpoints[$currentFile], #["line"] &],
        #["line"] > $currentLine &,
        <|"line" -> StringCount[$source, EndOfLine], "verified"->False|>
    ];

    exprs = Select[
        $expressions,
        $currentLine <= #[[-1]][CodeParser`Source][[1,1]] &&
        #[[-1]][CodeParser`Source][[1,1]] <= nextBreakpoint["line"] &
    ];

    $Context = "wlsp`";
    Map[
        (output0 = ReplaceAll[ToExpression[ToSourceCharacterString[#]], {$Failed -> "Failed", $Aborted -> "Aborted"}];
        sendResponse[
            <|
                "type"->"event",
                "event"->"output",
                "body"-><|
                "output"->ToString@$output0, 
                "category"->"stdout", 
                "threadId"->1|>
            |>
        ];)&,
        exprs
    ];

    updateScopesVariables[];

    $currentExpression = First[Flatten@Position[
        $expressions,
        Last[exprs, Last@$expressions]], Length@$expressions];
    expr = $expressions[[$currentExpression]];
    $currentLine = expr[[-1]][Source][[1,1]];
    $currentChar = expr[[-1]][Source][[1,2]];
    $stackFrames = {
        <|
            "id"->Length@$stackFrames,
            "name"->ToSourceCharacterString@expr,
            "source"-><|"name"->FileBaseName@$currentFile, "path"->$currentFile|>,
            "line"->expr[[-1]][Source][[1, 1]],
            "column"->expr[[-1]][Source][[1, 2]],
            "endLine"->expr[[-1]][Source][[2, 1]],
            "endColumn"->expr[[-1]][Source][[2, 2]]
        |>
    };

    sendResponse[
            <|
            "type"->"event", 
            "event"->"stopped",
            "body"-><|"reason"->"breakpoint", "threadId"->1|>|>
    ];
];

handle["scopes", json_]:=(
    sendResponse[Echo@<|
        "type"->"response", 
        "request_seq"->json["seq"],
        "command"->json["command"],
        "success"->True,
        "body"-><|
            "scopes"->$scopes
        |>|>];
);

handle["variables", json_]:=Module[{start}, (

    expr = $expressions[[$currentExpression]];

    start = If[
        KeyExistsQ[json["arguments"], "start"],
        json["arguments"]["start"]+1,
        1];

    count = If[
        KeyExistsQ[json["arguments"], "count"],
        json["arguments"]["count"],
        Length@vars["namedVariables"]
    ];

    filter = If[
        KeyExistsQ[json["arguments"], "filter"],
        filter,
        All
    ];


    vars = Flatten@Values[SelectFirst[
        $variableReferences,  
        #["varRef"] === json["arguments"]["variablesReference"] &,
        $variableReferences["Global"]
    ][["variables", filter]]];

    sendResponse[
        <|
            "type"->"response", 
            "request_seq"->json["seq"],
            "command"->json["command"],
            "success"->True,
            "body"-><|
                "variables"->MapIndexed[
                    If[
                        KeyExistsQ[$variableReferences, #],
                        <|
                            "name"->$variableReferences[#]["name"],
                            "value"->ToString[ToExpression[$variableReferences[#]["name"]], InputForm, TotalWidth->100],
                            "type"->ToString[Head@ToExpression[$variableReferences[#]["name"]]],
                            "evaluateName"->$variableReferences[#]["name"],
                            "variablesReference"->If[AtomQ[Symbol[ToString@#]], 0, $variableReferences[#]["varRef"]]
                        |>,
                        <|
                            "name" -> ToString@First[#2],
                            "value" -> ToString[#, InputForm, TotalWidth->100],
                            "type" -> ToString@Head@#,
                            "evaluateName"->ToString[#, InputForm, TotalWidth->500],
                            "variablesReference"->0
                        |>
                    ] &,
                    vars
                ]
            |>
        |>
    ];
)];

updateScopesVariables[]:=Module[{},

    $scopes = {<|
        "name"->"Global",
        "variablesReference"->1,
        "expensive"->False,
        "namedVariables" -> Length[Map[
                AtomQ[ToExpression[#]]&,
                Names["wlsp`*"]
            ]],
        "indexedVariables" -> 0 (*Length[
            Map[
                !AtomQ[ToExpression[#]]&,
                Names["wlsp`*"]
            ]
        ]*)
    |>};

    varRef = 1;
    $variableReferences["Global"] = <|
        "varRef" -> varRef,
        "name" -> "Global",
        "variables" -> <|
            "indexed" -> Select[
                Flatten@List@Names["wlsp`*"],
                !AtomQ[Symbol[#]]&
            ],
            "named" -> Select[
                Flatten@List@Names["wlsp`*"],
                AtomQ[Symbol[#]]&
            ]
        |>
    |>;

    Table[
        varRef = varRef + 1;
        $variableReferences[v] = <|
            "varRef" -> varRef,
            "name" -> v,
            "variables" -> <|
                "indexed" -> Quiet@Check[Select[ToExpression@v, !AtomQ@# &], v],
                "named" -> Quiet@Check[Select[ToExpression@v, AtomQ], v]
            |>
        |>,
        {v, Names["wlsp`*"]}
    ];
];

fireEventsForExpression[expr_, stepEvent_]:=Module[{line, ast, bps},
    (* break source into code blocks *)
    (* check if breakpoint in code block *)

    $Context = "wlsp`";
    $output0 = ToString[ReplaceAll[ToExpression[ToSourceCharacterString[expr]], {$Failed -> "Failed", $Aborted -> "Aborted"}], InputForm, TotalWidth->50];
    $Context = "wolframDebugger`";

    sendResponse[
        <|
            "type"->"event",
            "event"->"output",
            "body"-><|
            "output"->ToString@$output0, 
            "category"->"stdout", 
            "threadId"->1|>
        |>
    ];

    updateScopesVariables[];

    $currentExpression = $currentExpression + 1; 
    expr = $expressions[[$currentExpression]];
    
    $stackFrames = {
        <|
            "id"->Length@$stackFrames,
            "name"->ToSourceCharacterString@expr,
            "source"-><|"name"->FileBaseName@$currentFile, "path"->$currentFile|>,
            "line"->expr[[-1]][Source][[1, 1]],
            "column"->expr[[-1]][Source][[1, 2]],
            "endLine"->expr[[-1]][Source][[2, 1]],
            "endColumn"->expr[[-1]][Source][[2, 2]]
        |>
    };

    bps = SelectFirst[
        $breakpoints[$currentFile], 
        expr[[-1]][Source][[2, 1]] === #["line"] &, {}];

    If[Length@bps > 0,
        sendResponse[
            <|
            "type"->"event", 
            "event"->"stopped",
            "body"-><|"reason"->"breakpoint", "threadId"->1|>|>
        ];

        If[!KeyExistsQ[bps, "verified"],
            bps["verified"] = True;
        ];

        If[!bps["verified"],
            bps["verified"] = True;
        ];
    ];

    If[stepEvent === "stopOnStep",
        sendResponse[
            <|
            "type"->"event", 
            "event"->"stopped",
            "body"-><|"reason"->"step", "threadId"->1|>|>
        ];,
        step[stepEvent];
    ];
];

handle["stepIn", json_]:=Module[{},
    step["stopOnStep"]
];

handle["stepOut", json_]:=Module[{},
    step["stopOnStep"]
];

(* *)


(* Wolfram Language Server Debugger *)
(*ClearAll[Evaluate[Context[] <> "*"]]*)


(* Output Symbols *)
(* Private Context *)

$ExpensiveContexts = {"System`"};

DebuggerInit[] := (
    $SymbolTable = <|"wolframDebugger`" -> {}|>;
    $ReferenceTable = <||>;
    $NewSymbol = (($SymbolTable =
        Merge[{$SymbolTable, <|#2 -> #1|>}, Flatten]
    )&)
);


appendReference[type_, name_String, pos_:Nothing] := With[
    {
        newKey = (Length[$ReferenceTable] + 1)
    },

    AssociateTo[$ReferenceTable, newKey -> (
        {type, name, pos}
    )];
    newKey
];


GetContextsReferences[] := (
    AssociateTo[$ReferenceTable, 1 -> {}];
    Table[
        Scope[<|
            "name" -> context,
            "variablesReference" -> appendReference["Context", context],
            "expensive" -> If[MemberQ[$ExpensiveContexts, context], True, False],
            If[MemberQ[$ExpensiveContexts, context],
                "namedVariables" -> Length[Names[context <> "*"]],
                Nothing
            ]
        |>],
        {context, Keys[$SymbolTable]}
    ]
);


(* Shall return the pre-side-effect results *)
GetVariablesReference[variablesArguments_Association] := (
    $ReferenceTable
    // Key[variablesArguments["variablesReference"]]
    // Replace[{
        _?MissingQ -> {},
        {"Context", context_String} :> (
            Names[context <> "*"]
            // Map[analyzeSymbol]
            // DeleteMissing
        ),
        {"Symbol", symbolName_String} :> (
            {analyzeSymbol[symbolName]}
            // DeleteMissing
        ),
        {"AssocList", symbolName_String} :> (
            Table[
                symbolName
                // ToExpression[#, InputForm, Unevaluated]&
                // valuesFunc[#]&
                // Replace[{
                    valueList:Except[{}] :> (
                        DapVariable[<|
                            "name" -> (valuesFunc // ToString),
                            "value" -> (
                                If[valuesFunc === Attributes,
                                    valueList,
                                    (valueList // Keys)
                                ] // ToNonContextString[#]&
                            ),
                            "type" -> If[valuesFunc === Attributes, "List", "Rule List"],
                            "variablesReference" -> (
                                appendReference["AssocValues", symbolName, valuesFunc]
                            ),
                            If[valuesFunc === Attributes,
                                "indexedVariables",
                                "namedVariables"
                            ] -> Length[valueList]
                        |>]
                    ),
                    {} -> Nothing
                }],
                {valuesFunc, {DownValues, SubValues, UpValues, Options, Attributes}}
            ]
        ),
        {
            "AssocValues",
            symbolName_String,
            valuesFunc:(OwnValues | DownValues | SubValues | UpValues | Options | Attributes)
        } :> Block[
            {
                values = symbolName
                    // ToExpression[#, InputForm, Unevaluated]&
                    // valuesFunc[#]&
            },
            Table[
                createVariableWithTag[
                    If[valuesFunc === Attributes,
                        index // ToString,
                        Part[values, index, 1] // ToNonContextString[#]&
                    ],
                    symbolName,
                    values // Extract[#, If[valuesFunc === Attributes,
                        {index},
                        {index, 2}
                    ], Unevaluated]&,
                    {{valuesFunc, index}, {}}
                ],
                {index, Length[values]}
            ]
        ],
        {
            listType: "List" | "Association",
            symbolName_String,
            {
                {
                    valuesFunc:(OwnValues | DownValues | SubValues | UpValues | Attributes | Options),
                    valueIndex_Integer
                },
                {pos___}
            }
        } :> Block[
            {
                list = symbolName
                    // ToExpression[#, InputForm, Unevaluated]&
                    // valuesFunc[#]&
                    // Extract[#, {valueIndex, 2, pos}, Unevaluated]&
            },
            Table[
                createVariableWithTag[
                    If[listType == "List",
                        index // ToString,
                        index // First // ToString
                    ],
                    symbolName,
                    list // Extract[#, index, Unevaluated]&,
                    {{valuesFunc, valueIndex}, {pos, index}}
                ],
                {
                    index,
                    If[listType == "List",
                        list
                        // Length[#]&,
                        list
                        // Keys[#]&
                        // Map[Key]
                    ]
                }
            ]
        ],
        _ -> {}
    }]
);


SetAttributes[ToNonContextString, HoldFirst];

(*
    This will turn "x_pattern" into "Pattern[x, patter]".
    A complete but slow solution is to parse the string with CodeParser and
    delete contexts by source.
*)
ToNonContextString[expr_] := (
    expr
    // Hold
    // ReplaceAll[
        symbol_Symbol :> With[
            {
                symbolName = SymbolName[Unevaluated[symbol]]
            },
            symbolName
            /; (
                (* Removes the context other than System` (operators) and wolframDebugger` (not necessary) *)
                {"System`", "wolframDebugger`"}
                // MemberQ[Context[symbol]]
                // Not
            )]
        ]
    // Extract[#, {1}, Unevaluated]&
    // ToString[#]&
);


analyzeSymbol[symbolName_String] := (
    symbolName
    // ToExpression[#, InputForm, Unevaluated]&
    // Replace[{
        _?(Attributes /* MemberQ[ReadProtected]) -> Missing["NoValues"],
        symbol_ :> Block[
            {
                ownValues
            },
            createVariableWithTag[
                SymbolName[symbol],
                symbolName,
                ownValues
                // Extract[#, {1, 2}, Unevaluated]&,
                {{OwnValues, 1}, {}}
            ]
            /; (
                symbol
                // OwnValues
                // If[# =!= {},
                    ownValues = symbol // OwnValues;
                    True,
                    False
                ]&
            )
        ],
        symbol_ :> Block[
            {
                length
            },
            DapVariable[<|
                "name" -> SymbolName[symbol],
                "value" -> "",
                "type" -> "Function",
                "variablesReference" -> appendReference["AssocList", symbolName],
                "namedVariables" -> length,
                "expensive" -> False
            |>]
            /; (
                symbol
                // {DownValues, SubValues, UpValues}
                // Through
                // DeleteCases[{}]
                // Length
                // (length = #)&
                // (# > 0)&
            )
        ],
        _ -> Nothing
    }]
);

createVariableWithTag[tag_String, symbolName_String, expr_, nextPos_] := (
    expr
    // Unevaluated
    // analyzeExpr
    // Apply[{value, type, length} |-> (
        DapVariable[<|
            "name" -> (tag // ToString),
            "value" -> (value),
            "type" -> (
                type
                // Replace["Symbol"|"Expression" -> "Variable"]
            ),
            "variablesReference" -> If[length == 0,
                0,
                If[type == "Symbol",
                    appendReference["Symbol", value],
                    appendReference[type, symbolName, nextPos]
                ]
            ],
            type
            // Replace[{
                "List" -> (
                    "indexedVariables" -> length
                ),
                "Association" | "Symbol" -> (
                    "namedVariables" -> length
                ),
                "Expression" -> Nothing
            }],
            "expensive" -> False
        |>]
    )]
);


SetAttributes[analyzeExpr, HoldAll]
analyzeExpr[expr_] := (
    expr
    // Unevaluated
    // Replace[{
        list_?ListQ :> {
            "List",
            list // Length
        },
        association_?AssociationQ :> {
            "Association",
            association
            // Length
        },
        symbol:Unevaluated[_Symbol] /; (
            symbol
            // Attributes
            // MemberQ[ReadProtected]
        ) -> {"Expression", 0},
        symbol:Unevaluated[_Symbol] :> {
            "Symbol",
            symbol
            // {OwnValues, DownValues, SubValues, UpValues}
            // Through
            // If[SameQ[#, Range[{}, 4]], 0, 1]&
        },
        _ -> {"Expression", 0}
    }]
    // Prepend[
        expr
        // ToNonContextString
    ]
);

EndPackage[];
