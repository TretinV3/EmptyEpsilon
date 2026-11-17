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

class EEBase<Room> {
    wss!: WebSocketServer;

    http!: Server;

    express!: Application;

    /**  @type {Map<number, any>} */
    rooms: Map<number, Room> = new Map();

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

            this.wss.handleUpgrade(req, socket, head, (websocket) => {

                let connected = this.handle_websocket(websocket, pathname);

                const roomId = Number(pathname.split('rooms/')[1]);
                if (!connected && pathname.startsWith("/rooms/")) {
                    const room = this.rooms.get(roomId);
                    if (room) {
                            console.log("connected")

                            connected = this.handle_client(room, websocket);
                    }
                }

                if(!connected){
                    socket.destroy();
                }
            });

        });


        this.http.listen(35666, () => {
            console.log("Listening on http://localhost:35666");
        });

    }

    handle_websocket(websocket: WebSocket, pathname: string): boolean {
        return false;
    }

    handle_client(room: Room, websocket: WebSocket): boolean {
        throw "Base EEServer, connection is not implemented";
        return false;
    }

    /**
     * Create the REST api server
     */
    start_http() {

        const app = express();
        // app.use(bodyParser.text({type: "*/*"}));
        app.use(express.static(import.meta.dirname + '/public'));

        app.use(express.json());

        if(process.env.VITE_USE_DISCORD == "true") {
            import("./discord.js").then((discord) => {
                discord.discord_setup_app(app);
            })
        }

        this.express = app;
    };


}

class EEServer extends EEBase<EEInstance> {
    add(instance: EEInstance) {
        const roomId = 1234;
        this.rooms.set(roomId, instance);
    }

    handle_client(room: EEInstance, websocket: WebSocket): boolean {
        room.clientConnect(websocket);
        return true;
    }
}

interface WSProxyInstance {
    server: WebSocket,
    id_counter: number,
    clients: Map<number, WebSocket>
}

class EEWSProxy extends EEBase<WSProxyInstance> {

    add(server: WebSocket) {
        const roomId = 1234;
        const instance = {server, id_counter: 0, clients: new Map()};
        this.rooms.set(roomId, instance);

        server.on('message', (event: any) => {
            const view = new Uint8Array(event);

            const v = new DataView(view.buffer);

            // WARNING dangerous convertion
            const id = Number(v.getBigUint64(1));
            const command = v.getUint8(0);
            switch (command) {
                case ProxyCommands.CLOSE:
                    this.rooms.get(roomId)?.clients.get(id)?.close();
                    break;
                case ProxyCommands.SEND:
                    const message = view.slice(9).buffer
                    this.rooms.get(roomId)?.clients.get(id)?.send(message);
                    break;
                default:
                    console.log("Unknow command from client server " + command);
            }
        })

        server.on('close', () => {
            this.rooms.get(roomId)?.clients.forEach((v) => v.close());
            this.rooms.delete(roomId);
        })
    }

    handle_client(room: WSProxyInstance, websocket: WebSocket): boolean {

        const id = room.id_counter++
        websocket.binaryType = "arraybuffer";

        room.clients.set(id, websocket);

        // Send connecting event
        const buffer = new ArrayBuffer(9);
        const view = new DataView(buffer);
        view.setUint8(0, ProxyCommands.CONNECTION)
        view.setBigUint64(1, BigInt(id));
        room.server.send(view.buffer);

        websocket.on('message', (event: any) => {
            const buffer = new ArrayBuffer(9);
            const view = new DataView(buffer);
            view.setUint8(0, ProxyCommands.SEND)
            view.setBigUint64(1, BigInt(id));

            room.server.send(new Blob([view.buffer, event]))
        })

        websocket.on('close', () => {
            const buffer = new ArrayBuffer(9);
            const view = new DataView(buffer);
            view.setUint8(0, ProxyCommands.CLOSE)
            view.setBigUint64(1, BigInt(id));
            room.server.send(view.buffer);
        })

        return true;
    }

    handle_websocket(websocket: WebSocket, pathname: string): boolean {
        const roomId = Number(pathname.split('proxy/')[1]);
        if (pathname.startsWith("/proxy/")) {
            this.add(websocket);
            return true;
        }
        return false;
    }
}

enum ProxyCommands {
    CONNECTION = 0,
    STATUS = 1,
    CLOSE = 2,
    SEND = 3
}

if(process.env.VITE_SERVER_TYPE == "server"){
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
} else if(process.env.VITE_SERVER_TYPE == "client"){
    if(process.env.VITE_CONNECTION == "proxy"){
        const server = new EEWSProxy();
    } else if(process.env.VITE_CONNECTION == "P2P") {

    } else {
        console.log("Unknow VITE_CONNECTION : use 'proxy' of 'P2P'")
    }
} else {
    console.log("Unknow VITE_SERVER_TYPE : use 'server' of 'client'")
}
