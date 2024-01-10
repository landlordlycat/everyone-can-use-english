import { ipcMain, IpcMainEvent } from "electron";
import { Message, Speech, Conversation } from "@main/db/models";
import { FindOptions, WhereOptions, Attributes } from "sequelize";
import log from "electron-log/main";
import { t } from "i18next";

class MessagesHandler {
  private async findAll(
    event: IpcMainEvent,
    options: FindOptions<Attributes<Message>>
  ) {
    return Message.findAll({
      include: [
        {
          association: "speeches",
          model: Speech,
          where: { sourceType: "Message" },
          required: false,
        }
      ],
      order: [["createdAt", "DESC"]],
      ...options,
    })
      .then((messages) => {
        if (!messages) {
          return [];
        }
        return messages.map((message) => message.toJSON());
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
    where: WhereOptions<Attributes<Message>>
  ) {
    return Message.findOne({
      include: [
        Conversation,
        {
          association: "speeches",
          model: Speech,
          where: { sourceType: "Message" },
        },
      ],
      where: {
        ...where,
      },
    })
      .then((message) => {
        return message?.toJSON();
      })
      .catch((err) => {
        log.error(err);
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  private async create(event: IpcMainEvent, params: Message) {
    const { conversationId, role, content } = params;

    return Message.create({ conversationId, role, content })
      .then((message) => {
        return message.toJSON();
      })
      .catch((err) => {
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  private async update(
    event: IpcMainEvent,
    id: string,
    params: Attributes<Message>
  ) {
    const { content } = params;

    return Message.findOne({
      where: { id },
    })
      .then((message) => {
        if (!message) {
          throw new Error(t("models.message.notFound"));
        }
        message.update({ content });
      })
      .catch((err) => {
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  private async destroy(event: IpcMainEvent, id: string) {
    return Message.findOne({
      where: { id },
    })
      .then((message) => {
        if (!message) {
          throw new Error(t("models.message.notFound"));
        }
        message.destroy();
      })
      .catch((err) => {
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  private async createSpeech(
    event: IpcMainEvent,
    id: string,
    configuration?: { [key: string]: any }
  ) {
    const message = await Message.findOne({
      where: { id },
    });
    if (!message) {
      throw new Error(t("models.message.notFound"));
    }

    return message
      .createSpeech(configuration)
      .then((speech) => {
        return speech.toJSON();
      })
      .catch((err) => {
        event.sender.send("on-notification", {
          type: "error",
          message: err.message,
        });
      });
  }

  register() {
    ipcMain.handle("messages-find-all", this.findAll);
    ipcMain.handle("messages-find-one", this.findOne);
    ipcMain.handle("messages-create", this.create);
    ipcMain.handle("messages-update", this.update);
    ipcMain.handle("messages-destroy", this.destroy);
    ipcMain.handle("messages-create-speech", this.createSpeech);
  }
}

export const messagesHandler = new MessagesHandler();
