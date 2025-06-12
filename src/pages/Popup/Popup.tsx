"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Youtube, Check, Loader2, Sparkles } from "lucide-react";
import gsap from "gsap";

import { Button } from "./Button";
import { Input } from "./input";
import { ScrollArea } from "./ScrollArea";
import { Separator } from "./Separator";

import "./Popup.css";

type SearchState = "idle" | "loading" | "success" | "error" | "no-results";

export default function Component() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [whenSelected, setwhenSelected] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      name: string;
      subscribers: string;
      avatar: string;
      verified?: boolean;
      handle?: string;
    }>
  >([]);
  const [videoCount, setVideoCount] = useState(1);
  const minVideos = 1;
  const maxVideos = 10;

  const channelListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    
    if (whenSelected && channelListRef.current) {
      // Animate fade out for unselected
      gsap.to(
        channelListRef.current.querySelectorAll(".channel-item:not(.selected)"),
        { opacity: 0, scale: 0.95, duration: 0.3, pointerEvents: "none" }
      );
    } else if (!whenSelected && channelListRef.current) {
      // Instantly show all
      gsap.set(channelListRef.current.querySelectorAll(".channel-item"), {
        opacity: 1,
        scale: 1,
        clearProps: "pointerEvents",
      });
    }
  }, [whenSelected, selectedChannel]);

  useEffect(() => {
    if (selectedChannel === null) {
      // No channel is selected → reset whenSelected
      setwhenSelected(false);
    }
  }, [selectedChannel]);

  const selectedChannelHandle = searchResults.find(
    (channel) => channel.id === selectedChannel
  );
  function onStartAutomation() {
    chrome.runtime.sendMessage({
      action: "START_AUTOMATION",
      selectedHandle: selectedChannelHandle,
      maxResults: 5,
    });
  }
  function fetchUploadedVideosForSelectedChannel() {
    if (!selectedChannelData?.id) {
      console.error("No channel selected or missing channel id");
      return;
    }
    chrome.runtime.sendMessage(
      {
        type: "FETCH_UPLOADED_VIDEOS",
        channelId: selectedChannelData.id, // <-- This is the correct channel id
        noOfVideos: videoCount,
      },
      (response) => {
        if (response.videoLinks) {
          console.log("Video Links:", response.videoLinks);
        } else {
          console.error("Error fetching videos:", response.error);
        }
      }
    );
  }

  // Format subscriber count like YouTube (e.g., 5.8M, 123K, 999)
  function formatSubscribers(subs: string | number): string {
    const num = typeof subs === "number" ? subs : Number(subs);
    if (isNaN(num)) return String(subs);
    if (num >= 1_000_000)
      return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return num.toString();
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchState("loading");
    setSelectedChannel(null);

    // Request real data from background script
    chrome.runtime.sendMessage(
      { type: "FETCH_CHANNELS", query: searchQuery, maxResults: 5 },
      (response) => {
        console.log("[POPUP] Got response from background:", response);
        if (chrome.runtime.lastError || !response) {
          console.error(
            "[POPUP] Error or no response:",
            chrome.runtime.lastError,
            response
          );
          setSearchResults([]);
          setSearchState("error");
          return;
        }
        if (response.channels && response.channels.length > 0) {
          // Map API response to UI structure
          const mappedResults = response.channels.map((ch: any) => ({
            id: ch.id,
            name: ch.title, // API 'title' -> UI 'name'
            subscribers: formatSubscribers(ch.subscriberCount) + " subscribers", // Format for UI
            avatar: ch.iconUrl, // API 'iconUrl' -> UI 'avatar'
            handle: ch.handle, // Pass handle to UI if present
          }));
          console.log("[POPUP] Mapped results:", mappedResults);
          setSearchResults(mappedResults);
          setSearchState("success");
        } else {
          setSearchResults([]);
          setSearchState("no-results");
        }
      }
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const selectedChannelData = selectedChannel
    ? searchResults.find((channel) => channel.id === selectedChannel)
    : null;

  const renderContent = () => {
    switch (searchState) {
      case "idle":
        return (
          <div className="idle-state">
            <div>
              <div className="idle-state-icon">
                <Search />
              </div>
              <h3>Search for a channel</h3>
              <p>
                Enter a channel name or handle to find YouTube channels for
                automation.
              </p>
            </div>
          </div>
        );

      case "loading":
        return (
          <div className="loading-state">
            <div>
              <div className="loading-state-icon">
                <Loader2 />
              </div>
              <h3>Searching...</h3>
              <p>Looking for &quot;{searchQuery}&quot;</p>
            </div>
          </div>
        );

      case "no-results":
        return (
          <div className="no-results-state">
            <div>
              <div className="no-results-icon">
                <Youtube />
              </div>
              <h3>No channels found</h3>
              <p>
                We couldn’t find any channels matching &quot;{searchQuery}&quot;
              </p>
              <Button variant="outline" onClick={() => setSearchState("idle")}>
                Try another search
              </Button>
            </div>
          </div>
        );

      case "success":
        return (
          <ScrollArea className="results-scroll">
            <div className="results-info">
              Found {searchResults.length} result
              {searchResults.length !== 1 ? "s" : ""} for &quot;{searchQuery}
              &quot;
            </div>
            <div className="channel-list" ref={channelListRef}>
              {searchResults.map((channel) => {
                const isSelected = selectedChannel === channel.id;

                return (
                  <React.Fragment key={channel.id}>
                    {whenSelected && isSelected && (
                      <div className="video-count-input-wrapper center">
                        <label
                          htmlFor="noOfVideoToAutomate"
                          className="video-count-label"
                        >
                          Enter number of videos to automate:
                        </label>
                        <div className="video-count-controls">
                          <button
                            type="button"
                            className="video-count-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVideoCount((prev) =>
                                Math.max(minVideos, prev - 1)
                              );
                            }}
                            disabled={videoCount <= minVideos}
                          >
                            -
                          </button>
                          <div
                            className="video-count-display"
                            id="noOfVideoToAutomate"
                          >
                            {videoCount}
                          </div>
                          <button
                            type="button"
                            className="video-count-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVideoCount((prev) =>
                                Math.min(maxVideos, prev + 1)
                              );
                            }}
                            disabled={videoCount >= maxVideos}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}
                    <div
                      onClick={() => {
                        setSelectedChannel(isSelected ? null : channel.id);
                        setwhenSelected(true);
                        if (isSelected) setwhenSelected(false);
                      }}
                      className={`channel-item${isSelected ? " selected" : ""}`}
                    >
                      <div className="channel-avatar-wrapper">
                        <img
                          src={channel.avatar || "/placeholder.svg"}
                          alt={channel.name}
                          width={40}
                          height={40}
                          className="channel-avatar"
                        />
                      </div>

                      <div className="channel-info">
                        <div className="channel-name">{channel.name}</div>
                        {channel.subscribers}
                      </div>

                      <div
                        className={`channel-select-indicator ${
                          isSelected ? "selected" : "default hovered"
                        }`}
                      >
                        {isSelected ? (
                          <Check />
                        ) : (
                          <div className="check-placeholder" />
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </ScrollArea>
        );

      default:
        return null;
    }
  };

  return (
    <div className="youtube-automation">
      <div className="you-header">
        <div className="you-header-icon">
          <Youtube />
        </div>
        <h1 className="you-header-title">YouTube Automation</h1>
      </div>

      <Separator />

      {/* Search Section */}
      <div className="search-section">
        <div className="search-row">
          <Input
            icon={<Search />}
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={searchState === "loading"}
          />
          <Button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || searchState === "loading"}
          >
            {searchState === "loading" ? (
              <Loader2 className="animate-spin" />
            ) : (
              "Search"
            )}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Content Area */}
      <div className="content-area">{renderContent()}</div>

      {/* Footer */}
      {selectedChannelData && (
        <>
          <Separator />
          <div className="footer">
            <Button
              className="footer-btn"
              onClick={() => {
                onStartAutomation();
                fetchUploadedVideosForSelectedChannel();
              }}
            >
              <Sparkles />
              Start Automation
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
