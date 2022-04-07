# Kanapi - API layer to analyze single cell RNA-seq analysis

kanapi adds an API layer to [bakana](https://github.com/LTLA/bakana). This allows [Kana](https://github.com/jkanche/kana) to not only perform client-side single cell analysis but also in backend environments.

Kanapi uses web sockets to communicate analysis state and results between the application and the server. Because of the WebSocket protocol, we loose type information when converting the responses we need to send to browser; this will be fixed in the future release where we create our own ArrayBuffers. Currently all JSON is encoded as string and sent to the client. (or migrate to gRPC #good-first-task).

## Usage

### Start the server

```shell
  node kanapi/app.js
```

This should usually run the api on port 8000.

As with any websocket based API, we send a payload to the server, the server uses this information to perform an action and send one or many responses back to the client.

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

In addition, the [handy script](./kanapi/tests/kanapi.test.js) run performs the operations the API provides.

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
- [ ] LOAD (not yet implemented)
- [ ] PREFLIGHT (not yet implemented)
