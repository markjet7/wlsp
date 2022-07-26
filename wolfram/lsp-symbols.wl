(* ::Package:: *)

BeginPackage["wolframSymbolsLSP`"];

Check[Needs["CodeParser`"], PacletInstall["CodeParser"]; Needs["CodeParser`"]];
Check[Needs["CodeInspector`"], PacletInstall["CodeInspector"]; Needs["CodeInspector`"]]; 
scriptPath = DirectoryName@ExpandFileName[First[$ScriptCommandLine]]; 
contentLengthPattern[] := "Content-Length: "~~length:NumberString~~"\r\n\r\n";
contentPattern[length_]:= (("Content-Length: "~~ToString@length~~"\r\n\r\n"~~content1:Repeated[_,{length}]) | (content2:Repeated[_,{length}]~~"Content-Length: "~~ToString@length~~"\r\n\r\n"));

ServerCapabilities=<|  
    "textDocumentSync" -> 1,
    "documentSymbolProvider" -> True,
    "workspaceSymbolProvider" -> True,
	"workspace" -><|
		"workspaceFolders" -> <|"supported"->True, "changeNotifications" -> True|>
	|>
|>;


workspaceFolders = {};
handle["initialize", json_]:=Module[{response},
    Print["Initializing Wolfram Symbols LSP"];
	response = <|"id"->json["id"],"result"-><|"capabilities"->ServerCapabilities|>|>;
    documents = <||>;
	sendResponse[response];	
];

handle["textDocument/didOpen", json_]:=Module[{},
	lastChange = Now;
	documents[json["params","textDocument","uri"]] = json["params","textDocument","text"];
	(* validate[]; *)
];

handle["textDocument/didChange", json_]:=Module[{},
	(* oldLength = StringLength[documents[json["params","textDocument","uri"]]];
	newLength = json["params","contentChanges"][[1]]["text"]; *)
	lastChange = Now;
	documents[json["params","textDocument","uri"]] = json["params","contentChanges"][[1]]["text"];
];

handle["workspace/didChangeWorkspaceFolders", json_]:=Module[{added, removed},

	added = json["params"]["event"]["added"];
	removed = json["params"]["event"]["removed"];

	workspaceFolders = DeleteDuplicates@DeleteCases[Join[workspaceFolders, added], _?(MemberQ[removed, #] &)];
];

handle["workspace/symbol", json_]:=Module[{response},
	symbol = json["params"]["query"];
	AllSymbols = Import[symbolListFile, "RawJSON"];

	symbols = If[symbol != "", Flatten@Select[AllSymbols[[All, "children"]], StringContainsQ[ToString@#["name"], ToString@symbol] &], {}];

	response = <|"id" -> json["id"], "result"->symbols|>;
	sendResponse[response];
];

handle["builtInList", json_]:=Module[{},
	If[builtinSymbols === {},
		builtins = COMPLETIONS[[102;;-2, "label"]];
		builtinSymbols = Map[
			Function[{symbol},
				<|
					"name" -> symbol,
					"kind" -> "Variable",
					"location" -> <|
						"uri" -> "https://reference.wolfram.com/language/ref/" <> symbol <> ".html"
					|>
				|>
			],
			builtins
		]; 
	];

	file = CreateFile[];
	WriteString[file, ExportString[<|"builtins" -> builtinSymbols|>, "JSON"]];

	response = <|"id"->json["id"],"result"->ToString@file|>;

	sendResponse[response];
	Close[file];
];


handle["symbolList", json_]:=Module[{response, symbols, builtins, result1, result2, files, file},
	files = DeleteDuplicates@Flatten@Join[FileNames[{"*.wl", "*.wls", "*.nb0"}, workspaceFolders], StringReplace[FileNameJoin[Rest@URLParse[URLDecode[#], "Path"]], ("#"~~___ ->"")] & /@ Keys@documents];
	sources = Check[Import[First@StringSplit[#, "#"], "Text"], ""] & /@ files;
	
	symbols = SortBy[Flatten@MapThread[getSymbols[#1, URLBuild[<|"Scheme" -> "file", "Path" -> Join[{""}, FileNameSplit[#2]]|>]] &, {sources, files}], #1["name"] &];
	

	result1 = Map[
		Function[{symbol},
			<|
				"name" -> symbol["name"],
				"kind" -> "Variable"(* symbol["kind"] *),
				"definition" -> symbol["definition"],
				"location" -> <|
					"uri" -> symbol["uri"],
					"range" -> <|
						"start" -> <|"line" -> symbol["loc"][[1, 1]]-1, "character"->symbol["loc"][[1,2]]-1|>,
						"end" -> <|"line" -> symbol["loc"][[2, 1]]-1, "character"->symbol["loc"][[2,2]]-1|>
					|>
				|>,
				"children" -> If[Length[ToExpression[symbol["name"]]] > 1, Map[symbolToTreeItem, ToExpression[symbol["name"]]], {}]
			|>
		],
		symbols
	];

	If[builtinSymbols === {},
		builtins = COMPLETIONS[[102;;-2, "label"]];
		builtinSymbols = Map[
			Function[{symbol},
				<|
					"name" -> symbol,
					"kind" -> "Variable",
					"location" -> <|
						"uri" -> "https://reference.wolfram.com/language/ref/" <> symbol <> ".html"
					|>
				|>
			],
			builtins
		]; 
	];

	file = CreateFile[];
	WriteString[file, ExportString[<|"workspace" -> result1|>, "JSON"]];

	response = <|"id"->json["id"],"result"->ToString@file|>;

	sendResponse[response];
	Close[file];
];

handle["DocumentSymbolRequest"]:=Module[{},
    Print["Document symbol request TODO"];
];

handle["textDocument/documentSymbol", json_]:=Module[{uri, text, funcs, defs, result, response, kind, ast},
	start = Now;
	Check[
				(
					kind[s_]:= Switch[
								s, 
								"Symbol", 13, 
								"Integer", 16, 
								"Real", 16,
								"Complex", 16,
								"Rational", 16,
								"List", 18,
								"Map", 18,
								"Table", 18,
								"Association", 23,
								"Function", 12, 
								"String", 15, 
								"Module", 12,
								_, 19];

					uri = json["params"]["textDocument"]["uri"];
					text = documents[json["params", "textDocument", "uri"]];
					ast = CodeParse[text];

					symbols=Cases[ast,
                        CallNode[
                            _,{_, k_,___},<|Source->loc_,"Definitions"->s_|>
                            ]:>{s[[1,2]], FirstCase[k,LeafNode[_,h_,_]:>h,"Symbol",Infinity, Heads->True], loc},
                            {2,-1}
                        ];


					result = Table[
                        <|
                            "name" -> s[[1]],
                            "kind" -> kind[ToString@s[[2]]],
                            "location" -> <|
                                "uri" -> uri,
                                "range" -> <|
                                    "start" -> <|"line" -> s[[3,1,1]]+1, "character"->s[[3,1,2]]+1|>,
                                    "end" -> <|"line" -> s[[3,2,1]]+1, "character"->s[[3,2,2]]+1|>
                                |>
                            |>
                        |>,
                        {s, symbols}
                    ];

					response = <|"id"->json["id"],"result"->result|>;
					sendResponse[response];  

                    (*
					response = <|"method"->"updatePositions", "params" -> <|"result" -> result|>|>;
					sendResponse[response]; 
                    *)

			),
				response = <|"id"->json["id"],"result"->{}|>;
				sendResponse[response];  
				sendResponse[<| "method" -> "window/logMessage", "params" -> <| "type" -> 1, "message" -> "Document symbol request failed due to parsing error." |> |>];
	];
	Print["Document symbol request took ", Now - start, " seconds."];

];

handle["shutdown", json_]:=(
	Print["LSP Goodbye"];
	state = "Stop";
	sendResponse[<|"id" -> json["id"], "result" -> Null|>];
	Close[SERVER];
	Quit[];
	Exit[];
);

handle[m_, json_]:=Module[{},
    Print[m];
    If[StringContainsQ[m, "shutdown"],
        Quit[];    
    ]
];

EndPackage[];