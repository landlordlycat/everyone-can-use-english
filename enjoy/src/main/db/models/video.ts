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
import { Audio, Recording, Speech, Transcription } from "@main/db/models";
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

const logger = log.scope("db/models/video");
@Table({
  modelName: "Video",
  tableName: "videos",
  underscored: true,
  timestamps: true,
})
export class Video extends Model<Video> {
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
    scope: { target_type: "Video" },
  })
  recordings: Recording[];

  @HasOne(() => Transcription, {
    foreignKey: "targetId",
    constraints: false,
    scope: { target_type: "Video" },
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
      "videos",
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
      "videos",
      this.getDataValue("md5") + this.extname
    );
  }

  // generate cover and upload
  async generateCover() {
    if (this.coverUrl) return;

    const ffmpeg = new Ffmpeg();
    const coverFile = await ffmpeg.generateCover(
      this.filePath,
      path.join(settings.cachePath(), `${Date.now()}.png`)
    );
    const hash = await hashFile(coverFile, { algo: "md5" });
    const finalFile = path.join(settings.cachePath(), `${hash}.png`);
    fs.renameSync(coverFile, finalFile);

    storage.put(hash, finalFile).then((result) => {
      logger.debug("cover upload result:", result.data);
      if (result.data.success) {
        this.update({ coverUrl: storage.getUrl(hash) });
      }
    });
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

    return webApi.syncVideo(this.toJSON()).then(() => {
      this.update({ syncedAt: new Date() });
    });
  }

  @BeforeCreate
  static async setupDefaultAttributes(video: Video) {
    try {
      const ffmpeg = new Ffmpeg();
      const fileMetadata = await ffmpeg.generateMetadata(video.filePath);
      video.metadata = Object.assign(video.metadata || {}, fileMetadata);
    } catch (err) {
      logger.error("failed to generate metadata", err.message);
    }

    // Generate unique ID base on user ID and audio MD5
    const userId = settings.getSync("user.id");
    video.id = uuidv5(`${userId}/${video.md5}`, uuidv5.URL);
    logger.info("generated ID:", video.id);
  }

  @AfterCreate
  static transcribeAsync(video: Video) {
    setTimeout(() => {
      video.transcribe();
    }, 500);
  }

  @AfterCreate
  static autoSync(video: Video) {
    // auto sync should not block the main thread
    video.sync().catch(() => {});
    video.generateCover().catch(() => {});
  }

  @AfterCreate
  static notifyForCreate(video: Video) {
    this.notify(video, "create");
  }

  @AfterUpdate
  static notifyForUpdate(video: Video) {
    this.notify(video, "update");
  }

  @AfterDestroy
  static notifyForDestroy(video: Video) {
    this.notify(video, "destroy");
  }

  @AfterDestroy
  static cleanupFile(video: Video) {
    fs.remove(video.filePath);
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
      throw new Error(t("models.video.fileNotFound", { file: filePath }));
    }

    // Check if file format is supported
    const extname = path.extname(filePath);
    if (AudioFormats.includes(extname.split(".").pop() as string)) {
      return Audio.buildFromLocalFile(filePath, params);
    } else if (!VideoFormats.includes(extname.split(".").pop() as string)) {
      throw new Error(t("models.video.fileNotSupported", { file: filePath }));
    }

    const md5 = await hashFile(filePath, { algo: "md5" });

    const destDir = path.join(settings.userDataPath(), "videos");
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
      throw new Error(t("models.video.failedToCopyFile", { file: filePath }));
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

  async transcribe() {
    Transcription.findOrCreate({
      where: {
        targetId: this.id,
        targetType: "Video",
      },
      defaults: {
        targetId: this.id,
        targetType: "Video",
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

  static notify(video: Video, action: "create" | "update" | "destroy") {
    if (!mainWindow.win) return;

    mainWindow.win.webContents.send("db-on-transaction", {
      model: "Video",
      id: video.id,
      action: action,
      record: video.toJSON(),
    });
  }
}
