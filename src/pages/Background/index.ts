// --- YouTube Data API Key ---
const API_KEY = "AIzaSyC952tqsZvDXY6QexfE6heuP1veihU_VlI";
// const API_KEY = "AIzaSyDhpNTbHbITjJad64MFgO4eRVkm-x6VQYc";
// Fixed type annotation for channelPageTabId
let channelPageTabId: number | null = null;
let isAutomationActive = false;

// --- Types ---
type ChannelInfo = {
  id: string;
  title: string;
  iconUrl: string;
  subscriberCount: string;
  handle: string;
};

type SearchItem = {
  snippet: { channelId: string; channelTitle: string };
};

type ChannelsItem = {
  id: string;
  snippet: {
    title: string;
    customUrl?: string;
    thumbnails: { default: { url: string } };
    handle: string;
  };
  statistics: { subscriberCount: string };
  brandingSettings?: { channel?: { customUrl?: string } };
};

// --- Fetch channel info by search query ---
async function fetchChannelInfoByQuery(
  query: string,
  maxResults: number
): Promise<ChannelInfo[]> {
  const compareKey = query.replace(/\s+/g, "").toLowerCase();
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "channel");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", maxResults.toString());
  searchUrl.searchParams.set("key", API_KEY);
  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok)
    throw new Error(`YouTube Search API returned HTTP ${searchRes.status}`);
  const searchJson = await searchRes.json();
  const searchItems: SearchItem[] = searchJson.items || [];
  const channelIds: string[] = searchItems
    .map((item) => item.snippet.channelId)
    .filter(Boolean);
  if (!channelIds.length) return [];

  // Fetch channel details using the channel IDs
  const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelsUrl.searchParams.set(
    "part",
    "snippet,statistics,brandingSettings,contentDetails"
  );
  channelsUrl.searchParams.set("id", channelIds.join(","));
  channelsUrl.searchParams.set("key", API_KEY);
  const channelsRes = await fetch(channelsUrl.toString());
  if (!channelsRes.ok)
    throw new Error(`YouTube Channels API returned HTTP ${channelsRes.status}`);
  const channelsJson = await channelsRes.json();
  const mapped: ChannelInfo[] = (channelsJson.items as ChannelsItem[]).map(
    (item) => ({
      id: item.id,
      title: item.snippet.title,
      iconUrl: item.snippet.thumbnails.default.url,
      subscriberCount: item.statistics.subscriberCount,
      handle: item.snippet.customUrl
        ? item.snippet.customUrl.replace(/^@/, "")
        : "",
    })
  );
  // Sort: exact match first, then by subscriber count descending
  mapped.sort((a, b) => {
    const aKey = a.title.replace(/\s+/g, "").toLowerCase();
    const bKey = b.title.replace(/\s+/g, "").toLowerCase();
    const aExact = aKey === compareKey ? 1 : 0;
    const bExact = bKey === compareKey ? 1 : 0;
    if (aExact && !bExact) return -1;
    if (bExact && !aExact) return 1;
    const aSubs = parseInt(a.subscriberCount.replace(/[^\d]/g, "")) || 0;
    const bSubs = parseInt(b.subscriberCount.replace(/[^\d]/g, "")) || 0;
    return bSubs - aSubs;
  });
  return mapped;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.action === "FETCH_CHANNELS") {
        // Search for channels
        const channels = await fetchChannelInfoByQuery(
          message.query,
          message.maxResults
        );
        sendResponse({ channels });
      } else if (message.action === "START_AUTOMATION") {
        console.log("no of counts:", message.count);
        const channelPageUrl = `https://www.youtube.com/@${message.selectedHandle?.handle}/videos`;
        chrome.tabs.create({ url: channelPageUrl }, (tab) => {
          channelPageTabId = tab.id ?? null;
          if (isAutomationActive) {
            // already running; ignore
            sendResponse({ status: "already_running" });
            return true;
          }
          isAutomationActive = true;

          // Wait for the tab to finish loading
          const onUpdatedListener = (
            updatedTabId: number,
            info: chrome.tabs.TabChangeInfo
          ) => {
            if (
              updatedTabId === channelPageTabId &&
              info.status === "complete"
            ) {
              chrome.tabs.onUpdated.removeListener(onUpdatedListener);
              // Ask content script for video URLs and start automation when received
              chrome.tabs.sendMessage(
                channelPageTabId,
                { action: "FETCH_UPLOADED_VIDEOS", count: message.count },

                async (response) => {
                  const videosUrlArray = response?.videoLinks || [];
                  console.log("All Url of video", videosUrlArray);
                  for (const url of videosUrlArray) {
                    console.log("url of single video:", url);
                    if (!isAutomationActive) break;
                    await openAndAutomateVideo(url);
                  }
                  if (channelPageTabId !== null) {
                    await chrome.tabs.update(channelPageTabId, {
                      active: true,
                    });
                    setTimeout(() => {
                      chrome.tabs.remove(channelPageTabId!);
                      channelPageTabId = null;
                    }, 2000);
                  }
                }
              );
            }
          };
          chrome.tabs.onUpdated.addListener(onUpdatedListener);
        });
        sendResponse({ status: "success", message: "Automation started" });
      } else if (message.action === "stopAutomation") {
        // Stop automation
        isAutomationActive = false;
        sendResponse({ status: "stopped" });
        return true;
      } else {
        sendResponse({ status: "error", message: "Unknown action" });
      }
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true;
});
async function openAndAutomateVideo(videoUrl: string): Promise<void> {
  const tab = await chrome.tabs.create({ url: videoUrl, active: true });
  const videoTabId = tab.id!;

  await new Promise<void>((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === videoTabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);

        // Poll the tab until content script is ready
        const checkReady = setInterval(() => {
          chrome.tabs.sendMessage(
            videoTabId,
            { action: "ping" },
            (response) => {
              if (chrome.runtime.lastError) {
                // Script not injected yet
                return;
              }
              if (response?.status === "ready") {
                clearInterval(checkReady);
                // Now run automation
                chrome.tabs.sendMessage(
                  videoTabId,
                  { action: "startVideoAutomation" },
                  async () => {
                    resolve(); // Finish the Promise
                    chrome.tabs.remove(videoTabId);
                  }
                );
              }
            }
          );
        }, 500); // Check every 0.5 sec
      }
    });
  });
}
