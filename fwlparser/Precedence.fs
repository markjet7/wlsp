namespace FwlParser

open System.Collections.Generic

/// Associativity information mirroring rust precedence metadata.
type Associativity =
    | Left
    | Right
    | NonRight

module Precedence =
    // Map from TokenKind to (precedence level, associativity)
    // Generated from codeparser/crates/wolfram-parser/src/generated/precedence_values.rs
    let table: IReadOnlyDictionary<TokenKind, int * Associativity> =
        let d = Dictionary<TokenKind, int * Associativity>()
        let entries =
            [
                (TokenKind.Amp, (12, "NonRight"));
                (TokenKind.AmpAmp, (31, "NonRight"));
                (TokenKind.At, (82, "Right"));
                (TokenKind.AtAt, (80, "Right"));
                (TokenKind.AtAtAt, (80, "Right"));
                (TokenKind.AtStar, (85, "NonRight"));
                (TokenKind.Bar, (21, "NonRight"));
                (TokenKind.BarBar, (29, "NonRight"));
                (TokenKind.BarMinusGreater, (4, "Right"));
                (TokenKind.Caret, (75, "Right"));
                (TokenKind.CaretColonEqual, (4, "Right"));
                (TokenKind.CaretEqual, (4, "Right"));
                (TokenKind.ColonColon, (92, "NonRight"));
                (TokenKind.ColonEqual, (4, "Right"));
                (TokenKind.ColonGreater, (15, "Right"));
                (TokenKind.Comma, (1, "NonRight"));
                (TokenKind.Dot, (63, "NonRight"));
                (TokenKind.DotDot, (22, "NonRight"));
                (TokenKind.DotDotDot, (22, "NonRight"));
                (TokenKind.Equal, (4, "Right"));
                (TokenKind.EqualBangEqual, (35, "NonRight"));
                (TokenKind.EqualEqualEqual, (35, "NonRight"));
                (TokenKind.Fake_ImplicitTimes, (54, "NonRight"));
                (TokenKind.GreaterGreater, (3, "NonRight"));
                (TokenKind.GreaterGreaterGreater, (3, "NonRight"));
                (TokenKind.LessGreater, (76, "NonRight"));
                (TokenKind.LessLess, (91, "NonRight"));
                (TokenKind.LessMinusGreater, (16, "Right"));
                (TokenKind.LinearSyntax_Bang, (90, "NonRight"));
                (TokenKind.LongName_And, (31, "NonRight"));
                (TokenKind.LongName_Application, (83, "NonRight"));
                (TokenKind.LongName_Backslash, (60, "NonRight"));
                (TokenKind.LongName_Because, (6, "NonRight"));
                (TokenKind.LongName_Cap, (49, "NonRight"));
                (TokenKind.LongName_CapitalDifferentialD, (72, "NonRight"));
                (TokenKind.LongName_CenterDot, (55, "NonRight"));
                (TokenKind.LongName_CircleDot, (67, "NonRight"));
                (TokenKind.LongName_CircleMinus, (47, "NonRight"));
                (TokenKind.LongName_CirclePlus, (47, "NonRight"));
                (TokenKind.LongName_Colon, (11, "NonRight"));
                (TokenKind.LongName_Conditioned, (26, "NonRight"));
                (TokenKind.LongName_Conjugate, (78, "NonRight"));
                (TokenKind.LongName_ConjugateTranspose, (78, "NonRight"));
                (TokenKind.LongName_ContinuedFractionK, (52, "NonRight"));
                (TokenKind.LongName_Cross, (65, "NonRight"));
                (TokenKind.LongName_CubeRoot, (73, "NonRight"));
                (TokenKind.LongName_Cup, (48, "NonRight"));
                (TokenKind.LongName_Del, (70, "NonRight"));
                (TokenKind.LongName_Diamond, (59, "NonRight"));
                (TokenKind.LongName_DifferentialD, (72, "NonRight"));
                (TokenKind.LongName_DirectedEdge, (39, "Right"));
                (TokenKind.LongName_Divide, (61, "NonRight"));
                (TokenKind.LongName_Divides, (61, "NonRight"));
                (TokenKind.LongName_DivisionSlash, (61, "NonRight"));
                (TokenKind.LongName_DoubleLeftTee, (24, "NonRight"));
                (TokenKind.LongName_DoubleRightTee, (25, "Right"));
                (TokenKind.LongName_DoubleVerticalBar, (37, "NonRight"));
                (TokenKind.LongName_DownTee, (24, "NonRight"));
                (TokenKind.LongName_Equivalent, (28, "NonRight"));
                (TokenKind.LongName_Exists, (33, "NonRight"));
                (TokenKind.LongName_ExpectationE, (46, "NonRight"));
                (TokenKind.LongName_ForAll, (33, "NonRight"));
                (TokenKind.LongName_Function, (4, "Right"));
                (TokenKind.LongName_HermitianConjugate, (78, "NonRight"));
                (TokenKind.LongName_ImplicitPlus, (44, "NonRight"));
                (TokenKind.LongName_Implies, (27, "Right"));
                (TokenKind.LongName_InvisibleApplication, (82, "Right"));
                (TokenKind.LongName_InvisibleComma, (1, "NonRight"));
                (TokenKind.LongName_InvisiblePostfixScriptBase, (93, "NonRight"));
                (TokenKind.LongName_InvisiblePrefixScriptBase, (93, "NonRight"));
                (TokenKind.LongName_InvisibleTimes, (54, "NonRight"));
                (TokenKind.LongName_LeftTee, (24, "NonRight"));
                (TokenKind.LongName_Nand, (31, "NonRight"));
                (TokenKind.LongName_Nor, (29, "NonRight"));
                (TokenKind.LongName_Not, (32, "NonRight"));
                (TokenKind.LongName_NotDoubleVerticalBar, (37, "NonRight"));
                (TokenKind.LongName_NotExists, (33, "NonRight"));
                (TokenKind.LongName_NotVerticalBar, (37, "NonRight"));
                (TokenKind.LongName_Or, (29, "NonRight"));
                (TokenKind.LongName_PermutationProduct, (67, "NonRight"));
                (TokenKind.LongName_Perpendicular, (24, "NonRight"));
                (TokenKind.LongName_Piecewise, (71, "NonRight"));
                (TokenKind.LongName_ProbabilityPr, (46, "NonRight"));
                (TokenKind.LongName_Product, (52, "NonRight"));
                (TokenKind.LongName_RightTee, (25, "Right"));
                (TokenKind.LongName_RoundImplies, (27, "Right"));
                (TokenKind.LongName_Rule, (15, "Right"));
                (TokenKind.LongName_RuleDelayed, (15, "Right"));
                (TokenKind.LongName_SmallCircle, (68, "NonRight"));
                (TokenKind.LongName_Sqrt, (73, "NonRight"));
                (TokenKind.LongName_Square, (69, "NonRight"));
                (TokenKind.LongName_Star, (53, "NonRight"));
                (TokenKind.LongName_SuchThat, (23, "Right"));
                (TokenKind.LongName_Sum, (45, "NonRight"));
                (TokenKind.LongName_TensorProduct, (64, "NonRight"));
                (TokenKind.LongName_TensorWedge, (65, "NonRight"));
                (TokenKind.LongName_Therefore, (7, "Right"));
                (TokenKind.LongName_Times, (54, "NonRight"));
                (TokenKind.LongName_Transpose, (78, "NonRight"));
                (TokenKind.LongName_TwoWayRule, (16, "Right"));
                (TokenKind.LongName_UndirectedEdge, (39, "Right"));
                (TokenKind.LongName_UpTee, (24, "NonRight"));
                (TokenKind.LongName_Vee, (57, "NonRight"));
                (TokenKind.LongName_VerticalBar, (37, "NonRight"));
                (TokenKind.LongName_VerticalSeparator, (8, "NonRight"));
                (TokenKind.LongName_VerticalTilde, (51, "NonRight"));
                (TokenKind.LongName_Wedge, (58, "NonRight"));
                (TokenKind.LongName_Xnor, (30, "NonRight"));
                (TokenKind.LongName_Xor, (30, "NonRight"));
                (TokenKind.MinusEqual, (13, "Right"));
                (TokenKind.MinusGreater, (15, "Right"));
                (TokenKind.PlusEqual, (13, "Right"));
                (TokenKind.Semi, (2, "NonRight"));
                (TokenKind.SemiSemi, (40, "NonRight"));
                (TokenKind.SingleQuote, (77, "NonRight"));
                (TokenKind.Slash, (61, "NonRight"));
                (TokenKind.SlashAt, (80, "Right"));
                (TokenKind.SlashColon, (5, "Right"));
                (TokenKind.SlashDot, (14, "NonRight"));
                (TokenKind.SlashEqual, (13, "Right"));
                (TokenKind.SlashSemi, (17, "NonRight"));
                (TokenKind.SlashSlash, (9, "NonRight"));
                (TokenKind.SlashSlashAt, (80, "Right"));
                (TokenKind.SlashSlashDot, (14, "NonRight"));
                (TokenKind.SlashSlashEqual, (10, "Right"));
                (TokenKind.SlashStar, (84, "NonRight"));
                (TokenKind.Star, (54, "NonRight"));
                (TokenKind.StarCaret, (54, "NonRight"));
                (TokenKind.StarEqual, (13, "Right"));
                (TokenKind.StarStar, (66, "NonRight"));
                (TokenKind.Symbol, (94, "NonRight"));
                (TokenKind.Tilde, (81, "NonRight"));
                (TokenKind.TildeTilde, (18, "NonRight"));
                (TokenKind.Under, (94, "NonRight"));
            ]
        for (k, (prec, assoc)) in entries do
            let assoc' =
                match assoc with
                | "Left" -> Associativity.Left
                | "Right" -> Associativity.Right
                | _ -> Associativity.NonRight
            d[k] <- (prec, assoc')
        d :> IReadOnlyDictionary<_, _>
