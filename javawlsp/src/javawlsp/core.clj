(ns javawlsp.core
  (:gen-class)
  (:require
   [clojure.core.async :as async]
   [javawlsp.handler :as handler]
   [lsp4clj.lsp.requests :as lsp.requests]
   [lsp4clj.io-chan :as io-chan]
   [lsp4clj.io-server :as io-server]
   [lsp4clj.server :as server]
   [clojure.test :refer [is]]
   )
  (:import
   [java.io PipedInputStream PipedOutputStream])
  )

(defn evaluate [ml expr]
  (try
    (.evaluate ml (format "ExportString[ToExpression[\"%s\"], \"HTMLFragment\"]" expr))
    (.waitForAnswer ml)
    (println (.getString ml))
    (catch Exception e
      (println "An error occurred:" (.getMessage e))))
  )

(defn take-or-timeout
  ([ch]
   (take-or-timeout ch 100))
  ([ch timeout-ms]
   (take-or-timeout ch timeout-ms :timeout))
  ([ch timeout-ms timeout-val]
   (let [timeout (async/timeout timeout-ms)
         [result ch] (async/alts!! [ch timeout])]
     (if (= ch timeout)
       timeout-val
       result))))

(defn assert-no-take [ch]
  (is (= :nothing (take-or-timeout ch 500 :nothing))))

(defn assert-take [ch]
  (let [result (take-or-timeout ch)]
    (is (not= :timeout result))
    result))

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

  (let [
        client-input-stream (PipedInputStream.)
        client-output-stream (PipedOutputStream.)
        server-input-stream (PipedInputStream. client-output-stream)
        server-output-stream (PipedOutputStream. client-input-stream)
        client-input-ch (io-chan/input-stream->input-chan client-input-stream)
        client-output-ch (io-chan/output-stream->output-chan client-output-stream)
        server (io-server/server {:in server-input-stream :out server-output-stream})
        join (server/start server nil)
        ]
    ;; (async/put! client-output-ch (lsp.requests/request 1 "foo" {}))

    (loop []
      (let [message (take-or-timeout client-input-ch)]
        (if (= message :shutdown)
          (println "Shutdown message received, exiting loop.")
          (do
            (println message)
            (recur)))))
    ))
