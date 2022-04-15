// using example from uWebSockets
import WebSocket from 'ws';
// import * as uWS from "uWebSockets.js";
import { create_app } from "../src/app.js";
import { kanapiReader } from '../src/utils.js';
import { Buffer } from 'buffer';
import process from "process";

async function delay(time) {
    await new Promise(resolve => setTimeout(resolve, time));
}

const port = 8000;

create_app(port);

await delay(1000);
let msgCount = 0;
const ws = new WebSocket('ws://localhost:' + port, {
    skipUTF8Validation: true
});

ws.on('open', () => {
    /* Mark this socket as opened */
    ws._opened = true;
    ws.send(Buffer.from(JSON.stringify({
        "type": "PREFLIGHT_INPUT",
        "payload": {
            "inputs": {
                "files": {
                    "dataset-1": {
                        "format": "H5AD",
                        "h5": "./zeisel.h5ad"
                    }
                }
            }
        }
    })));
});

/* It seems you can get messages after close?! */
ws.on('message', async (data) => {
    const resp = kanapiReader(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    msgCount++;

    // writing my own error checks
    if ((!resp instanceof Object) || (!"type" in resp) ||
        ("error" in resp) || (resp["type"].toLowerCase().indexOf("error") != -1)) {
        console.log("error at step", resp["type"])
        process.abort();
    }

    if(msgCount > 0) {
        if (resp["type"] != "PREFLIGHT_INPUT_DATA") {
            process.abort();
        }
        console.log("all done");
        process.exit();
    }
});

ws.on('error', (err) => {
    /* We simply ignore errors. websockets/ws will call our close handler
     * on errors, potentially before even calling the open handler */
    console.error(err);
    process.abort();
});