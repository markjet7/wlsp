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
		f = CreateFile[];
		Print["Submitting Parallel"];
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

transformsIO[output_, errors_]:=Module[{out},
	If[Length@erros > 0,
		out = Rasterize@GraphicsColumn[
			{Short[output, 10],
			Short[errors, 10]}],
		out = Rasterize@Short[output, 10]
	];

	"<img src=\"data:image/png;base64," <> ExportString[out, {"Base64", "PNG"}] <> 	"\" />"
];
