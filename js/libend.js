

        // TODO change
        const inst = new ServerWSProxyLib();

        Module.clientConnect = inst.client_connect.bind(inst);
        Module.setUsername = inst.set_username.bind(inst);

        _js_websocket_connect = inst.js_websocket_connect.bind(inst);
        _js_websocket_state = inst.js_websocket_state.bind(inst);
        _js_websocket_send = inst.js_websocket_send.bind(inst);
        _js_websocket_receive = inst.js_websocket_receive.bind(inst);
        _js_websocket_listen = inst.js_websocket_listen.bind(inst);
        _js_websocket_close = inst.js_websocket_close.bind(inst);
        _js_can_client_start_server = inst.js_can_client_start_server.bind(inst);
    },
    //
    js_websocket_connect: function () { },
    js_websocket_connect__deps: ['$js_lib'],
    js_can_client_start_server: function(){ },
    js_can_client_start_server__deps: ['$js_lib'],
    js_websocket_state: function () { },
    js_websocket_state__deps: ['$js_lib'],
    js_websocket_send: function () { },
    js_websocket_send__deps: ['$js_lib'],
    js_websocket_receive: function () { },
    js_websocket_receive__deps: ['$js_lib'],
    js_websocket_listen: function () { },
    js_websocket_listen__deps: ['$js_lib'],
    js_websocket_close: function () { },
    js_websocket_close__deps: [ '$js_lib'],

    js_on_shutdown: function () {
        Module['onExit']?.(-314);
    },

    js_get_screen_size: function (ptrW, ptrH) {
        var win = window,
            doc = document,
            docElem = doc.documentElement,
            body = doc.getElementsByTagName('body')[0],
            x = win.innerWidth || docElem.clientWidth || body.clientWidth,
            y = win.innerHeight|| docElem.clientHeight|| body.clientHeight;


        setValue(ptrW, x, "i32");
        setValue(ptrH, y, "i32");
    }
});

// const propertyNames = Object.getOwnPropertyNames(BaseLib.prototype);
// for(const p of propertyNames){
//     if(p.startsWith('js')){
//         console.log(p + ` = function () { },`);
//         console.log(p + `__deps = ['$js_lib'],`);
//         // console.log(`_${p} = inst.${p}.bind(inst);`)
//     }
// }


