const { app, BrowserWindow, ipcMain } = require("electron");
// import { app, BrowserWindow } from "electron";
const path = require("node:path");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadFile("index.html");
  win.webContents.openDevTools();
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
