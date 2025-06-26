// -----------------------------------------------------------------------------
// YouTube Automation Background Script
// -----------------------------------------------------------------------------

// --- YouTube Data API Key ---
const API_KEY = "AIzaSyC952tqsZvDXY6QexfE6heuP1veihU_VlI";
// const API_KEY = "AIzaSyDhpNTbHbITjJad64MFgO4eRVkm-x6VQYc"; // Alternative key

// Tab and automation state
let channelPageTabId: number | null = null;
let isAutomationActive = false;

// --- Type Definitions ---

/**
 * Basic channel info returned to the popup
 */
type ChannelInfo = {
  id: string;
  title: string;
  iconUrl: string;
  subscriberCount: string;
  handle: string;
};

/**
 * Search result snippet structure
 */
type SearchItem = {
  snippet: {
    channelId: string;
    channelTitle: string;
  };
};

/**
 * Full channel item from YouTube Channels API
 */
type ChannelsItem = {
  id: string;
  snippet: {
    title: string;
    customUrl?: string;
    thumbnails: {
      default: { url: string };
    };
    handle: string;
  };
  statistics: {
    subscriberCount: string;
  };
  brandingSettings?: {
    channel?: { customUrl?: string };
  };
};


// -----------------------------------------------------------------------------
// Fetching and Sorting Channel Data
// -----------------------------------------------------------------------------

/**
 * Search for channels by query, then fetch detailed info
 * @param query Search keyword
 * @param maxResults Maximum channels to retrieve
 */
async function fetchChannelInfoByQuery(
  query: string,
  maxResults: number
): Promise<ChannelInfo[]> {
  // Prepare search endpoint URL
  const compareKey = query.replace(/\s+/g, "").toLowerCase();
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "channel");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", maxResults.toString());
  searchUrl.searchParams.set("key", API_KEY);

  // Execute search request
  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    throw new Error(`YouTube Search API returned HTTP ${searchRes.status}`);
  }

  // Extract channel IDs from search results
  const { items: searchItems = [] } = await searchRes.json();
  const channelIds = (searchItems as SearchItem[])
    .map(item => item.snippet.channelId)
    .filter(Boolean);

  if (!channelIds.length) {
    return []; // No channels found
  }

  // Prepare channels details endpoint URL
  const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelsUrl.searchParams.set(
    "part",
    "snippet,statistics,brandingSettings,contentDetails"
  );
  channelsUrl.searchParams.set("id", channelIds.join(","));
  channelsUrl.searchParams.set("key", API_KEY);

  // Fetch channel details
  const channelsRes = await fetch(channelsUrl.toString());
  if (!channelsRes.ok) {
    throw new Error(`YouTube Channels API returned HTTP ${channelsRes.status}`);
  }

  // Map API response to ChannelInfo objects
  const { items: channelItems = [] } = await channelsRes.json();
  const mapped = (channelItems as ChannelsItem[]).map(item => ({
    id: item.id,
    title: item.snippet.title,
    iconUrl: item.snippet.thumbnails.default.url,
    subscriberCount: item.statistics.subscriberCount,
    handle: item.snippet.customUrl
      ? item.snippet.customUrl.replace(/^@/, "")
      : "",
  }));

  // Sort: exact title matches first, then by subscriber count descending
  mapped.sort((a, b) => {
    const aKey = a.title.replace(/\s+/g, "").toLowerCase();
    const bKey = b.title.replace(/\s+/g, "").toLowerCase();
    const aExact = aKey === compareKey ? 1 : 0;
    const bExact = bKey === compareKey ? 1 : 0;

    if (aExact !== bExact) {
      return bExact - aExact;
    }

    const aSubs = parseInt(a.subscriberCount.replace(/[^\d]/g, "")) || 0;
    const bSubs = parseInt(b.subscriberCount.replace(/[^\d]/g, "")) || 0;
    return bSubs - aSubs;
  });

  return mapped;
}


// -----------------------------------------------------------------------------
// Message Listener: Handling Popup Commands
// -----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case "FETCH_CHANNELS": {
          const channels = await fetchChannelInfoByQuery(
            message.query,
            message.maxResults
          );
          sendResponse({ channels });
          break;
        }

        case "START_AUTOMATION": {
          console.log("Starting automation for count:", message.count);
          const channelPageUrl = `https://www.youtube.com/@${message.selectedHandle?.handle}/videos`;

          chrome.tabs.create({ url: channelPageUrl }, tab => {
            channelPageTabId = tab.id ?? null;

            // Prevent duplicate runs
            if (isAutomationActive) {
              sendResponse({ status: "already_running" });
              return;
            }
            isAutomationActive = true;

            // Wait for channel page to fully load
            const onUpdated = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
              if (updatedTabId === channelPageTabId && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(onUpdated);

                // Request uploaded video URLs
                chrome.tabs.sendMessage(
                  channelPageTabId!,
                  { action: "FETCH_UPLOADED_VIDEOS", count: message.count },
                  async response => {
                    const videos: string[] = response?.videoLinks || [];

                    // Iterate through each video URL
                    for (const url of videos) {
                      if (!isAutomationActive) break;
                      await openAndAutomateVideo(url);
                    }

                    // Close channel page tab after a brief delay
                    if (channelPageTabId !== null) {
                      await chrome.tabs.update(channelPageTabId, { active: true });
                      setTimeout(() => {
                        chrome.tabs.remove(channelPageTabId!);
                        channelPageTabId = null;
                      }, 1000);
                    }
                  }
                );
              }
            };

            chrome.tabs.onUpdated.addListener(onUpdated);
          });

          sendResponse({ status: "success", message: "Automation started" });
          break;
        }

        case "stopAutomation": {
          isAutomationActive = false;
          sendResponse({ status: "stopped" });
          break;
        }

        default:
          sendResponse({ status: "error", message: "Unknown action" });
      }
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : String(err) });
    }
  })();

  // Indicate async response
  return true;
});


// -----------------------------------------------------------------------------
// Helper: Open Video Tab and Automate Actions
// -----------------------------------------------------------------------------

/**
 * Opens a video URL in a new tab, waits for content script readiness,
 * sends automation command, then closes the tab.
 */
async function openAndAutomateVideo(videoUrl: string): Promise<void> {
  const tab = await chrome.tabs.create({ url: videoUrl, active: true });
  const videoTabId = tab.id!;

  // Wait for page load
  await new Promise<void>(resolve => {
    const onUpdate = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (tabId === videoTabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(onUpdate);

        // Poll until content script responds "ready"
        const checkReady = setInterval(() => {
          chrome.tabs.sendMessage(
            videoTabId,
            { action: "ping" },
            response => {
              if (!chrome.runtime.lastError && response?.status === "ready") {
                clearInterval(checkReady);

                // Trigger the automation flow
                chrome.tabs.sendMessage(
                  videoTabId,
                  { action: "startVideoAutomation" },
                  () => {
                    // Close tab on completion
                    resolve();
                    chrome.tabs.remove(videoTabId);
                  }
                );
              }
            }
          );
        }, 500);
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdate);
  });
}
