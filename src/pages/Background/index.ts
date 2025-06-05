import { CookingPot } from "lucide-react";

type ChannelInfo = {
  id: string;
  title: string;
  iconUrl: string;
  subscriberCount: string;
};

type SearchItem = {
  snippet: {
    channelId: string;
    channelTitle: string; // used for exact‐match check
  };
};

type ChannelsItem = {
  id: string;
  snippet: {
    title: string;
    thumbnails: {
      default: {
        url: string;
      };
    };
  };
  statistics: {
    subscriberCount: string;
  };
};

const API_KEY = "AIzaSyDhpNTbHbITjJad64MFgO4eRVkm-x6VQYc";

/**
 * 1. Search for channels matching `query`.
 * 2. Fetch snippet+statistics for those channel IDs.
 * 3. Sort so that any channel whose title exactly matches `query` (case‐insensitive, ignoring spaces) comes first.
 */
async function fetchChannelInfoByQuery(
  query: string,
  maxResults: number = 3
): Promise<ChannelInfo[]> {
  // Normalize query for exact‐match comparison

  const compareKey = query.replace(/\s+/g, "").toLowerCase();

  // ——— STEP A: Use search.list to get channel IDs & channelTitles ———
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "channel");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", maxResults.toString());
  searchUrl.searchParams.set("key", API_KEY);

  const searchRes = await fetch(searchUrl.toString());

  if (!searchRes.ok) {
    throw new Error(`YouTube Search API returned HTTP ${searchRes.status}`);
  }
  const searchJson = await searchRes.json();
  console.log(searchJson);

  // Extract an array of objects: { id, channelTitle }
  const searchItems: SearchItem[] = searchJson.items || [];
  const channelIdToTitle: Record<string, string> = {};
  const channelIds: string[] = [];

  for (const item of searchItems) {
    const channelId = item.snippet.channelId;
    const channelTitle = item.snippet.channelTitle;
    if (channelId) {
      channelIds.push(channelId);
      channelIdToTitle[channelId] = channelTitle;
    }
  }

  console.log("[BG] Channel IDs to fetch:", channelIds);

  if (channelIds.length === 0) {
    return [];
  }

  // ——— STEP B: Fetch snippet+statistics for those IDs ———
  const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelsUrl.searchParams.set("part", "snippet,statistics");
  channelsUrl.searchParams.set("id", channelIds.join(","));
  channelsUrl.searchParams.set("key", API_KEY);

  console.log("[BG] Fetching channel details:", channelsUrl.toString());

  const channelsRes = await fetch(channelsUrl.toString());
  console.log("[BG] channelsRes status:", channelsRes.status);
  if (!channelsRes.ok) {
    throw new Error(`YouTube Channels API returned HTTP ${channelsRes.status}`);
  }
  const channelsJson = await channelsRes.json();
  console.log("[BG] channelsJson:", channelsJson);

  // Map to ChannelInfo[], then sort
  const mapped: ChannelInfo[] = (channelsJson.items as ChannelsItem[]).map(
    (item) => ({
      id: item.id,
      title: item.snippet.title,
      iconUrl: item.snippet.thumbnails.default.url,
      subscriberCount: item.statistics.subscriberCount,
    })
  );

  // Sort so that exact matches come first, then by subscriber count
  mapped.sort((a, b) => {
    const aKey = a.title.replace(/\s+/g, "").toLowerCase();
    const bKey = b.title.replace(/\s+/g, "").toLowerCase();
    const aExact = aKey === compareKey ? 1 : 0;
    const bExact = bKey === compareKey ? 1 : 0;
    if (aExact && !bExact) return -1;
    if (bExact && !aExact) return 1;
    // If both are exact or both are not, sort by subscriber count (desc)
    // Only parse as integer, do not handle M/K formatting here
    const aSubs = parseInt(a.subscriberCount.replace(/[^\d]/g, "")) || 0;
    const bSubs = parseInt(b.subscriberCount.replace(/[^\d]/g, "")) || 0;
    return bSubs - aSubs;
  });

  return mapped;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_CHANNELS") {
    console.log("[BG] Received FETCH_CHANNELS message:", message);
    fetchChannelInfoByQuery(message.query, message.maxResults)
      .then((channels) => {
        console.log("[BG] Sending channels to popup:", channels);
        sendResponse({ channels });
      })
      .catch((err) => {
        console.error("[BG] Error in fetchChannelInfoByQuery:", err);
        sendResponse({ error: err.message });
      });
    // Indicate that we will respond asynchronously
    return true;
  }
});
