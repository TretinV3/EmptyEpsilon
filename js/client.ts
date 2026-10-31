
import { DiscordSDK, RPCCloseCodes } from "@discord/embedded-app-sdk";


console.log("Hello from vite !")


var statusElement = document.getElementById('status');
var progressElement = document.getElementById('progress');
var spinnerElement = document.getElementById('spinner');
var canvasElement = document.getElementById('canvas');
var outputElement = document.getElementById('output');
if (outputElement) outputElement.value = ''; // clear browser cache

// As a default initial behavior, pop up an alert when webgl context is lost. To make your
// application robust, you may want to override this behavior before shipping!
// See http://www.khronos.org/registry/webgl/specs/latest/1.0/#5.15.2
canvasElement.addEventListener('webglcontextlost', (e) => {
    alert('WebGL context lost. You will need to reload the page.');
    e.preventDefault();
}, false);

var setStatus = (text) => {
    if (!setStatus.last) setStatus.last = { time: Date.now(), text: '' };
    if (text === setStatus.last.text) return;
    var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
    var now = Date.now();
    // if this is a progress update, skip it if too soon
    if (m && now - setStatus.last.time < 30) return;
    setStatus.last.time = now;
    setStatus.last.text = text;
    if (m) {
        text = m[1];
        progressElement.value = parseInt(m[2])*100;
        progressElement.max = parseInt(m[4])*100;
        progressElement.hidden = false;
        spinnerElement.hidden = false;
    } else {
        progressElement.value = null;
        progressElement.max = null;
        progressElement.hidden = true;
        if (!text) spinnerElement.style.display = 'none';
    }
    statusElement.innerHTML = text;
};

var Module = {
    print(...args) {
        console.log(...args);
        // These replacements are necessary if you render to raw HTML
        //text = text.replace(/&/g, "&amp;");
        //text = text.replace(/</g, "&lt;");
        //text = text.replace(/>/g, "&gt;");
        //text = text.replace('\n', '<br>', 'g');
        if (outputElement) {
            var text = args.join(' ');
            outputElement.value += text + "\n";
            outputElement.scrollTop = outputElement.scrollHeight; // focus on bottom
        }
    },
    canvas: canvasElement,
    setStatus: setStatus,
    totalDependencies: 0,
    monitorRunDependencies(left) {
        this.totalDependencies = Math.max(this.totalDependencies, left);
        setStatus(left ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
    },
    postRun: function() {
        // console.log("Post RUnned !!");
        // console.log(this)
    },
    onExit: function() {
        console.log('Exiting...');
        discordSdk.close(RPCCloseCodes.CLOSE_NORMAL, "You exited from app");
    }
};
setStatus('Downloading...');
window.onerror = window.onunhandledrejection = () => {
    // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
    setStatus('Exception thrown, see JavaScript console');
    spinnerElement.style.display = 'none';
    setStatus = (text) => {
        if (text) console.error('[post-exception status] ' + text);
    };
};



// Instantiate the SDK
const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

setupDiscordSdk().then(() => {
    console.log("Discord SDK is ready");
});

let auth = null;

async function setupDiscordSdk() {
    await discordSdk.ready();

    const { code } = await discordSdk.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: [
            "identify",
            "guilds",
            "applications.commands"
        ],
    });

    // Retrieve an access_token from your activity's server
    const response = await fetch("/api/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            code,
        }),
    });
    const { access_token } = await response.json();

    // Authenticate with Discord client (using the access_token)
    auth = await discordSdk.commands.authenticate({
        access_token,
    });


    if (auth == null) {
        throw new Error("Authenticate command failed");
    }

}

async function getUser() {
    const user = await fetch(`https://discord.com/api/v10/users/@me`, {
        headers: {
            // NOTE: we're using the access_token provided by the "authenticate" command
            Authorization: `Bearer ${auth.access_token}`,
            'Content-Type': 'application/json',
        },
    }).then((response) => response.json());

    return user;
}

import initModule from "./EmptyEpsilon.js";
initModule(Module).then(async (instance) => {
    const user = await getUser();
    console.log(user);
    // setTimeout(() => {
        instance.setUsername(user.global_name);
    // }, 2000)
});