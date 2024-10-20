SetAttributes[accountingFormat, HoldFirst];
accountingFormat[expr_] := expr /. x_Real | x_Integer :> NumberForm[x, ScientificNotationThreshold -> {-9, 12}];


(*
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
	imageToPNG[Rasterize@output];
	ExportString[output, "HTMLFragment"]
];
transforms[output_GraphicsColumn]:=Module[{}, 
	imageToPNG[Rasterize@output];
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
*)
(* transforms[output_Legended]:=Module[{}, 
	(*imageToPNG[output];*)
	ExportString[output, "HTMLFragment", "GraphicsOutput"->"PNG"]
]; *)
transforms =.;
graphicsQ = 
  FreeQ[Union @@ ImageData @ Image[Graphics[#], ImageSize -> 30], 
    x_ /; x == {1.`, 0.9176470588235294`, 0.9176470588235294`}] &;

graphicHeads = {Point, PointBox, Line, LineBox, Arrow, ArrowBox, Rectangle, RectangleBox, Parallelogram, Triangle, JoinedCurve, Grid, Graph, Column, Row, JoinedCurveBox, FilledCurve, FilledCurveBox, StadiumShape, DiskSegment, Annulus, BezierCurve, BezierCurveBox, BSplineCurve, BSplineCurveBox, BSplineSurface, BSplineSurface3DBox, SphericalShell, CapsuleShape, Raster, RasterBox, Raster3D, Raster3DBox, Polygon, PolygonBox, RegularPolygon, Disk, DiskBox, Circle, CircleBox, Sphere, SphereBox, Ball, Ellipsoid, Cylinder, CylinderBox, Tetrahedron, TetrahedronBox, Cuboid, CuboidBox, Parallelepiped, Hexahedron, HexahedronBox, Prism, PrismBox, Pyramid, PyramidBox, Simplex, ConicHullRegion, ConicHullRegionBox, Hyperplane, HalfSpace, AffineHalfSpace, AffineSpace, ConicHullRegion3DBox, Cone, ConeBox, InfiniteLine, InfinitePlane, HalfLine, InfinitePlane, HalfPlane, Tube, TubeBox, GraphicsComplex, Image, GraphicsComplexBox, GraphicsGroup, GraphicsGroupBox, GeoGraphics, Graphics, GraphicsBox, Graphics3D, Graphics3DBox, MeshRegion, BoundaryMeshRegion, GeometricTransformation, GeometricTransformationBox, Rotate, Translate, Scale, SurfaceGraphics, Text, TextBox, Inset, InsetBox, Inset3DBox, Panel, PanelBox, Legended, Placed, LineLegend, Texture};

transforms[output_, errors0_]:=Module[{f, k},
	If[Head@output === List,
		output = Grid@output
	];
	errors = "<br>" <> StringRiffle[errors0, "\n"];
	If[ByteCount[output] > 100*^7,
		f = CreateFile[];
		Export[f, 
			Rasterize@"Loading...",
			"HTMLFragment", "GraphicsOutput"->Automatic
		];
		
		LocalSubmit[With[{file = f, out = output},(
			Export[
				f,
				Column@{out, errors},
				"HTMLFragment", "GraphicsOutput"->Automatic
			]
		)]];
		Return[f];
		,

		f = CreateFile[];
		Export[f, 
			Column@{output, errors},
			"HTMLFragment", "GraphicsOutput"->Automatic
		];
		Return[f];
	];

		(*
		f = CreateFile[];
		OpenWrite[f, BinaryFormat->True];
		BinaryWrite[f, 
				ExportString[
					Rasterize@ToString[output, TotalWidth->100],
					"HTMLFragment",
					"GraphicsOutput"->Automatic] <> If[Length@errors>0, "<pre>" <> ToString[errors, InputForm, TotalWidth -> 3500] <> "</pre>", ""]
		];
		Close[f];

		LocalSubmit[With[{file = f, out = output},(
			errors = {};
			OpenWrite[file];
			Write[file, 
					ExportString[
						Rasterize[Short[out, 10]],
						"PNG"]
			];
		Close[file];
		)]];
		*)
		

		Return[f];


		If[!(graphicsQ@output) && (!MemberQ[graphicHeads, Head@output]),
			BinaryWrite[f, 
					ExportString[
						ToString[output, InputForm, TotalWidth -> 3500],
						"HTMLFragment",
						"GraphicsOutput"->"JPEG",
						"XMLTransformationFunction"->(StringReplace[#, {"<" -> "&lt;", ">"->"&gt;"}] &)]
			];
			Close[f];
			Return[f]
		];

		If[output === Null,
			BinaryWrite[f, ""];
			Close[f];
			Return[f];
		];
		
		
		BinaryWrite[f,
			"<img src=\"data:image/png;base64," <> 
			(ExportString[(Rasterize@Short[output, 50]), {"Base64", "PNG"}]) <>
			"\" />" <> "<br />" <> "<pre>" <> ToString[errors, InputForm, TotalWidth -> 3500] <> "</pre>"
		];

		Close[f];
		Return[f]

];

transforms[output_]:=Module[{f, txt}, 

		If[Head@output === List,
			output = Grid@output
		];

		f = CreateFile[];
		SetSharedVariable[f];
		SetSharedVariable[output];

	

		ParallelSubmit[
			BinaryWrite[f, 
					ExportString[
						Rasterize@Short[output, 10],
						"HTMLFragment",
						"GraphicsOutput"->Automatic]
			];
			Close[f];
		];
		Return[f];


		
		If[!(graphicsQ@output) && (!MemberQ[graphicHeads, Head@output]),
			BinaryWrite[f, 
					ExportString[
						ToString[output, InputForm, TotalWidth -> 3500],
						"HTMLFragment",
						"GraphicsOutput"->"JPEG",
						"XMLTransformationFunction"->(StringReplace[#, {"<" -> "&lt;", ">"->"&gt;"}] &)]
			];
			Close[f];
			Return[f]
		];

		If[output === Null,
			BinaryWrite[f, ""];
			Close[f];
			Return[f];
		];
		
		
		BinaryWrite[f,
			"<img src=\"data:image/png;base64," <> 
			(ExportString[(Rasterize@Short[output, 50]), {"Base64", "PNG"}]) <>
			"\" />"
		];

		Close[f];
		Return[f]
];

transformsIO[output_, errors_]:=Module[{out, short},
	Which[
		(ByteCount[output] + ByteCount[errors]) > 1000000 && Length@errors > 0,
		out = ExportString[
			Column@{Rasterize@Short[output, 10], Rasterize@Short[errors, 10]},
			"HTMLFragment",
			"GraphicsOutput"->"PNG"
		];,
		(ByteCount[output] + ByteCount[errors]) > 1000000,
		out = ExportString[
			Rasterize@Short[output, 10],
			"HTMLFragment",
			"GraphicsOutput"->"PNG"
		];,
		Length@erros > 0,
		out = ExportString[
			GraphicsColumn[
			{output,
			errors}], 
			"HTMLFragment",
			"GraphicsOutput"->"PNG"
		];,
		True,
		out = ExportString[
			output, 
			"HTMLFragment",
			"GraphicsOutput"->"PNG"
		];
	];

	out
];

lowerResolution =.;
lowerResolution[g_]:=Rasterize[g, ImageResolution->72];
(*lowerResolution[g_Graphics]:=g;*)

transformsCell[output_, errors_]:=Module[{out, file, processed},
	now = Now;
	file = CreateFile[];

	Print["Errors: ", errors, Length@errors > 1];
	out = If[
		ByteCount[Column[{output, errors}]] < 1000000,
		Print["Output: ", output];
		If[Length@errors > 1, 
			Export[
				file,
				Column@{
					output,
					Rasterize@Short[errors, 5]},
				"HTMLFragment", 
				"GraphicsOutput"->"SVG"
			],
			Export[
				file,
				output, 
				"HTMLFragment", 
				"GraphicsOutput"->"SVG"
			]
		],

		processed = output /. {g_Graphics :> lowerResolution[g], g_Image :> lowerResolution[g], g_GeoGraphics :> lowerResolution[g]};

		If[Length@errors > 1, 
			Export[
				file,
				Rasterize@Column@{
					Short[processed, 5],
					Short[errors /. {} -> "", 5]},
				"HTMLFragment", 
				"GraphicsOutput"->"SVG"
			],
			Export[
				file,
				Rasterize[Short[processed, 5]], 
				"HTMLFragment", 
				"GraphicsOutput"->"SVG"
				]
			]
		];
	(*
	out
	out = Export[
		file,
		Column@{
			output, 
			errors},
		"ExpressionJSON",
		"Compact"->True
	];
	*)
	out
];
