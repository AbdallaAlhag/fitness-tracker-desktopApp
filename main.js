const { app, BrowserWindow, ipcMain } = require("electron");
// import { app, BrowserWindow } from "electron";
const path = require("node:path");
require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");

const CLIENT_ID = process.env.CLIENT_ID;
// const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

console.log(CLIENT_ID, REDIRECT_URI);

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadFile("index.html");
  win.webContents.openDevTools();

  try {
    await handleTokens();
    console.log("Ready to make Fitbit API calls with access_token");
  } catch (err) {
    console.error("Error during Fitbit auth:", err);
  }
};

const handleTokens = async () => {
  let tokens = loadTokens();
  console.log(tokens);
  if (
    tokens !== null &&
    tokens.success !== undefined &&
    Date.now() > tokens.acquired_at + tokens.expires_in * 1000
  ) {
    tokens = await refreshAccessToken(tokens.refresh_token, CLIENT_ID);
    tokens.acquired_at = Date.now();
    saveTokens(tokens);
    console.log("Token successfully refreshed");
  } else if (tokens === null || tokens.success === false) {
    await startFitbitAuth();
    console.log("Started Fitbit auth flow");
  }
};
app.whenReady().then(() => {
  ipcMain.handle("ping", () => "pong");
  createWindow();

  // closing on window and linux
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // closing on macOS
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("get-daily-steps", async () => {
  try {
    const tokens = loadTokens(); // your token management from earlier
    const accessToken = tokens.access_token;

    const today = new Date().toISOString().split("T")[0]; // e.g. "2025-09-25"

    const res = await fetch(
      `https://api.fitbit.com/1/user/-/activities/date/${today}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!res.ok) throw new Error("Failed to fetch Fitbit data");

    const data = await res.json();
    console.log(data);
    const steps = data.summary.steps; // daily steps
    return steps;
  } catch (err) {
    console.error(err);
    return null;
  }
});

// --- Get Fitbit Authorization.

// Generate random verifier
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url"); // Node 15+
}

// Hash it → challenge
function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function startFitbitAuth() {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);

  // what we want to grab from Fitbit
  // const scope = "activity profile";

  // const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}
  //                 &redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}
  //                 &code_challenge=${challenge}&code_challenge_method=S256`;

  // const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}
  //                 &redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=activity%20heartrate&expires_in=604800
  //                   &code_challenge=${challenge}&code_challenge_method=S256`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "activity heartrate",
    expires_in: "604800",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://www.fitbit.com/oauth2/authorize?${params.toString()}`;
  let authWin = new BrowserWindow({ width: 500, height: 600 });
  authWin.loadURL(authUrl);

  // Catch redirect
  authWin.webContents.on("will-redirect", async (event, url) => {
    if (url.startsWith(REDIRECT_URI)) {
      event.preventDefault();

      const code = new URL(url).searchParams.get("code");
      console.log("Got auth code:", code);
      authWin.close();

      // Exchange code for tokens
      const tokens = await exchangeCodeForToken(
        code,
        verifier,
        CLIENT_ID,
        REDIRECT_URI,
      );
      tokens.acquired_at = Date.now();
      saveTokens(tokens);
      console.log("Tokens:", tokens);
    }
  });
}

async function exchangeCodeForToken(code, verifier, clientId, redirectUri) {
  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
  });

  return res.json();
}

// refresh token and save

async function refreshAccessToken(refreshToken, clientId) {
  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error("Failed to refresh token: " + JSON.stringify(data));
  }
  return data; // contains new access_token, refresh_token, expires_in
}
function saveTokens(tokens) {
  fs.writeFileSync("tokens.json", JSON.stringify(tokens, null, 2));
}

function loadTokens() {
  if (!fs.existsSync("tokens.json")) return null;
  return JSON.parse(fs.readFileSync("tokens.json"));
}
