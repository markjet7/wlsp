
rawBoxesToExpression[RawBoxes[a_]] := rawBoxesToExpression[a];
rawBoxesToExpression[Cell[BoxData[b_], ___]] := rawBoxesToExpression[b];
rawBoxesToExpression[a_] := ToExpression[a]; 
rawBoxesToExpression[""]:= "";
rawBoxesToExpression[a_, "Input"] := StringReplace[
    StringRiffle[Flatten@List@(ToExpression[a,StandardForm,Function[dt,MakeBoxes[InputForm[dt]],HoldAll]] /. InterpretationBox[StyleBox[code_String,___],___]:>code), "\n"],
    "Null\n"->""];
rawBoxesToExpression["", "Input"] := "";

json2nb =.;
ClearAll@json2nb;
json2nb[elements_List, True]:=Notebook[Map[json2nb[#, False] &,elements],WindowSize->{1474,370},WindowMargins->{{Automatic,20},{Automatic,0}},StyleDefinitions->"Default.nb"];
json2nb[elements_List, False]:=Map[json2nb[#, False] &,elements];
json2nb[js_Association, False]:=Which[
    First[StringSplit[js["value"]],""] === "#", Cell[StringTake[js["value"], {3, -1}],  {}, "Title"],
    First[StringSplit[js["value"]],""] === "##", Cell[StringTake[js["value"], {4, -1}], {}, "Section"],
    First[StringSplit[js["value"]],""] === "###", Cell[StringTake[js["value"], {5, -1}], {}, "Chapter"],
    js["kind"] === 1, Cell[js["value"], {}, "Text"],
    js["kind"] === 2, Cell[CellGroupData[
        Join[
            List@Cell[BoxData[StringSplit[js["value"], "\r\n"]], "Input"],
            Map[
                Function[{i}, Cell[ImportString[i, "HTML"], "Output"]], 
                StringSplit[ByteArrayToString@ByteArray[First[js["outputs"],<|"items"->{<|"data"-><|"data"->{}|>|>}|>]["items"][[1]]["data"]["data"]], "<br>"]
            ]
        ], 
        Open]],
    True, Cell[js["value"], {}, "Text"]
];

(*
mdReplacements={Shortest["### "~~s__~~EndOfLine]:>"(* ::Subsection:: *)\n"<>StringJoin[Map["(*"<>#<>"*)\n"&,StringSplit[s,"\n"]]],
Shortest["## "~~s__~~EndOfLine]:>"(* ::Section:: *)\n"<>StringJoin[Map["(*"<>#<>"*)\n"&,StringSplit[s,"\n"]]],Shortest["# "~~s__~~EndOfLine]:>"(* ::Title:: *)\n"<>StringJoin[Map["(*"<>#<>"*)\n"&,StringSplit[s,"\n"]]],s:Except["#"]..:>"(* ::Text:: *)\n"<>StringJoin[Map["(*"<>#<>"*)\n"&,StringSplit[s,"\n"]]]};

mdReplacements2={"#"..~~" "~~s__:>s};

wlLines[wl_]:=StringJoin["(*"<>#<>"*)\n"&/@StringSplit[wl,"\n"]];

json2wl=.;
ClearAll@json2wl;
json2wl[js_Association]:=(Which[Check[js["kind"],2]===1,StringReplace[js["value"],mdReplacements]<>"\n\n",Check[js["metadata"],""]==="Code",js["value"]<>"\n\n\n",Check[js["metadata"],""]==="Input","(* ::Input:: *)\n"<>wlLines@js["value"]<>"\n\n",Check[js["metadata"],False]==="",js["value"]<>"\n\n",Check[js["metadata"],""]==="Package","(* ::Package:: *)\n\n\n\n",True,js["value"]<>"\n\n"]);
json2wl[elements_List]:=Map[json2wl[#]&,elements];
json2wl[a_]:=ToString@a;

wl2json=.;
wl2mdjson=.;
ClearAll@wl2json;
ClearAll@wl2mdjson;

wl2mdjson[str_]:=Sequence@@StringReplace[str,{Shortest["(* ::Section:: *)"~~Whitespace..~~"(*"~~h___~~"*)"]:>jsonT[1,"## "<>h,"markdown","Section"],Shortest["(* ::SubSection:: *)"~~Whitespace..~~"(*"~~h___~~"*)"]:>jsonT[1,"### "<>h,"markdown","SubSection"],Shortest["(* ::Chapter:: *)"~~Whitespace..~~"(*"~~h___~~"*)"]:>jsonT[1,"### "<>h,"markdown","Chapter"],Shortest["(* ::Title:: *)"~~Whitespace..~~"(*"~~h___~~"*)"]:>jsonT[1,"# "<>h,"markdown","Title"],Shortest["(* ::Text:: *)"~~___~~"(* ::"~~h___~~":: *)"]:>jsonT[1,"# "<>h,"markdown","Text"],Shortest["(* ::"~~s___~~":: *)"~~Whitespace..~~"(*"~~h___~~"*)"]:>jsonT[1,"### "<>h,"markdown",s],x__:>jsonT[2,x,"wolfram","Code"]}];


packagePattern=("(* ::Package:: *)"~~Whitespace..):>jsonT@@{1,"","markdown","Package"};
inputPatterns=x:("(* ::Input:: *)"~~Whitespace..~~content__~~"\n\n\n")/;StringCount[x,"\n\n\n"]==1:>jsonT@@{2,StringJoin@StringReplace[content,{StartOfLine~~"(*"->"","*)"~~EndOfLine->""}],"wolfram","Input"};
sectionPatterns=x:("(* ::"~~type__~~":: *)"~~Whitespace..~~content__~~"\n\n\n")/;StringCount[x,"\n\n\n"]<=1:>jsonT@@{1,StringJoin@StringReplace[content,{StartOfLine~~"(*"->wl2md[type],"*)"~~EndOfLine->""}],"markdown",type};
codePattern=x:Shortest@(content__~~"\n\n\n")/;StringCount[x,"\n\n\n"]<=1:>jsonT@@{2,content,"wolfram","Code"};

wl2json[wl_]:=Module[{a},(StringCases[wl,{packagePattern,inputPatterns,sectionPatterns,codePattern,x__:>jsonT[2,x,"wolfram","Code"]}])];

wl2md[type_]:=Switch[type,"Title","# ","Section","## ","SubSection","### ","Chapter","### ","Text","",_,""];

jsonT[k_,v_:"",l_:"wolfram",m_:"Text",o_:{}]:=<|"kind"->k,"value"->v,"languageId"->l,"metadata"->m,"outputs"->o|>;
*)

jsonT[k_,v_:"",l_:"wolfram",m_:"Code",o_:{}]:=<|
    "kind"->k,
    "value"->v,
    "languageId"->l,
    "metadata"->m,
    "outputs"->o|>;

json2wl[js_List]:=StringJoin[StringRiffle[js[[All,"value"]],"\n\n\n"]];

wl2json[wl_]:=Map[Function[{s}, jsonT[2,s]],StringSplit[wl,"\n\n\n"]];

nb2json =.;
ClearAll@nb2json;
(* nb2json[Cell[CellGroupData[{Cell[BoxData[content_],"Input",___], outputs___},___]]]:= ToExpression[content,StandardForm,Function[dt,MakeBoxes[InputForm[dt]],HoldAll]]/. InterpretationBox[StyleBox[code_String,___],___]:>
    (jsonT[2, code, "wolfram", "Input", Map[nb2json, List@outputs]]); *)
(* nb2json[c:Cell[BoxData[content_],"Input",___, ExpressionUUID->id_]]:=ToExpression[content,StandardForm,Function[dt,MakeBoxes[InputForm[dt]],HoldAll]]/. InterpretationBox[StyleBox[code_String,___],___]:>(jsonT[2, code, "wolfram", "Input"]);*)

nb2json[Cell[CellGroupData[{Cell[BoxData[content_],"Input",___], outputs___},___]]]:=  (jsonT[2, rawBoxesToExpression[content, "Input"], "wolfram", "Input", Map[nb2json, List@outputs]]); 
nb2json[c : Cell[BoxData[content_], style_, ___]] := jsonT[1, ExportString[rawBoxesToExpression@content,"HTMLFragment"], "markdown", style];
nb2json[c : Cell[content_, style_, ___]] := jsonT[1, ToString@rawBoxesToExpression@content, "markdown", style];
nb2json[c : Cell[content_, "Input", ___]] := jsonT[2, ToString@rawBoxesToExpression[content, "Input"], "wolfram", "Input"];
nb2json[c : Cell[content_, "Title", ___]] := jsonT[1, "# "<>content, "markdown", "Title"];
nb2json[c : Cell[content_, "Section", ___]] := jsonT[1, "## "<>content, "markdown", "Section"];
nb2json[c : Cell[content_, "Subsection", ___]] := jsonT[1, "### "<>content, "markdown", "Subsection"];
nb2json[c : Cell[content_, "Chapter", ___]] := jsonT[1, "### "<>content, "markdown", "Chapter"];
nb2json[c : Cell[content_, "Text", ___]] := jsonT[1, ""<>content, "markdown", "Text"];
nb2json[c : Cell[content_, "Output", ___]] := jsonT[1, ExportString[rawBoxesToExpression@content,"HTMLFragment"], "text/html", "Output"];
nb2json[c:Cell[BoxData[content_],"Output",___,ExpressionUUID->id_]]:=jsonT[1, ExportString[rawBoxesToExpression@content,"HTMLFragment"], "text/html", "Output"];
nb2json[Notebook[cells_, ___]] := Map[nb2json, cells];

nb2html=.;
ClearAll@nb2html;
nb2html[Cell[CellGroupData[cells_,___],___]]:="<div>"<>Map[nb2html,cells]<>"</div>";
nb2html[c:Cell[BoxData[content_],"Input",___, ExpressionUUID->id_]]:=ToExpression[content,StandardForm,Function[dt,MakeBoxes[InputForm[dt]],HoldAll]]/. InterpretationBox[StyleBox[code_String,___],___]:>("<textarea id=\""<>id<>"\">"<>code<>"</textarea>");
nb2html[c:Cell[BoxData[content_],"Output",___]]:=ExportString[content,"HTMLFragment"];
nb2html[c:Cell[BoxData[content_],style_,___]]:="<"<>style<>">"<>content<>"</"<>style<>">";
nb2html[c:Cell[content_,style_,___]]:="<"<>style<>">"<>content<>"</"<>style<>">";
nb2html[c:Cell[content_,"Title",___]]:="<h1>"<>content<>"</h1>";
nb2html[c:Cell[content_,"Section",___]]:="<h2>"<>content<>"</h2>";
nb2html[c:Cell[content_,"Subsection",___]]:="<h3>"<>content<>"</h3>";
nb2html[c:Cell[content_,"Chapter",___]]:="<h3>"<>content<>"</h3>";
nb2html[c:Cell[content_,"Text",___]]:="<p>"<>content<>"</p>";
nb2html[c:Cell[content_,"Output",___]]:=ExportString[content,"HTMLFragment"];
nb2html[c:Cell[BoxData[content_],"Output",___,ExpressionUUID->id_]]:="<div class=\"output\" id=\""<>id<>"\">"<>ExportString[content,"HTMLFragment"]<>"</div>";
nb2html[Notebook[cells_,___]]:= StringJoin@Map[nb2html,cells];

html2nb =.;
ClearAll@html2nb;
html2nb[XMLObject["Document"][___,XMLElement["html",_,elements__], ___]]:=Notebook[{Cell[CellGroupData[Map[html2nb,elements], Open]]},WindowSize->{1474,370},WindowMargins->{{Automatic,20},{Automatic,0}},StyleDefinitions->"Default.nb"];
html2nb[XMLElement["body",_,elements_]]:=Map[html2nb,elements];
html2nb[XMLElement["div",_,elements_]]:=Cell[CellGroupData[Map[html2nb,elements]]];
html2nb[XMLElement["h1",_,elements_]]:=Cell[Map[html2nb,elements],"Title"];
html2nb[XMLElement["h2",_,elements_]]:=Cell[Map[html2nb,elements],"Section"];
html2nb[XMLElement["h3",_,elements_]]:=Cell[Map[html2nb,elements],"Chapter"];
html2nb[XMLElement["p",_,elements_]]:=Cell[Map[html2nb,elements],"Text"];
html2nb[XMLElement["textarea",{___,"id"->id_,___},elements_]]:=Cell[Map[html2nb,elements],"Input", ExpressionUUID->id];
html2nb[XMLElement["div",{___,"class"->"output", "id"->id_,___},elements_]]:=Cell[ImportString[#,"HTML"] &/@ elements,"Output", ExpressionUUID->id];
html2nb[XMLElement["img",_,elements_]]:=Cell[ImportString[elements,"HTML"],"Output"];
html2nb[string_String]:=string;

