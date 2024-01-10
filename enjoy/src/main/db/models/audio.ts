import {
  AfterCreate,
  AfterUpdate,
  AfterDestroy,
  BeforeCreate,
  BelongsTo,
  Table,
  Column,
  Default,
  IsUUID,
  Model,
  HasMany,
  HasOne,
  DataType,
  Unique,
} from "sequelize-typescript";
import { Recording, Speech, Transcription, Video } from "@main/db/models";
import settings from "@main/settings";
import { AudioFormats, VideoFormats } from "@/constants";
import { hashFile } from "@/utils";
import path from "path";
import fs from "fs-extra";
import { t } from "i18next";
import mainWindow from "@main/window";
import log from "electron-log/main";
import storage from "@main/storage";
import Ffmpeg from "@main/ffmpeg";
import webApi from "@main/web-api";
import { startCase } from "lodash";
import { v5 as uuidv5 } from "uuid";

const logger = log.scope("db/models/audio");
@Table({
  modelName: "Audio",
  tableName: "audios",
  underscored: true,
  timestamps: true,
})
export class Audio extends Model<Audio> {
  @IsUUID(4)
  @Default(DataType.UUIDV4)
  @Column({ primaryKey: true, type: DataType.UUID })
  id: string;

  @Column(DataType.STRING)
  source: string;

  @Unique
  @Column(DataType.STRING)
  md5: string;

  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  description: string;

  @Column(DataType.JSON)
  metadata: any;

  @Column(DataType.STRING)
  coverUrl: string;

  @HasMany(() => Recording, {
    foreignKey: "targetId",
    constraints: false,
    scope: { target_type: "Audio" },
  })
  recordings: Recording[];

  @HasOne(() => Transcription, {
    foreignKey: "targetId",
    constraints: false,
    scope: { target_type: "Audio" },
  })
  transcription: Transcription;

  @BelongsTo(() => Speech, "md5")
  speech: Speech;

  @Default(0)
  @Column(DataType.INTEGER)
  recordingsCount: number;

  @Default(0)
  @Column(DataType.INTEGER)
  recordingsDuration: number;

  @Column(DataType.DATE)
  syncedAt: Date;

  @Column(DataType.DATE)
  uploadedAt: Date;

  @Column(DataType.VIRTUAL)
  get isSynced(): boolean {
    return Boolean(this.syncedAt) && this.syncedAt >= this.updatedAt;
  }

  @Column(DataType.VIRTUAL)
  get isUploaded(): boolean {
    return Boolean(this.uploadedAt);
  }

  @Column(DataType.VIRTUAL)
  get transcribing(): boolean {
    return this.transcription?.state === "processing";
  }

  @Column(DataType.VIRTUAL)
  get transcribed(): boolean {
    return this.transcription?.state === "finished";
  }

  @Column(DataType.VIRTUAL)
  get src(): string {
    return `enjoy://${path.join(
      "library",
      "audios",
      this.getDataValue("md5") + this.extname
    )}`;
  }

  get extname(): string {
    return (
      this.getDataValue("metadata").extname ||
      path.extname(this.getDataValue("source")) ||
      ""
    );
  }

  get filePath(): string {
    return path.join(
      settings.userDataPath(),
      "audios",
      this.getDataValue("md5") + this.extname
    );
  }

  async upload(force: boolean = false) {
    if (this.isUploaded && !force) return;

    return storage
      .put(this.md5, this.filePath)
      .then((result) => {
        logger.debug("upload result:", result.data);
        if (result.data.success) {
          this.update({ uploadedAt: new Date() });
        } else {
          throw new Error(result.data);
        }
      })
      .catch((err) => {
        logger.error("upload failed:", err.message);
        throw err;
      });
  }

  async sync() {
    if (!this.isUploaded) {
      this.upload();
    }

    return webApi.syncAudio(this.toJSON()).then(() => {
      this.update({ syncedAt: new Date() });
    });
  }

  @BeforeCreate
  static async setupDefaultAttributes(audio: Audio) {
    try {
      const ffmpeg = new Ffmpeg();
      const fileMetadata = await ffmpeg.generateMetadata(audio.filePath);
      audio.metadata = Object.assign(audio.metadata || {}, fileMetadata);
    } catch (err) {
      logger.error("failed to generate metadata", err.message);
    }

    // Generate unique ID base on user ID and audio MD5
    const userId = settings.getSync("user.id");
    audio.id = uuidv5(`${userId}/${audio.md5}`, uuidv5.URL);
    logger.info("generated ID:", audio.id);
  }

  @AfterCreate
  static transcribeAsync(audio: Audio) {
    setTimeout(() => {
      audio.transcribe();
    }, 500);
  }

  @AfterCreate
  static autoSync(audio: Audio) {
    // auto sync should not block the main thread
    audio.sync().catch(() => {});
  }

  @AfterCreate
  static notifyForCreate(audio: Audio) {
    this.notify(audio, "create");
  }

  @AfterUpdate
  static notifyForUpdate(audio: Audio) {
    this.notify(audio, "update");
  }

  @AfterDestroy
  static notifyForDestroy(audio: Audio) {
    this.notify(audio, "destroy");
  }

  @AfterDestroy
  static cleanupFile(audio: Audio) {
    fs.remove(audio.filePath);
  }

  static async buildFromLocalFile(
    filePath: string,
    params?: {
      name?: string;
      description?: string;
      source?: string;
      coverUrl?: string;
    }
  ): Promise<Audio | Video> {
    // Check if file exists
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch (error) {
      throw new Error(t("models.audio.fileNotFound", { file: filePath }));
    }

    // Check if file format is supported
    const extname = path.extname(filePath);
    if (VideoFormats.includes(extname.split(".").pop() as string)) {
      return Video.buildFromLocalFile(filePath, params);
    } else if (!AudioFormats.includes(extname.split(".").pop() as string)) {
      throw new Error(t("models.audio.fileNotSupported", { file: filePath }));
    }

    const md5 = await hashFile(filePath, { algo: "md5" });

    const destDir = path.join(settings.userDataPath(), "audios");
    const destFile = path.join(destDir, `${md5}${extname}`);

    // Copy file to library
    try {
      // Create directory if not exists
      fs.ensureDirSync(destDir);

      // Copy file
      fs.copySync(filePath, destFile);

      // Check if file copied
      fs.accessSync(destFile, fs.constants.R_OK);
    } catch (error) {
      throw new Error(t("models.audio.failedToCopyFile", { file: filePath }));
    }

    const {
      name = startCase(path.basename(filePath, extname)),
      description,
      source,
      coverUrl,
    } = params || {};
    const record = this.build({
      source,
      md5,
      name,
      description,
      coverUrl,
      metadata: {
        extname,
      },
    });

    return record.save().catch((err) => {
      logger.error(err);
      // Remove copied file
      fs.removeSync(destFile);
      throw err;
    });
  }

  // STT using whisper
  async transcribe() {
    Transcription.findOrCreate({
      where: {
        targetId: this.id,
        targetType: "Audio",
      },
      defaults: {
        targetId: this.id,
        targetType: "Audio",
        targetMd5: this.md5,
      },
    })
      .then(([transcription, _created]) => {
        if (transcription.state === "pending") {
          transcription.process();
        } else if (transcription.state === "finished") {
          transcription.process({ force: true });
        } else if (transcription.state === "processing") {
          logger.warn(
            `[${transcription.getDataValue("id")}]`,
            "Transcription is processing."
          );
        }
      })
      .catch((err) => {
        logger.error(err);

        throw err;
      });
  }

  static notify(audio: Audio, action: "create" | "update" | "destroy") {
    if (!mainWindow.win) return;

    mainWindow.win.webContents.send("db-on-transaction", {
      model: "Audio",
      id: audio.id,
      action: action,
      record: audio.toJSON(),
    });
  }
}
