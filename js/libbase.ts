/// <reference types="@types/emscripten">

import type {WebSocket as WebSocketS} from "ws";
import Peer from "peerjs";
import type {DataConnection} from "peerjs";

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

/**
 * Base "empty" library, its more of an interface than a class
 */
class BaseLib {

    server_mode: boolean = false;

    constructor() {
    }

    set_username(name: string) {
        ccall('set_username', null, ['string'], [name]);
    }


    // Client
    js_websocket_connect(ptrAddr: number, port: number){throw "BaseLib is selected, this function is not supported"}
    js_can_client_start_server() { return false }
    websocket_client_state(){throw "BaseLib is selected, this function is not supported"}
    websocket_client_send(ptrData: number, size: number){throw "BaseLib is selected, this function is not supported"}
    websocket_client_receive(ptr: number, size: number){throw "BaseLib is selected, this function is not supported"}
    websocket_client_close(){throw "BaseLib is selected, this function is not supported"}

    // Server
    js_websocket_listen(port: number){throw "BaseLib is selected, this function is not supported"}
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

/**
 * Client-Side Websocket to server library
 */
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

/**
 * Server-side WebSocket library used with dedicated server instance
 */
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

    js_websocket_listen(port: number){
        this.server_mode = true;
        return true;
    }
}

/**
 * Client-side server library when a WebSocket Proxy is used
 */
class ServerWSProxyLib extends ClientWSLib {

    server!: WebSocket;
    client_status: Map<number, number> = new Map();

    // clients: Map<number, WebSocket> = new Map();
    server_inputs: Map<number, ArrayBuffer[]> = new Map();

    constructor() {
        super();
    }

    js_can_client_start_server() { return true }

    /**
     * Handle a connecting websocket
     */
    client_connect_add(id: number) {

        this.server_inputs.set(id, []);
        this.client_status.set(id, WebSocket.OPEN);

        ccall('accept_client', "number", ['number'], [id])

    };

    websocket_server_state(id: number) {
        return this.client_status.get(id) ?? WebSocket.CLOSED;
    };

    /**
     * Send data over websocket
     */
    websocket_server_send(id: number, ptrData: number, size: number) {
        const data = cArrayToArrayBuffer(ptrData, size);

        const buffer = new ArrayBuffer(9);
        const view = new DataView(buffer);
        view.setUint8(0, ProxyCommands.SEND)
        view.setBigUint64(1, BigInt(id));

        this.server.send(new Blob([view.buffer, data]));

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
        const buffer = new ArrayBuffer(9);
        const view = new DataView(buffer);
        view.setUint8(0, ProxyCommands.CLOSE)
        view.setBigUint64(1, BigInt(id));
        this.server.send(view.buffer);
    }

    js_websocket_listen(port: number){
        this.server_mode = true;
        this.server = new WebSocket(`/proxy/${port}`);
        this.server.binaryType = "arraybuffer"

        console.log("Started js connection")

        this.server.addEventListener('message', (event) => {
            // Message :
            // uint_8 command
            // uint_64 destination id
            const view = new Uint8Array(event.data);

            const v = new DataView(view.buffer);

            // WARNING dangerous convertion
            const id = Number(v.getBigUint64(1));
            const command = v.getUint8(0);
            switch (command) {
                case ProxyCommands.CONNECTION:
                    this.client_connect_add(id);
                    break;
                case ProxyCommands.STATUS:
                    const status = v.getUint8(8);
                    this.client_status.set(id, status);
                    break;
                case ProxyCommands.CLOSE:
                    this.client_status.set(id, WebSocket.CLOSED);
                    break;
                case ProxyCommands.SEND:
                    const message = view.slice(9).buffer
                    this.server_inputs.get(id)!.push(message);
                    break;
                default:
                    console.log("Unknow command from proxy server " + command);
            }
        })
        return true;
    }
}

/**
 * Client and server library for Peer To Peer connection using peer.js
 */
class ServerPeerProxyLib extends BaseLib {

    // Server part :
    server!: Peer;

    clients: Map<number, DataConnection> = new Map();
    server_inputs: Map<number, ArrayBuffer[]> = new Map();

    idcounter: number = 0;

    constructor() {
        super();
    }

    js_can_client_start_server() { return true }


    websocket_server_state(id: number) {
        return this.clients.get(id)?.open ? WebSocket.OPEN : WebSocket.CLOSED;
    };

    /**
     * Send data over websocket
     */
    websocket_server_send(id: number, ptrData: number, size: number) {
        const data = cArrayToArrayBuffer(ptrData, size);

        this.clients.get(id)!.send(data);

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
        this.clients.delete(id);
    }

    client_connect_peer(conn: DataConnection) {

        conn.on("open", () => {

            console.log("connection server open")


            const id = this.idcounter++;

            this.clients.set(id, conn);
            this.server_inputs.set(id, []);

            ccall('accept_client', "number", ['number'], [id])

            conn.on('data', (message: any) => {
                // console.log("connection server data", message)
                const view = new Int8Array(message);
                this.server_inputs.get(id)!.push(message.transfer());
            })

            conn.on('close', () => {
                this.clients.delete(id)
            })
        })
    };

    js_websocket_listen(port: number){
        this.server_mode = true;
        this.server = new Peer();

        this.server.on("open", (id) => {
            console.log("Started js connection", id);

            const infobox = document.getElementById('infobox');
            if(infobox){
                infobox.innerHTML = `id: <button style="font-family: monospace; user-select: all; background: black; border-radius: 3px; padding: 1px; color: white; border: none;" onclick="navigator.clipboard.writeText('${id}'); alert('id copied')">${id}</button>`;
            }

            this.server.on("connection", conn => {
                console.log("connection server start")
                this.client_connect_peer(conn);
            })
        })

        return true;
    }

    // Client part :
    peer: Peer | null = null;
    connection: DataConnection | null = null;
    client_input: ArrayBuffer[] = [];

    is_waiting: boolean = false;

    /**
     * Connect to the local websocket server
     */
    js_websocket_connect(ptrAddr: number, port: number) {
        //const addr = 'localhost'//UTF8ToString(ptrAddr);
        //const url = `http://${addr}:${port}`;

        this.peer = new Peer()
        this.client_input = [];

        this.is_waiting = true;

        this.peer.on("open", () => {
            const dest = prompt("Connection Id");
            if(!dest) return;
            this.connection = this.peer!.connect(dest)

            console.log("connection start")
            this.connection.on("open", () => {
                console.log("connection open")
                this.is_waiting = false;
                this.connection!.on('data', (data: any) => {
                    // console.log("connection data", data)
                    this.client_input.push(data.transfer());
                })
            })
        })
    };


    websocket_client_state() {
        if(this.is_waiting) {
            return WebSocket.CONNECTING;
        } else
        if (this.connection != null) {
            return this.connection.open ? WebSocket.OPEN : WebSocket.CLOSED;
        }
        return WebSocket.CLOSED;
    };

    /**
     * Send data over websocket
     */
    websocket_client_send(ptrData: number, size: number) {
        const data = cArrayToArrayBuffer(ptrData, size);
        this.connection!.send(data);
    };

    /**
     * Give back desired received data
     */
    websocket_client_receive(ptr: number, size: number) {
        let data;
        if (this.connection) {
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
        this.connection?.close();
    }
}

enum ProxyCommands {
    CONNECTION = 0,
    STATUS = 1,
    CLOSE = 2,
    SEND = 3
}