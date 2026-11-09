# Stretchy Cap — online multiplayer server

This folder is a real game server. It does two jobs from one web address:

1. **Serves the game** (`public/index.html`), so you and your friends open the same link on Quest, phone or computer.
2. **Runs multiplayer** over WebSockets at `/ws`: rooms, 5-letter room codes, the player list, and live player
   positions, heads, arms and hands (about 20 updates a second, smoothed on each screen).

Players on different networks connect to the same server on the internet, so it works between houses, not just tabs.

## How to play once it's online

1. Everyone opens your server's link (for example `https://stretchy-cap.onrender.com`) in the Quest browser or any browser.
2. In the **Online Multiplayer** box, type a name.
3. One person presses **Create Room**. A code like `K7QX2` appears.
4. Everyone else types that code and presses **Join**. The box lists everyone in the room (★ marks the host).
5. Press **Enter VR** (Quest) or **Play on Screen** (computer). You'll see each other as capuchins with name tags.
   In VR, the stump computer shows the room code and how many monkes are in it.
6. **Leave Room** takes you out. If the host leaves, the next player becomes host.

The host's bear runs the Horror Cave, so everyone sees the same monster.

## Put it online for free (Render)

You need a free GitHub account and a free Render account. No credit card is needed for Render's free plan.

1. On GitHub, create a new repository called `stretchy-cap-server` and upload **everything in this folder**
   (`server.js`, `package.json`, `render.yaml`, `README.md`, `.gitignore` and the whole `public` folder).
   Don't upload `node_modules` if you have one.
2. Go to https://render.com, sign in with GitHub, and choose **New → Blueprint**.
   Pick your `stretchy-cap-server` repository. Render reads `render.yaml` and sets everything up.
   (Or choose **New → Web Service**, pick the repo, Build command `npm install`, Start command `npm start`, Plan **Free**.)
3. Wait for it to say **Live**. Your link is shown at the top, like `https://stretchy-cap.onrender.com`.
4. Check it: open `https://YOUR-LINK/health`. It should show `{"ok":true,...}`.
5. Open `https://YOUR-LINK` on your Quest and on a friend's device, create a room on one and join it on the other.

**Free plan note:** Render puts free servers to sleep after about 15 minutes with nobody connected.
The first person to open the link after that waits about a minute while it wakes up. A paid plan (about $7/month) stays awake.

### Other hosts that work

Any host that runs Node 18+ and allows WebSockets: Railway, Fly.io, Koyeb, or your own computer/VPS.
Start command is always `npm start`. The server uses the `PORT` the host gives it.

## Updating the game

Replace `public/index.html` with the new game file, upload it to GitHub, and Render redeploys by itself.

## Making it an installable Quest app

Use the APK guide from the earlier package, but point Bubblewrap at your server:

```
bubblewrap init --manifest=https://YOUR-LINK/manifest.webmanifest --metaquest
```

## Using a different server for the game page

If the game page is hosted somewhere else (like GitHub Pages), type your server address
(for example `stretchy-cap.onrender.com`) into the **Server** box in the Multiplayer menu. It's remembered.

## Running it on your own computer (for testing)

```
npm install
npm start
```

Then open http://localhost:8080. That only works on your own network; use a host above for friends elsewhere.

## Limits

- Up to 10 players per room. Rooms disappear when the last player leaves.
- Rooms and codes aren't saved; restarting the server empties them.
- Each player's own computer runs their physics; the server passes poses between players.
