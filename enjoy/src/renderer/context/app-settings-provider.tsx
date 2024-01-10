import { createContext, useEffect, useState } from "react";

type AppSettingsProviderState = {
  user: UserType | null;
  initialized: boolean;
  version?: string;
  libraryPath?: string;
  whisperModelsPath?: string;
  whisperModel?: string;
  login?: (user: UserType) => void;
  logout?: () => void;
  setLibraryPath?: (path: string) => Promise<void>;
  setWhisperModel?: (name: string) => void;
  ffmpegConfg?: FfmpegConfigType;
  setFfmegConfig?: (config: FfmpegConfigType) => void;
  EnjoyApp?: EnjoyAppType;
};

const initialState: AppSettingsProviderState = {
  user: null,
  initialized: false,
};

export const AppSettingsProviderContext =
  createContext<AppSettingsProviderState>(initialState);

export const AppSettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [initialized, setInitialized] = useState<boolean>(false);
  const [version, setVersion] = useState<string>("");
  const [user, setUser] = useState<UserType | null>(null);
  const [libraryPath, setLibraryPath] = useState("");
  const [whisperModelsPath, setWhisperModelsPath] = useState<string>("");
  const [whisperModel, setWhisperModel] = useState<string>(null);
  const [ffmpegConfg, setFfmegConfig] = useState<FfmpegConfigType>(null);
  const EnjoyApp = window.__ENJOY_APP__;

  useEffect(() => {
    fetchVersion();
    fetchUser();
    fetchLibraryPath();
    fetchModel();
    fetchFfmpegConfig();
  }, []);

  useEffect(() => {
    updatePaths();
  }, [libraryPath]);

  useEffect(() => {
    validate();
  }, [user, libraryPath, whisperModel, ffmpegConfg]);

  const fetchFfmpegConfig = async () => {
    const config = await EnjoyApp.settings.getFfmpegConfig();
    setFfmegConfig(config);
  };

  const fetchVersion = async () => {
    const version = EnjoyApp.app.version;
    setVersion(version);
  };

  const fetchUser = async () => {
    const currentUser = await EnjoyApp.settings.getUser();
    if (!currentUser) return;

    EnjoyApp.webApi.me().then((user) => {
      if (user?.id) {
        login(currentUser);
      } else {
        logout();
      }
    });
  };

  const login = (user: UserType) => {
    setUser(user);
    EnjoyApp.settings.setUser(user);
  };

  const logout = () => {
    setUser(null);
    EnjoyApp.settings.setUser(null);
  };

  const fetchLibraryPath = async () => {
    const dir = await EnjoyApp.settings.getLibrary();
    setLibraryPath(dir);
  };

  const setLibraryPathHandler = async (dir: string) => {
    await EnjoyApp.settings.setLibrary(dir);
    setLibraryPath(dir);
  };

  const updatePaths = async () => {
    const _path = await EnjoyApp.settings.getWhisperModelsPath();
    setWhisperModelsPath(_path);
  };

  const fetchModel = async () => {
    const whisperModel = await EnjoyApp.settings.getWhisperModel();
    setWhisperModel(whisperModel);
  };

  const setModelHandler = async (name: string) => {
    await EnjoyApp.settings.setWhisperModel(name);
    setWhisperModel(name);
  };

  const validate = async () => {
    setInitialized(
      !!(user && libraryPath && whisperModel && ffmpegConfg?.ready)
    );
  };

  return (
    <AppSettingsProviderContext.Provider
      value={{
        EnjoyApp,
        version,
        user,
        login,
        logout,
        libraryPath,
        setLibraryPath: setLibraryPathHandler,
        whisperModelsPath,
        whisperModel,
        setWhisperModel: setModelHandler,
        ffmpegConfg,
        setFfmegConfig,
        initialized,
      }}
    >
      {children}
    </AppSettingsProviderContext.Provider>
  );
};
