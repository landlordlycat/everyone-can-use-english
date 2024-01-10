import {
  app,
  BrowserWindow,
  BrowserView,
  Menu,
  ipcMain,
  shell,
  dialog,
} from "electron";
import path from "path";
import db from "@main/db";
import settings from "@main/settings";
import downloader from "@main/downloader";
import whisper from "@main/whisper";
import fs from "fs-extra";
import "@main/i18n";
import webApi from "@main/web-api";
import log from "electron-log/main";
import { WEB_API_URL } from "@/constants";
import { AudibleProvider, TedProvider } from "@main/providers";
import { FfmpegDownloader } from "@main/ffmpeg";

log.initialize({ preload: true });
const logger = log.scope("WINDOW");

const audibleProvider = new AudibleProvider();
const tedProvider = new TedProvider();
const ffmpegDownloader = new FfmpegDownloader();

const main = {
  win: null as BrowserWindow | null,
  init: () => {},
};

main.init = () => {
  if (main.win) {
    main.win.show();
    return;
  }

  webApi.registerIpcHandlers();

  // Prepare local database
  db.registerIpcHandlers();

  // Prepare Settings
  settings.registerIpcHandlers();

  // Whisper
  whisper.registerIpcHandlers();

  // Downloader
  downloader.registerIpcHandlers();

  // FfmpegDownloader
  ffmpegDownloader.registerIpcHandlers();

  // AudibleProvider
  audibleProvider.registerIpcHandlers();

  // TedProvider
  tedProvider.registerIpcHandlers();

  // BrowserView
  ipcMain.handle(
    "view-load",
    (
      event,
      url,
      bounds: { x: number; y: number; width: number; height: number }
    ) => {
      const {
        x = 0,
        y = 0,
        width = mainWindow.getBounds().width,
        height = mainWindow.getBounds().height,
      } = bounds;

      logger.debug("view-load", url);
      const view = new BrowserView();
      view.setBackgroundColor("#fff");
      mainWindow.setBrowserView(view);

      view.setBounds({
        x,
        y,
        width,
        height,
      });
      view.setAutoResize({
        width: true,
        height: true,
        horizontal: true,
        vertical: true,
      });
      view.webContents.on("did-navigate", (_event, url) => {
        event.sender.send("view-on-state", {
          state: "did-navigate",
          url,
        });
      });
      view.webContents.on(
        "did-fail-load",
        (_event, _errorCode, errrorDescription, validatedURL) => {
          event.sender.send("view-on-state", {
            state: "did-fail-load",
            error: errrorDescription,
            url: validatedURL,
          });
          (view.webContents as any).destroy();
          mainWindow.removeBrowserView(view);
        }
      );
      view.webContents.on("did-finish-load", () => {
        view.webContents
          .executeJavaScript(`document.documentElement.innerHTML`)
          .then((html) => {
            event.sender.send("view-on-state", {
              state: "did-finish-load",
              html,
            });
          });
      });
      view.webContents.on("will-navigate", (detail) => {
        event.sender.send("view-on-state", {
          state: "will-navigate",
          url: detail.url,
        });

        logger.debug("prevent navigation", detail.url);
        detail.preventDefault();
      });
      view.webContents.loadURL(url);
    }
  );

  ipcMain.handle("view-remove", () => {
    logger.debug("view-remove");
    mainWindow.getBrowserViews().forEach((view) => {
      (view.webContents as any).destroy();
      mainWindow.removeBrowserView(view);
    });
  });

  ipcMain.handle("view-hide", () => {
    logger.debug("view-hide");
    const view = mainWindow.getBrowserView();
    if (!view) return;

    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  });

  ipcMain.handle(
    "view-show",
    (
      _event,
      bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    ) => {
      logger.debug("view-show", bounds);
      mainWindow.getBrowserView()?.setBounds(bounds);
    }
  );

  ipcMain.handle("view-scrape", (event, url) => {
    logger.debug("view-scrape", url);
    const view = new BrowserView();
    mainWindow.setBrowserView(view);

    view.webContents.on("did-navigate", (_event, url) => {
      event.sender.send("view-on-state", {
        state: "did-navigate",
        url,
      });
    });
    view.webContents.on(
      "did-fail-load",
      (_event, _errorCode, errrorDescription, validatedURL) => {
        event.sender.send("view-on-state", {
          state: "did-fail-load",
          error: errrorDescription,
          url: validatedURL,
        });
        (view.webContents as any).destroy();
        mainWindow.removeBrowserView(view);
      }
    );
    view.webContents.on("did-finish-load", () => {
      view.webContents
        .executeJavaScript(`document.documentElement.innerHTML`)
        .then((html) => {
          event.sender.send("view-on-state", {
            state: "did-finish-load",
            html,
          });
          (view.webContents as any).destroy();
          mainWindow.removeBrowserView(view);
        });
    });

    view.webContents.loadURL(url);
  });

  // App options
  ipcMain.handle("app-reset", () => {
    fs.removeSync(settings.userDataPath());

    app.relaunch();
    app.exit();
  });

  ipcMain.handle("app-relaunch", () => {
    app.relaunch();
    app.exit();
  });

  ipcMain.handle("app-reload", () => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
      );
    }
  });

  ipcMain.handle("app-is-packaged", () => {
    return app.isPackaged;
  });

  ipcMain.handle("app-api-url", () => {
    return process.env.WEB_API_URL || WEB_API_URL;
  });

  // Shell
  ipcMain.handle("shell-open-external", (_event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle("shell-open-path", (_event, path) => {
    shell.openPath(path);
  });

  // Dialog
  ipcMain.handle("dialog-show-open-dialog", (event, options) => {
    return dialog.showOpenDialogSync(
      BrowserWindow.fromWebContents(event.sender),
      options
    );
  });

  ipcMain.handle("dialog-show-save-dialog", (event, options) => {
    return dialog.showSaveDialogSync(
      BrowserWindow.fromWebContents(event.sender),
      options
    );
  });

  ipcMain.handle("dialog-show-message-box", (event, options) => {
    return dialog.showMessageBoxSync(
      BrowserWindow.fromWebContents(event.sender),
      options
    );
  });

  ipcMain.handle("dialog-show-error-box", (_event, title, content) => {
    return dialog.showErrorBox(title, content);
  });

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    icon: "./assets/icon.png",
    width: 1600,
    height: 1200,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      logger.info(`Opening ${url}`);
      shell.openExternal(url);
      return { action: "deny" };
    } else {
      return { action: "allow" };
    }
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);

    // Open the DevTools.
    setTimeout(() => {
      mainWindow.webContents.openDevTools();
    }, 100);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
    // mainWindow.webContents.openDevTools();
  }

  Menu.setApplicationMenu(null);

  main.win = mainWindow;
};

export default main;
