type EnjoyAppType = {
  app: {
    reset: () => Promise<void>;
    relaunch: () => Promise<void>;
    reload: () => Promise<void>;
    isPackaged: () => Promise<boolean>;
    apiUrl: () => Promise<string>;
    version: string;
  };
  providers: {
    audible: {
      bestsellers: (params?: {
        page?: number;
        category?: number;
        pageSize?: number;
      }) => Promise<{
        books: AudibleBookType[];
        page: number;
        nextPage: number | undefined;
      }>;
    };
    ted: {
      talks: () => Promise<TedTalkType[]>;
      ideas: () => Promise<TedIdeaType[]>;
      downloadTalk: (url: string) => Promise<{ audio: string; video: string }>;
    };
  };
  view: {
    load: (url: string, bounds?: object) => Promise<void>;
    show: (bounds: object) => Promise<void>;
    hide: () => Promise<void>;
    remove: () => Promise<void>;
    scrape: (url: string) => Promise<void>;
    onViewState: (
      callback: (
        event,
        state: { state: string; error?: string; url?: string; html?: string }
      ) => void
    ) => void;
    removeViewStateListeners: () => void;
  };
  onNotification: (
    callback: (event, notification: NotificationType) => void
  ) => void;
  shell: {
    openExternal: (url: string) => Promise<void>;
    openPath: (path: string) => Promise<void>;
  };
  dialog: {
    showOpenDialog: (
      options: Electron.OpenDialogOptions
    ) => Promise<string[] | undefined>;
    showSaveDialog: (
      options: Electron.SaveDialogOptions
    ) => Promise<Electron.SaveDialogReturnValue>;
    showMessageBox: (
      options: Electron.MessageBoxOptions
    ) => Promise<Electron.MessageBoxReturnValue>;
    showErrorBox: (title: string, content: string) => Promise<void>;
  };
  settings: {
    getLibrary: () => Promise<string>;
    setLibrary: (library: string) => Promise<void>;
    getUser: () => Promise<UserType>;
    setUser: (user: UserType) => Promise<void>;
    getWhisperModel: () => Promise<string>;
    setWhisperModel: (model: string) => Promise<void>;
    getWhisperModelsPath: () => Promise<string>;
    getUserDataPath: () => Promise<string>;
    getLlm: (provider: SupportedLlmProviderType) => Promise<LlmProviderType>;
    setLlm: (
      provider: SupportedLlmProviderType,
      LlmProviderType
    ) => Promise<void>;
    getFfmpegConfig: () => Promise<FfmpegConfigType>;
    setFfmpegConfig: () => Promise<void>;
  };
  fs: {
    ensureDir: (path: string) => Promise<boolean>;
  };
  path: {
    join: (...paths: string[]) => Promise<string>;
  };
  db: {
    init: () => Promise<DbState>;
    onTransaction: (
      callback: (event, state: TransactionStateType) => void
    ) => Promise<void>;
    removeListeners: () => Promise<void>;
  };
  audios: {
    findAll: (params: object) => Promise<AudioType[]>;
    findOne: (params: object) => Promise<AudioType>;
    create: (source: string, params?: object) => Promise<AudioType>;
    update: (id: string, params: object) => Promise<AudioType | undefined>;
    destroy: (id: string) => Promise<undefined>;
    transcribe: (id: string) => Promise<void>;
    upload: (id: string) => Promise<void>;
  };
  videos: {
    findAll: (params: object) => Promise<VideoType[]>;
    findOne: (params: object) => Promise<VideoType>;
    create: (source: string, params?: object) => Promise<VideoType>;
    update: (id: string, params: object) => Promise<VideoType | undefined>;
    destroy: (id: string) => Promise<undefined>;
    transcribe: (id: string) => Promise<void>;
    upload: (id: string) => Promise<void>;
  };
  recordings: {
    findAll: (where: object) => Promise<RecordingType[]>;
    findOne: (where: object) => Promise<RecordingType>;
    create: (params: object) => Promise<RecordingType>;
    update: (id: string, params: object) => Promise<RecordingType | undefined>;
    destroy: (id: string) => Promise<void>;
    upload: (id: string) => Promise<void>;
    assess: (id: string) => Promise<void>;
    stats: (params: { from: string; to: string }) => Promise<{
      count: number;
      duration: number;
    }>;
    groupByDate: (params: { from: string; to: string }) => Promise<
      {
        date: string;
        count: number;
        level?: number;
      }[]
    >;
    groupByTarget: (params: { from: string; to: string }) => Promise<
      {
        date: string;
        targetId: string;
        targetType: string;
        count: number;
        duration: number;
        target: AudioType | VideoType;
      }[]
    >;
    groupBySegment: (
      targetId: string,
      targetType
    ) => Promise<SegementRecordingStatsType>;
  };
  conversations: {
    findAll: (params: object) => Promise<ConversationType[]>;
    findOne: (params: object) => Promise<ConversationType>;
    create: (params: object) => Promise<ConversationType>;
    update: (id: string, params: object) => Promise<ConversationType>;
    destroy: (id: string) => Promise<void>;
    ask: (
      id: string,
      params: {
        messageId?: string;
        content?: string;
        file?: string;
        blob?: {
          type: string;
          arrayBuffer: ArrayBuffer;
        };
      }
    ) => Promise<MessageType>;
  };
  messages: {
    findAll: (params: object) => Promise<MessageType[]>;
    findOne: (params: object) => Promise<MessageType>;
    destroy: (id: string) => Promise<void>;
    createSpeech: (id: string, configuration?: any) => Promise<SpeechType>;
  };
  whisper: {
    availableModels: () => Promise<string[]>;
    downloadModel: (name: string) => Promise<any>;
    transcribe: (
      blob: { type: string; arrayBuffer: ArrayBuffer },
      prompt?: string
    ) => Promise<{ file: string; content: string }>;
  };
  ffmpeg: {
    download: () => Promise<FfmpegConfigType>;
  };
  download: {
    onState: (callback: (event, state) => void) => void;
    cancel: (filename: string) => void;
    cancelAll: () => void;
    dashboard: () => Promise<DownloadStateType[]>;
    removeAllListeners: () => void;
  };
  webApi: {
    auth: (params: { provider: string; code: string }) => Promise<UserType>;
    me: () => Promise<UserType>;
    lookup: (params: {
      word: string;
      context?: string;
      sourceId?: string;
      sourceType?: string;
    }) => Promise<LookupType>;
    lookupInBatch: (
      params: {
        word: string;
        context?: string;
        sourceId?: string;
        sourceType?: string;
      }[]
    ) => Promise<{ successCount: number; errors: string[]; total: number }>;
    mineMeanings: (params?: {
      page?: number;
      items?: number;
      sourceId?: string;
      sourceType?: string;
    }) => Promise<
      {
        meanings: MeaningType[];
      } & PagyResponseType
    >;
    createStory: (params: {
      title: string;
      content: string;
      url: string;
      metadata: {
        [key: string]: any;
      };
    }) => Promise<StoryType>;
    extractVocabularyFromStory: (id: string) => Promise<string[]>;
    story: (id: string) => Promise<StoryType>;
    stories: (params?: { page: number }) => Promise<{
      stories: StoryType[];
      page: number;
      next: number | null;
    }>;
    mineStories: (params?: { page: number }) => Promise<{
      stories: StoryType[];
      page: number;
      next: number | null;
    }>;
    storyMeanings: (
      storyId: string,
      params?: {
        page?: number;
        items?: number;
        sourceId?: string;
        sourceType?: string;
      }
    ) => Promise<
      {
        meanings: MeaningType[];
        pendingLookups: LookupType[];
      } & PagyResponseType
    >;
    starStory: (id: string) => Promise<{ starred: boolean }>;
    unstarStory: (id: string) => Promise<{ starred: boolean }>;
  };
  cacheObjects: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any, ttl?: number) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  transcriptions: {
    findOrCreate: (params: any) => Promise<TranscriptionType>;
    process: (params: any) => Promise<void>;
    update: (id: string, params: any) => Promise<void>;
  };
};
