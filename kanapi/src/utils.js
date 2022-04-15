import * as bakana from "bakana";
import * as os from "os"

// from kana
export function generateRandomName(prefix = "", suffix = "") {
    return prefix + String(Number(new Date())) + suffix
}

/**
 * wrapper for bakana's initialize
 * 
 * @return A promise
 */
export async function initialize(numberOfThreads) {
    return await bakana.initialize({ numberOfThreads: numberOfThreads, localFile: true });
}

/**
 * get the typedarray type of an object
 * 
 * @return A promise
 */
export function getArrayType(object) {
    if (object instanceof Int8Array) {
        return "Int8Array";
    } else if (object instanceof Uint8Array) {
        return "Uint8Array";
    } else if (object instanceof Uint8ClampedArray) {
        return "Uint8ClampedArray";
    } else if (object instanceof Int16Array) {
        return "Int16Array";
    } else if (object instanceof Uint16Array) {
        return "Uint16Array";
    } else if (object instanceof Int32Array) {
        return "Int32Array";
    } else if (object instanceof Uint32Array) {
        return "Uint32Array";
    } else if (object instanceof Float32Array) {
        return "Float32Array";
    } else if (object instanceof Float64Array) {
        return "Float64Array";
    } else if (object instanceof BigInt64Array) {
        return "BigInt64Array";
    } else if (object instanceof BigUint64Array) {
        return "BigUint64Array";
    }
}

/**
 * extract typed arrays from an object
 * buffers and extracted will contain the final extracted buffers and reprocessed object
 */
export function extractBuffers(object, buffers, extracted) {
    if(!object) {
        return object;
    }

    if (!Array.isArray(object) && object.constructor == Object) {
        for (const [key, element] of Object.entries(object)) {
            extracted[key] = {};
            extracted[key] = extractBuffers(element, buffers, extracted[key]);
        }
    } else if (Array.isArray(object)) {
        return object
    } else if (ArrayBuffer.isView(object)) {
        if (!(object.buffer instanceof ArrayBuffer)) {
            throw "only ArrayBuffers should be in the message payload";
        }

        let offset = 0;
        if (buffers.length > 0) {
            offset = buffers.map(x => x.byteLength).reduce((a, b) => a + b);
        }
        buffers.push(object.buffer);
        return {
            _offset: offset,
            _type: getArrayType(object),
            _byteLength: object.buffer.byteLength
        }
    } else {
        return object
    }

    return extracted;
}

/**
 * merge multiple buffers into a single buffer
 * 
 * @return an ArrayBuffer
 */
export function mergeBuffers(buffers) {
    if (buffers.length == 0) return new Uint8Array(0).buffer;
    const total_bytelength = buffers.map(x => x.byteLength).reduce((a, b) => a + b);
    var tmp = new Uint8Array(total_bytelength);

    let counter = 0
    for (const buff of buffers) {
        tmp.set(new Uint8Array(buff), counter);
        counter += buff.byteLength;
    }

    return tmp.buffer;
};

/**
 * write the msg the kanapi exchange format
 * 
 * @param buffers: ArrayBuffer that holds the extracted buffers.
 * @param json: the json response to send.
 * 
 * fmt specification:
 *  header -> json ->  data buffers
 *      header : 16 bytes
 *          MAGIC - 8 bytes - magic code (kanapi)
 *          format version - 1 byte - (specifices version of the format)
 *          endiannes - 1 byte - 0 if little endian else 1
 *          data_offset - offset to the file where the array buffer starts - 4 bytes
 *          reserved - 2 bytes - for future use
 *      response: json from the server encoded as an arraybuffer. This is a two step process. 
 *          First, we extract any array buffer based objects from the json object.
 *          we put them in the buffers array (next section of this file) and hold a reference.
 *              for each extracted buffer - offset, length and type are captured here.
 *      buffers: the array buffers extracted and merged from the response.
 * @return an ArrayBuffer
 */
export function kanapiWriter(buffers, json) {
    const encoder = new TextEncoder();
    const view = encoder.encode(JSON.stringify(json))

    const json_AB = view.buffer
    let magic = new Uint8Array(8);
    // kanapi followed by version
    magic.set([107, 97, 110, 97, 112, 105]);

    let version = new Uint8Array(1);
    version.set([1]);

    let endian = new Uint8Array(1);
    endian.set([os.endianness() == "LE" ? 1 : 0]);

    // 16 bytes for data offset
    let data_offset = new Uint32Array(1);
    data_offset.set([16 + json_AB.byteLength]);
    let reserved = new Uint8Array(2);

    let header = mergeBuffers([magic.buffer, version.buffer, endian.buffer, data_offset.buffer, reserved.buffer]);

    let output_buffer = mergeBuffers([header, json_AB, buffers]);
    return output_buffer;
}

export function create_typed_array(type, data) {
    // let view = new eval(type)(data)
    if (type == "Int8Array") {
        return new Int8Array(data);
    } else if (type == "Uint8Array") {
        return new Uint8Array(data);
    } else if (type == "Uint8ClampedArray") {
        return new Uint8ClampedArray(data);
    } else if (type == "Int16Array") {
        return new Int16Array(data);
    } else if (type == "Uint16Array") {
        return new Uint16Array(data);
    } else if (type == "Int32Array") {
        return new Int32Array(data);
    } else if (type == "Uint32Array") {
        return new Uint32Array(data);
    } else if (type == "Float32Array") {
        return new Float32Array(data);
    } else if (type == "Float64Array") {
        return new Float64Array(data);
    } else if (type == "BigInt64Array") {
        return new BigInt64Array(data);
    } else if (type == "BigUint64Array") {
        return new BigUint64Array(data);
    }
}

/**
 * extract typed arrays from an object
 * buffers and ectracted_obj will contain the final extracted buffers and reprocessed object
 */
export function replaceBuffers(object, buffer, replaced) {
    if (!Array.isArray(object) && object.constructor == Object) {
        if ("_type" in object && "_offset" in object && "_byteLength" in object) {
            const data = buffer.slice(object["_offset"], object["_offset"] + object["_byteLength"]);
            let view = create_typed_array(object["_type"], data);
            return view;
        } else {
            for (const [key, element] of Object.entries(object)) {
                replaced[key] = {};
                replaced[key] = replaceBuffers(element, buffer, replaced[key]);
            }
        }
    } else if (Array.isArray(object)) {
        return object
    } else {
        return object
    }

    return replaced;
}

/**
 * read the kanapi format back to an array buffer
 *
 * @param buffer: Arraybuffer that holds the data
 * @return an json
 */
export function kanapiReader(buffer) {
    const dv = new DataView(buffer);
    // extract the header
    const header = buffer.slice(0, 16);
    const magic = new Uint8Array(header.slice(0, 8));
    const endian_bytes = dv.getUint8(9);
    const endian = endian_bytes == 1 ? true : false;

    const data_offset = dv.getUint32(10, endian);
    const msg_slice = buffer.slice(16, data_offset);
    let utf8decoder = new TextDecoder(); // default 'utf-8' or 'utf8'
    const msg = JSON.parse(utf8decoder.decode(msg_slice));
    const data_buffer = buffer.slice(data_offset);

    if (data_buffer.byteLength == 0) {
        return msg;
    }

    if(!msg) {
        return {};
    }


    let replaced = {};
    replaceBuffers(msg, data_buffer, replaced);
    return replaced;
}