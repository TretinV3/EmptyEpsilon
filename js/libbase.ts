/// <reference types="@types/emscripten">

import type {WebSocket as WebSocketS} from "ws";

/**
 * Print a buffer to hex - debug usage
 */
function buf2hex(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join(' ');
}

/**
 * Convert a wasm char* array to an ArrayBuffer
 */
function cArrayToArrayBuffer(ptr: number, size: number): ArrayBuffer {
    const array = new ArrayBuffer(size);
    const view = new Int8Array(array);
    for (let i = 0; i < size; i++) {
        view[i] = getValue(ptr + i, "i8");
    }
    return array;
}

/**
 * Try to extract n bytes out of the chunks in order and return actual size of extraction
 */
function extractSizeBytes(chunks: ArrayBuffer[], size: number): ArrayBuffer {
    if (!chunks || chunks.length === 0) return new ArrayBuffer(0);

    // Total available bytes
    let available = 0;
    for (const buf of chunks) available += buf.byteLength;

    const toTake = Math.min(size, available);
    if (toTake === 0) return new ArrayBuffer(0);

    const out = new Uint8Array(toTake);
    let outOff = 0;

    while (outOff < toTake && chunks.length > 0) {
        const head = chunks[0]!;
        const headU8 = new Uint8Array(head);
        const need = toTake - outOff;

        if (head.byteLength <= need) {
            // Take whole chunk
            out.set(headU8, outOff);
            outOff += head.byteLength;
            chunks.shift(); // remove + advance
        } else {
            // Take part of head chunk, keep remainder
            out.set(headU8.subarray(0, need), outOff);
            const remainder = headU8.subarray(need).buffer.slice(headU8.subarray(need).byteOffset);
            chunks[0] = remainder;
            outOff += need;
        }
    }

    // If client stored a backing array, it has already been mutated in-place (shift/replace).
    return out.buffer;
}

class BaseLib {

    server_mode: boolean = false;

    constructor() {
    }

    set_username(name: string) {
        ccall('set_username', null, ['string'], [name]);
    }


    // Client
    js_websocket_connect(ptrAddr: number, port: number){throw "BaseLib is selected, this function is not supported"}
    websocket_client_state(){throw "BaseLib is selected, this function is not supported"}
    websocket_client_send(ptrData: number, size: number){throw "BaseLib is selected, this function is not supported"}
    websocket_client_receive(ptr: number, size: number){throw "BaseLib is selected, this function is not supported"}
    websocket_client_close(){throw "BaseLib is selected, this function is not supported"}

    // Server
    js_websocket_listen(){throw "BaseLib is selected, this function is not supported"}
    client_connect(ws: WebSocketS){throw "BaseLib is selected, this function is not supported"}
    websocket_server_state(id: number){throw "BaseLib is selected, this function is not supported"}
    websocket_server_send(id: number, ptrData: number, size: number){throw "BaseLib is selected, this function is not supported"}
    websocket_server_receive(id: number, ptr: number, size: number){throw "BaseLib is selected, this function is not supported"}
    websocket_server_close(id: number){throw "BaseLib is selected, this function is not supported"}

    // Both
    js_websocket_state(id: number | null){
        if(id == null || !this.server_mode){
            return this.websocket_client_state();
        } else {
            return this.websocket_server_state(id);
        }
    }
    js_websocket_send(id: number | null, ptrData: number, size: number){
        if(id == null || !this.server_mode){
            return this.websocket_client_send(ptrData, size);
        } else {
            return this.websocket_server_send(id, ptrData, size);
        }
    }
    js_websocket_receive(id: number | null, ptr: number, size: number){
        if(id == null || !this.server_mode){
            return this.websocket_client_receive(ptr, size);
        } else {
            return this.websocket_server_receive(id, ptr, size);
        }
    }
    js_websocket_close(id: number | null){
        if(id == null || !this.server_mode){
            return this.websocket_client_close();
        } else {
            return this.websocket_server_close(id);
        }
    }

}

class ClientWSLib extends BaseLib {

    ws: WebSocket | null = null;

    client_input: ArrayBuffer[] = [];

    constructor() {
        super();
    }

    /**
     * Connect to the local websocket server
     */
    js_websocket_connect(ptrAddr: number, port: number) {
        //const addr = 'localhost'//UTF8ToString(ptrAddr);
        //const url = `http://${addr}:${port}`;

        this.ws = new WebSocket(`/rooms/${port}`);
        this.ws.binaryType = "arraybuffer"

        this.client_input = [];

        this.ws.addEventListener('message', (event) => {
            const view = new Int8Array(event.data);
            this.client_input.push(event.data.transfer());
        })
    };


    websocket_client_state() {
        if (this.ws != null) {
            return this.ws.readyState;
        }
        return WebSocket.CLOSED;
    };

    /**
     * Send data over websocket
     */
    websocket_client_send(ptrData: number, size: number) {
        const data = cArrayToArrayBuffer(ptrData, size);
        this.ws!.send(data);
    };

    /**
     * Give back desired received data
     */
    websocket_client_receive(ptr: number, size: number) {
        let data;
        if (this.ws) {
            data = extractSizeBytes(this.client_input, size);
        } else {
            return 0;
        }

        const view = new Int8Array(data);
        for (let i = 0; i < view.length; i++) {
            setValue(ptr + i, view[i]!, "i8");
        }

        return view.length;
    }

    websocket_client_close() {
        this.ws?.close();
    }
}

class ServerWSLib extends ClientWSLib {

    idcounter: number = 0;

    clients: Map<number, WebSocketS> = new Map();
    server_inputs: Map<number, ArrayBuffer[]> = new Map();

    constructor() {
        super();
    }

    /**
     * Handle a connecting websocket
     */
    client_connect(websocket: WebSocketS) {
        const id = this.idcounter++;
        //console.log(this.clients)
        websocket.binaryType = "arraybuffer"

        this.clients.set(id, websocket);
        this.server_inputs.set(id, []);

        ccall('accept_client', "number", ['number'], [id])

        websocket.on('message', (message: any) => {
            const view = new Int8Array(message);
            //Module.ccall('receive_client_data', null, ['number', 'array', 'number'], [id, view, view.length])

            this.server_inputs.get(id)!.push(message.transfer());
        })

        websocket.on('close', () => {
            this.clients.delete(id)
            // Module.ccall('disconnect_client', "number", ['number'], [id])
        })
    };

    websocket_server_state(id: number) {
        const ws = this.clients.get(id);
        if (!ws) return 3;
        return ws.readyState
    };

    /**
     * Send data over websocket
     */
    websocket_server_send(id: number, ptrData: number, size: number) {
        const data = cArrayToArrayBuffer(ptrData, size);

        this.clients.get(id)?.send(data);

    };

    /**
     * Give back desired received data
     */
    websocket_server_receive(id: number, ptr: number, size: number) {
        let data = extractSizeBytes(this.server_inputs.get(id)!, size);

        const view = new Int8Array(data);
        for (let i = 0; i < view.length; i++) {
            setValue(ptr + i, view[i]!, "i8");
        }

        return view.length;
    }

    websocket_server_close(id: number) {
        this.clients.get(id)?.close();
    }

    js_websocket_listen(){
        this.server_mode = true;
        return true;
    }
}

//
// class OldLib {
//
//     wss: boolean = false;
//     ws: WebSocket | null = null;
//     http: boolean = false;
//
//     idcounter: number = 0;
//
//     clients: Map<number, WebSocketS> = new Map();
//     inputs: Map<number, ArrayBuffer[]> = new Map();
//
//     /**
//      * Handle a connecting websocket
//      */
//     client_connect(websocket: WebSocketS) {
//         const id = this.idcounter++;
//         //console.log(this.clients)
//         websocket.binaryType = "arraybuffer"
//
//         this.clients.set(id, websocket);
//         this.inputs.set(id, []);
//
//         ccall('accept_client', "number", ['number'], [id])
//
//         websocket.on('message', (message: any) => {
//             const view = new Int8Array(message);
//             //Module.ccall('receive_client_data', null, ['number', 'array', 'number'], [id, view, view.length])
//
//             this.inputs.get(id)!.push(message.transfer());
//         })
//
//         websocket.on('close', () => {
//             this.clients.delete(id)
//             // Module.ccall('disconnect_client', "number", ['number'], [id])
//         })
//     };
//
//     js_websocket_listen() {
//         this.wss = true;
//         return true;
//     }
//
//     js_start_http() {
//         this.http = true;
//         return true;
//     }
//
//     js_close_http() {
//         return true;
//     };
//
//     js_websocket_close() {
//         return true;
//     };
//
//     /**
//      * Connect to the local websocket server
//      */
//     js_websocket_connect(ptrAddr: number, port: number) {
//         //const addr = 'localhost'//UTF8ToString(ptrAddr);
//         //const url = `http://${addr}:${port}`;
//
//         this.ws = new WebSocket(`/rooms/${port}`);
//         this.ws.binaryType = "arraybuffer"
//
//         this.inputs.set(0, []);
//
//         this.ws.addEventListener('message', (event) => {
//             const view = new Int8Array(event.data);
//             this.inputs.get(0)!.push(event.data.transfer());
//         })
//     };
//
//     js_websocket_state(id: number | null = null) {
//         if (this.ws != null) {
//             return this.ws.readyState;
//         }
//         if (this.wss != null && id != null) {
//             const ws = this.clients.get(id);
//             if (!ws) return 3;
//             return ws.readyState
//         }
//         return 3;
//     };
//
//     /**
//      * Send data over websocket
//      */
//     js_websocket_send(id: number, ptrData: number, size: number) {
//         const data = cArrayToArrayBuffer(ptrData, size);
//
//         if (this.wss != null) {
//             this.clients.get(id)?.send(data);
//         }
//         if (this.ws) {
//             this.ws?.send(data);
//         }
//     };
//
//     /**
//      * Give back desired received data
//      */
//     js_websocket_receive(id: number, ptr: number, size: number) {
//         let data;
//         if (this.wss != null) {
//             data = extractSizeBytes(this.inputs.get(id)!, size);
//
//         } else if (this.ws) {
//             data = extractSizeBytes(this.inputs.get(0)!, size);
//         } else {
//             return 0;
//         }
//
//         const view = new Int8Array(data);
//         for (let i = 0; i < view.length; i++) {
//             setValue(ptr + i, view[i]!, "i8");
//         }
//
//         return view.length;
//     }
//
//     set_username(name: string) {
//         ccall('set_username', null, ['string'], [name]);
//     }
// }