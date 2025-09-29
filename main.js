const { app, BrowserWindow, ipcMain } = require("electron");
// import { app, BrowserWindow } from "electron";
const path = require("node:path");
require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");

const FITBIT_CLIENT_ID = process.env.FITBIT_CLIENT_ID;
// const CLIENT_SECRET = process.env.CLIENT_SECRET;
const FITBIT_REDIRECT_URI = process.env.FITBIT_REDIRECT_URI;

const STRAVA = {
  clientId: process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,
  redirectUri: process.env.STRAVA_REDIRECT_URI,
  authUrl: "https://www.strava.com/oauth/authorize",
  tokenUrl: "https://www.strava.com/oauth/token",
  scope: "read,activity:read_all",
};
// console.log(FITBIT_CLIENT_ID, FITBIT_REDIRECT_URI);

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
  let fitbit_tokens = loadTokens("fitbit_tokens.json");
  if (
    fitbit_tokens !== null &&
    Date.now() > fitbit_tokens.acquired_at + fitbit_tokens.expires_in * 1000
  ) {
    fitbit_tokens = await refreshAccessToken(
      fitbit_tokens.refresh_token,
      FITBIT_CLIENT_ID,
    );
    fitbit_tokens.acquired_at = Date.now();
    saveTokens("fitbit_tokens.json", fitbit_tokens);
    console.log("Token successfully refreshed");
  } else if (fitbit_tokens === null || fitbit_tokens.success === false) {
    await startFitbitAuth();
    console.log("Started Fitbit auth flow");
  }
  let strava_tokens = loadTokens("strava_tokens.json");
  if (strava_tokens == null) {
    await startStravaAuth();
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

ipcMain.handle("get-daily-activity", async () => {
  try {
    const tokens = loadTokens("fitbit_tokens.json"); // your token management from earlier
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
    return data;
  } catch (err) {
    console.error(err);
    return null;
  }
});

async function fetchFitbitResource(resource, startDate, endDate, accessToken) {
  const res = await fetch(
    `https://api.fitbit.com/1/user/-/activities/${resource}/date/${startDate}/${endDate}.json`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Fitbit API error ${res.status}: ${resource}`);
  }

  return res.json();
}
ipcMain.handle("get-weekly-activity", async () => {
  const tokens = loadTokens("fitbit_tokens.json"); // your token management from earlier
  const accessToken = tokens.access_token;
  const today = new Date().toISOString().split("T")[0]; // e.g. "2025-09-25"
  const { monday: startDate, sunday: endDate } = getWeekRange(today);

  console.log(startDate, endDate);
  const resources = [
    "activityCalories",
    "calories",
    "caloriesBMR",
    "steps",
    "distance",
  ];

  // fetch all in parallel
  const results = await Promise.all(
    resources.map((r) =>
      fetchFitbitResource(r, startDate, endDate, accessToken),
    ),
  );

  // combine into one object
  const combined = {};
  resources.forEach((r, i) => {
    combined[r] = results[i];
  });

  return combined;
});

function getWeekRange(date = new Date()) {
  // clone date so we don’t mutate the original
  const d = new Date(date);

  // get the day index (0=Sunday, 1=Monday, ..., 6=Saturday)
  const day = d.getDay();

  // calculate Monday (if Sunday, day=0 → go back 6 days)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  // calculate Sunday (Monday + 6 days)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // format as yyyy-mm-dd
  const fmt = (x) => x.toISOString().split("T")[0];

  return {
    monday: fmt(monday),
    sunday: fmt(sunday),
  };
}
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

  // const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${FITBIT_CLIENT_ID}
  //                 &redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${encodeURIComponent(scope)}
  //                 &code_challenge=${challenge}&code_challenge_method=S256`;

  // const authUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${FITBIT_CLIENT_ID}
  //                 &redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=activity%20heartrate&expires_in=604800
  //                   &code_challenge=${challenge}&code_challenge_method=S256`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: FITBIT_CLIENT_ID,
    redirect_uri: FITBIT_REDIRECT_URI,
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
    if (url.startsWith(FITBIT_REDIRECT_URI)) {
      event.preventDefault();

      const code = new URL(url).searchParams.get("code");
      authWin.close();

      // Exchange code for tokens
      const tokens = await exchangeCodeForToken(
        code,
        verifier,
        FITBIT_CLIENT_ID,
        FITBIT_REDIRECT_URI,
      );
      tokens.acquired_at = Date.now();
      saveTokens("fitbit_tokens.json", tokens);
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
function saveTokens(fileName, tokens) {
  fs.writeFileSync(fileName, JSON.stringify(tokens, null, 2));
}

function loadTokens(fileName) {
  if (!fs.existsSync(fileName)) return null;
  return JSON.parse(fs.readFileSync(fileName));
}

async function startStravaAuth() {
  const authWindow = new BrowserWindow({
    width: 600,
    height: 800,
    webPreferences: { nodeIntegration: false },
  });

  const authUrl = `${STRAVA.authUrl}?client_id=${STRAVA.clientId}&response_type=code&redirect_uri=${STRAVA.redirectUri}&scope=${STRAVA.scope}&approval_prompt=force`;
  authWindow.loadURL(authUrl);

  authWindow.webContents.on("will-redirect", async (event, url) => {
    if (url.startsWith(STRAVA.redirectUri)) {
      event.preventDefault();

      const codeMatch = url.match(/code=([\w\d]+)/);
      if (codeMatch) {
        const code = codeMatch[1];

        const res = await fetch(STRAVA.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: STRAVA.clientId,
            client_secret: STRAVA.clientSecret,
            code,
            grant_type: "authorization_code",
          }),
        });
        const tokens = await res.json();
        tokens.acquired_at = Date.now();

        fs.writeFileSync("strava_tokens.json", JSON.stringify(tokens, null, 2));
        console.log("tokens saved");
        authWindow.close();
      }
    }
  });
}
