# Kanapi - API layer to analyze single cell RNA-seq analysis

kanapi adds an API layer to [bakana](https://github.com/LTLA/bakana). This allows [Kana](https://github.com/jkanche/kana) to not only perform single cell analysis client-side but also in backend environments (node in this case).

Kanapi uses web sockets to communicate analysis state and results between Kana and the server. Since we use WebSocket protocol, we loose type information when sending information from the server to client, but a future version will create a custom response format (based on ArrayBuffers). Currently all JSON is encoded as string and sent to the client. (or migrate to gRPC #good-first-task).

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

Each msg send to the server must include an action (defined by `type`) and the parameters for the request (defined by `payload`). The server then routes to message to the appropriate action.

For analysis based activities

- RUN: Perform a new analysis.

Takes a dataset in a [matrix formatted supported by bakana](https://ltla.github.io/bakana/global.html#runAnalysis).

- If parameters are empty, a [default set of parameters](https://ltla.github.io/bakana/global.html#analysisDefaults) will be chosen for each step of the analysis.
- If you would like to perform `batch` correction, you could also specify the column in the annotation that contains this information. unless specfied, default is `mnn_correction`
- If multiple datasets are imported, each dataset is considered a batch.

```json
{
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
}
```

- EXPORT

After running the analysis above, you might want to store the results and the analysis state. Kana supports reloading analysis state by saving to a [HDf5 based kana file format](https://github.com/LTLA/kanaval)

**_an environment variable `OUTPATH` species this location. If not, we store files in the tmp directory and the path is returned back as the response._**

```json
{
  "type": "EXPORT"
}
```

- LOAD: Restore an analysis from a .kana file
- PREFLIGHT_INPUT: validate the input dataset

For interactions with the analysis results/state

- getMarkersForCluster
- getGeneExpression
- computeCustomMarkers
- getMarkersForSelection
- removeCustomMarkers
- animateTSNE
- animateUMAP
- getAnnotation

A number of these are documented both in the [bakana docs](https://github.com/LTLA/bakana) and the [tests directory](./kanapi/tests/) of this repository.
