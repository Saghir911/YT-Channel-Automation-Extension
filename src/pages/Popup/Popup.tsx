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
  // --- 1. State ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [channelResults, setChannelResults] = useState<
    Array<{
      id: string;
      name: string;
      subscribers: string;
      avatar: string;
      handle?: string;
    }>
  >([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null
  );
  const [showResultCount, setShowResultCount] = useState(false);
  const [videoCount, setVideoCount] = useState(1);

  // Constants
  const minVideos = 1;
  const maxVideos = 100;
  const channelListRef = useRef<HTMLDivElement>(null);

  // --- 2. Animation ---
  useEffect(() => {
    if (!channelListRef.current) return;
    const items = channelListRef.current.querySelectorAll(".channel-item");

    if (showResultCount && channelResults.length > 1) {
      gsap.to(
        channelListRef.current.querySelectorAll(".channel-item:not(.selected)"),
        { opacity: 0, scale: 0.95, duration: 0, pointerEvents: "none" }
      );
    } else {
      gsap.set(items, { opacity: 1, scale: 1, clearProps: "pointerEvents" });
    }
  }, [showResultCount, selectedChannelId, channelResults.length]);

  // --- 3. Reset on Deselect ---
  useEffect(() => {
    if (selectedChannelId === null) {
      setShowResultCount(false);
      setVideoCount(minVideos);
    }
  }, [selectedChannelId]);

  const selectedChannel =
    channelResults.find((c) => c.id === selectedChannelId) || null;

  // --- 4. Format Subs ---
  const formatSubscribers = (subs: string | number) => {
    const num = typeof subs === "number" ? subs : Number(subs);
    if (isNaN(num)) return String(subs);
    if (num >= 1_000_000)
      return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return num.toString();
  };

  // --- 5. Search ---
  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setSearchState("loading");
    setSelectedChannelId(null);

    chrome.runtime.sendMessage(
      { action: "FETCH_CHANNELS", query: searchQuery, maxResults: 5 },
      (response) => {
        if (chrome.runtime.lastError || !response) {
          setChannelResults([]);
          setSearchState("error");
          return;
        }
        if (response.channels?.length) {
          setChannelResults(
            response.channels.map((ch: any) => ({
              id: ch.id,
              name: ch.title,
              subscribers:
                formatSubscribers(ch.subscriberCount) + " subscribers",
              avatar: ch.iconUrl,
              handle: ch.handle,
            }))
          );
          setSearchState("success");
        } else {
          setChannelResults([]);
          setSearchState("no-results");
        }
      }
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // --- 6. Start ---
  const startAutomation = () => {
    chrome.runtime.sendMessage({
      action: "START_AUTOMATION",
      selectedHandle: selectedChannel,
      maxResults: 5,
      count: videoCount,
    });
  };

  // --- 7. Render Content ---
  const renderContent = () => {
    switch (searchState) {
      case "idle":
        return (
          <div className="idle-state">
            <div className="idle-state-icon">
              <Search />
            </div>
            <h3>Search for a channel</h3>
            <p>
              Enter a channel name or handle to find YouTube channels for
              automation.
            </p>
          </div>
        );

      case "loading":
        return (
          <div className="loading-state">
            <div className="loading-state-icon">
              <Loader2 />
            </div>
            <h3>Searching...</h3>
            <p>Looking for &quot;{searchQuery}&quot;</p>
          </div>
        );

      case "no-results":
        return (
          <div className="no-results-state">
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
        );

      case "success":
        return (
          <ScrollArea className="results-scroll">
            <div className="results-info">
              Found {channelResults.length} result
              {channelResults.length !== 1 ? "s" : ""} for &quot;{searchQuery}
              &quot;
            </div>
            <div className="channel-list" ref={channelListRef}>
              {channelResults.map((channel) => {
                const isSelected = selectedChannelId === channel.id;
                return (
                  <React.Fragment key={channel.id}>
                    {showResultCount && isSelected && (
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
                            className="video-count-btn minus-ten"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVideoCount((v) => Math.max(minVideos, v - 10));
                            }}
                            disabled={videoCount <= minVideos}
                          >
                            -10
                          </button>
                          <button
                            type="button"
                            className="video-count-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVideoCount((v) => Math.max(minVideos, v - 1));
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
                              setVideoCount((v) => Math.min(maxVideos, v + 1));
                            }}
                            disabled={videoCount >= maxVideos}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="video-count-btn plus-ten"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVideoCount((v) => Math.min(maxVideos, v + 10));
                            }}
                            disabled={videoCount >= maxVideos}
                          >
                            +10
                          </button>
                        </div>
                      </div>
                    )}
                    <div
                      onClick={() => {
                        setSelectedChannelId(isSelected ? null : channel.id);
                        setShowResultCount(true);
                        if (isSelected) setShowResultCount(false);
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
      <div className="content-area">{renderContent()}</div>
      {selectedChannel && (
        <>
          <Separator />
          <div className="footer">
            <Button
              className="footer-btn"
              onClick={startAutomation}
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
