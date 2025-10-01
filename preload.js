const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("versions", {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  ping: () => ipcRenderer.invoke("ping"),
});

contextBridge.exposeInMainWorld("fitbitAPI", {
  getFitbitDailyActivity: () => ipcRenderer.invoke("fitbit-get-daily-activity"),
  getFitbitWeeklyActivity: () =>
    ipcRenderer.invoke("fitbit-get-weekly-activity"),
});

contextBridge.exposeInMainWorld("stravaAPI", {
  getStravaActivity: () => ipcRenderer.invoke("strava-get-activity"),
});

contextBridge.exposeInMainWorld("hevyAPI", {
  getHevyActivity: () => ipcRenderer.invoke("hevy-get-activity"),
});
