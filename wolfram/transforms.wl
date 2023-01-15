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

transforms[output_]:=Module[{f, txt}, 
		f = CreateFile[];
		
		BinaryWrite[f, 
				ExportString[
					Rasterize@Short[Echo@output, 10],
					"HTMLFragment",
					"GraphicsOutput"->Automatic]
		];
		Close[f];
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
