/*
    npm clean-install
    node ./server.js
 */

const factory = require('./EmptyEpsilon.js');

const express = require("express");
const bodyParser = require("body-parser");
const wss = require("ws")
const http = require('http');

class EEServer {
    /**  @type {wss.WebSocketServer} */
    wss = null;

    /**  @type {http.Server} */
    http = null;
    /**  @type {Express.Application} */
    express = null;

    /**  @type {Map<number, any>} */
    rooms = new Map();

    constructor() {
        this.init_http();
    }

    /**
     * Create the http server and link it to the websocket server and REST api
     */
    init_http() {
        if (this.http == null && typeof window === 'undefined') {
            this.start_http();

            this.http = http.createServer(this.express);
            this.wss = new wss.WebSocketServer({ noServer: true });

            this.http.on("upgrade", (req, socket, head) => {
                const { pathname} = new URL(req.url, "http://localhost");

                const roomId = Number(pathname.split('rooms/')[1]);
                // console.log(`Room Id: ${roomId}`);
                // console.log(this.rooms)
                // console.log(pathname)
                if (pathname.startsWith("/rooms/")) {
                    const room = this.rooms.get(roomId);
                    if(room){
                        this.wss.handleUpgrade(req, socket, head, (websocket) => {
                            // console.log("connected")
                            room.clientConnect(websocket)
                            // this.wss.emit("connection", websocket, req);
                        });
                    } else {
                        socket.destroy();
                    }
                } else {
                    socket.destroy();
                }
            });


            this.http.listen(35666, () => {
                console.log("Listening on http://localhost:35666");
            });
        }
    }

    /**
     * Create the REST api server
     */
    start_http() {

        const app = express();
        app.use(bodyParser.text({ type: "*/*" }));
        app.use(express.static(__dirname));

        app.post("/exec.lua", (req, reply) => {
            try {
                const ptr = this.instance.ccall("execute_lua", "number", ["string"], [req.body]);
                const str = UTF8ToString(ptr);
                reply.send(str);
            } catch (e) {
                reply.status(500).send(String(e?.stack || e));
            }
        });

        this.express = app;
    };

    add(instance){
        const roomId = 1234;
        this.rooms.set(roomId, instance);
    }
}

const server = new EEServer();


factory({arguments: ["headless=scenario_00_basic.lua", "headless_name=Federation","headless_internet=0","httpserver=35666"]}).then(instance => {
    server.add(instance);
});