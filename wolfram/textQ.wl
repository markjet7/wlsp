textQ[expr_] := Module[
		{
			(* the head of expr *)
			exprHead,

			(* pattern objects *)
			pObjects
		}, 

		(* if we cannot use the frontend, use text *)
		If[
			!$canUseFrontEnd,
			Return[True];
		];

		(* save the head of the expression *)
		exprHead = Head[expr];

		(* if the expression is wrapped with InputForm or OutputForm,
			automatically format as text *)
		If[exprHead === InputForm || exprHead === OutputForm,
			Return[True]
		];

		(* if the FormatType of $Output is set to TeXForm, or if the expression is wrapped with TeXForm,
			and the expression has an acceptable textual form, format as text *)
		If[(exprHead == TeXForm) && !containsPUAQ[ToString[expr]],
			Return[True];
		];

		(* if the FormatType of $Output is set to TraditionalForm,
			or if the expression is wrapped with TraditionalForm,
			do not use text *)
		If[exprHead === TraditionalForm,
			Return[False]
		];

		(* breakdown expr into atomic objects organized by their Head *)
		pObjects = 
			GroupBy[
				Complement[
					Quiet[Cases[
						expr, 
						elem_ /; (Depth[Unevaluated[elem]] == 1) :> Hold[elem], 
						{0, Infinity}, 
						Heads -> True
					]],
					(* these symbols are fine *)
					{Hold[List], Hold[Association]}
				],
				(
					Replace[
						#1,
						Hold[elem_] :> Head[Unevaluated[elem]]
					]
				) &
			];

	   	(* if expr just contains atomic objects of the types listed above, return True *)
		If[
			ContainsOnly[Keys[pObjects], {Integer, Real}],
			Return[True];
	   	];

	   	(* if expr just contains atomic objects of the types listed above, along with some symbols,
	   		return True only if the symbols have no attached rules *)
		If[
			ContainsOnly[Keys[pObjects], {Integer, Real, String, Symbol}],
	   		Return[
				AllTrue[
						Lookup[pObjects, String, {}], 
						(!containsPUAQ[ReleaseHold[#1]]) &
					] &&
		   			AllTrue[
		   				Lookup[pObjects, Symbol, {}], 
		   				(
							Replace[
								#1,
								Hold[elem_] :> ToString[Definition[elem]]
							] === "Null"
		   				) &
		   			]
	   		];
	   	];

	   	(* otherwise, no, the result should not be displayed as text *)
	   	Return[False];
	];


containsPUAQ[str_] :=
		AnyTrue[
			ToCharacterCode[str, "Unicode"],
			(57344 <= #1 <= 63743 || 983040 <= #1 <= 1048575 || 1048576 <= #1 <= 1114111) &
		];