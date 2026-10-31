import type {Application} from "express";

export function discord_setup_app(app: Application) {
    app.post("/api/token", async (req, res) => {
        // const code = JSON.parse(req.body).code
        console.log("Received code:", req.body.code);
        console.log("Client ID:", process.env.VITE_DISCORD_CLIENT_ID);
        console.log("Client Secret exists:", !!process.env.DISCORD_CLIENT_SECRET);

        const params = new URLSearchParams({
            client_id: process.env.VITE_DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: "authorization_code",
            code: req.body.code,
        } as any);

        console.log("Request body:", params.toString());

        const response = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: params,
        });

        const body = await response.json();
        console.log("Discord response:", body);
        res.send(body);
    });
}