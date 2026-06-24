addToLibrary({
    $js_wss__postset: 'js_wss();',
    $js_wss: function() {

        // TODO handle input data size

        function buf2hex(buffer) { // buffer is an ArrayBuffer
            return [...new Uint8Array(buffer)]
                .map(x => x.toString(16).padStart(2, '0'))
                .join(' ');
        }

        function cArrayToArrayBuffer(ptr, size){
            const array = new ArrayBuffer(size);
            const view = new Int8Array(array);
            for (let i = 0; i < size; i++) {
                view[i] = getValue(ptr + i, "i8");
            }

            return array;
        }


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


        var WSSLib = function() {
            this.wss = null;
            this.ws = null;

            this.http = null;

            this.idcounter = 0;

            this.clients = new Map();
            this.inputs = new Map();
        };

        WSSLib.prototype.js_websocket_listen = function() {
            const wss = require("ws")

            this.wss = new wss.WebSocketServer({
                port: 35666,
            });

            this.wss.on("connection", (websocket) => {
                const id = this.idcounter++;
                console.log(this.clients)
                websocket.binaryType = "arraybuffer"

                this.clients.set(id, websocket);
                this.inputs.set(id, []);

                Module.ccall('accept_client', "number", ['number'], [id])

                websocket.on('message', (message) => {
                    const view = new Int8Array(message);
                    console.log("in : ", buf2hex(message))
                    //Module.ccall('receive_client_data', null, ['number', 'array', 'number'], [id, view, view.length])

                    this.inputs.get(id).push(message.transfer());
                })

                websocket.on('close', (event) => {
                    this.clients.delete(id)
                    // Module.ccall('disconnect_client', "number", ['number'], [id])
                })
            })

            return true;
        };

        WSSLib.prototype.js_start_http = function() {

            this.http = require("express")()

            this.http.use(express.text());

            this.http.get('/status', (req, res) => {
                res.send("hello world")
            });

            this.http.post('/exec.lua', (req, res) => {
                const ptr = Module.ccall('execute_lua', "number", ['string'], [res.body])
                const str = UTF8ToString(ptr)
                res.send(str)
            });

            this.http.listen(3000, () => console.log(`Server running on port 3000`));

            return true;
        };

        WSSLib.prototype.js_close_http = function() {
            if(this.http != null){
                this.http.close();
            }
            return true;
        };

        WSSLib.prototype.js_websocket_close = function() {
            if(this.wss != null){
                this.wss.close();
            }
            if(this.ws != null) {
                this.ws.close();
            }
        };

        WSSLib.prototype.js_websocket_connect = function(ptrAddr, port) {
            const addr = 'localhost'//UTF8ToString(ptrAddr);
            const url = `http://${addr}:${port}`;

            this.ws = new WebSocket(url);
            this.ws.binaryType = "arraybuffer"

            this.inputs.set(0, []);

            this.ws.addEventListener('message', (event) => {
                const view = new Int8Array(event.data);
                console.log("in : ", buf2hex(event.data))
                console.log(this.inputs)
                //Module.ccall('receive_server_data', null, ['array', 'number'], [view, view.length])
                this.inputs.get(0).push(event.data.transfer());
            })
        };

        WSSLib.prototype.js_websocket_state = function(id = null) {
            if(this.ws != null) {
                return this.ws.readyState;
            }
            if(this.wss != null && id != null) {
                const ws = this.clients.get(id);
                if(!ws) return 3;
                return ws.readyState
            }
            return 3;
        };

        WSSLib.prototype.js_websocket_send = function(id, ptrData, size) {
                const data = cArrayToArrayBuffer(ptrData, size);

                if(this.wss != null){
                    this.clients.get(id).send(data);
                    console.log("out : ", buf2hex(data))
                }
                if(this.ws) {
                    this.ws.send(data);
                    console.log("out : ", buf2hex(data))
                }
        };

        WSSLib.prototype.js_websocket_receive = function (id, ptr, size) {
            if(this.wss != null){
                const data = extractSizeBytes(this.inputs.get(id), size);
                const view = new Int8Array(data);
                //console.log("read : ", buf2hex(data))
                for(let i = 0; i < view.length; i++) {
                    setValue(ptr + i, view[i], "i8");
                }

                return view.length;
            }
            if(this.ws) {
                const data = extractSizeBytes(this.inputs.get(0), size);
                //console.log("read : ", buf2hex(data))
                const view = new Int8Array(data);
                for(let i = 0; i < view.length; i++) {
                    setValue(ptr + i, view[i], "i8");
                }

                return view.length;
            }
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
    },
    js_websocket_listen: function() {},
    js_websocket_listen__deps: ['$js_wss'],
    js_websocket_close: function() {},
    js_websocket_close__deps: ['$js_wss'],

    js_start_http: function() {},
    js_start_http__deps: ['$js_wss'],
    js_close_http: function() {},
    js_close_http__deps: ['$js_wss'],

    js_websocket_connect: function() {},
    js_websocket_connect__deps: ['$js_wss'],
    js_websocket_state: function() {},
    js_websocket_state__deps: ['$js_wss'],
    js_websocket_send: function() {},
    js_websocket_send__deps: ['$js_wss'],
    js_websocket_receive: function() {},
    js_websocket_receive__deps: ['$js_wss'],
});