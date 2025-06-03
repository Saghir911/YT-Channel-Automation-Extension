console.log('Background Working')

chrome.runtime.onMessage.addListener(
    (message: { action: string; UserValue?: string }, sender, sendResponse) => {
      if (["Comment", "Like", "Subscribe", "Do All"].includes(message.action)) {
        chrome.tabs.create({ url: "https://www.youtube.com", active: true }, (tab) => {
          if (!tab.id) {
            sendResponse({ status: "Error", error: "Failed to create tab" });
            return;
          }
  
          delay(3000).then(() => {
            chrome.tabs.sendMessage(
              tab.id as number,
              { action: message.action, UserValue: message.UserValue },
              (response) => {
                if (chrome.runtime.lastError) {
                  sendResponse({ status: "Error", error: chrome.runtime.lastError.message });
                  return;
                }
  
                if (response && response.status === "Automation Completed!") {
                  chrome.tabs.remove(tab.id as number, () => {
                    sendResponse({ status: "Automation Completed!" });
                  });
                } else {
                  sendResponse({ status: "Error", error: response?.error || "Unknown error" });
                }
              }
            );
          });
        });
  
        return true; // Keeps sendResponse valid for asynchronous use
      }
    }
  );
  
//   function delay(ms: number): Promise<void> {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }
  