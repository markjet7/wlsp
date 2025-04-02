(ns javawlsp.core
  (:gen-class)
  (:require
   [clojure.core.async :as async]
   [clojure.tools.logging :as logger]
   [handler :as handler]
   [lsp4clj.io-server :as io-server]
   [lsp4clj.lsp.requests :as lsp.requests])
  )

(defn evaluate [ml expr]
  (try
    (.evaluate ml (format "ExportString[ToExpression[\"%s\"], \"HTMLFragment\"]" expr))
    (.waitForAnswer ml)
    (println (.getString ml))
    (catch Exception e
      (println "An error occurred:" (.getMessage e))))
  )

(defn -main
  "I don't do a whole lot ... yet."
  [& args]
  ;; "-linkmode launch -linkname 'YOUR_PATH_TO_MATHEMATICA/mathematica/13.2.1/Executables/MathKernel' ";
;;  ml = MathLinkFactory.createKernelLink(s);
  ;; (let [ml (MathLinkFactory/createKernelLink "-linkmode launch -linkname '/Applications/Wolfram.app/Contents/MacOS/MathKernel' -mathlink")]
  ;;   (.discardAnswer ml)
  ;;   ;; (.putFunction ml "EvaluatePacket" 1)
  ;;   ;; (.putFunction ml "Plus" 2)
  ;;   ;; (.put ml 2)
  ;;   ;; (.put ml 2)
  ;;   ;; (.endPacket ml)
  ;;   ;; (println (.waitForAnswer ml))
  ;;   ;; (println (.getInteger ml))
  ;;   (evaluate ml "Table[i, {i, 1, 10}]")
  ;;   (.close ml) 
  ;;   )

  (let [server (.io-server/stdio-server)]
    (async/go-loop []
      (when-let [[level & args] (async/<! (:log-ch server))]
        (apply logger/log level args)
        (recur))))
  
  (defmethod io-server/receive-request "initialize" [_ {:keys [db* server] :as components} params]
    (logger/info startup/logger-tag "Initializing...")
    (handler/initialize components
                        (lsp.requests/initialize-params params)))

;; a notification; return value is ignored
    (defmethod io-server/receive-notification "textDocument/didOpen"
      [_ context {:keys [text-document]}]
      (handler/did-open context (:uri text-document) (:text text-document)))
    
;; a request; return value is converted to a response
    (defmethod io-server/receive-request "textDocument/definition"
      [_ context params]
      (->> params
           (handler/definition context)))

    )
