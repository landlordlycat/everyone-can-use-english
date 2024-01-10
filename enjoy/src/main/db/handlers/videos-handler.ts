import { ipcMain, IpcMainEvent } from "electron";
import { Video, Transcription } from "@main/db/models";
import { FindOptions, WhereOptions, Attributes } from "sequelize";
import downloader from "@main/downloader";
import log from "electron-log/main";
import { t } from "i18next";
import youtubedr from "@main/youtubedr";

const logger = log.scope("db/handlers/videos-handler");

class VideosHandler {
  private async findAll(
    event: IpcMainEvent,
    options: FindOptions<Attributes<Video>>
  ) {
    return Video.findAll({
      order: [["createdAt", "DESC"]],
      include: [
        {
          association: "transcription",
          model: Transcription,
          where: { targetType: "Video" },
          required: false,
        },
      ],
      ...options,
    })
      .then((videos) => {
        if (!videos) {
          return [];
        }
        return videos.map((video) => video.toJSON());
      })
      .catch((err) => {
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  private async findOne(
    event: IpcMainEvent,
    where: WhereOptions<Attributes<Video>>
  ) {
    return Video.findOne({
      where: {
        ...where,
      },
    })
      .then((video) => {
        if (!video) {
          throw new Error(t("models.video.notFound"));
        }
        if (!video.isSynced) {
          video.sync().catch(() => {});
        }

        return video.toJSON();
      })
      .catch((err) => {
        logger.error(err);
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  private async transcribe(event: IpcMainEvent, id: string) {
    const video = await Video.findOne({
      where: {
        id,
      },
    });
    if (!video) {
      event.sender.send("on-notification", {
        type: "error",
        message: t("models.video.notFound"),
      });
    }

    video.transcribe().catch((err) => {
      event.sender.send("on-notification", {
        type: "error",
        message: err.message,
      });
    });
  }

  private async create(
    event: IpcMainEvent,
    source: string,
    params: {
      name?: string;
      coverUrl?: string;
    } = {}
  ) {
    let file = source;
    if (source.startsWith("http")) {
      try {
        if (youtubedr.validateYtURL(source)) {
          file = await youtubedr.autoDownload(source);
        } else {
          file = await downloader.download(source, {
            webContents: event.sender,
          });
        }
        if (!file) throw new Error("Failed to download file");
      } catch (err) {
        return event.sender.send("on-notification", {
          type: "error",
          message: t("models.video.failedToDownloadFile", { file: source }),
        });
      }
    }

    return Video.buildFromLocalFile(file, {
      source,
      ...params,
    })
      .then((video) => {
        return video.toJSON();
      })
      .catch((err) => {
        return event.sender.send("on-notification", {
          type: "error",
          message: t("models.video.failedToAdd", { error: err.message }),
        });
      });
  }

  private async update(
    event: IpcMainEvent,
    id: string,
    params: Attributes<Video>
  ) {
    const { name, description, transcription } = params;

    return Video.findOne({
      where: { id },
    })
      .then((video) => {
        if (!video) {
          throw new Error(t("models.video.notFound"));
        }
        video.update({ name, description, transcription });
      })
      .catch((err) => {
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  private async destroy(event: IpcMainEvent, id: string) {
    return Video.findOne({
      where: { id },
    }).then((video) => {
      if (!video) {
        event.sender.send("on-notification", {
          type: "error",
          message: t("models.video.notFound"),
        });
      }
      video.destroy();
    });
  }

  private async upload(event: IpcMainEvent, id: string) {
    const video = await Video.findOne({
      where: { id },
    });
    if (!video) {
      event.sender.send("on-notification", {
        type: "error",
        message: t("models.video.notFound"),
      });
    }

    video
      .upload()
      .then((res) => {
        return res;
      })
      .catch((err) => {
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  register() {
    ipcMain.handle("videos-find-all", this.findAll);
    ipcMain.handle("videos-find-one", this.findOne);
    ipcMain.handle("videos-transcribe", this.transcribe);
    ipcMain.handle("videos-create", this.create);
    ipcMain.handle("videos-update", this.update);
    ipcMain.handle("videos-destroy", this.destroy);
    ipcMain.handle("videos-upload", this.upload);
  }
}

export const videosHandler = new VideosHandler();
