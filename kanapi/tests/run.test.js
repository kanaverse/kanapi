// using example from uWebSockets
import WebSocket from 'ws';
// import * as uWS from "uWebSockets.js";
import { create_app } from "../app.js";
import { Buffer } from 'buffer';
import process from "process";

async function delay(time) {
    await new Promise(resolve => setTimeout(resolve, time));
}

// TODO: use jest

const port = 8000;

create_app(port);

await delay(1000);
let msgCount = 0;
const ws = new WebSocket('ws://localhost:' + port);

ws.on('open', () => {
    /* Mark this socket as opened */
    ws._opened = true;
    ws.send(Buffer.from(JSON.stringify({
        "type": "RUN",
        "payload": {
            "inputs": {
                "files": {
                    "dataset-1": {
                        "format": "H5AD",
                        "h5": "./zeisel.h5ad"
                    }
                },
                "batch": null
            },
            "params": null
        }
    })));
});

/* It seems you can get messages after close?! */
ws.on('message', async (data) => {
    let resp = JSON.parse(data.toString());
    console.log("CLIENT RCV:", resp["type"]);
    msgCount++;

    // writing my own error checks
    if ((!resp instanceof Object) || (!"type" in resp) ||
        ("error" in resp) || (resp["type"].toLowerCase().indexOf("error") != -1)) {
        console.log("error at step", resp["type"])
        process.abort();
    }

    // after all anlysis responses come back
    if (msgCount == 14) {
        delay(1000);

        ws.send(Buffer.from(JSON.stringify({
            "type": "getMarkersForCluster",
            "payload": {
                "cluster": 0,
                "rank_type": "cohen-min-rank"
            }
        })));
    }

    if (msgCount == 15) {
        await delay(1000);

        ws.send(Buffer.from(JSON.stringify({
            "type": "getGeneExpression",
            "payload": {
                "gene": 100
            }
        })));
    }

    if (msgCount == 16) {
        await delay(1000);

        ws.send(Buffer.from(JSON.stringify({
            "type": "computeCustomMarkers",
            "payload": {
                "id": "custom-selection-1",
                "selection": [1, 100, 140]
            }
        })));
    }

    if (msgCount == 17) {
        await delay(1000);

        ws.send(Buffer.from(JSON.stringify({
            "type": "getMarkersForSelection",
            "payload": {
                "cluster": "custom-selection-1",
                "rank_type": "cohen-min-rank"
            }
        })));
    }

    if (msgCount == 18) {
        await delay(1000);

        ws.send(Buffer.from(JSON.stringify({
            "type": "removeCustomMarkers",
            "payload": {
                "id": "custom-selection-1"
            }
        })));
    }

    if (msgCount == 19) {
        await delay(1000);

        ws.send(Buffer.from(JSON.stringify({
            "type": "getAnnotation",
            "payload": {
                "annotation": "age"
            }
        })));
    }

    if (msgCount == 20) {
        await delay(1000);

        ws.send(Buffer.from(JSON.stringify({
            "type": "animateTSNE",
            "payload": {}
        })));
    }

    if (resp["type"] == "tsne_iter") {
        if (resp["resp"]["iteration"] >= 200) {
            console.log("all done");
            process.exit();
        }
    }
});

ws.on('error', (err) => {
    /* We simply ignore errors. websockets/ws will call our close handler
     * on errors, potentially before even calling the open handler */
    console.error(err);
    process.abort();
});