
transforms[output_Graphics]:=Module[{}, 
	(*imageToPNG[output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_Image]:=Module[{}, 
	(*imageToPNG[output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_Legended]:=Module[{}, 
	(*imageToPNG[output];*)
	ExportString[Rasterize@output, "HTMLFragment"]
];
transforms[output_Grid]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_Column]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_Row]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_GraphicsRow]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_GraphicsColumn]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_GeoGraphics]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[output, "HTMLFragment"]
];
transforms[output_Overlay]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[Rasterize@output, "HTMLFragment"]
];
transforms[output_Null]:=Module[{}, ""];

transforms[output_InformationData]:=Module[{}, 
	(*imageToPNG[Rasterize@output];*)
	ExportString[Rasterize@output, "HTMLFragment"]
];
transforms[output_]:=Module[{}, 
	ExportString[ToString[output, InputForm, TotalWidth->1000], "HTMLFragment"]
];
