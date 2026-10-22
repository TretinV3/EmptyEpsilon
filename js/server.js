/*
    npm clean-install
    node ./server.js
 */

const factory = require('./EmptyEpsilon.js');

factory({arguments: ["headless=scenario_00_basic.lua", "headless_name=Federation","headless_internet=0","httpserver=35666"]}).then(instance => {
    //instance.start_em_server("scenario_01_waves.lua")

});