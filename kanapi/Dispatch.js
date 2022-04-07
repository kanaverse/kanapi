import * as bakana from "bakana";
import os from "os";
import * as path from 'path';
import { mkdtemp } from "fs/promises";
import { generateRandomName } from "./utils.js";

/**
 * wrapper for bakana's initialize
 * 
 * @return A promise
 */
export async function initialize(numberOfThreads) {
    return await bakana.initialize({ numberOfThreads: numberOfThreads, localFile: true });
}

/**
 * handles all message handling with websockets
 * routes the messages to the appropriate handler
 * 
 * bcoz of backpressure, uses an array (`#pending`) to keep track of all messages that need to be
 * send to the clients.
 * 
 * @namespace Dispatch
 */
export class Dispatch {
    #pending;
    #state;

    constructor() {
        this.#pending = [];
        this.#state = null;
    }

    // error handling starts
    // This whole send message system doesn't work including the setInterval in the constructor
    // setInterval(ws, isBinary, compression) {
    //     this.interval;
    //     this.interval = setInterval(async () => {
    //         if (ws.getBufferedAmount() < this.backpressure && this.#pending.length > 0) {
    //             const error_to_send = this.#pending.shift();
    //             await this.sendMessage(ws, error_to_send, isBinary, compression)
    //         }
    //     }, 100);
    //     // TODO: clear interval when the last message is sent (UMAP/TSNE whatever ends up last)
    // }

    // clearInterval() {
    //     clearInterval(this.interval);
    // }

    // async sendMessage(ws, error, isBinary, compression = true) {
    //     await ws.send(Buffer.from(JSON.stringify(error)), isBinary, compression)
    // }

    // async send#pendingMessage(ws, isBinary, compression) {
    //     if (ws.getBufferedAmount() < this.backpressure && this.#pending.length > 0) {
    //         const error_to_send = this.#pending.shift();
    //         this.sendMessage(ws, error_to_send, isBinary, compression)
    //     }
    // }
    // error handling ends

    /**
     * Get first message from the queue
     * 
     * @return the message object
     */
    getMsg() {
        return this.#pending.shift();
    }

    /**
     * Get pending msgs in queue
     * 
     * @return length
     */
    getPendingLength() {
        return this.#pending.length;
    }

    /**
     * Frees up resources and any workers
     * wrapper to free analysis
     */
    terminate() {
        bakana.freeAnalysis(this.#state);
    }

    /**
     * Run an analysis 
     * 
     * @param {Object} message payload
     */
    async runAnalysis(message) {
        let { files, params } = message;
        this.#state = await bakana.createAnalysis();

        if (!params) {
            params = bakana.analysisDefaults();
        }

        // TODO: do i really need an await here
        await bakana.runAnalysis(this.#state,
            files,
            params,
            {
                finishFun: async (step, results) => {
                    // convert data into a more appropriate structure that stores types
                    this.#pending.push({
                        "type": `${step}_DATA`,
                        "resp": results
                    });
                }
            }
        );
    }

    /**
     * load an analysis 
     * 
     * @param {Object} message payload
     */
    async loadAnalysis(message) {
        // TODO: not sure how to do this, but sure
        // TODO: do i really need an await here
        // await bakana.loadAnalysis(file,
        //     "loadfunc",
        //     {
        //         finishFun: async (step, results) => {
        //             console.log("finished", step);
        //             console.log(this.#pending.length);
        //             this.#pending.push(Buffer.from(JSON.stringify({
        //                 "type": `${step}_data`,
        //                 "resp": results
        //             })));
        //         }
        //     }
        // );
    }

    /**
     * Save an analysis 
     * 
     * @param {Object} message payload
     */
    async saveAnalysis(message) {
        // TODO: check paths; currently dumps to tmp
        let fname = generateRandomName("#state_", ".h5")
        console.log(fname);

        try {
            let tmpdir = path.join(os.tmpdir(), fname)
            await mkdtemp(tmpdir);

            if (!this.#state) {
                this.#pending.push({
                    type: "export_ERROR",
                    error: "nothing to save, run or load an analysis first"
                });
            } else {
                
                await bakana.saveAnalysis(this.#state, tmpdir, {
                    embedded: true
                });

                this.#pending.push({
                    type: "export_DATA",
                    data: `file saved to ${tmpdir}`
                });
            }
        } catch (err) {
            this.#pending.push({
                type: "run_ERROR",
                error: err.toString()
            });
        }
    }

    /**
     * message dispatcher
     * 
     * @param {Object} message payload
     */
    async dispatch(message) {
        let { data } = message;
        if (message.type == "RUN") {
            this.runAnalysis(data)
                .catch(err => {
                    this.#pending.push({
                        type: "run_ERROR",
                        error: err.toString()
                    })
                });
            /**************** LOADING EXISTING ANALYSES *******************/
        } else if (message.type == "LOAD") {
            // load a dataset on the server
            this.loadAnalysis(data)
                .catch(err => {
                    this.#pending.push({
                        type: "load_ERROR",
                        error: err.toString()
                    })
                });
            /**************** SAVING EXISTING ANALYSES *******************/
        } else if (message.type == "EXPORT") {
            // create tmp directory
            this.saveAnalysis(data)
                .catch(err => {
                    this.#pending.push({
                        type: "export_ERROR",
                        error: err.toString()
                    })
                })
        } else if (message.type == "PREFLIGHT_INPUT") {
            // do something here for batches
            // TODO:
            /**************** OTHER EVENTS FROM UI *******************/
        } else if (message.type == "getMarkersForCluster") {
            const { cluster, rank_type } = data;
            console.log("getMarkersForCluster", Object.keys(this.#state));
            console.log(data);
            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                const resp = this.#state["marker_detection"].fetchGroupResults(rank_type, cluster);
                this.#pending.push({
                    type: "setMarkersForCluster",
                    resp: resp,
                });
            }

        } else if (message.type == "getGeneExpression") {
            console.log("getGeneExpression", Object.keys(this.#state));
            console.log(data);

            const row_idx = data.gene;
            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                console.log(this.#state);
                const vec = this.#state["normalizaton"].fetchExpression(row_idx);
                this.#pending.push({
                    type: "setGeneExpression",
                    resp: {
                        gene: row_idx,
                        expr: vec
                    }
                });
            }
        } else if (message.type == "computeCustomMarkers") {
            console.log("computeCustomMarkers", Object.keys(this.#state));
            console.log(data);
            const { id, selection } = data;

            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                this.#state["custom_selections"].addSelection(id, selection);
                this.#pending.push({
                    type: "computeCustomMarkers"
                });
            }
        } else if (message.type == "getMarkersForSelection") {
            const { cluster, rank_type } = data;
            console.log("getMarkersForSelection", Object.keys(this.#state));
            console.log(data);

            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                const resp = this.#state["custom_selections"].fetchResults(cluster, rank_type);
                this.#pending.push({
                    type: "setMarkersForCustomSelection",
                    resp: resp
                });
            }
        } else if (message.type == "removeCustomMarkers") {
            const { id } = data;
            console.log("removeCustomMarkers", Object.keys(this.#state));
            console.log(data);

            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                const resp = this.#state["custom_selections"].removeSelection(id);
                this.#pending.push({
                    type: "setRemoveCustomMarkers",
                    resp: resp
                });
            }
        } else if (message.type == "animateTSNE") {
            console.log("animateTSNE", Object.keys(this.#state));
            console.log(data);

            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                bakana.setVisualizationAnimate((x, y, i) => {
                    this.#pending.push({
                        type: "tsne_iter",
                        resp: {
                            "x": x,
                            "y": y,
                            "iterations": i
                        }
                    });
                });

                await this.#state["tsne"].animate();
            }
        } else if (message.type == "animateUMAP") {
            console.log("animateUMAP", Object.keys(this.#state));
            console.log(data);

            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                bakana.setVisualizationAnimate((x, y, i) => {
                    this.#pending.push({
                        type: "umap_iter",
                        resp: {
                            "x": x,
                            "y": y,
                            "iterations": i
                        }
                    });
                })
                await this.#state["umap"].animate();
            }
        } else if (message.type == "getAnnotation") {
            console.log("getAnnotation", Object.keys(this.#state));
            console.log(data);
            const { annotation, unfiltered } = data;

            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                const vec = this.#state["inputs"].fetchAnnotations(annot);

                // Filter to match QC unless requested otherwise.
                if (unfiltered !== false) {
                    var discard = new Set(this.#state["quality_control"].fetchDiscards());
                    let filterfun = (x, i) => !discard.has(i);
                    if ("factor" in vec) {
                        vec.factor = vec.factor.filter(filterfun);
                    } else {
                        vec = vec.filter(filterfun);
                    }
                }

                this.#pending.push({
                    type: "setAnnotation",
                    resp: {
                        annotation: annot,
                        values: {
                            "index": vec.index,
                            "factor": vec.factor
                        }
                    }
                });
            }
        } else {
            console.error("MIM:::error type incorrect")
            this.#pending.push({
                type: "run_ERROR",
                error: "MIM:::error type incorrect"
            });
        }
    }
}