const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("node:path");
require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");

const FITBIT_CLIENT_ID = process.env.FITBIT_CLIENT_ID;
// const CLIENT_SECRET = process.env.CLIENT_SECRET;
const FITBIT_REDIRECT_URI = process.env.FITBIT_REDIRECT_URI;
const HEVY_API_KEY = process.env.HEVY_API_KEY;

const STRAVA = {
  clientId: process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,
  redirectUri: process.env.STRAVA_REDIRECT_URI,
  authUrl: "https://www.strava.com/oauth/authorize",
  tokenUrl: "https://www.strava.com/oauth/token",
  scope: "read,activity:read_all",
};

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadFile("index.html");
  Menu.setApplicationMenu(null);
  win.webContents.openDevTools();
};

// Both start up at the same time
// will result in errors until logged in since auth is async,
// loadtokens runs alongside our renderer.js methods calling get daily and get weekly
const handleTokens = async () => {
  // Fitbit Auth and Refresh check.
  let fitbit_tokens = loadTokens("fitbit_tokens.json");
  if (
    fitbit_tokens &&
    Date.now() > fitbit_tokens.acquired_at + fitbit_tokens.expires_in * 1000
  ) {
    fitbit_tokens = await refreshAccessToken(
      fitbit_tokens.refresh_token,
      FITBIT_CLIENT_ID,
    );
    fitbit_tokens.acquired_at = Date.now();
    saveTokens("fitbit_tokens.json", fitbit_tokens);
  } else if (fitbit_tokens == null || fitbit_tokens.success === false) {
    await startFitbitAuth();
  }

  // Strava Auth and Refresh check
  let strava_tokens = loadTokens("strava_tokens.json");
  const now = Math.floor(Date.now() / 1000);
  if (!strava_tokens) {
    // No tokens at all → start auth flow
    await startStravaAuth();
  }

  if (strava_tokens && now >= strava_tokens.expires_at) {
    // We have tokens, but access token expired → refresh
    strava_tokens = await refreshStravaToken();
    saveTokens("strava_tokens.json", strava_tokens);
  }
};

const createSplashWindow = () => {
  const splash = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    alwaysOnTop: true,
  });
  splash.loadFile("splash.html");
  return splash;
};

app.whenReady().then(async () => {
  const splash = createSplashWindow();

  ipcMain.handle("ping", () => "pong");
  try {
    await handleTokens();
  } catch (err) {
    console.error("Error during auth:", err);
    // app.quit();
    // return;
  }
  await createWindow();
  splash.close();
  // closing on window and linux
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // closing on macOS
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("hevy-get-activity", async () => {
  try {
    const url = "https://api.hevyapp.com/v1/workouts?page=1&pageSize=5";

    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": HEVY_API_KEY, // <-- matches curl
      },
    });
    if (!res.ok) throw new Error("Failed to fetch Hevy data");
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(err);
    return null;
    // return { success: false, error: err.message };
  }
});
ipcMain.handle("fitbit-get-daily-activity", async () => {
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
ipcMain.handle("fitbit-get-weight", async () => {
  try {
    const tokens = loadTokens("fitbit_tokens.json"); // your token management from earlier
    const accessToken = tokens.access_token;
    const today = new Date().toISOString().split("T")[0]; // e.g. "2025-09-25"

    const res = await fetch(
      `https://api.fitbit.com/1/user/-/body/log/weight/date/${today}.json`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    // if (!res.ok) throw new Error("Failed to fetch Fitbit data");
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Fitbit API failed: ${res.status} - ${errText}`);
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Fitbit API failed: ${res.status} - ${errText}`);
    }
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
ipcMain.handle("fitbit-get-weekly-activity", async () => {
  const tokens = loadTokens("fitbit_tokens.json"); // your token management from earlier
  const accessToken = tokens.access_token;
  const today = new Date().toISOString().split("T")[0]; // e.g. "2025-09-25"
  const { monday: startDate, sunday: endDate } = getWeekRange(today);

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
  return new Promise((resolve, reject) => {
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
      scope: "activity weight",
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
        try {
          // Exchange code for tokens
          const tokens = await exchangeCodeForToken(
            code,
            verifier,
            FITBIT_CLIENT_ID,
            FITBIT_REDIRECT_URI,
          );
          tokens.acquired_at = Date.now();
          saveTokens("fitbit_tokens.json", tokens);
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      }
    });
    authWin.on("closed", () => {
      reject(new Error("Auth window closed by user"));
    });
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
  return new Promise((resolve, reject) => {
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
          try {
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
            if (!res.ok)
              throw new Error(`Strava token exchange failed: ${res.status}`);
            const tokens = await res.json();
            tokens.acquired_at = Date.now();

            fs.writeFileSync(
              "strava_tokens.json",
              JSON.stringify(tokens, null, 2),
            );
            authWindow.close();
            resolve(tokens);
          } catch (err) {
            reject(err);
          }
        }
      }
    });
    authWindow.on("closed", () => {
      reject(new Error("Strava auth window closed by user"));
    });
  });
}

ipcMain.handle("strava-get-activity", async () => {
  const tokens = loadTokens("strava_tokens.json"); // your token management from earlier
  const accessToken = tokens.access_token;

  /// Gives us daily timer period, don't use at the moment.
  // // Get today’s midnight (local)
  // const startOfDay = new Date();
  // startOfDay.setHours(0, 0, 0, 0);
  //
  // // Get tomorrow’s midnight (local)
  // const endOfDay = new Date(startOfDay);
  // endOfDay.setDate(endOfDay.getDate() + 1);
  //
  // // Convert to epoch seconds
  // const after = Math.floor(startOfDay.getTime() / 1000);
  // const before = Math.floor(endOfDay.getTime() / 1000);
  // Today’s midnight (local)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Epoch seconds for "before" → now (end of today)
  const before = Math.floor(Date.now() / 1000);

  // Epoch seconds for "after" → 7 days ago
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const after = Math.floor(sevenDaysAgo.getTime() / 1000);

  // Page and per_page parameters
  const page = 1;
  const perPage = 30;

  // Construct the URL with query params
  const url = new URL("https://www.strava.com/api/v3/athlete/activities");
  url.search = new URLSearchParams({
    before,
    after,
    page,
    per_page: perPage,
  });

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching Strava activities:", error);
  }
});

async function refreshStravaToken() {
  const tokens = loadTokens("strava_tokens.json"); // your token management from earlier
  const refreshToken = tokens.refresh_token;

  const params = new URLSearchParams({
    client_id: STRAVA.clientId,
    client_secret: STRAVA.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    body: params,
  });
  const newTokens = await res.json();
  return newTokens;
}
