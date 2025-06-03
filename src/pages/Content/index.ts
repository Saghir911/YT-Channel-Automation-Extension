console.log("Content script loaded");

chrome.runtime.onMessage.addListener(
  (message: { action: string; UserValue?: string }, sender, sendResponse) => {
    const { action, UserValue } = message;

    if (action) {
      automateActions(action, UserValue)
        .then(() => sendResponse({ status: "Automation Completed!" }))
        .catch((error) => sendResponse({ status: "Error", error: error.message }));
      return true; // Keeps sendResponse valid for async function
    }
  }
);

async function automateActions(action: string, commentValue?: string): Promise<void> {
  try {
    const firstVideo = document.querySelectorAll<HTMLElement>("#content ytd-thumbnail yt-image");
    firstVideo[1]?.click();
    await delay(5000);

    if (action === "Like") {
      await performLike();
    } else if (action === "Subscribe") {
      await performSubscribe();
    } else if (action === "Comment") {
      await performComment(commentValue || "");
    } else if (action === "Do All") {
      await performLike();
      await delay(2000);
      await performSubscribe();
      await delay(2000);
      await performComment(commentValue || "");
    }
  } catch (error) {
    console.error("Error in automateActions:", error);
    throw error;
  }
}

async function performLike(): Promise<void> {
  window.scrollBy({ top: 200, behavior: "smooth" });
  await delay(2500);
  const likeBtn = document.querySelector<HTMLButtonElement>("like-button-view-model button");
  if (likeBtn && likeBtn.title === "I like this") likeBtn.click();
  await delay(2500);
}

async function performSubscribe(): Promise<void> {
  window.scrollBy({ top: 200, behavior: "smooth" });
  await delay(2500);
  const subscribeBtn = document.querySelector<HTMLButtonElement>("ytd-subscribe-button-renderer button");
  if (subscribeBtn && subscribeBtn.textContent?.trim() === "Subscribe") subscribeBtn.click();
  await delay(2500);
}

async function performComment(userValue: string): Promise<void> {
  window.scrollBy({ top: 350, behavior: "smooth" });
  await delay(2500);
  const input = document.querySelector<HTMLElement>("#placeholder-area");
  if (input) {
    input.click();
    document.execCommand("insertText", false, userValue);
    document.querySelector<HTMLElement>("#submit-button yt-button-shape")?.click();
  }
  await delay(5000);
}

async function ReplyFeature(userValue: string): Promise<void> {
  const startButtons = document.querySelectorAll<HTMLButtonElement>("#reply-button-end button");
  const input = document.querySelector<HTMLElement>("yt-user-mention-autosuggest-input");

  document.querySelectorAll<HTMLButtonElement>("#like-button button")?.forEach((button) => button.click());

  if (startButtons.length >= 3 && input) {
    for (let i = 0; i < 3; i++) {
      startButtons[i].click();
      await delay(500);
      input.focus();
      document.execCommand("insertText", false, userValue);
      await delay(500);
    }
  }
  document.querySelectorAll<HTMLButtonElement>("#submit-button button")?.forEach((button) => button.click());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
let d = document.createElement('ul')
d.style.width = '500'
d.style.height = '500'
d.style.zIndex = '1'
d.style.backgroundColor = 'red'
document.body.appendChild(d)