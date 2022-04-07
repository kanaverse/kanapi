import * as uWS from "uWebSockets.js";
import process from "process";
import { Buffer } from 'buffer';
import * as os from "os";

import { Dispatch, initialize } from "./Dispatch.js";

const port = 8000;
const backpressure = 1024 * 1024;
let sessions = 0;

export const app = uWS.default.App({
    // options
});

// Initialize bakana first, if not nothing is going to work 
// so no point in setting up anything
// This happens once per start

initialize(Math.round(os.cpus().length * 2 / 3))
    .then(() => {
        app.get('/ping', (res, req) => {
            res.end({
                "status": true,
                "sessions": sessions
            });
        }).ws('/*', {
            // options 
            idleTimeout: 0,
            maxBackpressure: backpressure,
            compression: uWS.default.DEDICATED_COMPRESSOR_3KB,

            // handlers
            open: async (ws) => {
                // initialize the dispatch object
                ws["dataset"] = new Dispatch();
                // for watever reason; having this inside the dispatch doesn't work
                ws["interval"] = setInterval(() => {
                    if (ws.getBufferedAmount() < backpressure && ws["dataset"].getPendingLength() > 0) {
                        const msg_to_send = ws["dataset"].getMsg();
                        if (msg_to_send) {
                            ws.send(Buffer.from(JSON.stringify(msg_to_send)));
                        }
                    }
                }, 100);
                sessions++;
            },
            close: (ws, code, message) => {
                clearInterval(ws["interval"]);
                ws["dataset"].terminate();
                ws["dataset"] = null;
                sessions--;
            },
            message: async (ws, message, isBinary) => {
                const decoded = Buffer.from(message);
                ws["dataset"].dispatch(JSON.parse(decoded.toString()))
                    .catch(err => {
                        // so it doesn't crash the entire instance
                        console.error("welp error");
                        ws.send(JSON.stringify(err))
                    });
            }
        }).listen(port, (listenSocket) => {
            if (listenSocket) {
                console.log('Listening to port ' + port);
            } else {
                console.log('Failed to listen to port ' + port);
                process.abort();
            }
        });
    })
    .catch(err => {
        console.log('Failed to initialize' + err);
        process.abort();
    })

