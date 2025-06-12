// import { Chrome, CookingPot, Send } from "lucide-react";

type ChannelInfo = {
  id: string;
  title: string;
  iconUrl: string;
  subscriberCount: string;
  handle: string; // Add handle as optional
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
    customUrl?: string; // This is the new field for channel handle
    thumbnails: {
      default: {
        url: string;
      };
    };
    handle: string;
  };
  statistics: {
    subscriberCount: string;
  };
  brandingSettings?: {
    channel?: {
      customUrl?: string;
    };
  };
};

const API_KEY = "AIzaSyDhpNTbHbITjJad64MFgO4eRVkm-x6VQYc";
// const API_KEY = "AIzaSyC952tqsZvDXY6QexfE6heuP1veihU_VlI";
// let videoPageId: number | null = null;

/**
 * 1. Search for channels matching `query`.
 * 2. Fetch snippet+statistics for those channel IDs.
 * 3. Sort so that any channel whose title exactly matches `query` (case‐insensitive, ignoring spaces) comes first.
 */
async function fetchChannelInfoByQuery(
  query: string,
  maxResults: number
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

  if (channelIds.length === 0) {
    return [];
  }

  // ——— STEP B: Fetch snippet+statistics for those IDs ———
  const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
  channelsUrl.searchParams.set(
    "part",
    "snippet,statistics,brandingSettings,contentDetails"
  );
  channelsUrl.searchParams.set("id", channelIds.join(","));
  channelsUrl.searchParams.set("key", API_KEY);

  const channelsRes = await fetch(channelsUrl.toString());
  if (!channelsRes.ok) {
    throw new Error(`YouTube Channels API returned HTTP ${channelsRes.status}`);
  }
  const channelsJson = await channelsRes.json();
  // Log the full API response for debugging handle extraction
  console.log("[BG] channelsJson.items:", channelsJson.items);

  // Map to ChannelInfo[], then sort
  const mapped: ChannelInfo[] = (channelsJson.items as ChannelsItem[]).map(
    (item) => ({
      id: item.id,
      title: item.snippet.title,
      iconUrl: item.snippet.thumbnails.default.url,
      subscriberCount: item.statistics.subscriberCount,
      // Use customUrl from snippet as handle (removing '@'), fallback to empty string
      handle: item.snippet.customUrl
        ? item.snippet.customUrl.replace(/^@/, "")
        : "",
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FETCH_CHANNELS") {
    fetchChannelInfoByQuery(message.query, message.maxResults)
      .then((channels) => {
        sendResponse({ channels });
      })
      .catch((err) => {
        sendResponse({ error: err.message });
      });
    // Indicate that we will respond asynchronously
    return true;
  } else if (message.action === "START_AUTOMATION") {
    const videoPageUrl = `https://www.youtube.com/@${message.selectedHandle?.handle}/videos`;
    chrome.tabs.create({ url: videoPageUrl }, (tab) => {
      // videoPageId = tab.id ?? null;
    });
    sendResponse({ status: "success", message: "Automation started" });
    return true;
  } else if (message.type === "FETCH_UPLOADED_VIDEOS") {
    // You need to pass the channelId from the message
    fetchUploadedVideos(message.channelId, message.noOfVideos)
      .then((videoLinks) => {
        sendResponse({ videoLinks });
      })
      .catch((err) => {
        sendResponse({ error: err.message });
      });
    return true;
  } else {
    sendResponse({ status: "error", message: "Unknown action" });
    return true;
  }
});

async function fetchUploadedVideos(channelId: string, maxResults: number): Promise<string[]> {
  // Step 1: Get contentDetails to extract uploads playlist ID
  const channelDetailsUrl = new URL(
    "https://www.googleapis.com/youtube/v3/channels"
  );
  channelDetailsUrl.searchParams.set("part", "contentDetails");
  channelDetailsUrl.searchParams.set("id", channelId); // FIX: use the actual channelId
  channelDetailsUrl.searchParams.set("key", API_KEY);

  const detailsRes = await fetch(channelDetailsUrl.toString());
  if (!detailsRes.ok) {
    throw new Error(
      `YouTube API (contentDetails) returned HTTP ${detailsRes.status}`
    );
  }
  const detailsJson = await detailsRes.json();
  const uploadsPlaylistId =
    detailsJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error("Upload playlist not found");
  }

  // Step 2: Fetch videos from that playlist
  const playlistItemsUrl = new URL(
    "https://www.googleapis.com/youtube/v3/playlistItems"
  );
  playlistItemsUrl.searchParams.set("part", "snippet");
  playlistItemsUrl.searchParams.set("playlistId", uploadsPlaylistId);
  playlistItemsUrl.searchParams.set("maxResults", maxResults.toString());
  playlistItemsUrl.searchParams.set("key", API_KEY);

  const playlistRes = await fetch(playlistItemsUrl.toString());
  if (!playlistRes.ok) {
    throw new Error(
      `YouTube API (playlistItems) returned HTTP ${playlistRes.status}`
    );
  }
  const playlistJson = await playlistRes.json();
  const videoLinks: string[] = playlistJson.items.map(
    (item: any) =>
      `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
  );
  console.log(videoLinks);
  return videoLinks;
}
