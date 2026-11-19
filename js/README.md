# EmptyEpsilon with Emscripten

## Dependencies :
- [Emscripten](https://emscripten.org/)
- [Nodejs & npm](https://nodejs.org)

## Building :
Once Emscripten has been installed and setup, just use `emcmake` before the `cmake` command. Example : `emcmake cmake -S EmptyEpsilon -B EmptyEpsilon/_buildem`. Be aware of your cmake version !

Then you need to choose your multiplayer architecture : server, proxy or p2p. You either use a dedicated server instance or an client provided one (`VITE_SERVER_TYPE`). When using a client game, other clients can connect in two ways : WebSockets through a proxy server or peer to peer connection with WebRTC (`VITE_CONNECTION`). These options **must be** configured in a `.env` or passed in environment variables at every stage.

## Running

All necessaries files are self-contained and are created in `{BUILD FOLDER}/web/`. Public facing files are in the `public` folder and can be hosted on a web server. If a server is needed (`server` or `proxy` option) dependencies can be installed with `npm clean-install` and the server can be started with `node server.js`.

## Contributing
There are 3 builds :
- Client side : bundling the frontend html (using [Vite](https://vite.dev/))
- Server side : simple typescript compilation
- Emscripten library : the base library file (`libbase.ts`) is bundled (using [rolldown](https://rolldown.rs/)) to include his dependencies then injected in the Emscripten template file (`libtemplate.js`) then used by Emscripten to create the final file. The intermediary product is saved in `{BUILD FOLDER}/web/lib.js`