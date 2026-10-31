/*
    NODE_ENV=production npm clean-install
    NODE_ENV=production node ./server.js
 */

import type {Server} from "node:http";
import type {Application} from "express";
import dotenv from "dotenv";
// import fetch from "node-fetch";
dotenv.config({});

import express from "express"
import bodyParser  from  "body-parser"
import {createServer} from  'http';
import {WebSocketServer, WebSocket} from  "ws"

interface EEInstance {
    clientConnect: (s: WebSocket) => void;
}

class EEServer {
    wss!: WebSocketServer;

    http!: Server;

    express!: Application;

    /**  @type {Map<number, any>} */
    rooms: Map<number, EEInstance> = new Map();

    constructor() {
        this.init_http();
    }

    /**
     * Create the http server and link it to the websocket server and REST api
     */
    init_http() {
        this.start_http();

        this.http = createServer(this.express);
        this.wss = new WebSocketServer({noServer: true});

        this.http.on("upgrade", (req, socket, head) => {
            const {pathname} = new URL(req.url ?? '', "http://localhost");

            const roomId = Number(pathname.split('rooms/')[1]);
            // console.log(`Room Id: ${roomId}`);
            // console.log(this.rooms)
            // console.log(pathname)
            if (pathname.startsWith("/rooms/")) {
                const room = this.rooms.get(roomId);
                if (room) {
                    this.wss.handleUpgrade(req, socket, head, (websocket) => {
                        console.log("connected")
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

    /**
     * Create the REST api server
     */
    start_http() {

        const app = express();
        // app.use(bodyParser.text({type: "*/*"}));
        app.use(express.static(import.meta.dirname + '/public'));

        // app.post("/exec.lua", (req, reply) => {
        //     try {
        //         const ptr = this.instance.ccall("execute_lua", "number", ["string"], [req.body]);
        //         const str = UTF8ToString(ptr);
        //         reply.send(str);
        //     } catch (e) {
        //         reply.status(500).send(String(e?.stack || e));
        //     }
        // });

        app.use(express.json());

        if(process.env.VITE_USE_DISCORD == "true") {
            import("./discord.js").then((discord) => {
                discord.discord_setup_app(app);
            })
        }

        this.express = app;
    };

    add(instance: EEInstance) {
        const roomId = 1234;
        this.rooms.set(roomId, instance);
    }
}

const server = new EEServer();

async function loadFactory(){
    const file = './public/EmptyEpsilon.js';
    const fac = await import(file);
    return fac.default;
}


const factory = await loadFactory();
factory({arguments: ["headless=scenario_00_basic.lua", "headless_name=Federation", "headless_internet=0", "httpserver=35666"], locateFile: (f: string) => 'public/' + f}).then((instance: EEInstance) => {
    server.add(instance);
})
