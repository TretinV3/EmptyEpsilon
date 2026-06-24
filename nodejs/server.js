
var screen = {width: 0, height: 0};

var factory = require('./EmptyEpsilon.js');

factory({arguments: ["headless=scenario_01_waves.lua", "headless_name=Federation","headless_internet=0","httpserver=8080"]}).then(instance => {
    //instance.start_em_server("scenario_01_waves.lua")

});