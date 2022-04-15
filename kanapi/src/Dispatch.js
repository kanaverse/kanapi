import * as bakana from "bakana";
import os from "os";
import * as path from 'path';
import {
    generateRandomName, extractBuffers, mergeBuffers,
    kanapiWriter
} from "./utils.js";
import process from "process";

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
        let msg = this.#pending.shift();
        var buffer = [], extracted = {};
        extractBuffers(msg, buffer, extracted);
        let merged_buffers = mergeBuffers(buffer);
        let msg_buffer = kanapiWriter(merged_buffers, extracted);
        return msg_buffer;
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

    async createAnalysis() {
        this.#state = await bakana.createAnalysis();

        bakana.setVisualizationAnimate((type, x, y, iter) => {
            this.#pending.push({
                type: `${type}_iter`,
                resp: {
                    "x": x,
                    "y": y,
                    "iteration": iter
                }
            });
        })
    }

    /**
     * Run an analysis 
     * 
     * @param {Object} message payload
     */
    async runAnalysis(message) {
        let { inputs, params } = message;

        if (!params) {
            params = bakana.analysisDefaults();
        }

        if (!this.#state) {
            this.#state = await bakana.createAnalysis();
        }

        bakana.runAnalysis(this.#state,
            inputs.files,
            params,
            {
                finishFun: (step, results) => {
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
        let fname = generateRandomName("#state_", ".h5")
        let h5path = path.join(os.tmpdir(), fname)
        let output = {};
        try {
            let loader = await bakana.parseKanaFile(message.inputs.file, h5path);
            let response = await bakana.loadAnalysis(h5path, loader, {
                finishFun: async (step, results) => {
                    this.#pending.push({
                        "type": `${step}_DATA`,
                        "resp": results
                    });
                }
            });

            if (this.#state !== null) {
                await bakana.freeAnalysis(this.#state);
            }
            this.#state = response.state;

            let params = response.parameters;
            output = {
                inputs: {
                    "batch": params.inputs.sample_factor
                },
                qc: {
                    "qc-usemitodefault": params.quality_control.use_mito_default,
                    "qc-mito": params.quality_control.mito_prefix,
                    "qc-nmads": params.quality_control.nmads
                },
                fSelection: {
                    "fsel-span": params.feature_selection.span
                },
                pca: {
                    "pca-hvg": params.pca.num_hvgs,
                    "pca-npc": params.pca.num_pcs,
                    "pca-correction": params.pca.block_method
                },
                cluster: {
                    "clus-approx": params.neighbor_index.approximate,
                    "kmeans-k": params.kmeans_cluster.k,
                    "clus-k": params.snn_graph_cluster.k,
                    "clus-scheme": params.snn_graph_cluster.scheme,
                    "clus-res": params.snn_graph_cluster.resolution,
                    "clus-method": params.choose_clustering.method
                },
                tsne: {
                    "tsne-perp": params.tsne.perplexity,
                    "tsne-iter": params.tsne.iterations,
                    "animate": params.tsne.animate
                },
                umap: {
                    "umap-epochs": params.umap.num_epochs,
                    "umap-nn": params.umap.num_neighbors,
                    "umap-min_dist": params.umap.min_dist,
                    "animate": params.umap.animate
                },
                annotateCells: {
                    "annotateCells-human_references": params.cell_labelling.human_references,
                    "annotateCells-mouse_references": params.cell_labelling.mouse_references
                },
                custom_selections: params.custom_selections
            }
        } finally {
            bakana.removeHDF5File(h5path);
        }

        return output;
    }

    /**
     * Save an analysis 
     * 
     * @param {Object} message payload
     */
    async saveAnalysis(message) {
        let fname = generateRandomName("#state_", ".h5")
        let outpath = process.env.OUTPATH;

        if (!outpath) {
            outpath = os.tmpdir();
        }

        try {
            let outfile = path.join(outpath, fname)

            if (!this.#state) {
                this.#pending.push({
                    type: "export_ERROR",
                    error: "nothing to save, run or load an analysis first"
                });
            } else {

                let serialized = await bakana.saveAnalysis(this.#state, outfile, {
                    embedded: true
                });

                let output = await bakana.createKanaFile(outfile, serialized.collected);

                this.#pending.push({
                    type: "export_DATA",
                    resp: {
                        "outpath": output
                    }
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
        const { type, payload } = message;
        if (type == "RUN") {
            this.runAnalysis(payload)
                .catch(err => {
                    this.#pending.push({
                        type: "run_ERROR",
                        error: err.toString()
                    })
                });
            /**************** LOADING EXISTING ANALYSES *******************/
        } else if (type == "LOAD") {
            // load a dataset on the server
            this.loadAnalysis(payload)
                .catch(err => {
                    this.#pending.push({
                        type: "load_ERROR",
                        error: err.toString()
                    })
                });
            /**************** SAVING EXISTING ANALYSES *******************/
        } else if (type == "EXPORT") {
            // create tmp directory
            this.saveAnalysis(payload)
                .catch(err => {
                    this.#pending.push({
                        type: "export_ERROR",
                        error: err.toString()
                    })
                })
        } else if (type == "PREFLIGHT_INPUT") {
            // do something here for batches
            let resp = {};
            try {
                resp.status = "SUCCESS";
                resp.details = await bakana.validateAnnotations(payload.inputs.files);
            } catch (e) {
                resp.status = "ERROR";
                resp.reason = e.toString();
            }

            this.#pending.push({
                type: "PREFLIGHT_INPUT_DATA",
                resp: resp,
                msg: "Success: PREFLIGHT_INPUT done"
            });
            /**************** OTHER EVENTS FROM UI *******************/
        } else if (type == "getMarkersForCluster") {
            const { cluster, rank_type } = payload;
            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                const resp = this.#state.marker_detection.fetchGroupResults(cluster, rank_type);
                this.#pending.push({
                    type: "setMarkersForCluster",
                    resp: resp,
                });
            }

        } else if (type == "getGeneExpression") {
            const row_idx = payload.gene;
            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                const vec = this.#state.normalization.fetchExpression(row_idx);
                this.#pending.push({
                    type: "setGeneExpression",
                    resp: {
                        gene: row_idx,
                        expr: vec
                    }
                });
            }
        } else if (type == "computeCustomMarkers") {
            const { id, selection } = payload;

            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                this.#state.custom_selections.addSelection(id, selection);
                this.#pending.push({
                    type: "computeCustomMarkers"
                });
            }
        } else if (type == "getMarkersForSelection") {
            const { cluster, rank_type } = payload;
            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                let rtype = rank_type.replace(/-.*/, ""); // summary type doesn't matter for pairwise comparisons.
                const resp = this.#state.custom_selections.fetchResults(cluster, rtype);
                this.#pending.push({
                    type: "setMarkersForCustomSelection",
                    resp: resp
                });
            }
        } else if (type == "removeCustomMarkers") {
            const { id } = payload;
            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                const resp = this.#state.custom_selections.removeSelection(id);
                this.#pending.push({
                    type: "setRemoveCustomMarkers",
                    resp: resp
                });
            }
        } else if (type == "animateTSNE") {
            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                await this.#state.tsne.animate();
            }
        } else if (type == "animateUMAP") {
            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                await this.#state.umap.animate();
            }
        } else if (type == "getAnnotation") {
            const { annotation, unfiltered } = payload;

            if (!this.#state) {
                this.#pending.push({
                    type: "analysis_ERROR",
                    error: "run or load an analysis first"
                });
            } else {
                let vec;
                // Filter to match QC unless requested otherwise.
                if (unfiltered !== false) {
                    vec = this.#state.quality_control.fetchFilteredAnnotations(annotation);
                } else {
                    vec = this.#state.inputs.fetchAnnotations(annotation);
                }

                this.#pending.push({
                    type: "setAnnotation",
                    resp: {
                        annotation: annotation,
                        values: vec
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