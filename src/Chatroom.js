// @flow
import "@babel/polyfill";
import React, { Component, Fragment } from "react";
import ReactDOM from "react-dom";
import isEqual from "lodash.isequal";
import classnames from "classnames";

// $FlowFixMe
import "./Chatroom.scss";

import { uuidv4 } from "./utils";
import Message, { MessageTime } from "./Message";
import SpeechInput from "./SpeechInput";

const REDRAW_INTERVAL = 10000;
const GROUP_INTERVAL = 60000;

export type MessageType =
  | {
      type: "text",
      text: string
    }
  | { type: "image", image: string }
  | {
      type: "button",
      buttons: Array<{ payload: string, title: string, selected?: boolean }>
    }
  | {
      type: "custom",
      content: any
    };

export type ChatMessage = {
  message: MessageType,
  username: string,
  time: number,
  uuid: string,
  voiceLang?: string
};

const WaitingBubble = () => (
  <li className="chat waiting">
    <span>●</span> <span>●</span> <span>●</span>
  </li>
);

const MessageGroup = ({ messages, onButtonClick, voiceLang }) => {
  const isBot = messages[0].username === "bot";
  const isButtonGroup =
    messages.length === 1 && messages[0].message.type === "button";
  return (
    <Fragment>
      {messages.map((message, i) => (
        <Message
          chat={message}
          key={i}
          onButtonClick={onButtonClick}
          voiceLang={voiceLang}
        />
      ))}
      {!isButtonGroup ? (
        <MessageTime time={messages[messages.length - 1].time} isBot={isBot} />
      ) : null}
    </Fragment>
  );
};

type ChatroomProps = {
  messages: Array<ChatMessage>,
  title: string,
  isOpen: boolean,
  waitingForBotResponse: boolean,
  speechRecognition: ?string,
  onButtonClick: (message: string, payload: string) => *,
  onSendMessage: (message: string) => *,
  onToggleChat: () => *,
  voiceLang: ?string
};

type ChatroomState = {
  inputValue: string
};

export default class Chatroom extends Component<ChatroomProps, ChatroomState> {
  state = {
    inputValue: ""
  };
  lastRendered: number = 0;
  chatsRef = React.createRef<HTMLDivElement>();
  inputRef = React.createRef<HTMLInputElement>();

  componentDidMount() {
    this.scrollToBot();
  }

  componentDidUpdate(prevProps: ChatroomProps) {
    if (!isEqual(prevProps.messages, this.props.messages)) {
      this.scrollToBot();
    }
    if (!prevProps.isOpen && this.props.isOpen) {
      this.focusInput();
    }
    this.lastRendered = Date.now();
  }

  shouldComponentUpdate(nextProps: ChatroomProps, nextState: ChatroomState) {
    return (
      !isEqual(nextProps, this.props) ||
      !isEqual(nextState, this.state) ||
      Date.now() > this.lastRendered + REDRAW_INTERVAL
    );
  }

  getInputRef(): HTMLInputElement {
    const { inputRef } = this;
    if (inputRef.current == null) throw new TypeError("inputRef is null.");
    return ((inputRef.current: any): HTMLInputElement);
  }

  getChatsRef(): HTMLElement {
    const { chatsRef } = this;
    if (chatsRef.current == null) throw new TypeError("chatsRef is null.");
    return ((chatsRef.current: any): HTMLElement);
  }

  scrollToBot() {
    this.getChatsRef().scrollTop = this.getChatsRef().scrollHeight;
  }

  focusInput() {
    this.getInputRef().focus();
  }

  handleSubmitMessage = async (e?: SyntheticEvent<>) => {
    if (e != null) {
      e.preventDefault();
    }
    const message = this.getInputRef().value.trim();
    this.props.onSendMessage(message);
    this.setState({ inputValue: "" });

    // Добавлено: отправка сообщения на сервер и получение ответа
    try {
      const response = await fetch('http://localhost:5000/send_message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });

      const data = await response.json();

      // Добавление сообщения бота в чат
      this.props.messages.push({
        message: { type: 'text', text: data.response },
        username: 'bot',
        time: Date.now(),
        uuid: uuidv4()
      });
      this.forceUpdate(); // Принудительное обновление компонента для отображения нового сообщения
    } catch (error) {
      console.error('Error:', error);
    }
  };

  handleInputChange = async (
    inputValue: string,
    scrollToEnd: boolean = false
  ) => {
    await this.setState({
      inputValue
    });
    if (scrollToEnd) {
      const inputRef = this.getInputRef();
      inputRef.focus();
      inputRef.scrollLeft = inputRef.scrollWidth;
    }
  };

  render() {
    const { messages, isOpen, waitingForBotResponse, voiceLang } = this.props;
    const messageGroups = this.groupMessages(messages);
    const isClickable = i =>
      !waitingForBotResponse && i == messageGroups.length - 1;

    return (
      <div className={classnames("chatroom", isOpen ? "open" : "closed")}>
        <h3 onClick={this.props.onToggleChat}>{this.props.title}</h3>
        <div className="chats" ref={this.chatsRef}>
          {messageGroups.map((group, i) => (
            <MessageGroup
              messages={group}
              key={i}
              onButtonClick={
                isClickable(i) ? this.handleButtonClick : undefined
              }
              voiceLang={voiceLang}
            />
          ))}
          {waitingForBotResponse ? <WaitingBubble /> : null}
        </div>
        <form className="input" onSubmit={this.handleSubmitMessage}>
          <input
            type="text"
            value={this.state.inputValue}
            onChange={event =>
              this.handleInputChange(event.currentTarget.value)
            }
            ref={this.inputRef}
          />
          <input type="submit" value="Submit" />
          {this.props.speechRecognition != null ? (
            <SpeechInput
              language={this.props.speechRecognition}
              onSpeechInput={message => this.handleInputChange(message, true)}
              onSpeechEnd={this.handleSubmitMessage}
            />
          ) : null}
        </form>
      </div>
    );
  }
}
    );
  }
}
