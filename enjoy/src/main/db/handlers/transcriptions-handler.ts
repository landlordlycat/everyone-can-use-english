import { ipcMain, IpcMainEvent } from "electron";
import { Transcription, Audio, Video } from "@main/db/models";
import { WhereOptions, Attributes } from "sequelize";
import log from "electron-log/main";

const logger = log.scope("db/handlers/transcriptions-handler");
class TranscriptionsHandler {
  private async findOrCreate(event: IpcMainEvent, where: Transcription) {
    try {
      const { targetType, targetId } = where;
      let target: Video | Audio = null;
      if (targetType === "Video") {
        target = await Video.findByPk(targetId);
      } else if (targetType === "Audio") {
        target = await Audio.findByPk(targetId);
      } else {
        throw new Error("models.transcription.invalidTargetType");
      }

      const [transcription, _created] = await Transcription.findOrCreate({
        where: {
          targetId,
          targetType,
        },
        defaults: {
          targetId,
          targetType,
          targetMd5: target.md5,
        },
      });

      if (transcription.state === "pending") {
        transcription.process();
      }

      return transcription.toJSON();
    } catch (err) {
      logger.error(err);
      event.sender.send("on-notification", {
        type: "error",
        message: err.message,
      });
    }
  }

  private async update(
    event: IpcMainEvent,
    id: string,
    params: Attributes<Transcription>
  ) {
    const { result } = params;

    return Transcription.findOne({
      where: { id },
    })
      .then((transcription) => {
        if (!transcription) {
          throw new Error("models.transcription.notFound");
        }
        transcription.update({ result });
      })
      .catch((err) => {
        logger.error(err);
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  private async process(
    event: IpcMainEvent,
    where: WhereOptions<Attributes<Transcription>>
  ) {
    return Transcription.findOne({
      where: {
        ...where,
      },
    })
      .then((transcription) => {
        if (!transcription) {
          throw new Error("models.transcription.notFound");
        }

        transcription.process({ force: true });
      })
      .catch((err) => {
        logger.error(err);
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  register() {
    ipcMain.handle("transcriptions-find-or-create", this.findOrCreate);
    ipcMain.handle("transcriptions-process", this.process);
    ipcMain.handle("transcriptions-update", this.update);
  }
}

export const transcriptionsHandler = new TranscriptionsHandler();
