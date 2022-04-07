// using example from uWebSockets
import WebSocket from 'ws';
// import * as uWS from "uWebSockets.js";
import { app } from "../app.js";
import { Buffer } from 'buffer';
import process from "process";

async function delay(time) {
    await new Promise(resolve => setTimeout(resolve, time));
}

// TODO: use jest

const port = 8000;

await delay(200);
let msgCount = 0;
const ws = new WebSocket('ws://localhost:' + port);

ws.on('open', () => {
    /* Mark this socket as opened */
    ws._opened = true;
    ws.send(Buffer.from(JSON.stringify({
        "type": "RUN",
        "data": {
            "files": {
                "dataset-1": {
                    "format": "H5AD",
                    "h5": "kanapi/zeisel.h5ad"
                }
            }
        }
    })));
});

/* It seems you can get messages after close?! */
ws.on('message', async (data) => {
    let resp = JSON.parse(data.toString());
    // console.log(resp);
    console.log("CLIENT RCV:", resp["type"]);
    msgCount++;


    console.log(msgCount);

    // after all anlysis responses come back
    if (msgCount == 14) {
        await delay(200);

        ws.send(Buffer.from(JSON.stringify({
            "type": "getMarkersForCluster",
            "data": {
                "cluster": "cluster_1",
                "rank_type": "cohen-min-rank"
            }
        })));
    }

    if (msgCount == 15) {
        await delay(200);

        ws.send(Buffer.from(JSON.stringify({
            "type": "getGeneExpression",
            "data": {
                "gene": 100
            }
        })));
    }

    if (msgCount == 16) {
        await delay(200);

        ws.send(Buffer.from(JSON.stringify({
            "type": "computeCustomMarkers",
            "data": {
                "id": "custom-selection-1",
                "selection": [1, 100, 140]
            }
        })));
    }

    if (msgCount == 17) {
        await delay(200);

        ws.send(Buffer.from(JSON.stringify({
            "type": "getMarkersForSelection",
            "data": {
                "cluster": "custom-selection-1",
                "rank_type": "cohen-min-rank"
            }
        })));
    }

    if (msgCount == 18) {
        await delay(200);

        ws.send(Buffer.from(JSON.stringify({
            "type": "removeCustomMarkers",
            "data": {
                "id": "custom-selection-1"
            }
        })));
    }

    if (msgCount == 19) {
        await delay(200);

        ws.send(Buffer.from(JSON.stringify({
            "type": "getAnnotation",
            "data": {
                "annotation": "sex"
            }
        })));
    }

    if (msgCount == 20) {
        await delay(200);

        ws.send(Buffer.from(JSON.stringify({
            "type": "animateTSNE",
            "data": {}
        })));
    }

    if (resp["type"] == "tsne_iter") {
        if (resp["resp"]["iterations"] >= 500) {
            console.log("all done");
            process.exit();
        }
    }
});

ws.on('error', (err) => {
    /* We simply ignore errors. websockets/ws will call our close handler
     * on errors, potentially before even calling the open handler */
    console.error(err);
});