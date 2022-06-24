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

graphicHeads = {Point, PointBox, Line, LineBox, Arrow, ArrowBox, Rectangle, RectangleBox, Parallelogram, Triangle, JoinedCurve, Grid, Column, Row, JoinedCurveBox, FilledCurve, FilledCurveBox, StadiumShape, DiskSegment, Annulus, BezierCurve, BezierCurveBox, BSplineCurve, BSplineCurveBox, BSplineSurface, BSplineSurface3DBox, SphericalShell, CapsuleShape, Raster, RasterBox, Raster3D, Raster3DBox, Polygon, PolygonBox, RegularPolygon, Disk, DiskBox, Circle, CircleBox, Sphere, SphereBox, Ball, Ellipsoid, Cylinder, CylinderBox, Tetrahedron, TetrahedronBox, Cuboid, CuboidBox, Parallelepiped, Hexahedron, HexahedronBox, Prism, PrismBox, Pyramid, PyramidBox, Simplex, ConicHullRegion, ConicHullRegionBox, Hyperplane, HalfSpace, AffineHalfSpace, AffineSpace, ConicHullRegion3DBox, Cone, ConeBox, InfiniteLine, InfinitePlane, HalfLine, InfinitePlane, HalfPlane, Tube, TubeBox, GraphicsComplex, Image, GraphicsComplexBox, GraphicsGroup, GraphicsGroupBox, GeoGraphics, Graphics, GraphicsBox, Graphics3D, Graphics3DBox, MeshRegion, BoundaryMeshRegion, GeometricTransformation, GeometricTransformationBox, Rotate, Translate, Scale, SurfaceGraphics, Text, TextBox, Inset, InsetBox, Inset3DBox, Panel, PanelBox, Legended, Placed, LineLegend, Texture};

transforms[output_]:=Module[{f, txt}, 
		f = CreateFile[];

		If[!(graphicsQ@output) && (!MemberQ[ graphicHeads, Head@output]) && (ByteCount[output] < 1000000),
			WriteString[f, ExportString[ToString[output, InputForm, TotalWidth -> 4000], "HTMLFragment", "GraphicsOutput"->"PNG"]];
			Close[f];
			Return[f]
		];

		If[output === Null,
			WriteString[f, "\t"];
			Close[f];
			Return[f];
		];

		WriteString[f, 
			ExportString[
				If[graphicsQ@output,
					Rasterize[output /.Null->"", Background ->None], 

					Rasterize[Short[output, 25] /.Null->"", Background ->None]
				],
				"HTMLFragment", 
				"GraphicsOutput"->"PNG",
				"URIHandler" -> "Export", 
				"FilesDirectory" -> DirectoryName[f], 
				"FilesPrefix" -> "https://file%2B.vscode-resource.vscode-cdn.net" <> DirectoryName[f]
				]];

		Close[f];
		Return[f]
];

