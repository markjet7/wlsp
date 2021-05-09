(* ::Package:: *)

Notebook2Jupyter::usage = "";

Begin["`Private`"];
JupyterInputCell::usage = "";
JupyterCodeCell::usage = "";
JupyterMarkdownCell::usage = "";
JupyterRawCell::usage = "";


Options[Notebook2Jupyter] = {Debug -> False};
Notebook2Jupyter[in_String, o : OptionsPattern[]] := Block[
	{out = FileNameJoin[{DirectoryName@in, FileBaseName@in <> ".ipynb"}]},
	Notebook2Jupyter[in, out, o]
];
Notebook2Jupyter[in_String, out_String, o : OptionsPattern[]] := Block[
	{nb , result},
	nb = NotebookOpen[in, Visible -> False];
	result = If[
		TrueQ@OptionValue[Debug],
		Notebook2Jupyter[nb, o],
		Notebook2Jupyter[nb, out, o]
	];
	NotebookClose[nb];
	Return@result
];
Notebook2Jupyter[nb_NotebookObject, path_String, o : OptionsPattern[]] := Block[
	{jp = Notebook2Jupyter[nb, o]},
	File@Export[path, jp, "JSON"]
];
Notebook2Jupyter[nb_NotebookObject, o : OptionsPattern[]] := Block[
	{jp = $JupyterTemplate, parsed, cells},
	parsed = Flatten[parseCell /@ Cells[nb]];
	cells = SequenceSplit[parsed, {
		{text__JupyterMarkdownCell} :> JupyterMarkdownBuild[First /@ {text}],
		{in_JupyterInputCell, other___JupyterCodeCell} :> JupyterCodeBuild[First /@ {in, other}]
	}];
	jp["cells"] = cells;
	Return@jp;
];


JupyterMarkdownBuild[text_List] := <|
	"cell_type" -> "markdown",
	"metadata" -> <||>,
	"source" -> StringRiffle[text, "\n\n"]
|>;
JupyterCodeBuild[{code_}] := <|
	"cell_type" -> "code",
	"metadata" -> <||>,
	"source" -> code,
	"execution_count" -> 0,
	"outputs" -> {}
|>;
JupyterCodeBuild[{code_, out_}] := <|
	"cell_type" -> "code",
	"metadata" -> <||>,
	"source" -> code,
	"outputs" -> {
		<|
			"metadata" -> <||>,
			"execution_count" -> 0,
			"output_type" -> "execute_result",
			"data" -> out
		|>
	},
	"execution_count" -> 0
|>;
JupyterCodeBuild[{code_, print__, out_}] := <|
	"cell_type" -> "code",
	"metadata" -> <||>,
	"source" -> code,
	"outputs" -> Flatten@{
		<|"name" -> "stdout", "output_type" -> "stream", "text" -> #|>& /@ {print},
		<|
			"metadata" -> <||>,
			"execution_count" -> 0,
			"output_type" -> "execute_result",
			"data" -> out
		|>
	},
	"execution_count" -> 0
|>;


(* ::Chapter:: *)
(*Cell*)


(* ::Section:: *)
(*Template*)


$JupyterTemplate = <|
	"nbformat" -> 4,
	"nbformat_minor" -> 2,
	"metadata" -> <|
		"kernelspec" -> <|
			"display_name" -> "Wolfram Language " <> ToString@$VersionNumber,
			"language" -> "Wolfram Language",
			"name" -> "wolframlanguage" <> ToString@$VersionNumber
		|>,
		"language_info" -> <|
			"codemirror_mode" -> "python",
			"file_extension" -> ".m",
			"mimetype" -> "application/vnd.wolfram.m",
			"name" -> "Wolfram Language",
			"pygments_lexer" -> "python",
			"version" -> "12.0"
		|>
	|>
|>;


(* ::Section:: *)
(*Default*)


parseCell[co_CellObject] := parseCell[NotebookRead[co], co];
parseCell[c_Cell, co_CellObject] := parseCell[#2, #, co]& @@ c;
parseCell[s_, o___] := (
	Echo[Inactive[parseCell][s, o], "Todo: "];
	JupyterMarkdownCell@TemplateApply["[//]: # (No rules defined for ``)\n\n", {s}]
);


(* ::Section:: *)
(*Normal*)


(* ::Subsection:: *)
(*Title*)


parseCell["Title", data_, co_CellObject] := JupyterMarkdownCell["# " <> parseData@data];
parseCell["Subtitle", data_, co_CellObject] := JupyterMarkdownCell["## " <> parseData@data];
parseCell["Subsubtitle", data_, co_CellObject] := JupyterMarkdownCell["### " <> parseData@data];
parseCell["Section", data_, co_CellObject] := JupyterMarkdownCell["#### " <> parseData@data];
parseCell["Subsection", data_, co_CellObject] := JupyterMarkdownCell["##### " <> parseData@data];
parseCell["Subsubsection", data_, co_CellObject] := JupyterMarkdownCell["###### " <> parseData@data];
parseCell["Chapter", data_, co_CellObject] := JupyterMarkdownCell["### " <> parseData@data];


(* ::Subsection:: *)
(*Item*)


parseCell["Item", data_, co_CellObject] := JupyterMarkdownCell["- " <> parseData@data];
parseCell["ItemParagraph", data_, co_CellObject] := JupyterMarkdownCell["  " <> parseData@data];
parseCell["Subitem", data_, co_CellObject] := JupyterMarkdownCell["  - " <> parseData@data];
parseCell["SubitemParagraph", data_, co_CellObject] := JupyterMarkdownCell["    " <> parseData@data];
parseCell["Subsubitem", data_, co_CellObject] := JupyterMarkdownCell["    - " <> parseData@data];
parseCell["SubsubitemParagraph", data_, co_CellObject] := JupyterMarkdownCell["      " <> parseData@data];

parseCell["ItemNumbered", data_, co_CellObject] := JupyterMarkdownCell["1. " <> parseData@data];
parseCell["SubitemNumbered", data_, co_CellObject] := JupyterMarkdownCell["  1." <> parseData@data];
parseCell["SubsubitemNumbered", data_, co_CellObject] := JupyterMarkdownCell["    1." <> parseData@data];


(* ::Subsection:: *)
(*Text*)


parseCell["Text", text_, co_CellObject] := JupyterMarkdownCell[parseData@text];
parseCell["CodeText", data___] := parseCell["Text", data];
parseCell["WolframAlphaShort", data_String, co_CellObject] := JupyterMarkdownCell[data];


(* ::Section:: *)
(*Code*)


toASCII[a_] := StringTake[ToString[a, InputForm, CharacterEncoding -> "ASCII"], {10, -2}];
parseCell["Input", boxes_, co_CellObject] := Block[
	{expr = MakeExpression[Cell@boxes, StandardForm], out},
	out = expr //. {
		HoldComplete[ExpressionCell[{a___, Null, b___}]] :> StringJoin[toASCII[HoldForm@a], ";\n", toASCII[HoldForm@b]],
		HoldComplete[ExpressionCell[a_]] :> toASCII[HoldForm@a]
	};
	JupyterInputCell[out]
];
parseCell["Code", data___] := parseCell["Input", data];
parseCell["Program", text_String, co_CellObject] := JupyterInputCell[text];

parseCell["Print", boxes_, o___] := JupyterCodeCell[First@MathLink`CallFrontEnd[ExportPacket[Cell@boxes, "PlainText"]]];
parseCell["Echo", data___] := parseCell["Print", data];
parseCell["Message", data___] := parseCell["Print", data];

parseCell["Output", boxes_, co_CellObject] := Block[
	{dump = First@MathLink`CallFrontEnd[ExportPacket[Cell@boxes, "PlainText"]]},
	JupyterCodeCell@If[
		dump == "",
		<|"image/png" -> ExportString[Rasterize[co, Background -> None], {"Base64", "PNG"}, Background -> None]|>,
		<|"text/plain" -> dump|>
	]
];


(* ::Section:: *)
(*TeX*)


boxesToTeX = ToString[ToExpression@#, TeXForm] &;
parseCell["Output", BoxData[FormBox[boxes_, TraditionalForm]], cellObj_CellObject] := TemplateApply["$$``$$\n\n", {boxesToTeX@boxes}];
parseCell["DisplayFormulaNumbered", data___] := parseCell["DisplayFormula", data];
parseCell["DisplayFormula", boxes_, co_CellObject] := Block[
	{dump = Convert`TeX`BoxesToTeX@boxes},
	JupyterMarkdownCell["$$" <> dump <> "$$\n\n"]
];



(* ::Section:: *)
(*Pass*)


parseCell[$Failed, data___] := {};


(* ::Chapter:: *)
(*Data*)


parseData[cell_Cell] := parseData@First@cell;
parseData[boxes_] := (
	Echo[Inactive[parseData][boxes], "Todo: "];
	JupyterMarkdownCell@TemplateApply["[//]: # (No rules defined for ``)\n\n", {ToString@boxes}]
);

parseData[string_String] := string;
parseData[TextData[data_List]] := StringJoin[parseData /@ data];
parseData[BoxData[data_]] := parseData@data;


parseData[FormBox[boxes_, TraditionalForm]] := Block[
	{dump = Convert`TeX`BoxesToTeX@boxes},
	"$" <> dump <> "$"
];




(*
parseData[list_List] := parseData /@ list;
parseData[TemplateBox[{text_String, link_String}, "HyperlinkURL"]] := TemplateApply["[``](``)", {text, link}];
	*)



End[]
