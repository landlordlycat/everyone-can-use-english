import {
  AfterCreate,
  AfterUpdate,
  AfterDestroy,
  BelongsTo,
  Table,
  Column,
  Default,
  IsUUID,
  Model,
  DataType,
  Unique,
} from "sequelize-typescript";
import { Audio, Video } from "@main/db/models";
import whisper from "@main/whisper";
import mainWindow from "@main/window";
import log from "electron-log/main";
import webApi from "@main/web-api";

const logger = log.scope("db/models/transcription");
@Table({
  modelName: "Transcription",
  tableName: "transcriptions",
  underscored: true,
  timestamps: true,
})
export class Transcription extends Model<Transcription> {
  @IsUUID(4)
  @Default(DataType.UUIDV4)
  @Column({ primaryKey: true, type: DataType.UUID })
  id: string;

  @Column(DataType.UUID)
  targetId: string;

  @Column(DataType.STRING)
  targetType: string;

  @Unique
  @Column(DataType.STRING)
  targetMd5: string;

  @Default("pending")
  @Column(DataType.ENUM("pending", "processing", "finished"))
  state: "pending" | "processing" | "finished";

  @Column(DataType.STRING)
  engine: string;

  @Column(DataType.STRING)
  model: string;

  @Column(DataType.JSON)
  result: any;

  @Column(DataType.DATE)
  syncedAt: Date;

  @BelongsTo(() => Audio, { foreignKey: "targetId", constraints: false })
  audio: Audio;

  @BelongsTo(() => Video, { foreignKey: "targetId", constraints: false })
  video: Video;

  @Column(DataType.VIRTUAL)
  get isSynced(): boolean {
    return Boolean(this.syncedAt) && this.syncedAt >= this.updatedAt;
  }

  async sync() {
    if (this.getDataValue("state") !== "finished") return;

    return webApi.syncTranscription(this.toJSON()).then(() => {
      this.update({ syncedAt: new Date() });
    });
  }

  // STT using whisper
  async process(options: { force?: boolean } = {}) {
    if (this.getDataValue("state") === "processing") return;
    const { force = false } = options;

    logger.info(`[${this.getDataValue("id")}]`, "Start to transcribe.");

    let filePath = "";
    if (this.targetType === "Audio") {
      filePath = (await Audio.findByPk(this.targetId)).filePath;
    } else if (this.targetType === "Video") {
      filePath = (await Video.findByPk(this.targetId)).filePath;
    }

    if (!filePath) {
      logger.error(`[${this.getDataValue("id")}]`, "No file path.");
      throw new Error("No file path.");
    }

    try {
      await this.update({
        state: "processing",
      });
      const { model, transcription } = await whisper.transcribe(filePath, {
        force,
        extra: [
          "--split-on-word",
          "--max-len 1",
          `--prompt "Hello! Welcome to listen to this audio."`,
        ],
      });
      const result = whisper.groupTranscription(transcription);
      this.update({
        engine: "whisper",
        model: model?.type,
        result,
        state: "finished",
      }).then(() => this.sync());

      logger.info(`[${this.getDataValue("id")}]`, "Transcription finished.");
    } catch (err) {
      logger.error(
        `[${this.getDataValue("id")}]`,
        "Transcription not finished.",
        err
      );
      this.update({
        state: "pending",
      });

      throw err;
    }
  }

  @AfterCreate
  static startTranscribeAsync(transcription: Transcription) {
    setTimeout(() => {
      transcription.process();
    }, 0);
  }

  @AfterUpdate
  static notifyForUpdate(transcription: Transcription) {
    this.notify(transcription, "update");
  }

  @AfterDestroy
  static notifyForDestroy(transcription: Transcription) {
    this.notify(transcription, "destroy");
  }

  static notify(
    transcription: Transcription,
    action: "create" | "update" | "destroy"
  ) {
    if (!mainWindow.win) return;

    mainWindow.win.webContents.send("db-on-transaction", {
      model: "Transcription",
      id: transcription.id,
      action: action,
      record: transcription.toJSON(),
    });
  }
}
