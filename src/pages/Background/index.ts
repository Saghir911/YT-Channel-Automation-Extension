// --- YouTube Data API Key ---
// const API_KEY = "AIzaSyC952tqsZvDXY6QexfE6heuP1veihU_VlI";
const API_KEY = "AIzaSyDhpNTbHbITjJad64MFgO4eRVkm-x6VQYc";
// Fixed type annotation for channelPageTabId
let channelPageTabId: number | null = null;

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
        const channelPageUrl = `https://www.youtube.com/@${message.selectedHandle?.handle}/videos`;
        chrome.tabs.create({ url: channelPageUrl }, (tab) => {
          channelPageTabId = tab.id ?? null;
        });
        sendResponse({ status: "success", message: "Automation started" });
      }
      //  else if (message.type === "GetVideoUrlArray") {
      //   await new Promise<void>((resolve) => {
      //     chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      //       if (tabId === channelPageTabId && info.status === "complete") {
      //         chrome.tabs.onUpdated.removeListener(listener);
      //         resolve();
      //       }
      //     });
      //   });
      // } 
      else {
        sendResponse({ status: "error", message: "Unknown action" });
      }
    } catch (err) {
      sendResponse({ error: err instanceof Error ? err.message : String(err) });
    }
  })();

  // Listen for tab updates to check when the page is fully loaded

  // Indicate async response
  return true;
});
