// --- YouTube Data API Key ---
// const API_KEY = "AIzaSyC952tqsZvDXY6QexfE6heuP1veihU_VlI";
const API_KEY = "AIzaSyDhpNTbHbITjJad64MFgO4eRVkm-x6VQYc";
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

// --- Chrome message listener: handles all extension actions ---
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "FETCH_CHANNELS") {
        // Search for channels
        const channels = await fetchChannelInfoByQuery(
          message.query,
          message.maxResults
        );
        sendResponse({ channels });
      } else if (message.action === "START_AUTOMATION") {
        // Start automation: open channel videos page
        if (isAutomationActive)
          return sendResponse({ status: "already_running" });
        isAutomationActive = true;
        const channelPageUrl = `https://www.youtube.com/@${message.selectedHandle?.handle}/videos`;
        chrome.tabs.create({ url: channelPageUrl }, (tab) => {
          channelPageTabId = tab.id ?? null;
        });
        sendResponse({ status: "success", message: "Automation started" });
      } else if (message.type === "FETCH_UPLOADED_VIDEOS") {
        // Fetch uploaded videos and automate each
        const uploadedVideoUrls = await fetchUploadedVideos(
          message.channelId,
          message.noOfVideos
        );
        // Wait for channel page to load
        await new Promise<void>((resolve) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === channelPageTabId && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          });
        });
        await new Promise((r) => setTimeout(r, 2000));
        for (const uploadedVideoUrl of uploadedVideoUrls) {
          if (!isAutomationActive) break;
          await openAndAutomateVideo(uploadedVideoUrl);
        }
        // Close channel page tab after automation
        if (channelPageTabId !== null) {
          await chrome.tabs.update(channelPageTabId, { active: true });
          setTimeout(() => {
            chrome.tabs.remove(channelPageTabId!);
            channelPageTabId = null;
          }, 2000);
        }
        sendResponse({ videoLinks: uploadedVideoUrls });
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
  // Indicate async response
  return true;
});

// --- Fetch uploaded videos for a channel ---
async function fetchUploadedVideos(
  channelId: string,
  maxResults: number
): Promise<string[]> {
  // Get uploads playlist ID
  const channelDetailsUrl = new URL(
    "https://www.googleapis.com/youtube/v3/channels"
  );
  channelDetailsUrl.searchParams.set("part", "contentDetails");
  channelDetailsUrl.searchParams.set("id", channelId);
  channelDetailsUrl.searchParams.set("key", API_KEY);
  const detailsRes = await fetch(channelDetailsUrl.toString());
  if (!detailsRes.ok)
    throw new Error(
      `YouTube API (contentDetails) returned HTTP ${detailsRes.status}`
    );
  const detailsJson = await detailsRes.json();
  const uploadsPlaylistId =
    detailsJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error("Upload playlist not found");

  // Get videos from playlist
  const playlistItemsUrl = new URL(
    "https://www.googleapis.com/youtube/v3/playlistItems"
  );
  playlistItemsUrl.searchParams.set("part", "snippet");
  playlistItemsUrl.searchParams.set("playlistId", uploadsPlaylistId);
  playlistItemsUrl.searchParams.set("maxResults", maxResults.toString());
  playlistItemsUrl.searchParams.set("key", API_KEY);
  const playlistRes = await fetch(playlistItemsUrl.toString());
  if (!playlistRes.ok)
    throw new Error(
      `YouTube API (playlistItems) returned HTTP ${playlistRes.status}`
    );
  const playlistJson = await playlistRes.json();
  return playlistJson.items.map(
    (item: any) =>
      `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
  );
}

// --- Open a video in a new tab and trigger automation ---
async function openAndAutomateVideo(videoUrl: string): Promise<void> {
  const tab = await chrome.tabs.create({ url: videoUrl, active: true });
  const videoTabId = tab.id!;
  await new Promise<void>((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === videoTabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.sendMessage(
          videoTabId,
          { action: "startVideoAutomation" },
          () => {
            resolve();
            chrome.tabs.remove(videoTabId);
          }
        );
      }
    });
  });
}
