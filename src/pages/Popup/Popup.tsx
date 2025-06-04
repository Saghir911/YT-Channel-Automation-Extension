"use client";

import React, { useState } from "react";
import { Search, Youtube, Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "./Button";
import { Input } from "./input";
import { ScrollArea } from "./ScrollArea";
import { Separator } from "./Separator";

import "./Popup.css";

// Mock channel data for API simulation
const mockChannelDatabase = [
  {
    id: "1",
    name: "MrBeast",
    ubscribers: "224M subscribers",
    avatar: "/placeholder.svg?height=48&width=48",
    verified: true,
  },
  {
    id: "2",
    name: "PewDiePie",
    subscribers: "111M subscribers",
    avatar: "/placeholder.svg?height=48&width=48",
    verified: true,
  },
  {
    id: "3",
    name: "Marques Brownlee",
    scribers: "18.1M subscribers",
    avatar: "/placeholder.svg?height=48&width=48",
    verified: true,
  },
  {
    id: "4",
    name: "Veritasium",
    subscribers: "14.1M subscribers",
    avatar: "/placeholder.svg?height=48&width=48",
    verified: true,
  },
  {
    id: "5",
    name: "Linus Tech Tips",
    subscribers: "15.8M subscribers",
    avatar: "/placeholder.svg?height=48&width=48",
    verified: true,
  },
];

type SearchState = "idle" | "loading" | "success" | "error" | "no-results";

export default function Component() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchResults, setSearchResults] = useState<
    typeof mockChannelDatabase
  >([]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchState("loading");
    setSelectedChannel(null);

    // Simulate API call
    setTimeout(() => {
      const results = mockChannelDatabase.filter((channel) =>
        channel.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

      if (results.length > 0) {
        setSearchResults(results);
        setSearchState("success");
      } else {
        setSearchResults([]);
        setSearchState("no-results");
      }
    }, 1200); // Simulate network delay
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
            <div className="channel-list">
              {searchResults.map((channel) => {
                const isSelected = selectedChannel === channel.id;
                return (
                  <div
                    key={channel.id}
                    className={`channel-item ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedChannel(channel.id)}
                  >
                    <div className="channel-avatar-wrapper">
                      <img
                        src={channel.avatar || "/placeholder.svg"}
                        alt={channel.name}
                        width={40}
                        height={40}
                        className="channel-avatar"
                      />
                      {channel.verified && (
                        <div className="verified-badge">
                          <Check />
                        </div>
                      )}
                    </div>

                    <div className="channel-info">
                      <div className="channel-name">{channel.name}</div>
                      <div className="channel-handle">
                         &bull; {channel.subscribers}
                      </div>
                    </div>

                    <div
                      className={`channel-select-indicator ${
                        isSelected ? "selected" : "default hovered"
                      }`}
                    >
                      {isSelected && <Check />}
                    </div>
                  </div>
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
            <Button className="footer-btn">
              <Sparkles />
              Start Automation
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
