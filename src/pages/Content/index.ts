// =======================================
// YouTube Automation Content Script
// =======================================

// Log loader success
console.log("[Content Script] ✅ Content script loaded");

// Utility wait: resolves after X ms
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------
// 1. Scrolling & Fetching Video Links
// ---------------------------------------------------

/**
 * Scroll page incrementally until at least `minExpectedItems` are visible or timeout.
 * @param minExpectedItems - Minimum ytd-rich-item-renderer count to reach.
 * @param timeoutMs - Maximum wait time in ms (default 8000).
 * @returns true if loaded, false if timed out.
 */
async function scrollAndWaitForNewItems(
  minExpectedItems: number,
  timeoutMs = 8000
): Promise<boolean> {
  const start = Date.now();
  const pause = (ms: number) => new Promise(res => setTimeout(res, ms));

  while (Date.now() - start < timeoutMs) {
    window.scrollBy(0, window.innerHeight);
    await pause(500);

    const currentCount = document.querySelectorAll("ytd-rich-item-renderer").length;
    if (currentCount >= minExpectedItems) {
      return true;
    }
  }

  return false; // timed out
}

/**
 * Fetch exactly `noOfUrls` video URLs, scrolling as needed.
 * @param noOfUrls - Number of URLs desired.
 * @returns array of video hrefs.
 */
async function fetchNextVideoUrls(noOfUrls: number): Promise<string[]> {
  const urls: string[] = [];
  let lastFetchedIndex = 0;

  while (urls.length < noOfUrls) {
    const items = Array.from(
      document.querySelectorAll("ytd-rich-item-renderer")
    ) as HTMLElement[];

    // If we've consumed all loaded items, scroll for more
    if (lastFetchedIndex >= items.length) {
      const target = items.length + Math.ceil(noOfUrls / 2);
      const loaded = await scrollAndWaitForNewItems(target);
      if (!loaded) {
        console.warn("[fetchNextVideoUrls] timeout waiting for more videos.");
        break;
      }
      continue;
    }

    // Extract href from thumbnail anchor
    const item = items[lastFetchedIndex++];
    const anchor = item.querySelector("a#thumbnail") as HTMLAnchorElement | null;
    if (anchor?.href) {
      urls.push(anchor.href);
    }
  }

  return urls;
}

// ---------------------------------------------------
// 2. Message Listener for Popup Commands
// ---------------------------------------------------

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Quick ping to verify content script is injected
  if (request.action === "ping") {
    sendResponse({ status: "ready" });
    return; // synchronous response
  }

  // Async handling for other actions
  (async () => {
    try {
      switch (request.action) {
        // Fetch uploaded videos list
        case "FETCH_UPLOADED_VIDEOS":
          console.log("[Content] 📥 FETCH_UPLOADED_VIDEOS, count=", request.count);
          await wait(3000); // allow initial load
          const links = await fetchNextVideoUrls(request.count);
          console.log("[Content] ✅ Video links fetched:", links);
          sendResponse({ videoLinks: links });
          break;

        // Automate actions on current video page
        case "startVideoAutomation":
          console.log("[Content] 🤖 startVideoAutomation");
          await automateThisVideo();
          console.log("[Content] ✅ Automation complete");
          sendResponse({ status: "done" });
          break;

        default:
          // unknown action
          sendResponse({ status: "error", error: "Unknown action" });
      }
    } catch (err: any) {
      console.error("[Content] ❌ Error:", err);
      sendResponse({ status: "error", error: err.message });
    }
  })();

  return true; // keep messaging channel open
});

// ---------------------------------------------------
// 3. Video Automation Steps
// ---------------------------------------------------

/**
 * Performs subscription, like, and AI-generated comment on loaded video.
 */
async function automateThisVideo(): Promise<void> {
  // Selectors
  const selectors = {
    subscribeBtn: "ytd-subscribe-button-renderer button",
    subscribeSpan: "ytd-subscribe-button-renderer button span",
    likeBtn: "button-view-model button",
    commentArea: "#placeholder-area",
    inputField: "#contenteditable-root",
    commentBtn: "yt-button-shape button"
  };

  // Wait for page elements
  await wait(5000);

  // Subscribe if not already
  const subscribeBtn = document.querySelector(selectors.subscribeBtn) as HTMLElement;
  const subscribeSpan = document.querySelector(selectors.subscribeSpan) as HTMLElement;
  if (subscribeBtn && subscribeSpan && !/subscribed/i.test(subscribeSpan.textContent || "")) {
    subscribeBtn.click();
    await wait(3000);
  }

  // Like if not liked
  const likeBtn = document.querySelector(selectors.likeBtn) as HTMLElement;
  if (likeBtn && likeBtn.getAttribute("aria-pressed") !== "true") {
    likeBtn.click();
    await wait(3000);
  }

  // Scroll down to comments
  for (let i = 0; i < 3; i++) {
    window.scrollBy(0, 200);
    await wait(500);
  }

  // Generate AI comment via Groq API
  const videoTitle = document.title.replace(" - YouTube", "").trim();
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer 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",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: `Generate a natural comment (10–15 words) for: ${videoTitle}` }]
      })
    });
    const json = await response.json();
    const comment = json.choices?.[0]?.message?.content?.replace(/^"(.*)"$/, "$1").trim();

    if (comment) {
      // Post the comment
      const commentArea = document.querySelector(selectors.commentArea) as HTMLElement;
      commentArea.click();
      await wait(500);
      const input = document.querySelector(selectors.inputField) as HTMLElement;
      input.innerText = comment;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(500);
      const submitBtn = Array.from(document.querySelectorAll(selectors.commentBtn))
        .find(el => /comment/i.test(el.getAttribute("aria-label") || "")) as HTMLElement;
      submitBtn?.click();
      await wait(3000);
    }
  } catch (e) {
    console.error("[Content] Comment error:", e);
  }
}

// ---------------------------------------------------
// 4. Inject Stop Automation Control
// ---------------------------------------------------

// Only on channel videos page
if (/youtube\.com\/@[^/]+\/videos/.test(window.location.href)) {
  injectStopAutomationButton();
}

/**
 * Creates a floating Stop Automation button with styles & handlers.
 */
function injectStopAutomationButton() {
  const btn = document.createElement("button");
  btn.id = "yt-stop-automation-btn";
  btn.textContent = "Stop Automation";

  // Apply basic styles
  Object.assign(btn.style, {
    position: "fixed",
    top: "56px",
    right: "28px",
    zIndex: "9999",
    background: "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "12px 28px 12px 44px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(59,130,246,0.18)",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontFamily: "SF Pro Display, Segoe UI, Arial, sans-serif"
  });

  // SVG icon
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("width", "22");
  icon.setAttribute("height", "22");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.style.position = "absolute";
  icon.style.left = "16px";
  icon.style.top = "50%";
  icon.style.transform = "translateY(-50%)";
  icon.innerHTML = `
    <circle cx="12" cy="12" r="10" fill="#fff" opacity="0.13"/>
    <path d="M8 8h8v8H8z" fill="#fff"/>
    <path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `;
  btn.appendChild(icon);

  // Hover & animations handled via injected <style>
  const style = document.createElement("style");
  style.textContent = `
    @keyframes ytStopBtnBounce { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }
    #yt-stop-automation-btn { animation: ytStopBtnBounce 1.2s infinite cubic-bezier(.6,-0.28,.74,1.25); }
    #yt-stop-automation-btn:hover { animation-play-state: paused; background: linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%); box-shadow: 0 6px 20px rgba(37,99,235,0.22); transform: translateY(-2px) scale(1.03); }
    #yt-stop-automation-btn.yt-stop-automation-btn-disabled { background: #888 !important; cursor: not-allowed !important; opacity: 0.7; pointer-events: none; animation-play-state: paused; }
  `;

  // Click handler to stop automation
  btn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopAutomation" }, response => {
      if (response?.status === "stopped") {
        btn.textContent = "Stopped";
        btn.disabled = true;
        btn.classList.add("yt-stop-automation-btn-disabled");
        btn.removeChild(icon);
        btn.style.paddingLeft = "28px"; // reclaim space
      }
    });
  });

  // Inject into DOM
  window.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(style);
    document.body.appendChild(btn);
  });
}
