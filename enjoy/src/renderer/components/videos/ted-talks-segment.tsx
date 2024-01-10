import { useState, useEffect, useContext } from "react";
import { AppSettingsProviderContext } from "@renderer/context";
import {
  Button,
  ScrollArea,
  ScrollBar,
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from "@renderer/components/ui";
import { LoaderSpin } from "@renderer/components";
import { t } from "i18next";
import { useNavigate } from "react-router-dom";
import { LoaderIcon } from "lucide-react";
import { secondsToTimestamp } from "@renderer/lib/utils";

export const TedTalksSegment = () => {
  const navigate = useNavigate();
  const { EnjoyApp } = useContext(AppSettingsProviderContext);
  const [talks, setTalks] = useState<TedTalkType[]>([]);
  const [selectedTalk, setSelectedTalk] = useState<TedTalkType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<{
    audio: string;
    video: string;
  }>();

  const addToLibrary = (type: "audio" | "video") => {
    if (!downloadUrl) return;
    if (!selectedTalk) return;

    let url = downloadUrl.audio;
    if (type === "video") url = downloadUrl.video;
    setSubmitting(true);

    EnjoyApp.videos
      .create(url, {
        name: selectedTalk?.title,
        coverUrl: selectedTalk?.primaryImageSet[0].url,
      })
      .then((record) => {
        if (type === "video") {
          navigate(`/videos/${record.id}`);
        } else {
          navigate(`/audios/${record.id}`);
        }
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const downloadTalk = () => {
    if (!selectedTalk?.canonicalUrl) return;

    setDownloadUrl(null);
    EnjoyApp.providers.ted
      .downloadTalk(selectedTalk?.canonicalUrl)
      .then((downloadUrl) => {
        if (!downloadUrl) return;
        setDownloadUrl(downloadUrl);
      });
  };

  const fetchTalks = async () => {
    const cachedTalks = await EnjoyApp.cacheObjects.get("ted-talks");
    if (cachedTalks) {
      setTalks(cachedTalks);
      return;
    }

    EnjoyApp.providers.ted
      .talks()
      .then((talks) => {
        if (!talks) return;

        EnjoyApp.cacheObjects.set("ted-talks", talks, 60 * 60);
        setTalks(talks);
      })
      .catch((err) => {
        console.error(err);
      });
  };

  useEffect(() => {
    fetchTalks();
  }, []);

  useEffect(() => {
    downloadTalk();
  }, [selectedTalk]);

  if (!talks?.length) return null;

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight capitalize">
            {t("from")} Ted Talks
          </h2>
        </div>
        <div className="ml-auto mr-4"></div>
      </div>

      <ScrollArea>
        <div className="flex items-center space-x-4 pb-4">
          {talks.map((talk) => {
            return (
              <TedTalkCard
                key={talk.title}
                talk={talk}
                onClick={() => setSelectedTalk(talk)}
              />
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <Dialog
        open={Boolean(selectedTalk)}
        onOpenChange={(value) => {
          if (!value) setSelectedTalk(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedTalk?.title}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center mb-4 bg-muted rounded-lg">
            <div className="aspect-square h-28 overflow-hidden rounded-l-lg">
              <img
                src={selectedTalk?.primaryImageSet[0].url}
                alt={selectedTalk?.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 py-3 px-4 h-28">
              <div className="text-lg font-semibold line-clamp-1">
                {selectedTalk?.title}
              </div>
              <div className="text-xs line-clamp-1 mb-2 text-right">
                {secondsToTimestamp(parseInt(selectedTalk?.duration || "0"))}
              </div>
              <div className="text-xs text-muted-foreground text-right">
                {t("presenter")}: {selectedTalk?.presenterDisplayName}
              </div>
            </div>
          </div>

          {downloadUrl ? (
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() =>
                  EnjoyApp.shell.openExternal(selectedTalk?.canonicalUrl)
                }
                className="mr-auto"
              >
                {t("open")}
              </Button>

              <Button onClick={() => setSelectedTalk(null)} variant="secondary">
                {t("cancel")}
              </Button>
              {downloadUrl.audio && (
                <Button
                  onClick={() => addToLibrary("audio")}
                  disabled={submitting}
                >
                  {submitting && (
                    <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
                  )}
                  {t("downloadAudio")}
                </Button>
              )}
              {downloadUrl.video && (
                <Button
                  onClick={() => addToLibrary("video")}
                  disabled={submitting}
                >
                  {submitting && (
                    <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
                  )}
                  {t("downloadVideo")}
                </Button>
              )}
            </DialogFooter>
          ) : (
            <LoaderSpin />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const TedTalkCard = (props: { talk: TedTalkType; onClick?: () => void }) => {
  const { talk, onClick } = props;

  return (
    <div onClick={onClick} className="w-56 cursor-pointer">
      <div className="aspect-[4/3] border rounded-lg overflow-hidden relative">
        <img
          src={talk.primaryImageSet[0].url}
          alt={talk.title}
          className="hover:scale-105 object-cover w-full h-full"
        />

        <div className="absolute bottom-0 left-0 right-0 p-2 bg-black bg-opacity-50">
          <div className="text-xs text-white text-right">
            {secondsToTimestamp(parseInt(talk.duration))}
          </div>
        </div>
      </div>
      <div className="text-sm font-semibold mt-2 max-w-full line-clamp-1 h-5">
        {talk.title}
      </div>
      <div className="text-xs font-muted-foreground max-w-full line-clamp-1 h-4">
        {talk.presenterDisplayName}
      </div>
    </div>
  );
};
