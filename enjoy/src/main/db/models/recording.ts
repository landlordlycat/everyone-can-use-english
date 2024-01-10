import { app } from "electron";
import {
  AfterCreate,
  AfterUpdate,
  AfterDestroy,
  AfterFind,
  Table,
  Column,
  Default,
  Model,
  IsUUID,
  BelongsTo,
  Min,
  DataType,
  Unique,
  HasOne,
} from "sequelize-typescript";
import mainWindow from "@main/window";
import { Audio, PronunciationAssessment, Video } from "@main/db/models";
import fs from "fs-extra";
import path from "path";
import settings from "@main/settings";
import { hashFile } from "@/utils";
import log from "electron-log/main";
import storage from "@main/storage";
import Ffmpeg from "@main/ffmpeg";
import webApi from "@main/web-api";
import { AzureSpeechSdk } from "@main/azure-speech-sdk";
import camelcaseKeys from "camelcase-keys";

@Table({
  modelName: "Recording",
  tableName: "recordings",
  underscored: true,
  timestamps: true,
})
export class Recording extends Model<Recording> {
  @IsUUID(4)
  @Default(DataType.UUIDV4)
  @Column({ primaryKey: true, type: DataType.UUID })
  id: string;

  @BelongsTo(() => Audio, { foreignKey: "targetId", constraints: false })
  audio: Audio;

  @BelongsTo(() => Video, { foreignKey: "targetId", constraints: false })
  video: Video;

  @Column(DataType.VIRTUAL)
  target: Audio | Video;

  @Column(DataType.UUID)
  targetId: string;

  @Column(DataType.STRING)
  targetType: "Audio" | "Video";

  @HasOne(() => PronunciationAssessment, {
    foreignKey: "targetId",
    constraints: false,
  })
  pronunciationAssessment: PronunciationAssessment;

  @Unique
  @Column(DataType.STRING)
  md5: string;

  @Column(DataType.STRING)
  filename: string;

  @Column(DataType.INTEGER)
  referenceId: number;

  @Column(DataType.STRING)
  referenceText: string;

  @Min(0)
  @Column(DataType.INTEGER)
  duration: number;

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
  get src(): string {
    return `enjoy://${path.join(
      "library",
      "recordings",
      this.getDataValue("filename")
    )}`;
  }

  get filePath(): string {
    return path.join(
      settings.userDataPath(),
      "recordings",
      this.getDataValue("filename")
    );
  }

  async upload(force: boolean = false) {
    if (this.isUploaded && !force) {
      return;
    }

    return storage
      .put(this.md5, this.filePath)
      .then((result) => {
        log.debug("[RECORDING]", "upload result:", result.data);
        if (result.data.success) {
          this.update({ uploadedAt: new Date() });
        } else {
          throw new Error(result.data);
        }
      })
      .catch((err) => {
        log.error("[RECORDING]", "upload failed:", err.message);
        throw err;
      });
  }

  async sync() {
    if (!this.uploadedAt) {
      await this.upload();
    }

    return webApi.syncRecording(this.toJSON()).then(() => {
      this.update({ syncedAt: new Date() });
    });
  }

  async assess() {
    const assessment = await PronunciationAssessment.findOne({
      where: { targetId: this.id, targetType: "Recording" },
    });

    if (assessment) {
      return assessment;
    }

    const { token, region } = await webApi.generateSpeechToken();
    const sdk = new AzureSpeechSdk(token, region);

    const result = await sdk.pronunciationAssessment({
      filePath: this.filePath,
      reference: this.referenceText,
    });

    const _pronunciationAssessment = await PronunciationAssessment.create(
      {
        targetId: this.id,
        targetType: "Recording",
        pronunciationScore: result.pronunciationScore,
        accuracyScore: result.accuracyScore,
        completenessScore: result.completenessScore,
        fluencyScore: result.fluencyScore,
        prosodyScore: result.prosodyScore,
        grammarScore: result.contentAssessmentResult?.grammarScore,
        vocabularyScore: result.contentAssessmentResult?.vocabularyScore,
        topicScore: result.contentAssessmentResult?.topicScore,
        result: camelcaseKeys(JSON.parse(JSON.stringify(result.detailResult)), {
          deep: true,
        }),
      },
      {
        include: Recording,
      }
    );
    return _pronunciationAssessment.toJSON();
  }

  @AfterFind
  static async findTarget(findResult: Recording | Recording[]) {
    if (!Array.isArray(findResult)) findResult = [findResult];

    for (const instance of findResult) {
      if (instance.targetType === "Audio" && instance.audio !== undefined) {
        instance.target = instance.audio.toJSON();
      }
      if (instance.targetType === "Video" && instance.video !== undefined) {
        instance.target = instance.video.toJSON();
      }
      // To prevent mistakes:
      delete instance.audio;
      delete instance.dataValues.audio;
      delete instance.video;
      delete instance.dataValues.video;
    }
  }

  @AfterCreate
  static autoSync(recording: Recording) {
    // auto upload should not block the main thread
    recording.sync().catch(() => {});
  }

  @AfterCreate
  static increaseResourceCache(recording: Recording) {
    if (recording.targetType !== "Audio") return;

    Audio.findByPk(recording.targetId).then((audio) => {
      audio.increment("recordingsCount");
      audio.increment("recordingsDuration", {
        by: recording.duration,
      });
    });
  }

  @AfterCreate
  static notifyForCreate(recording: Recording) {
    this.notify(recording, "create");
  }

  @AfterUpdate
  static notifyForUpdate(recording: Recording) {
    this.notify(recording, "update");
  }

  @AfterDestroy
  static notifyForDestroy(recording: Recording) {
    this.notify(recording, "destroy");
  }

  @AfterDestroy
  static decreaseResourceCache(recording: Recording) {
    if (recording.targetType === "Audio") {
      Audio.findByPk(recording.targetId).then((audio) => {
        audio.decrement("recordingsCount");
        audio.decrement("recordingsDuration", {
          by: recording.duration,
        });
      });
    }
  }

  @AfterDestroy
  static cleanupFile(recording: Recording) {
    fs.remove(recording.filePath);
  }

  static async createFromBlob(
    blob: {
      type: string;
      arrayBuffer: ArrayBuffer;
    },
    params: {
      targetId: string;
      targetType: "Audio" | "Video";
      duration: number;
      referenceId?: number;
      referenceText?: string;
    }
  ) {
    const { targetId, targetType, referenceId, referenceText, duration } =
      params;

    const format = blob.type.split("/")[1];
    const tempfile = path.join(settings.cachePath(), `${Date.now()}.${format}`);
    await fs.outputFile(tempfile, Buffer.from(blob.arrayBuffer));
    const wavFile = path.join(
      settings.userDataPath(),
      "recordings",
      `${Date.now()}.wav`
    );

    const ffmpeg = new Ffmpeg();
    await ffmpeg.convertToWav(tempfile, wavFile);

    const md5 = await hashFile(wavFile, { algo: "md5" });
    const filename = `${md5}.wav`;
    fs.renameSync(wavFile, path.join(path.dirname(wavFile), filename));

    return this.create(
      {
        targetId,
        targetType,
        filename,
        duration,
        md5,
        referenceId,
        referenceText,
      },
      {
        include: [Audio],
      }
    );
  }

  static notify(recording: Recording, action: "create" | "update" | "destroy") {
    if (!mainWindow.win) return;

    mainWindow.win.webContents.send("db-on-transaction", {
      model: "Recording",
      id: recording.id,
      action: action,
      record: recording.toJSON(),
    });
  }
}
