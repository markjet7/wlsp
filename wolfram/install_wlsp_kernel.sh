#!/bin/bash

mkdir -p ~/.ipython/kernels/wlsp_kernel/
START_SCRIPT_PATH=$(cd `dirname "${BASH_SOURCE[0]}"` && pwd)/wlsp_jupyter_kernel.wl
WOLFRAM_PATH=$(which wolframscript)
CONTENT='{
   "argv": ["'${WOLFRAM_PATH}'", "-file", "'${START_SCRIPT_PATH}'", "{connection_file}"],
                "display_name": "wlsp_kernel",
                "language": "wlsp_kernel"
}'
echo $CONTENT > ~/.ipython/kernels/wlsp_kernel/kernel.json