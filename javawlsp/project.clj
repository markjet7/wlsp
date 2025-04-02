(defproject javawlsp "0.1.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "http://example.com/FIXME"
  :license {:name "EPL-2.0 OR GPL-2.0-or-later WITH Classpath-exception-2.0"
            :url "https://www.eclipse.org/legal/epl-2.0/"}
  :dependencies [[org.clojure/clojure "1.11.1"]
                 [com.github.clojure-lsp/lsp4clj "1.12.0"]]
  :main ^:skip-aot javawlsp.core
  :target-path "target/%s"
  :resource-paths ["/Applications/Wolfram.app/Contents/SystemFiles/Links/JLink/JLink.jar"]
  :jvm-opts [~(str "-Djava.library.path=/Applications/Wolfram.app/Contents/SystemFiles/Links/JLink/SystemFiles/Libraries/MacOSX-x86-64:"
                   "/Applications/Wolfram.app/Contents/SystemFiles/Links/JLink/SystemFiles/Libraries/MacOSX-x86-64:")]
  :profiles {:uberjar {:aot :all
                       :jvm-opts ["-Dclojure.compiler.direct-linking=true"]}})