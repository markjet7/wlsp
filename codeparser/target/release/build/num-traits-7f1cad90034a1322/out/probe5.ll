; ModuleID = 'probe5.8fa4411a83a02f32-cgu.0'
source_filename = "probe5.8fa4411a83a02f32-cgu.0"
target datalayout = "e-m:o-i64:64-i128:128-n32:64-S128-Fn32"
target triple = "arm64-apple-macosx11.0.0"

; core::f64::<impl f64>::copysign
; Function Attrs: inlinehint uwtable
define internal double @"_ZN4core3f6421_$LT$impl$u20$f64$GT$8copysign17h4ebf5e0e8b1610f3E"(double %self, double %sign) unnamed_addr #0 {
start:
  %0 = alloca [8 x i8], align 8
  %1 = call double @llvm.copysign.f64(double %self, double %sign)
  store double %1, ptr %0, align 8
  %_0 = load double, ptr %0, align 8
  ret double %_0
}

; probe5::probe
; Function Attrs: uwtable
define void @_ZN6probe55probe17h4761614583936265E() unnamed_addr #1 {
start:
; call core::f64::<impl f64>::copysign
  %_1 = call double @"_ZN4core3f6421_$LT$impl$u20$f64$GT$8copysign17h4ebf5e0e8b1610f3E"(double 1.000000e+00, double -1.000000e+00)
  ret void
}

; Function Attrs: nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare double @llvm.copysign.f64(double, double) #2

attributes #0 = { inlinehint uwtable "frame-pointer"="non-leaf" "probe-stack"="inline-asm" "target-cpu"="apple-m1" }
attributes #1 = { uwtable "frame-pointer"="non-leaf" "probe-stack"="inline-asm" "target-cpu"="apple-m1" }
attributes #2 = { nocallback nofree nosync nounwind speculatable willreturn memory(none) }

!llvm.module.flags = !{!0}
!llvm.ident = !{!1}

!0 = !{i32 8, !"PIC Level", i32 2}
!1 = !{!"rustc version 1.85.0 (4d91de4e4 2025-02-17)"}
