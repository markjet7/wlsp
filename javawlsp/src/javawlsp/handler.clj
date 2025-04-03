(ns javawlsp.handler
  (:require
   [lsp4clj.io-server :as io-server]
   ))

(defn initialize
    "Initialize the server"
    [components params]
    (let [capabilities {:textDocumentSync 1
                                            :hoverProvider true
                                            :definitionProvider true
                                            :completionProvider {:resolveProvider true}}]
        {:capabilities capabilities}))

(defn did-open
    "Handle a textDocument/didOpen notification"
    [context uri text]
    (let [server (context :server)]
       ))

(defn definition
    "Handle a textDocument/definition request"
    [context params]
    (let [server (context :server)]
       ))