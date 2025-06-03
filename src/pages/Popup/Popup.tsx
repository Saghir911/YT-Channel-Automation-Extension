import React, { useEffect, useRef } from "react";
import './Popup.css'
const Popup: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageRef = useRef<HTMLLIElement | null>(null);

  const StartAutomation = (event: React.MouseEvent<HTMLButtonElement>) => {
    const buttonText = event.currentTarget.innerText;
    const commentValue = inputRef.current?.value.trim() || "";

    if ((buttonText === "Comment" || buttonText === "Do All") && !commentValue) {
      if (messageRef.current) messageRef.current.innerText = "Please enter a comment";
      return;
    }

    chrome.runtime.sendMessage(
      { action: buttonText, UserValue: commentValue },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError.message);
        } else {
          console.log("Message sent:", buttonText, commentValue);
        }
        if (inputRef.current) inputRef.current.value = "";
      }
    );
  };

  return (
    <div className="single">
      <input ref={inputRef} className="single_input" type="text" placeholder="Enter a Comment" />
      <button className="Comment" onClick={StartAutomation}>Comment</button>
      <button className="Like" onClick={StartAutomation}>Like</button>
      <button className="Subscribe" onClick={StartAutomation}>Subscribe</button>
      <button className="Do All" onClick={StartAutomation}>Do All</button>
      <li ref={messageRef} className="message"></li>
    </div>
  );
};

export default Popup;
