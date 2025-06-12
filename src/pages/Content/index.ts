

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "startVideoAutomation") {
    (async () => {
      try {
        await automateThisVideo(); // Wait for all automation (including comment)
        sendResponse({ status: "done" }); // Only respond after everything is done
      } catch (err: any) {
        console.error("[Content] Automation error:", err);
        sendResponse({ status: "error", error: err.message });
      }
    })();
    return true; // keep channel open for async sendResponse
  }
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Automates subscribe, like, scroll, and AI‐generated comment***/
async function automateThisVideo() {
  const sel = {
    subscribeBtn: "ytd-subscribe-button-renderer button",
    subscribeSpan: "ytd-subscribe-button-renderer button span",
    likeBtn: "button-view-model button",
    commentArea: "#placeholder-area",
    inputField: "#contenteditable-root",
    commentBtn: "yt-button-shape button",
  };

  // small delay for page elements
  await wait(5000);

  // Subscribe if needed
  console.log("[Content] Checking subscription status...");
  const subBtn = document.querySelector(sel.subscribeBtn) as HTMLElement;
  const subSpan = document.querySelector(sel.subscribeSpan) as HTMLElement;
  if (subBtn && subSpan && !/subscribed/i.test(subSpan.textContent || "")) {
    subBtn.click();
    console.log("→ Subscribed");
    await wait(3000);
  } else {
    console.log("Already subscribed or subscribe button not found.");
  }

  // Like if needed
  console.log("[Content] Checking like status...");
  const likeBtn = document.querySelector(sel.likeBtn) as HTMLElement;
  if (likeBtn && likeBtn.getAttribute("aria-pressed") !== "true") {
    likeBtn.click();
    console.log("→ Liked");
    await wait(3000);
  } else {
    console.log("Already liked or like button not found.");
  }

  // Scroll down to comments
  for (let i = 0; i < 3; i++) {
    window.scrollBy(0, 200);
    await wait(500);
  }

  // Fetch and submit AI comment
  const prompt = document.title.replace(" - YouTube", "").trim();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization:
          "Bearer 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",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: `Generate a natural comment (10–15 words) for: ${prompt}`,
          },
        ],
      }),
    });
    const json = await res.json();
    const comment = (json.choices?.[0]?.message?.content || "")
      .replace(/^"(.*)"$/, "$1")
      .trim();
    if (comment) {
      const area = document.querySelector(sel.commentArea) as HTMLElement;
      area?.click();
      await wait(500);
      const input = document.querySelector(sel.inputField) as HTMLElement;
      input.innerText = comment;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(500);
      const submit = Array.from(document.querySelectorAll(sel.commentBtn)).find(
        (el) => /comment/i.test(el.getAttribute("aria-label") || "")
      ) as HTMLElement;
      submit?.click();
      console.log("→ Commented:", comment);
      await wait(3000);
    }
  } catch (e) {
    console.error("[Content] Comment fetch failed:", e);
  }
}



if (/youtube\.com\/@[^/]+\/videos/.test(window.location.href)) {
  injectStopAutomationButton();
}

function injectStopAutomationButton() {
  const btn = document.createElement("button");
  btn.id = "yt-stop-automation-btn";
  btn.textContent = "Stop Automation";
  Object.assign(btn.style, {
    position: "fixed",
    top: "56px",
    right: "28px",
    zIndex: "9999",
    background: "#e53935",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    transition: "background 0.2s",
  });
  btn.onmouseenter = () => {
    btn.style.background = "#b71c1c";
    btn.style.animationPlayState = "paused";
  };
  btn.onmouseleave = () => {
    btn.style.background = "#e53935";
    btn.style.animationPlayState = "running";
  };

  // 2) Add the bounce‐keyframes style and a disabled state style
  const style = document.createElement("style");
  style.textContent = `
    @keyframes ytStopBtnBounce {
      0% { transform: translateY(0); }
      50% { transform: translateY(-12px); }
      100% { transform: translateY(0); }
    }
    #yt-stop-automation-btn {
      animation: ytStopBtnBounce 1.2s infinite ease-in-out;
      animation-play-state: running;
    }
    #yt-stop-automation-btn:hover {
      animation-play-state: paused;
    }
    #yt-stop-automation-btn.yt-stop-automation-btn-disabled {
      background: #888 !important;
      cursor: not-allowed !important;
      pointer-events: none !important;
      opacity: 0.6 !important;
      animation-play-state: paused !important;
    }
  `;

  // 3) When user clicks “Stop Automation,” send a message to background
  btn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopAutomation" }, (response) => {
      if (response?.status === "stopped") {
        btn.textContent = "Stopped";
        btn.disabled = true;
        btn.setAttribute("disabled", "disabled");
        btn.style.background = "#888";
        btn.style.cursor = "not-allowed";
        btn.style.pointerEvents = "none";
        btn.style.opacity = "0.6";
        btn.style.animationPlayState = "paused";
        btn.classList.add("yt-stop-automation-btn-disabled");
      }
    });
  });

  // 4) Wait for DOMContentLoaded before injecting <style> & <button>
  window.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(style);
    document.body.appendChild(btn);
  });
}
