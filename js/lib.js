// Library linked to emscripten js functions in cpp

addToLibrary({
    $js_wss__postset: 'js_wss();',
    $js_wss: function () {

        /**
         * Print a buffer to hex - debug usage
         * @param {ArrayBuffer} buffer 
         * @returns {string} Humain readeable hex string
         */
        function buf2hex(buffer) { // buffer is an ArrayBuffer
            return [...new Uint8Array(buffer)]
                .map(x => x.toString(16).padStart(2, '0'))
                .join(' ');
        }

        /**
         * Convert a wasm char* array to an ArrayBuffer
         * @param {number} ptr Pointer to the start of the array
         * @param {number} size Size of the array in bytes
         * @returns {ArrayBuffer}
         */
        function cArrayToArrayBuffer(ptr, size) {
            const array = new ArrayBuffer(size);
            const view = new Int8Array(array);
            for (let i = 0; i < size; i++) {
                view[i] = getValue(ptr + i, "i8");
            }
            return array;
        }

        /**
         * Try to extract n bytes out of the chunks in order and return actual size of extraction
         * @param {ArrayBuffer[]} chunks List of buffer
         * @param {number} size Bytes to extract
         * @returns {ArrayBuffer} Extracted bytes
         */
        function extractSizeBytes(chunks, size) {
            if (!chunks || chunks.length === 0) return new ArrayBuffer(0);

            // Total available bytes
            let available = 0;
            for (const buf of chunks) available += buf.byteLength;

            const toTake = Math.min(size, available);
            if (toTake === 0) return new ArrayBuffer(0);

            const out = new Uint8Array(toTake);
            let outOff = 0;

            while (outOff < toTake && chunks.length > 0) {
                const head = chunks[0];
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
         * @constructor
         */
        var WSSLib = function () {
            /**  @type {wss.WebSocketServer} */
            this.wss = null;
            /**  @type {WebSocket} */
            this.ws = null;

            /**  @type {http.Server} */
            this.http = null;
            /**  @type {Express.Application} */
            this.express = null;

            /**  @type {number} */
            this.idcounter = 0;

            /**  @type {Map<number, WebSocket>} */
            this.clients = new Map();
            /**  @type {Map<number, ArrayBuffer[]>} */
            this.inputs = new Map();
        };

        /**
         * Handle a connecting websocket
         */
        WSSLib.prototype.client_connect = function (websocket) {
            const id = this.idcounter++;
            //console.log(this.clients)
            websocket.binaryType = "arraybuffer"

            this.clients.set(id, websocket);
            this.inputs.set(id, []);

            Module.ccall('accept_client', "number", ['number'], [id])

            websocket.on('message', (message) => {
                const view = new Int8Array(message);
                //Module.ccall('receive_client_data', null, ['number', 'array', 'number'], [id, view, view.length])

                this.inputs.get(id).push(message.transfer());
            })

            websocket.on('close', (event) => {
                this.clients.delete(id)
                // Module.ccall('disconnect_client', "number", ['number'], [id])
            })
        };

        WSSLib.prototype.js_websocket_listen = function () {
            // this.init_http()
            return true;
        }

        WSSLib.prototype.js_start_http = function () {
            // this.init_http()
            return true;
        }

        WSSLib.prototype.js_close_http = function () {
            // if (this.http != null) {
            //     this.http.close();
            // }
            return true;
        };

        WSSLib.prototype.js_websocket_close = function () {
            //if(this.wss != null){
            //    this.wss.close();
            //}
            // if (this.ws != null) {
            //     this.ws.close();
            // }
        };

        /**
         * Connect to the local websocket server
         * @param {number} ptrAddr 
         * @param {number} port 
         */
        WSSLib.prototype.js_websocket_connect = function (ptrAddr, port) {
            //const addr = 'localhost'//UTF8ToString(ptrAddr);
            //const url = `http://${addr}:${port}`;

            this.ws = new WebSocket(`/rooms/${port}`);
            this.ws.binaryType = "arraybuffer"

            this.inputs.set(0, []);

            this.ws.addEventListener('message', (event) => {
                const view = new Int8Array(event.data);
                //Module.ccall('receive_server_data', null, ['array', 'number'], [view, view.length])
                this.inputs.get(0).push(event.data.transfer());
            })
        };

        /**
         * Get the websocket connection status
         * @param {number} id Client websocket id
         * @returns 
         */
        WSSLib.prototype.js_websocket_state = function (id = null) {
            if (this.ws != null) {
                return this.ws.readyState;
            }
            if (this.wss != null && id != null) {
                const ws = this.clients.get(id);
                if (!ws) return 3;
                return ws.readyState
            }
            return 3;
        };

        /**
         * Send data over websocket
         * @param {number} id Client target id
         * @param {number} ptrData Pointer to the start of the data
         * @param {number} size Lenght in bytes of data
         */
        WSSLib.prototype.js_websocket_send = function (id, ptrData, size) {
            const data = cArrayToArrayBuffer(ptrData, size);

            if (this.wss != null) {
                this.clients.get(id)?.send(data);
            }
            if (this.ws) {
                this.ws?.send(data);
            }
        };

        /**
         * Give back desired received data
         * @param {number} id Client target id
         * @param {number} ptr Pointer to the start of the data
         * @param {number} size Lenght of desired bytes of data
         * @returns 
         */
        WSSLib.prototype.js_websocket_receive = function (id, ptr, size) {
            let data;
            if (this.wss != null) {
                data = extractSizeBytes(this.inputs.get(id), size);

            } else if (this.ws) {
                data = extractSizeBytes(this.inputs.get(0), size);
            } else {
                return 0;
            }

            const view = new Int8Array(data);
            for (let i = 0; i < view.length; i++) {
                setValue(ptr + i, view[i], "i8");
            }

            return view.length;
        }

        var inst = new WSSLib();
        _js_websocket_listen = inst.js_websocket_listen.bind(inst);
        _js_websocket_close = inst.js_websocket_close.bind(inst);

        _js_start_http = inst.js_start_http.bind(inst);
        _js_close_http = inst.js_close_http.bind(inst);

        _js_websocket_connect = inst.js_websocket_connect.bind(inst);
        _js_websocket_state = inst.js_websocket_state.bind(inst);
        _js_websocket_send = inst.js_websocket_send.bind(inst);
        _js_websocket_receive = inst.js_websocket_receive.bind(inst);

        Module.clientConnect = inst.client_connect.bind(inst);
    },
    js_websocket_listen: function () { },
    js_websocket_listen__deps: ['$js_wss'],
    js_websocket_close: function () { },
    js_websocket_close__deps: ['$js_wss'],

    js_start_http: function () { },
    js_start_http__deps: ['$js_wss'],
    js_close_http: function () { },
    js_close_http__deps: ['$js_wss'],

    js_websocket_connect: function () { },
    js_websocket_connect__deps: ['$js_wss'],
    js_websocket_state: function () { },
    js_websocket_state__deps: ['$js_wss'],
    js_websocket_send: function () { },
    js_websocket_send__deps: ['$js_wss'],
    js_websocket_receive: function () { },
    js_websocket_receive__deps: ['$js_wss'],

    js_get_screen_size: function (ptrW, ptrH) {
        var win = window,
            doc = document,
            docElem = doc.documentElement,
            body = doc.getElementsByTagName('body')[0],
            x = win.innerWidth || docElem.clientWidth || body.clientWidth,
            y = win.innerHeight|| docElem.clientHeight|| body.clientHeight;

        //     int x, y;
        //     int w, h;
        //setValue(ptrRect + 0, 0, "i64");
        //setValue(ptrRect + 4, 0, "i64");
        setValue(ptrW, x, "i32");
        setValue(ptrH, y, "i32");
    }
});