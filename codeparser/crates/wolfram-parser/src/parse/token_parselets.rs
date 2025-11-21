//! Mapping [`TokenKind`] variants to parselet implementations

#![allow(non_upper_case_globals)]

use crate::parse::{operators::CompoundOperator, parselet::*};


pub(crate) const under1Parselet: UnderParselet = UnderParselet::new(
    CompoundOperator::Blank,
    CompoundOperator::CodeParser_PatternBlank,
);
pub(crate) const under2Parselet: UnderParselet = UnderParselet::new(
    CompoundOperator::BlankSequence,
    CompoundOperator::CodeParser_PatternBlankSequence,
);
pub(crate) const under3Parselet: UnderParselet = UnderParselet::new(
    CompoundOperator::BlankNullSequence,
    CompoundOperator::CodeParser_PatternBlankNullSequence,
);

macro_rules! token_kind_to_prefix_parselet {
    ($ty:ty; $kind:ident; $callback:expr) => {{
        use crate::{
            tokenize::TokenKind as TK,
            parse::parselet::*,
            precedence::Precedence,
        };

    match $kind {
        TK::EndOfFile => $callback(&PrefixEndOfFileParselet {}),

        TK::String
        | TK::Integer
        | TK::Real
        | TK::Rational
        | TK::LinearSyntaxBlob => $callback(&LeafParselet {}),

        TK::Unknown
        | TK::Whitespace
        | TK::InternalNewline
        | TK::Comment => $callback(&PrefixErrorParselet {}),


        TK::Error_ExpectedEqual
        | TK::Error_Number
        | TK::Error_UnhandledCharacter
        | TK::Error_ExpectedLetterlike
        | TK::Error_Aborted
        | TK::Error_ExpectedOperand
        | TK::Error_ExpectedTag
        | TK::Error_ExpectedFile
        | TK::Error_UnterminatedComment
        | TK::Error_UnterminatedString
        | TK::Error_UnterminatedFileString
        | TK::Error_UnterminatedLinearSyntaxBlob
        | TK::Error_UnsupportedToken
        | TK::Error_UnexpectedCloser
        | TK::Error_UnsafeCharacterEncoding
        | TK::Error_UnexpectedCommentCloser => $callback(&PrefixErrorParselet {}),


        TK::BarGreater
        | TK::CloseCurly
        | TK::CloseParen
        | TK::CloseSquare
        | TK::LongName_CloseCurlyDoubleQuote
        | TK::LongName_CloseCurlyQuote
        | TK::LongName_RightAngleBracket
        | TK::LongName_RightAssociation
        | TK::LongName_RightBracketingBar
        | TK::LongName_RightCeiling
        | TK::LongName_RightDoubleBracket
        | TK::LongName_RightDoubleBracketingBar
        | TK::LongName_RightFloor => $callback(&PrefixCloserParselet {}),


        TK::Minus      => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_MINUS, PrefixOperator::Minus)),
        TK::Plus       => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_PLUS, PrefixOperator::Plus)),
        TK::Bang       => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_BANG, PrefixOperator::Not)),
        TK::PlusPlus   => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_PLUSPLUS, PrefixOperator::PreIncrement)),
        TK::MinusMinus => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_MINUSMINUS, PrefixOperator::PreDecrement)),

        TK::BangBang => $callback(&PrefixOperatorParselet::new(Precedence::FAKE_PREFIX_BANGBANG, PrefixOperator::CodeParser_PrefixNot2)),

        TK::LongName_PlusMinus            => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_LONGNAME_PLUSMINUS, PrefixOperator::PlusMinus)),
        TK::LongName_Sum                  => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_SUM, PrefixOperator::Sum)),
        TK::LongName_Not                  => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_NOT, PrefixOperator::Not)),
        TK::LongName_Sqrt                 => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_SQRT, PrefixOperator::Sqrt)),
        TK::LongName_MinusPlus            => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_LONGNAME_MINUSPLUS, PrefixOperator::MinusPlus)),
        TK::LongName_DifferentialD        => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_DIFFERENTIALD, PrefixOperator::DifferentialD)),
        TK::LongName_CapitalDifferentialD => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_CAPITALDIFFERENTIALD, PrefixOperator::CapitalDifferentialD)),
        TK::LongName_Minus                => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_LONGNAME_MINUS, PrefixOperator::Minus)),
        TK::LongName_Del                  => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_DEL, PrefixOperator::Del)),
        TK::LongName_Square               => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_SQUARE, PrefixOperator::Square)),


        TK::Comma
        | TK::LongName_InvisibleComma => $callback(&PrefixCommaParselet {}),


        TK::LongName_Product                   => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_PRODUCT, PrefixOperator::Product)),
        TK::LongName_ContinuedFractionK        => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_CONTINUEDFRACTIONK, PrefixOperator::ContinuedFractionK)),
        TK::LongName_CircleTimes               => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_LONGNAME_CIRCLETIMES, PrefixOperator::CircleTimes)),
        TK::LongName_ForAll                    => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_FORALL, PrefixOperator::ForAll)),
        TK::LongName_Exists                    => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_EXISTS, PrefixOperator::Exists)),
        TK::LongName_NotExists                 => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_NOTEXISTS,PrefixOperator:: NotExists)),
        TK::LongName_Coproduct                 => $callback(&PrefixOperatorParselet::new(Precedence::PREFIX_LONGNAME_COPRODUCT, PrefixOperator::Coproduct)),
        TK::LongName_Piecewise                 => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_PIECEWISE, PrefixOperator::Piecewise)),
        TK::LongName_InvisiblePrefixScriptBase => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_INVISIBLEPREFIXSCRIPTBASE, PrefixOperator::InvisiblePrefixScriptBase)),
        TK::LongName_ExpectationE              => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_EXPECTATIONE, PrefixOperator::ExpectationE)),
        TK::LongName_CubeRoot                  => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_CUBEROOT, PrefixOperator::CubeRoot)),
        TK::LongName_ProbabilityPr             => $callback(&PrefixOperatorParselet::new(Precedence::LONGNAME_PROBABILITYPR, PrefixOperator::ProbabilityPr)),

        TK::LinearSyntax_Bang => $callback(&PrefixOperatorParselet::new(Precedence::LINEARSYNTAX_BANG, PrefixOperator::CodeParser_PrefixLinearSyntaxBang)),
        | TK::LinearSyntax_At
        | TK::LinearSyntax_Amp
        | TK::LinearSyntax_Star
        | TK::LinearSyntax_Under
        | TK::LinearSyntax_Caret
        | TK::LinearSyntax_Space
        | TK::LinearSyntax_Percent
        | TK::LinearSyntax_Plus
        | TK::LinearSyntax_Slash
        | TK::LinearSyntax_BackTick
        | TK::LinearSyntax_CloseParen => $callback(&PrefixUnsupportedTokenParselet {}),


        //
        // Groups
        //
        TK::OpenParen                        => $callback(&GroupParselet::new(TK::OpenParen, GroupOperator::CodeParser_GroupParen)),
        TK::OpenSquare                       => $callback(&GroupParselet::new(TK::OpenSquare, GroupOperator::CodeParser_GroupSquare)),
        TK::OpenCurly                        => $callback(&GroupParselet::new(TK::OpenCurly, GroupOperator::List)),
        TK::LessBar                          => $callback(&GroupParselet::new(TK::LessBar, GroupOperator::Association)),
        TK::ColonColonOpenSquare             => $callback(&GroupParselet::new(TK::ColonColonOpenSquare, GroupOperator::CodeParser_GroupTypeSpecifier)),
        TK::LongName_LeftAngleBracket        => $callback(&GroupParselet::new(TK::LongName_LeftAngleBracket, GroupOperator::AngleBracket)),
        TK::LongName_LeftCeiling             => $callback(&GroupParselet::new(TK::LongName_LeftCeiling, GroupOperator::Ceiling)),
        TK::LongName_LeftFloor               => $callback(&GroupParselet::new(TK::LongName_LeftFloor, GroupOperator::Floor)),
        TK::LongName_LeftDoubleBracket       => $callback(&GroupParselet::new(TK::LongName_LeftDoubleBracket, GroupOperator::CodeParser_GroupDoubleBracket)),
        TK::LongName_LeftBracketingBar       => $callback(&GroupParselet::new(TK::LongName_LeftBracketingBar, GroupOperator::BracketingBar)),
        TK::LongName_LeftDoubleBracketingBar => $callback(&GroupParselet::new(TK::LongName_LeftDoubleBracketingBar, GroupOperator::DoubleBracketingBar)),
        TK::LongName_LeftAssociation         => $callback(&GroupParselet::new(TK::LongName_LeftAssociation, GroupOperator::Association)),
        TK::LongName_OpenCurlyQuote          => $callback(&GroupParselet::new(TK::LongName_OpenCurlyQuote, GroupOperator::CurlyQuote)),
        TK::LongName_OpenCurlyDoubleQuote    => $callback(&GroupParselet::new(TK::LongName_OpenCurlyDoubleQuote, GroupOperator::CurlyDoubleQuote)),

        //----------------------------
        // Special
        //----------------------------

        //
        // context sensitive parsing of  x_
        //
        TK::Symbol => $callback(&SymbolParselet {}),

        //
        // context sensitive parsing of _x
        //
        TK::Under           => $callback(&UnderParselet::new(CompoundOperator::Blank, CompoundOperator::CodeParser_PatternBlank)),
        TK::UnderUnder      => $callback(&UnderParselet::new(CompoundOperator::BlankSequence, CompoundOperator::CodeParser_PatternBlankSequence)),
        TK::UnderUnderUnder => $callback(&UnderParselet::new(CompoundOperator::BlankNullSequence, CompoundOperator::CodeParser_PatternBlankNullSequence)),

        TK::UnderDot => $callback(&UnderDotParselet {}),


        TK::Hash => $callback(&HashParselet {}),
        TK::HashHash => $callback(&HashHashParselet {}),

        TK::Percent => $callback(&PercentParselet {}),
        TK::PercentPercent => $callback(&LeafParselet {}),

        // prefix, infix, postfix
        TK::SemiSemi => $callback(&SemiSemiParselet {}),

        //
        // Has to handle \[Integral] f \[DifferentialD] x
        //
        TK::LongName_Integral                        => $callback(&IntegralParselet::new(PrefixBinaryOperator::Integrate, PrefixOperator::Integral)),
        TK::LongName_ContourIntegral                 => $callback(&IntegralParselet::new(PrefixBinaryOperator::ContourIntegral, PrefixOperator::ContourIntegral)),
        TK::LongName_DoubleContourIntegral           => $callback(&IntegralParselet::new(PrefixBinaryOperator::DoubleContourIntegral, PrefixOperator::DoubleContourIntegral)),
        TK::LongName_ClockwiseContourIntegral        => $callback(&IntegralParselet::new(PrefixBinaryOperator::ClockwiseContourIntegral, PrefixOperator::ClockwiseContourIntegral)),
        TK::LongName_CounterClockwiseContourIntegral => $callback(&IntegralParselet::new(PrefixBinaryOperator::CounterClockwiseContourIntegral, PrefixOperator::CounterClockwiseContourIntegral)),

        // stringify next token (as a file]
        TK::LessLess => $callback(&LessLessParselet {}),


        TK::QuestionQuestion => $callback(&PrefixUnsupportedTokenParselet {}),

        // Also use for operators that are only valid in StandardForm.
        // e.g., \[Limit] does not have an interpretation in InputForm
        //
        // \[Limit] is not letterlike, so it needs some kind of categorization,
        // but it also needs to be prevented from making any valid parses.
        TK::LongName_Limit
        | TK::LongName_MaxLimit
        | TK::LongName_MinLimit => $callback(&PrefixUnsupportedTokenParselet {}),

        // technically, \[AutoLeftMatch] foo \[AutoRightMatch] does parse as
        // AutoMatch[foo] in InputForm but this is not documented,
        // and I'm not going to support it
        TK::LongName_AutoLeftMatch
        | TK::LongName_AutoRightMatch
        | TK::LongName_DiscreteShift
        | TK::LongName_DifferenceDelta
        | TK::LongName_DiscreteRatio
        | TK::LongName_PartialD => $callback(&PrefixUnsupportedTokenParselet {}),


        _ => $callback(&PrefixUnhandledParselet {}),
    } }}
}

//======================================
// Infix Parselets
//======================================

macro_rules! token_kind_to_infix_parselet {
    ($ty:ty; $kind:ident; $callback:expr) => {{

    use crate::{
        tokenize::TokenKind as TK,
        parse::parselet::*,
        precedence::Precedence
    };

    match $kind {
        TK::EndOfFile => $callback(&InfixAssertFalseParselet {}),

        TK::Unknown
        | TK::Whitespace
        | TK::InternalNewline
        | TK::Comment => $callback(&InfixAssertFalseParselet {}),

        TK::ToplevelNewline => $callback(&InfixToplevelNewlineParselet {}),


        TK::Error_ExpectedEqual
        | TK::Error_Number
        | TK::Error_UnhandledCharacter
        | TK::Error_ExpectedLetterlike
        | TK::Error_Aborted
        | TK::Error_ExpectedOperand
        | TK::Error_ExpectedTag
        | TK::Error_ExpectedFile
        | TK::Error_UnterminatedComment
        | TK::Error_UnterminatedString
        | TK::Error_UnterminatedFileString
        | TK::Error_UnterminatedLinearSyntaxBlob
        | TK::Error_UnsupportedToken
        | TK::Error_UnexpectedCloser
        | TK::Error_UnsafeCharacterEncoding
        | TK::Error_UnexpectedCommentCloser => $callback(&InfixAssertFalseParselet {}),

        TK::BarGreater
        | TK::CloseCurly
        | TK::CloseParen
        | TK::CloseSquare
        | TK::LongName_CloseCurlyDoubleQuote
        | TK::LongName_CloseCurlyQuote
        | TK::LongName_RightAngleBracket
        | TK::LongName_RightAssociation
        | TK::LongName_RightBracketingBar
        | TK::LongName_RightCeiling
        | TK::LongName_RightDoubleBracket
        | TK::LongName_RightDoubleBracketingBar
        | TK::LongName_RightFloor => $callback(&InfixAssertFalseParselet {}),

        TK::LongName_DifferentialD
        | TK::LongName_CapitalDifferentialD => $callback(&InfixDifferentialDParselet {}),


        //
        // Binary
        //

        TK::Slash            => $callback(&BinaryOperatorParselet::new(Precedence::SLASH, BinaryOperator::Divide)),
        TK::Caret            => $callback(&BinaryOperatorParselet::new(Precedence::CARET, BinaryOperator::Power)),
        TK::CaretEqual       => $callback(&BinaryOperatorParselet::new(Precedence::CARETEQUAL, BinaryOperator::UpSet)),
        TK::CaretColonEqual  => $callback(&BinaryOperatorParselet::new(Precedence::CARETCOLONEQUAL, BinaryOperator::UpSetDelayed)),
        TK::SlashAt          => $callback(&BinaryOperatorParselet::new(Precedence::SLASHAT, BinaryOperator::Map)),
        TK::MinusGreater     => $callback(&BinaryOperatorParselet::new(Precedence::MINUSGREATER, BinaryOperator::Rule)),
        TK::AtAt             => $callback(&BinaryOperatorParselet::new(Precedence::ATAT, BinaryOperator::Apply)),
        TK::SlashSemi        => $callback(&BinaryOperatorParselet::new(Precedence::SLASHSEMI, BinaryOperator::Condition)),
        TK::SlashDot         => $callback(&BinaryOperatorParselet::new(Precedence::SLASHDOT, BinaryOperator::ReplaceAll)),
        TK::ColonGreater     => $callback(&BinaryOperatorParselet::new(Precedence::COLONGREATER, BinaryOperator::RuleDelayed)),
        TK::SlashSlashDot    => $callback(&BinaryOperatorParselet::new(Precedence::SLASHSLASHDOT, BinaryOperator::ReplaceRepeated)),
        TK::PlusEqual        => $callback(&BinaryOperatorParselet::new(Precedence::PLUSEQUAL, BinaryOperator::AddTo)),
        TK::StarEqual        => $callback(&BinaryOperatorParselet::new(Precedence::STAREQUAL, BinaryOperator::TimesBy)),
        TK::MinusEqual       => $callback(&BinaryOperatorParselet::new(Precedence::MINUSEQUAL, BinaryOperator::SubtractFrom)),
        TK::SlashEqual       => $callback(&BinaryOperatorParselet::new(Precedence::SLASHEQUAL, BinaryOperator::DivideBy)),
        TK::LessMinusGreater => $callback(&BinaryOperatorParselet::new(Precedence::LESSMINUSGREATER, BinaryOperator::TwoWayRule)),
        TK::SlashSlashAt     => $callback(&BinaryOperatorParselet::new(Precedence::SLASHSLASHAT, BinaryOperator::MapAll)),
        TK::At               => $callback(&BinaryOperatorParselet::new(Precedence::AT, BinaryOperator::CodeParser_BinaryAt)),
        TK::AtAtAt           => $callback(&BinaryOperatorParselet::new(Precedence::ATATAT, BinaryOperator::MapApply)),
        TK::SlashSlash       => $callback(&BinaryOperatorParselet::new(Precedence::SLASHSLASH, BinaryOperator::CodeParser_BinarySlashSlash)),
        TK::Question         => $callback(&BinaryOperatorParselet::new(Precedence::INFIX_QUESTION, BinaryOperator::PatternTest)),
        TK::BarMinusGreater  => $callback(&BinaryOperatorParselet::new(Precedence::BARMINUSGREATER, BinaryOperator::Function)),
        TK::SlashSlashEqual  => $callback(&BinaryOperatorParselet::new(Precedence::SLASHSLASHEQUAL, BinaryOperator::ApplyTo)),

        TK::LongName_Divide               => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_DIVIDE, BinaryOperator::Divide)),
        TK::LongName_DivisionSlash        => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_DIVISIONSLASH, BinaryOperator::Divide)),
        TK::LongName_Implies              => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_IMPLIES, BinaryOperator::Implies)),
        TK::LongName_RoundImplies         => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_ROUNDIMPLIES, BinaryOperator::RoundImplies)),
        TK::LongName_PlusMinus            => $callback(&BinaryOperatorParselet::new(Precedence::INFIX_LONGNAME_PLUSMINUS, BinaryOperator::PlusMinus)),
        TK::LongName_DirectedEdge         => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_DIRECTEDEDGE, BinaryOperator::DirectedEdge)),
        TK::LongName_Rule                 => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_RULE, BinaryOperator::Rule)),
        TK::LongName_RuleDelayed          => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_RULEDELAYED, BinaryOperator::RuleDelayed)),
        TK::LongName_UndirectedEdge       => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_UNDIRECTEDEDGE, BinaryOperator::UndirectedEdge)),
        TK::LongName_Function             => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_FUNCTION, BinaryOperator::Function)),
        TK::LongName_MinusPlus            => $callback(&BinaryOperatorParselet::new(Precedence::INFIX_LONGNAME_MINUSPLUS, BinaryOperator::MinusPlus)),
        TK::LongName_TwoWayRule           => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_TWOWAYRULE, BinaryOperator::TwoWayRule)),
        TK::LongName_InvisibleApplication => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_INVISIBLEAPPLICATION, BinaryOperator::CodeParser_BinaryAt)),
        TK::LongName_CircleMinus          => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_CIRCLEMINUS, BinaryOperator::CircleMinus)),
        TK::LongName_SuchThat             => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_SUCHTHAT, BinaryOperator::SuchThat)),
        TK::LongName_Perpendicular        => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_PERPENDICULAR, BinaryOperator::Perpendicular)),
        TK::LongName_Because              => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_BECAUSE, BinaryOperator::Because)),
        TK::LongName_Therefore            => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_THEREFORE, BinaryOperator::Therefore)),
        TK::LongName_RightTee             => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_RIGHTTEE, BinaryOperator::RightTee)),
        TK::LongName_LeftTee              => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_LEFTTEE, BinaryOperator::LeftTee)),
        TK::LongName_DoubleRightTee       => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_DOUBLERIGHTTEE, BinaryOperator::DoubleRightTee)),
        TK::LongName_DoubleLeftTee        => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_DOUBLELEFTTEE, BinaryOperator::DoubleLeftTee)),
        TK::LongName_UpTee                => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_UPTEE, BinaryOperator::UpTee)),
        TK::LongName_DownTee              => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_DOWNTEE, BinaryOperator::DownTee)),
        TK::LongName_Application          => $callback(&BinaryOperatorParselet::new(Precedence::LONGNAME_APPLICATION, BinaryOperator::Application)),


        //
        // Infix
        //
        // Note that these are the operators that make sense to be infix in WL source code.
        //
        // These may not necessarily correspond to Flat functions in WL.
        //
        TK::Minus           => $callback(&InfixOperatorParselet::new(Precedence::INFIX_MINUS, InfixOperator::Plus)),
        TK::EqualEqualEqual => $callback(&InfixOperatorParselet::new(Precedence::EQUALEQUALEQUAL, InfixOperator::SameQ)),
        TK::EqualBangEqual  => $callback(&InfixOperatorParselet::new(Precedence::EQUALBANGEQUAL, InfixOperator::UnsameQ)),
        TK::Plus            => $callback(&InfixOperatorParselet::new(Precedence::INFIX_PLUS, InfixOperator::Plus)),
        TK::Dot             => $callback(&InfixOperatorParselet::new(Precedence::DOT, InfixOperator::Dot)),
        TK::StarStar        => $callback(&InfixOperatorParselet::new(Precedence::STARSTAR, InfixOperator::NonCommutativeMultiply)),
        TK::AmpAmp          => $callback(&InfixOperatorParselet::new(Precedence::AMPAMP, InfixOperator::And)),
        TK::BarBar          => $callback(&InfixOperatorParselet::new(Precedence::BARBAR, InfixOperator::Or)),
        TK::Bar             => $callback(&InfixOperatorParselet::new(Precedence::BAR, InfixOperator::Alternatives)),
        TK::LessGreater     => $callback(&InfixOperatorParselet::new(Precedence::LESSGREATER, InfixOperator::StringJoin)),
        TK::TildeTilde      => $callback(&InfixOperatorParselet::new(Precedence::TILDETILDE, InfixOperator::StringExpression)),
        TK::AtStar          => $callback(&InfixOperatorParselet::new(Precedence::ATSTAR, InfixOperator::Composition)),
        TK::SlashStar       => $callback(&InfixOperatorParselet::new(Precedence::SLASHSTAR, InfixOperator::RightComposition)),

        //
        // Times
        //
        TK::Star
        | TK::LongName_Times
        | TK::LongName_InvisibleTimes
        | TK::Fake_ImplicitTimes => $callback(&TimesParselet {}),


        //
        // Set relations
        //
        TK::LongName_Element                => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::Element)),
        TK::LongName_Subset                 => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::Subset)),
        TK::LongName_Superset               => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::Superset)),
        TK::LongName_SubsetEqual            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::SubsetEqual)),
        TK::LongName_SupersetEqual          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::SupersetEqual)),
        TK::LongName_NotElement             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotElement)),
        TK::LongName_NotSubset              => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotSubset)),
        TK::LongName_NotSuperset            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotSuperset)),
        TK::LongName_NotSubsetEqual         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotSubsetEqual)),
        TK::LongName_NotSupersetEqual       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotSupersetEqual)),
        TK::LongName_SquareSubset           => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::SquareSubset)),
        TK::LongName_SquareSuperset         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::SquareSuperset)),
        TK::LongName_NotSquareSubset        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotSquareSubset)),
        TK::LongName_NotSquareSuperset      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotSquareSuperset)),
        TK::LongName_SquareSubsetEqual      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::SquareSubsetEqual)),
        TK::LongName_SquareSupersetEqual    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::SquareSupersetEqual)),
        TK::LongName_NotSquareSubsetEqual   => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotSquareSubsetEqual)),
        TK::LongName_NotSquareSupersetEqual => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotSquareSupersetEqual)),
        TK::LongName_ReverseElement         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::ReverseElement)),
        TK::LongName_NotReverseElement      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::NotReverseElement)),
        TK::LongName_Distributed            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_SETRELATIONS, InfixOperator::Distributed)),

        TK::LongName_ImplicitPlus => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_IMPLICITPLUS, InfixOperator::Plus)),
        TK::LongName_And          => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_AND, InfixOperator::And)),
        TK::LongName_Or           => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_OR, InfixOperator::Or)),
        TK::LongName_Xor          => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_XOR, InfixOperator::Xor)),
        TK::LongName_Nand         => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_NAND, InfixOperator::Nand)),
        TK::LongName_Nor          => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_NOR, InfixOperator::Nor)),

        //
        // Horizontal arrows
        //
        TK::LongName_LeftArrow            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::LeftArrow)),
        TK::LongName_RightArrow           => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::RightArrow)),
        TK::LongName_LeftRightArrow       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::LeftRightArrow)),
        TK::LongName_LeftTeeArrow         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::LeftTeeArrow)),
        TK::LongName_RightTeeArrow        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::RightTeeArrow)),
        TK::LongName_RightArrowLeftArrow  => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::RightArrowLeftArrow)),
        TK::LongName_LeftArrowRightArrow  => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::LeftArrowRightArrow)),
        TK::LongName_DoubleLeftArrow      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::DoubleLeftArrow)),
        TK::LongName_DoubleRightArrow     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::DoubleRightArrow)),
        TK::LongName_DoubleLeftRightArrow => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::DoubleLeftRightArrow)),
        TK::LongName_LeftArrowBar         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::LeftArrowBar)),
        TK::LongName_RightArrowBar        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::RightArrowBar)),
        TK::LongName_ShortRightArrow      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::ShortRightArrow)),
        TK::LongName_ShortLeftArrow       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_HORIZONTALARROWS, InfixOperator::ShortLeftArrow)),

        //
        // Diagonal arrow operators
        //
        TK::LongName_UpperLeftArrow  => $callback(&InfixOperatorParselet::new(Precedence::CLASS_DIAGONALARROWOPERATORS, InfixOperator::UpperLeftArrow)),
        TK::LongName_UpperRightArrow => $callback(&InfixOperatorParselet::new(Precedence::CLASS_DIAGONALARROWOPERATORS, InfixOperator::UpperRightArrow)),
        TK::LongName_LowerRightArrow => $callback(&InfixOperatorParselet::new(Precedence::CLASS_DIAGONALARROWOPERATORS, InfixOperator::LowerRightArrow)),
        TK::LongName_LowerLeftArrow  => $callback(&InfixOperatorParselet::new(Precedence::CLASS_DIAGONALARROWOPERATORS, InfixOperator::LowerLeftArrow)),

        //
        // Vector operators
        //
        TK::LongName_LeftVector          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::LeftVector)),
        TK::LongName_RightVector         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::RightVector)),
        TK::LongName_LeftRightVector     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::LeftRightVector)),
        TK::LongName_LeftVectorBar       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::LeftVectorBar)),
        TK::LongName_RightVectorBar      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::RightVectorBar)),
        TK::LongName_LeftTeeVector       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::LeftTeeVector)),
        TK::LongName_RightTeeVector      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::RightTeeVector)),
        TK::LongName_DownLeftVector      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::DownLeftVector)),
        TK::LongName_DownRightVector     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::DownRightVector)),
        TK::LongName_DownLeftRightVector => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::DownLeftRightVector)),
        TK::LongName_DownLeftVectorBar   => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::DownLeftVectorBar)),
        TK::LongName_DownRightVectorBar  => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::DownRightVectorBar)),
        TK::LongName_DownLeftTeeVector   => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::DownLeftTeeVector)),
        TK::LongName_DownRightTeeVector  => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VECTOROPERATORS, InfixOperator::DownRightTeeVector)),

        //
        // Vertical arrow operators
        //
        TK::LongName_UpArrow           => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::UpArrow)),
        TK::LongName_DownArrow         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DownArrow)),
        TK::LongName_UpDownArrow       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::UpDownArrow)),
        TK::LongName_UpTeeArrow        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::UpTeeArrow)),
        TK::LongName_DownTeeArrow      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DownTeeArrow)),
        TK::LongName_UpArrowDownArrow  => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::UpArrowDownArrow)),
        TK::LongName_DoubleUpArrow     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DoubleUpArrow)),
        TK::LongName_DoubleDownArrow   => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DoubleDownArrow)),
        TK::LongName_DoubleUpDownArrow => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DoubleUpDownArrow)),
        TK::LongName_DownArrowUpArrow  => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DownArrowUpArrow)),
        //
        // itai asking about precedence of "long" arrows:
        // https://mail-archive.wolfram.com/archive/l-typeset/2021/Jul00/0000.html
        //
        TK::LongName_LongLeftArrow            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::LongLeftArrow)),
        TK::LongName_LongRightArrow           => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::LongRightArrow)),
        TK::LongName_LongLeftRightArrow       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::LongLeftRightArrow)),
        TK::LongName_DoubleLongLeftArrow      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DoubleLongLeftArrow)),
        TK::LongName_DoubleLongRightArrow     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DoubleLongRightArrow)),
        TK::LongName_DoubleLongLeftRightArrow => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DoubleLongLeftRightArrow)),
        TK::LongName_UpArrowBar               => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::UpArrowBar)),
        TK::LongName_DownArrowBar             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::DownArrowBar)),
        TK::LongName_ShortUpArrow             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::ShortUpArrow)),
        TK::LongName_ShortDownArrow           => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALARROWOPERATORS, InfixOperator::ShortDownArrow)),


        //
        // Vertical vector operators
        //
        TK::LongName_RightUpVector        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::RightUpVector)),
        TK::LongName_LeftUpVector         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::LeftUpVector)),
        TK::LongName_RightDownVector      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::RightDownVector)),
        TK::LongName_LeftDownVector       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::LeftDownVector)),
        TK::LongName_RightUpDownVector    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::RightUpDownVector)),
        TK::LongName_LeftUpDownVector     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::LeftUpDownVector)),
        TK::LongName_RightUpVectorBar     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::RightUpVectorBar)),
        TK::LongName_RightDownVectorBar   => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::RightDownVectorBar)),
        TK::LongName_LeftUpVectorBar      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::LeftUpVectorBar)),
        TK::LongName_LeftDownVectorBar    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::LeftDownVectorBar)),
        TK::LongName_RightUpTeeVector     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::RightUpTeeVector)),
        TK::LongName_RightDownTeeVector   => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::RightDownTeeVector)),
        TK::LongName_LeftUpTeeVector      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::LeftUpTeeVector)),
        TK::LongName_LeftDownTeeVector    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::LeftDownTeeVector)),
        TK::LongName_UpEquilibrium        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::UpEquilibrium)),
        TK::LongName_ReverseUpEquilibrium => $callback(&InfixOperatorParselet::new(Precedence::CLASS_VERTICALVECTOROPERATORS, InfixOperator::ReverseUpEquilibrium)),


        TK::LongName_CenterDot   => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_CENTERDOT, InfixOperator::CenterDot)),
        TK::LongName_Equivalent  => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_EQUIVALENT, InfixOperator::Equivalent)),
        TK::LongName_CircleDot   => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_CIRCLEDOT, InfixOperator::CircleDot)),
        TK::LongName_Conditioned => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_CONDITIONED, InfixOperator::Conditioned)),

        //
        // Union operators
        //
        TK::LongName_Union       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_UNIONOPERATORS, InfixOperator::Union)),
        TK::LongName_SquareUnion => $callback(&InfixOperatorParselet::new(Precedence::CLASS_UNIONOPERATORS, InfixOperator::SquareUnion)),
        TK::LongName_UnionPlus   => $callback(&InfixOperatorParselet::new(Precedence::CLASS_UNIONOPERATORS, InfixOperator::UnionPlus)),

        //
        // Intersection operators
        //
        TK::LongName_Intersection       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INTERSECTIONOPERATORS, InfixOperator::Intersection)),
        TK::LongName_SquareIntersection => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INTERSECTIONOPERATORS, InfixOperator::SquareIntersection)),


        TK::LongName_TensorWedge          => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_TENSORWEDGE, InfixOperator::TensorWedge)),
        TK::LongName_TensorProduct        => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_TENSORPRODUCT, InfixOperator::TensorProduct)),
        TK::LongName_Cross                => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_CROSS, InfixOperator::Cross)),
        TK::LongName_SmallCircle          => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_SMALLCIRCLE, InfixOperator::SmallCircle)),
        TK::LongName_Divides              => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_DIVIDES, InfixOperator::Divisible)),
        TK::LongName_VerticalSeparator    => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_VERTICALSEPARATOR, InfixOperator::VerticalSeparator)),
        TK::LongName_Backslash            => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_BACKSLASH, InfixOperator::Backslash)),
        TK::LongName_Diamond              => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_DIAMOND, InfixOperator::Diamond)),
        TK::LongName_Wedge                => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_WEDGE, InfixOperator::Wedge)),
        TK::LongName_Vee                  => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_VEE, InfixOperator::Vee)),
        TK::LongName_CircleTimes          => $callback(&InfixOperatorParselet::new(Precedence::INFIX_LONGNAME_CIRCLETIMES, InfixOperator::CircleTimes)),
        TK::LongName_Star                 => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_STAR, InfixOperator::Star)),
        TK::LongName_VerticalTilde        => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_VERTICALTILDE, InfixOperator::VerticalTilde)),
        TK::LongName_Coproduct            => $callback(&InfixOperatorParselet::new(Precedence::INFIX_LONGNAME_COPRODUCT, InfixOperator::Coproduct)),
        TK::LongName_Cap                  => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_CAP, InfixOperator::Cap)),
        TK::LongName_Cup                  => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_CUP, InfixOperator::Cup)),
        TK::LongName_CirclePlus           => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_CIRCLEPLUS, InfixOperator::CirclePlus)),
        TK::LongName_VerticalBar          => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_VERTICALBAR, InfixOperator::VerticalBar)),
        TK::LongName_DoubleVerticalBar    => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_DOUBLEVERTICALBAR, InfixOperator::DoubleVerticalBar)),
        TK::LongName_NotVerticalBar       => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_NOTVERTICALBAR, InfixOperator::NotVerticalBar)),
        TK::LongName_NotDoubleVerticalBar => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_NOTDOUBLEVERTICALBAR, InfixOperator::NotDoubleVerticalBar)),

        //
        // Ordering operators
        //
        TK::LongName_LeftTriangle          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::LeftTriangle)),
        TK::LongName_RightTriangle         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::RightTriangle)),
        TK::LongName_NotLeftTriangle       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotLeftTriangle)),
        TK::LongName_NotRightTriangle      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotRightTriangle)),
        TK::LongName_LeftTriangleEqual     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::LeftTriangleEqual)),
        TK::LongName_RightTriangleEqual    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::RightTriangleEqual)),
        TK::LongName_NotLeftTriangleEqual  => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotLeftTriangleEqual)),
        TK::LongName_NotRightTriangleEqual => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotRightTriangleEqual)),
        TK::LongName_LeftTriangleBar       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::LeftTriangleBar)),
        TK::LongName_RightTriangleBar      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::RightTriangleBar)),
        TK::LongName_NotLeftTriangleBar    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotLeftTriangleBar)),
        TK::LongName_NotRightTriangleBar   => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotRightTriangleBar)),
        TK::LongName_TildeEqual            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::TildeEqual)),
        TK::LongName_NotTildeEqual         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotTildeEqual)),
        TK::LongName_TildeFullEqual        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::TildeFullEqual)),
        TK::LongName_NotTildeFullEqual     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotTildeFullEqual)),
        TK::LongName_Tilde                 => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::Tilde)),
        TK::LongName_NotTilde              => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotTilde)),
        TK::LongName_EqualTilde            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::EqualTilde)),
        TK::LongName_NotEqualTilde         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotEqualTilde)),
        TK::LongName_TildeTilde            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::TildeTilde)),
        TK::LongName_NotTildeTilde         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotTildeTilde)),
        TK::LongName_Proportional          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::Proportional)),
        TK::LongName_Proportion            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::Proportion)),
        TK::LongName_Congruent             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::Congruent)),
        TK::LongName_NotCongruent          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotCongruent)),
        TK::LongName_Equilibrium           => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::Equilibrium)),
        TK::LongName_ReverseEquilibrium    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::ReverseEquilibrium)),
        TK::LongName_DotEqual              => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::DotEqual)),
        TK::LongName_Precedes              => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::Precedes)),
        TK::LongName_Succeeds              => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::Succeeds)),
        TK::LongName_PrecedesEqual         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::PrecedesEqual)),
        TK::LongName_SucceedsEqual         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::SucceedsEqual)),
        TK::LongName_PrecedesTilde         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::PrecedesTilde)),
        TK::LongName_SucceedsTilde         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::SucceedsTilde)),
        TK::LongName_PrecedesSlantEqual    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::PrecedesSlantEqual)),
        TK::LongName_SucceedsSlantEqual    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::SucceedsSlantEqual)),
        TK::LongName_NotPrecedes           => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotPrecedes)),
        TK::LongName_NotSucceeds           => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotSucceeds)),
        TK::LongName_NotPrecedesEqual      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotPrecedesEqual)),
        TK::LongName_NotSucceedsEqual      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotSucceedsEqual)),
        TK::LongName_NotPrecedesTilde      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotPrecedesTilde)),
        TK::LongName_NotSucceedsTilde      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotSucceedsTilde)),
        TK::LongName_NotPrecedesSlantEqual => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotPrecedesSlantEqual)),
        TK::LongName_NotSucceedsSlantEqual => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotSucceedsSlantEqual)),
        TK::LongName_CupCap                => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::CupCap)),
        TK::LongName_NotCupCap             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotCupCap)),
        TK::LongName_HumpEqual             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::HumpEqual)),
        TK::LongName_HumpDownHump          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::HumpDownHump)),
        TK::LongName_NotHumpEqual          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotHumpEqual)),
        TK::LongName_NotHumpDownHump       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_ORDERINGOPERATORS, InfixOperator::NotHumpDownHump)),

        //
        // special Inequality
        //
        TK::BangEqual                        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::EqualEqual                       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::Greater                          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::GreaterEqual                     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LessEqual                        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::Less                             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_Equal                   => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_GreaterEqual            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_GreaterEqualLess        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_GreaterFullEqual        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_GreaterGreater          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_GreaterLess             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_GreaterSlantEqual       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_GreaterTilde            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_LessEqual               => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_LessEqualGreater        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_LessFullEqual           => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_LessGreater             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_LessLess                => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_LessSlantEqual          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_LessTilde               => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_LongEqual               => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NestedGreaterGreater    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NestedLessLess          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotEqual                => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotGreater              => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotGreaterEqual         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotGreaterFullEqual     => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotGreaterGreater       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotGreaterLess          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotGreaterSlantEqual    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotGreaterTilde         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotLess                 => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotLessEqual            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotLessFullEqual        => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotLessGreater          => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotLessLess             => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotLessSlantEqual       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotLessTilde            => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotNestedGreaterGreater => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_NotNestedLessLess       => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        //
        // special VectorInequality
        //
        TK::LongName_VectorGreater      => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_VectorGreaterEqual => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_VectorLess         => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),
        TK::LongName_VectorLessEqual    => $callback(&InfixOperatorParselet::new(Precedence::CLASS_INEQUALITY, InfixOperator::CodeParser_InfixInequality)),


        TK::LongName_PermutationProduct => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_PERMUTATIONPRODUCT, InfixOperator::PermutationProduct)),
        TK::LongName_Colon              => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_COLON, InfixOperator::Colon)),
        TK::LongName_Xnor               => $callback(&InfixOperatorParselet::new(Precedence::LONGNAME_XNOR, InfixOperator::Xnor)),
        TK::LongName_Minus              => $callback(&InfixOperatorParselet::new(Precedence::INFIX_LONGNAME_MINUS, InfixOperator::Plus)),


        //
        // Postfix
        //
        TK::Amp                                 => $callback(&PostfixOperatorParselet::new(Precedence::AMP, PostfixOperator::Function)),
        TK::DotDot                              => $callback(&PostfixOperatorParselet::new(Precedence::DOTDOT, PostfixOperator::Repeated)),
        TK::Bang                                => $callback(&PostfixOperatorParselet::new(Precedence::POSTFIX_BANG, PostfixOperator::Factorial)),
        TK::MinusMinus                          => $callback(&PostfixOperatorParselet::new(Precedence::POSTFIX_MINUSMINUS, PostfixOperator::Decrement)),
        TK::PlusPlus                            => $callback(&PostfixOperatorParselet::new(Precedence::POSTFIX_PLUSPLUS, PostfixOperator::Increment)),
        TK::DotDotDot                           => $callback(&PostfixOperatorParselet::new(Precedence::DOTDOTDOT, PostfixOperator::RepeatedNull)),
        TK::BangBang                            => $callback(&PostfixOperatorParselet::new(Precedence::POSTFIX_BANGBANG, PostfixOperator::Factorial2)),
        TK::SingleQuote                         => $callback(&PostfixOperatorParselet::new(Precedence::SINGLEQUOTE, PostfixOperator::Derivative)),
        TK::LongName_Transpose                  => $callback(&PostfixOperatorParselet::new(Precedence::LONGNAME_TRANSPOSE, PostfixOperator::Transpose)),
        TK::LongName_Conjugate                  => $callback(&PostfixOperatorParselet::new(Precedence::LONGNAME_CONJUGATE, PostfixOperator::Conjugate)),
        TK::LongName_ConjugateTranspose         => $callback(&PostfixOperatorParselet::new(Precedence::LONGNAME_CONJUGATETRANSPOSE, PostfixOperator::ConjugateTranspose)),
        TK::LongName_HermitianConjugate         => $callback(&PostfixOperatorParselet::new(Precedence::LONGNAME_HERMITIANCONJUGATE, PostfixOperator::HermitianConjugate)),
        TK::LongName_InvisiblePostfixScriptBase => $callback(&PostfixOperatorParselet::new(Precedence::LONGNAME_INVISIBLEPOSTFIXSCRIPTBASE, PostfixOperator::InvisiblePostfixScriptBase)),


        //
        // Calls
        //
        TK::OpenSquare                 => $callback(&CallParselet::new(GroupParselet::new(TK::OpenSquare, GroupOperator::CodeParser_GroupSquare))),
        TK::LongName_LeftDoubleBracket => $callback(&CallParselet::new(GroupParselet::new(TK::LongName_LeftDoubleBracket, GroupOperator::CodeParser_GroupDoubleBracket))),
        TK::ColonColonOpenSquare       => $callback(&CallParselet::new(GroupParselet::new(TK::ColonColonOpenSquare, GroupOperator::CodeParser_GroupTypeSpecifier))),




        //
        // trailing ; and , is allowed
        //
        TK::Semi => $callback(&SemiParselet {}),

        TK::Comma => $callback(&CommaParselet {}),
        TK::LongName_InvisibleComma => $callback(&CommaParselet {}),

        //
        // prefix, infix, postfix
        //
        TK::SemiSemi => $callback(&SemiSemiParselet {}),

        //
        // ternary
        //
        TK::Tilde => $callback(&TildeParselet {}),

        //
        // context sensitive parsing of sym:obj and pat:v
        //
        TK::Colon => $callback(&ColonParselet {}),

        //
        // ternary, with different possibilities for second operator
        //
        TK::SlashColon => $callback(&SlashColonParselet {}),

        //
        // Has to handle  a =.  and  a = .
        //
        TK::Equal => $callback(&EqualParselet::new()),
        TK::ColonEqual => $callback(&ColonEqualParselet::new()),

        //
        // stringify next token (as a symbol)
        //
        TK::ColonColon => $callback(&ColonColonParselet {}),

        //
        // stringify next token (as a file)
        //
        TK::GreaterGreater => $callback(&GreaterGreaterParselet {}),
        TK::GreaterGreaterGreater => $callback(&GreaterGreaterGreaterParselet {}),


        TK::QuestionQuestion => $callback(&InfixAssertFalseParselet {}),

        //
        // Also use for operators that are only valid in StandardForm.
        // e.g., \[Limit] does not have an interpretation in InputForm
        //
        // \[Limit] is not letterlike, so it needs some kind of categorization,
        // but it also needs to be prevented from making any valid parses.
        //
        TK::LongName_Limit
        | TK::LongName_MaxLimit
        | TK::LongName_MinLimit => $callback(&InfixAssertFalseParselet {}),

        //
        // technically, \[AutoLeftMatch] foo \[AutoRightMatch] does parse as
        // AutoMatch[foo] in InputForm but this is not documented,
        // and I'm not going to support it
        //
        | TK::LongName_AutoLeftMatch
        | TK::LongName_AutoRightMatch
        | TK::LongName_DiscreteShift
        | TK::LongName_DifferenceDelta
        | TK::LongName_DiscreteRatio
        | TK::LongName_PartialD => $callback(&InfixAssertFalseParselet {}),

        // TODO: Debug assert renaming variants are isPossibleBeginning()
        _ => $callback(&InfixImplicitTimesParselet {}),
    }

    }}
}

pub(crate) use {token_kind_to_infix_parselet, token_kind_to_prefix_parselet};
