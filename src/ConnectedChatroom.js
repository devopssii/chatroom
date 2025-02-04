// @flow
import React, { Component } from "react";
import type { ElementRef } from "react";

import type { ChatMessage, MessageType } from "./Chatroom";
import Chatroom from "./Chatroom";
import { sleep, uuidv4 } from "./utils";

type ConnectedChatroomProps = {
  userId: string,
  host: string,
  welcomeMessage: ?string,
  title: string,
  waitingTimeout: number,
  speechRecognition: ?string,
  messageBlacklist: Array<string>,
  fetchOptions?: RequestOptions,
  voiceLang: ?string
};
type ConnectedChatroomState = {
  messages: Array<ChatMessage>,
  messageQueue: Array<ChatMessage>,
  isOpen: boolean,
  waitingForBotResponse: boolean
};

type RasaMessage =
  | {| sender_id: string, text: string |}
  | {|
      sender_id: string,
      buttons: Array<{ title: string, payload: string, selected?: boolean }>,
      text?: string
    |}
  | {| sender_id: string, image: string, text?: string |}
  | {| sender_id: string, attachment: string, text?: string |};

export default class ConnectedChatroom extends Component<
  ConnectedChatroomProps,
  ConnectedChatroomState
> {
  state = {
    messages: [],
    messageQueue: [],
    isOpen: false,
    waitingForBotResponse: false
  };

  static defaultProps = {
    waitingTimeout: 5000,
    messageBlacklist: ["_restart", "_start", "/restart", "/start"]
  };

  waitingForBotResponseTimer: ?TimeoutID = null;
  messageQueueInterval: ?IntervalID = null;
  chatroomRef = React.createRef<Chatroom>();

  componentDidMount() {
    const messageDelay = 800; //delay between message in ms
    this.messageQueueInterval = window.setInterval(
      this.queuedMessagesInterval,
      messageDelay
    );

    if (this.props.welcomeMessage) {
      const welcomeMessage = {
        message: { type: "text", text: this.props.welcomeMessage },
        time: Date.now(),
        username: "bot",
        uuid: uuidv4()
      };
      this.setState({ messages: [welcomeMessage] });
    }
  }

  componentWillUnmount() {
    if (this.waitingForBotResponseTimer != null) {
      window.clearTimeout(this.waitingForBotResponseTimer);
      this.waitingForBotResponseTimer = null;
    }
    if (this.messageQueueInterval != null) {
      window.clearInterval(this.messageQueueInterval);
      this.messageQueueInterval = null;
    }
  }

 // ...

async callMyAPI(message) {
   // Определяем конечную точку вашего API. Замените эту строку на URL вашего API.
   const API_ENDPOINT = 'https://api.synlabs.pro/send_message';

   try {
     // Выполняем POST-запрос к вашему API.
     const response = await fetch(API_ENDPOINT, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({ message: message })
     });

     // Проверяем, был ли успешным ответ от сервера.
     if (!response.ok) {
       throw new Error(`API call failed with status ${response.status}`);
     }

     // Преобразуем ответ в JSON.
     const jsonResponse = await response.json();

     // Проверяем наличие поля "response" в ответе от сервера.
     if (!jsonResponse.hasOwnProperty('response')) {
       throw new Error("API response does not contain 'response' field.");
     }

     // Возвращаем сообщение от вашего API.
     return jsonResponse.response;

   } catch (error) {
     console.error('Error calling API', error);
     return "Извините, произошла ошибка. Пожалуйста, попробуйте позже."; // Стандартное сообщение об ошибке
   }
 }

sendMessage = async (messageText: string) => {
    if (messageText === "") return;

    const messageObj = {
        message: { type: "text", text: messageText },
        time: Date.now(),
        username: this.props.userId,
        uuid: uuidv4()
    };

    if (!this.props.messageBlacklist.includes(messageText)) {
        this.setState({
            messages: [
                ...this.state.messages,
                ...this.state.messageQueue,
                messageObj
            ],
            messageQueue: []
        });
    }

    this.setState({ waitingForBotResponse: true });
    if (this.waitingForBotResponseTimer != null) {
        window.clearTimeout(this.waitingForBotResponseTimer);
    }
    this.waitingForBotResponseTimer = setTimeout(() => {
        this.setState({ waitingForBotResponse: false });
    }, this.props.waitingTimeout);

    // Используем функцию callMyAPI для отправки сообщения
    const apiResponseMessage = await this.callMyAPI(messageText);

    if (apiResponseMessage) {
        this.parseMessages([{
            text: apiResponseMessage,
            sender_id: 'bot'
        }]);
    }

    if (window.ga != null) {
        window.ga("send", "event", "chat", "chat-message-sent");
    }
};


// ...


  createNewBotMessage(botMessageObj: MessageType): ChatMessage {
    return {
      message: botMessageObj,
      time: Date.now(),
      username: "bot",
      uuid: uuidv4()
    };
  }

  async parseMessages(RasaMessages: Array<RasaMessage>) {
    const validMessageTypes = ["text", "image", "buttons", "attachment"];

    let expandedMessages = [];

    RasaMessages.filter((message: RasaMessage) =>
      validMessageTypes.some(type => type in message)
    ).forEach((message: RasaMessage) => {
      let validMessage = false;
      if (message.text) {
        validMessage = true;
        expandedMessages.push(
          this.createNewBotMessage({ type: "text", text: message.text })
        );
      }

      if (message.buttons) {
        validMessage = true;
        expandedMessages.push(
          this.createNewBotMessage({ type: "button", buttons: message.buttons })
        );
      }

      if (message.image) {
        validMessage = true;
        expandedMessages.push(
          this.createNewBotMessage({ type: "image", image: message.image })
        );
      }

      // probably should be handled with special UI elements
      if (message.attachment) {
        validMessage = true;
        expandedMessages.push(
          this.createNewBotMessage({ type: "text", text: message.attachment })
        );
      }

      if (validMessage === false)
        throw Error("Could not parse message from Bot or empty message");
    });

    // Bot messages should be displayed in a queued manner. Not all at once
    const messageQueue = [...this.state.messageQueue, ...expandedMessages];
    this.setState({
      messageQueue,
      waitingForBotResponse: messageQueue.length > 0
    });
  }

  queuedMessagesInterval = () => {
    const { messages, messageQueue } = this.state;

    if (messageQueue.length > 0) {
      const message = messageQueue.shift();
      const waitingForBotResponse = messageQueue.length > 0;

      this.setState({
        messages: [...messages, message],
        messageQueue,
        waitingForBotResponse
      });
    }
  };

  handleButtonClick = (buttonTitle: string, payload: string) => {
    this.sendMessage(payload);
    if (window.ga != null) {
      window.ga("send", "event", "chat", "chat-button-click");
    }
  };

  handleToggleChat = () => {
    if (window.ga != null) {
      if (this.state.isOpen) {
        window.ga("send", "event", "chat", "chat-close");
      } else {
        window.ga("send", "event", "chat", "chat-open");
      }
    }
    this.setState({ isOpen: !this.state.isOpen });
  };

  render() {
    const { messages, waitingForBotResponse } = this.state;

    const renderableMessages = messages
      .filter(
        message =>
          message.message.type !== "text" ||
          !this.props.messageBlacklist.includes(message.message.text)
      )
      .sort((a, b) => a.time - b.time);

    return (
      <Chatroom
        messages={renderableMessages}
        title={this.props.title}
        waitingForBotResponse={waitingForBotResponse}
        isOpen={this.state.isOpen}
        speechRecognition={this.props.speechRecognition}
        onToggleChat={this.handleToggleChat}
        onButtonClick={this.handleButtonClick}
        onSendMessage={this.sendMessage}
        ref={this.chatroomRef}
        voiceLang={this.props.voiceLang}
      />
    );
  }
}
