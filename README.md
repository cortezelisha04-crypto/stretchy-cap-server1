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

## Public servers (matchmaking)

- Spawn in the stump, climb out of its window, and you're **automatically matched into a public server**.
  A message in front of your eyes says which one ("Public Server 2 · 4/10 players").
- The **server** does the matchmaking: it puts you in the fullest public server that still has a free slot
  (10 players max). When every public server is full it opens a new one. Two players can never both take the last slot.
- **Find Public Server** (desktop menu or VR menu) does the same without leaving the stump.
- **Auto-join** can be switched off in either menu if you'd rather play alone or only with a private room.
- **Leave & go to stump** (VR menu, Y/B button) takes you out of the public server and back into the stump.
  Climb out again to be matched again.
- Public servers can't be joined with a code. **Private rooms** (Create Private Room / Join with code) stay separate,
  and you're never pulled into a public server while you're in a private room.
- Touch another player's hand for a **high five** or their head for a **boop**. Both of you hear and feel it
  (controller buzz) and see a spark. It goes through the server to the other player.
- `https://YOUR-LINK/servers` lists the public servers and how many players are in each.

## Christmas update

- **Santa hat for everyone:** every player owns it and wears it by default. Turn yours on or off with
  **SANTA HAT** on the stump computer. Other players see your choice (server v5 and up; an older server just shows hats).
- The shopkeeper wears a Santa hat too, a decorated Christmas tree with presents stands by the monkey shop,
  and snow falls over the forest pit.

## Proximity voice chat

- Turn it on with **Voice Chat: On** (desktop menu) or **VOICE: ON** (top-left of the VR menu). The browser asks for
  the microphone; on Quest choose **Allow**. Voice stays on next time.
- Players in the same room (public or private) hear each other through their microphones, **from where their
  capuchin is**: full volume up close, fading with distance, and coming from the left or right in 3D.
- **Mute:** A or X on a Quest controller, M on a keyboard, **Mute Mic** in the desktop menu, or **MIC** in the VR menu.
- **Your mic indicator** floats below your view: MIC LIVE, TALKING (when you speak), or MUTED (red).
- **A green speaker ring** appears above any player who is talking.
- Turning voice **off** stops your microphone and you won't hear others.
- How it works: the server only passes the WebRTC connection setup between players in the same room. The voices
  go directly player to player, so they don't use your Render bandwidth.
- Limit: it uses free public STUN servers. A few strict networks (some school, office or mobile networks)
  block direct connections; those players can play together but may not hear each other. A TURN server
  (paid, e.g. Twilio or Metered) fixes that; add it to `ICE_SERVERS` in index.html.
- Voice chat only works on your Render link. The claude.ai page doesn't allow microphones or WebRTC.

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

## Updating the game (do this every time)

Upload **both** files, each to the **right place** in your GitHub repo, or Render keeps running the old one:

| File from the zip      | Where it goes in GitHub        |
|------------------------|--------------------------------|
| `server.js`            | the top folder of the repo     |
| `public/index.html`    | inside the `public` folder     |
| `public/sw.js`         | inside the `public` folder     |

On GitHub: open the `public` folder first, then **Add file → Upload files**, so `index.html` lands inside it.
Commit to the `main` branch (the branch Render deploys).

Render then redeploys by itself. In the Render dashboard, **Events** should show a new deploy with your latest
commit message, ending in **Deploy live**. If it doesn't, press **Manual Deploy → Deploy latest commit**,
and check **Settings → Build & Deploy**: Branch is `main`, Auto-Deploy is **On**.

### Check what Render is actually running

Open `https://YOUR-LINK/version`. It shows:

- `server`: should be `5` or higher. Lower means Render still has an old `server.js`.
- `game.version`: the game version Render is serving, for example `2026.11.09-christmas-1`.
- `game.file`: should be `public/index.html`. If it says `index.html`, it was uploaded to the top folder;
  the server still serves the newest copy, but move it into `public`.
- `deployCommit`: the GitHub commit Render built.

The same versions show at the bottom of the Multiplayer box in the game ("Game … · Server …") and in the
corner of the VR menu, so you can see on the Quest exactly which version you're playing.

### Old version still showing on the Quest?

The game checks the server's version every time it starts. If the server has a newer game than the copy the
browser saved, the game clears its saved copy and reloads by itself once. If an installed app (APK) still shows
an old game, make sure the APK was built from your **Render** link (`bubblewrap init --manifest=https://YOUR-LINK/manifest.webmanifest`),
not a GitHub Pages link: an APK built from GitHub Pages loads the GitHub Pages copy, which has no game server.

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

## Store update (game 2026.11.09-store-1, server v6)
- The Monkey Shop is now the **Store**: spend Bananas on hats (HATS tab) or pick your arms (ARMS tab).
- You start with 100 Bananas, earn 1 every 10 seconds of play and 5 per high five. Bananas and hats are saved on your device.
- Hats: Santa Hat (free), Beanie 50, Party Hat 75, Cowboy Hat 120, Headphones 150, Top Hat 200, Viking Helmet 250, Crown 500.
- Server v6 passes your hat to everyone in the room (`hid`). Older game copies still work and show the Santa hat.
- Snow falls everywhere outside, the ground is snowy and the stump and store roof have snow on top.
- Check the deploy: `/version` should report server "6" and game "2026.11.09-store-1".

## Start screen (game 2026.11.09-start-1)
- The game now opens on a Stretchy Cap VR start screen: a big capuchin face (a close-up of the real in-game monkey, wearing your hat), the title, and a banana loading bar.
- When everything has loaded a big PLAY button appears. On a Quest it goes straight into VR; on a computer or phone it starts on screen.
- "Play on screen instead" and "Settings & Multiplayer" (the full old menu) are under PLAY.
- The server did not change for this update (still v6). `/version` should report game "2026.11.09-start-1".

## Stump mirror (game 2026.11.09-mirror-1)
- A real mirror hangs on the stump wall (away from the window, computer and bed) so you can see your monkey, fur color and hat. Works in VR and on screen.
