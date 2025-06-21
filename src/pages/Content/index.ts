console.log("[Content Script] ✅ Content script loaded");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// let lastFetchedIndex = 0;

/**
 * Scrolls the page by one viewport and waits until at least `minExpectedItems`
 * ytd-rich-item-renderer elements exist, or times out after `timeoutMs`.
 */
async function scrollAndWaitForNewItems(
  minExpectedItems: number,
  timeoutMs = 8000
): Promise<boolean> {
  const start = Date.now();
  const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

  while (Date.now() - start < timeoutMs) {
    window.scrollBy(0, window.innerHeight);
    await wait(500);

    const currentCount = document.querySelectorAll("ytd-rich-item-renderer").length;
    if (currentCount >= minExpectedItems) {
      return true;
    }
  }

  return false;
}

/**
 * Fetches exactly `noOfUrls` video URLs from the channel’s /videos page,
 * scrolling as needed to load more elements.
 */
async function fetchNextVideoUrls(noOfUrls: number): Promise<string[]> {
  const urls: string[] = [];
  let lastFetchedIndex = 0;

  while (urls.length < noOfUrls) {
    // grab all currently rendered video items
    const items = Array.from(
      document.querySelectorAll("ytd-rich-item-renderer")
    ) as HTMLElement[];

    // if we've consumed every loaded item, scroll to load more
    if (lastFetchedIndex >= items.length) {
      // target at least one more batch of items
      const targetCount = items.length + Math.ceil(noOfUrls / 2);
      const loaded = await scrollAndWaitForNewItems(targetCount);
      if (!loaded) {
        console.warn(
          "[fetchNextVideoUrls] timed out waiting for more videos after scrolling."
        );
        break;
      }
      continue;
    }

    // otherwise pull the next URL
    const item = items[lastFetchedIndex++];
    const anchor = item.querySelector("a#thumbnail") as HTMLAnchorElement | null;
    if (anchor?.href) {
      urls.push(anchor.href);
    }
  }

  return urls;
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle quick synchronous ping (no need for return true)
  if (request.action === "ping") {
    sendResponse({ status: "ready" });
    return; // No async logic here
  }

  // Wrap all other logic in async block
  (async () => {
    try {
      if (request.action === "FETCH_UPLOADED_VIDEOS") {
        console.log("[Content] 📥 Received FETCH_UPLOADED_VIDEOS");
        console.log("▶️ No of videos requested:", request.count);
        await wait(3000);
        const links = await fetchNextVideoUrls(request.count);
        console.log("✅ Video links fetched:", links);

        sendResponse({ videoLinks: links });
      } else if (request.action === "startVideoAutomation") {
        console.log("[Content] 🤖 Starting automation");

        await automateThisVideo();

        console.log("[Content] ✅ Automation complete");
        sendResponse({ status: "done" });
      }
    } catch (err: any) {
      console.error("[Content] ❌ Automation error:", err);
      sendResponse({ status: "error", error: err.message });
    }
  })();

  return true; // Keep port open for async responses
});

// --- Main Automation Logic ---
async function automateThisVideo() {
  // CSS selectors for YouTube UI elements
  const selectors = {
    subscribeBtn: "ytd-subscribe-button-renderer button",
    subscribeSpan: "ytd-subscribe-button-renderer button span",
    likeBtn: "button-view-model button",
    commentArea: "#placeholder-area",
    inputField: "#contenteditable-root",
    commentBtn: "yt-button-shape button",
  };
  await wait(5000); // Wait for page to load

  // --- Subscribe if not already subscribed ---
  const subscribeBtn = document.querySelector(
    selectors.subscribeBtn
  ) as HTMLElement;
  const subscribeSpan = document.querySelector(
    selectors.subscribeSpan
  ) as HTMLElement;
  if (
    subscribeBtn &&
    subscribeSpan &&
    !/subscribed/i.test(subscribeSpan.textContent || "")
  ) {
    subscribeBtn.click();
    await wait(3000);
  }

  // --- Like the video if not already liked ---
  const likeBtn = document.querySelector(selectors.likeBtn) as HTMLElement;
  if (likeBtn && likeBtn.getAttribute("aria-pressed") !== "true") {
    likeBtn.click();
    await wait(3000);
  }

  // --- Scroll to comments section ---
  for (let i = 0; i < 3; i++) {
    window.scrollBy(0, 200);
    await wait(500);
  }

  // --- Generate and post AI comment ---
  const videoTitle = document.title.replace(" - YouTube", "").trim();
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
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
              content: `Generate a natural comment (10–15 words) for: ${videoTitle}`,
            },
          ],
        }),
      }
    );
    const json = await response.json();
    const comment = (json.choices?.[0]?.message?.content || "")
      .replace(/^"(.*)"$/, "$1")
      .trim();
    if (comment) {
      const commentArea = document.querySelector(
        selectors.commentArea
      ) as HTMLElement;
      commentArea?.click();
      await wait(500);
      const input = document.querySelector(selectors.inputField) as HTMLElement;
      input.innerText = comment;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(500);
      const submitBtn = Array.from(
        document.querySelectorAll(selectors.commentBtn)
      ).find((el) =>
        /comment/i.test(el.getAttribute("aria-label") || "")
      ) as HTMLElement;
      submitBtn?.click();
      await wait(3000);
    }
  } catch (e) {
    console.error("[Content] Comment fetch failed:", e);
  }
}

// --- Inject Stop Automation Button on Channel Videos Page ---
if (/youtube\.com\/@[^/]+\/videos/.test(window.location.href)) {
  injectStopAutomationButton();
}

/**
 * Injects a floating stop automation button on the channel videos page.
 */
function injectStopAutomationButton() {
  const btn = document.createElement("button");
  btn.id = "yt-stop-automation-btn";
  btn.textContent = "Stop Automation";
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
    transition: "background 0.18s, box-shadow 0.18s, transform 0.12s",
    letterSpacing: "0.03em",
    outline: "none",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontFamily: "SF Pro Display, Segoe UI, Arial, sans-serif",
  });

  // --- SVG Icon ---
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("width", "22");
  icon.setAttribute("height", "22");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.style.position = "absolute";
  icon.style.left = "16px";
  icon.style.top = "50%";
  icon.style.transform = "translateY(-50%)";
  icon.innerHTML = `<circle cx="12" cy="12" r="10" fill="#fff" opacity="0.13"/><path d="M8 8h8v8H8z" fill="#fff"/><path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  btn.appendChild(icon);

  // --- Hover/Active/Disabled Styles ---
  btn.onmouseenter = () => {
    btn.style.background = "linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)";
    btn.style.boxShadow = "0 6px 20px rgba(37,99,235,0.22)";
    btn.style.transform = "translateY(-2px) scale(1.03)";
    btn.style.animationPlayState = "paused";
  };
  btn.onmouseleave = () => {
    btn.style.background = "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)";
    btn.style.boxShadow = "0 4px 16px rgba(59,130,246,0.18)";
    btn.style.transform = "none";
    btn.style.animationPlayState = "running";
  };

  // --- Animation Styles ---
  const style = document.createElement("style");
  style.textContent = `
    @keyframes ytStopBtnBounce {
      0% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
      100% { transform: translateY(0); }
    }
    #yt-stop-automation-btn {
      animation: ytStopBtnBounce 1.2s infinite cubic-bezier(.6,-0.28,.74,1.25);
      animation-play-state: running;
    }
    #yt-stop-automation-btn:hover {
      animation-play-state: paused;
    }
    #yt-stop-automation-btn.yt-stop-automation-btn-disabled {
      background: linear-gradient(90deg, #bdbdbd 0%, #888 100%) !important;
      color: #f3f4f6 !important;
      cursor: not-allowed !important;
      pointer-events: none !important;
      opacity: 0.7 !important;
      animation-play-state: paused !important;
      box-shadow: none !important;
    }
    #yt-stop-automation-btn svg {
      margin-right: 0;
    }
  `;

  // --- Stop Automation Button Click Handler ---
  btn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopAutomation" }, (response) => {
      if (response?.status === "stopped") {
        // Remove icon and reclaim space
        if (icon.parentNode) icon.parentNode.removeChild(icon);
        btn.textContent = "Stopped";
        btn.disabled = true;
        btn.setAttribute("disabled", "disabled");
        btn.style.background = "linear-gradient(90deg, #bdbdbd 0%, #888 100%)";
        btn.style.color = "#f3f4f6";
        btn.style.cursor = "not-allowed";
        btn.style.pointerEvents = "none";
        btn.style.opacity = "0.7";
        btn.style.boxShadow = "none";
        btn.style.animationPlayState = "paused";
        btn.classList.add("yt-stop-automation-btn-disabled");
        btn.style.paddingLeft = "28px"; // Remove icon space
      }
    });
  });

  // --- Inject styles and button on DOMContentLoaded ---
  window.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(style);
    document.body.appendChild(btn);
  });
}
