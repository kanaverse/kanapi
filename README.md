# Kanapi - API layer to analyze single cell RNA-seq analysis

kanapi adds an API layer to [bakana](https://github.com/LTLA/bakana). This allows [Kana](https://github.com/jkanche/kana) to not only perform single cell analysis both client-side and also in backend environments (like node as in this case).

Kanapi uses web sockets to communicate analysis state and results between the application and the server. Since we use WebSocket protocol, we loose type information when sending information from the server to client, but a future version will create a custom response format (that uses ArrayBuffers). Currently all JSON is encoded as string and sent to the client. (or migrate to gRPC #good-first-task).

## Usage

### Start the server

```shell
  node kanapi/run.js
```

This should usually run the api on port 8000.

As with any websocket based API, we send a payload to the server, the server performs an action and sends one/many responses to the client.

For example to RUN an analysis, we send the following packet to the server, it contains information on the action we want to perfom (`type`) and the payload it needs.

```json
{
  "type": "RUN",
  "data": {
    "files": {
      "dataset-1": {
        "format": "H5AD",
        "h5": "./zeisel.h5ad"
      }
    }
  }
}
```

Once this payload is sent, the backend would start an analysis on this dataset

**_Note: File path is relative to where the script is run from._**

In addition, the scripts in the tests directory provide various functionality the backend can support

- [Run an analysis](./kanapi/tests/run.analysis.test.js)
- [Save an analysis](./kanapi/tests/save.analysis.test.js)
- [Load an analysis](./kanapi/tests/load.analysis.test.js)

### Payload Actions

- RUN
- EXPORT
- getMarkersForCluster
- getGeneExpression
- computeCustomMarkers
- getMarkersForSelection
- removeCustomMarkers
- animateTSNE
- animateUMAP
- getAnnotation
- LOAD
