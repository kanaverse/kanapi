// using example from uWebSockets
import WebSocket from 'ws';
// import * as uWS from "uWebSockets.js";
import { create_app } from "../app.js";
import { Buffer } from 'buffer';
import process from "process";
import { create } from 'domain';

async function delay(time) {
    await new Promise(resolve => setTimeout(resolve, time));
}

await delay(200);
const port = 8000;

let msgCount = 0;
const ws = new WebSocket('ws://localhost:' + port);
let app;

beforeAll(async () => {
    app = create_app();
    await delay(500);
});

test("runAnalysis", async () => {
    // expect.assertions(1);

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

        expect(resp instanceof Object).toBe(true);
        expect ("type" in resp).toBe(true);

        // error checks
        expect ("error" in resp).toBe(false);
        expect(resp["type"].toLowerCase().indexOf()).toBe(-1);

        msgCount++;
        delay(5000);

        // after all anlysis responses come back
        if (msgCount == 14) {
            delay(200);

            ws.send(Buffer.from(JSON.stringify({
                "type": "getMarkersForCluster",
                "payload": {
                    "cluster": 0,
                    "rank_type": "cohen-min-rank"
                }
            })));
        }

        if (msgCount == 15) {
            await delay(200);

            ws.send(Buffer.from(JSON.stringify({
                "type": "getGeneExpression",
                "payload": {
                    "gene": 100
                }
            })));
        }

        if (msgCount == 16) {
            await delay(200);

            ws.send(Buffer.from(JSON.stringify({
                "type": "computeCustomMarkers",
                "payload": {
                    "id": "custom-selection-1",
                    "selection": [1, 100, 140]
                }
            })));
        }

        if (msgCount == 17) {
            await delay(200);

            ws.send(Buffer.from(JSON.stringify({
                "type": "getMarkersForSelection",
                "payload": {
                    "cluster": "custom-selection-1",
                    "rank_type": "cohen-min-rank"
                }
            })));
        }

        if (msgCount == 18) {
            await delay(200);

            ws.send(Buffer.from(JSON.stringify({
                "type": "removeCustomMarkers",
                "payload": {
                    "id": "custom-selection-1"
                }
            })));
        }

        if (msgCount == 19) {
            await delay(200);

            ws.send(Buffer.from(JSON.stringify({
                "type": "getAnnotation",
                "payload": {
                    "annotation": "sex"
                }
            })));
        }

        if (msgCount == 20) {
            await delay(200);

            ws.send(Buffer.from(JSON.stringify({
                "type": "animateTSNE",
                "payload": {}
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
        expect(err).toBe(null);
    });

});

afterAll(async () => ws.close());