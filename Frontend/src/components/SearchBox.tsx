import { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import "./SearchBox.css";
import { API_V1, API_V2 } from "../config";

interface Suggestion {
  id: number;
  query: string;
  count: number;
}

const GITHUB_USERNAME = "X-DIABLO-X";
const GITHUB_URL = `https://github.com/${GITHUB_USERNAME}`;

export default function SearchBox() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [trending, setTrending] = useState<string[]>([]);

  // Fun random words for "Feeling Lucky" — picks one at random
  const RANDOM_WORDS = [
    "serendipity", "ephemeral", "petrichor", "sonder", "luminous",
    "vellichor", "crystalline", "wanderlust", "ethereal", "sussurus",
    "melancholy", "solitude", "twilight", "aurora", "zephyr",
    "infinity", "cascade", "gossamer", "quintessential", "epiphany",
    "labyrinth", "horizon", "stellar", "cascade", "ephemeral",
    "silhouette", "radiance", "whimsical", "jubilee", "nostalgia",
    "breathtaking", "magnificent", "extraordinary", "phenomenon", "symphony",
    "universe", "galaxy", "nebula", "cosmos", "velocity", "quantum",
    "adventure", "discovery", "treasure", "exploration", "expedition"
  ];
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isCached, setIsCached] = useState<boolean | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLHeadingElement>(null);
  const latencyRef = useRef<HTMLDivElement>(null);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaderTweenRef = useRef<gsap.core.Timeline | null>(null);

  // ── Logo entrance animation (the only GSAP animation kept) ───
  useEffect(() => {
    if (!logoRef.current) return;
    const original = logoRef.current.textContent ?? "";
    logoRef.current.innerHTML = original
      .split("")
      .map((ch) =>
        ch === " "
          ? "&nbsp;"
          : `<span class="logo-char" style="display:inline-block;opacity:0">${ch}</span>`
      )
      .join("");

    const ctx = gsap.context(() => {
      gsap.to(logoRef.current!.querySelectorAll(".logo-char"), {
        opacity: 1,
        y: 0,
        rotate: 0,
        duration: 0.55,
        stagger: 0.04,
        delay: 0.05,
        ease: "back.out(2)",
        from: { y: -80, rotate: gsap.utils.random(-25, 25) },
      });
    });

    return () => ctx.revert();
  }, []);

  // ── Logo hover wobble (the only GSAP animation kept) ─────────
  const handleLogoEnter = () => {
    if (!logoRef.current) return;
    gsap.to(logoRef.current, { rotation: -4, scale: 1.05, duration: 0.4, ease: "elastic.out(1.2, 0.4)" });
  };
  const handleLogoLeave = () => {
    if (!logoRef.current) return;
    gsap.to(logoRef.current, { rotation: -2, scale: 1, duration: 0.4, ease: "elastic.out(1.2, 0.4)" });
  };

  // ── Fetch Trending on mount ─────────────────────────────────────
  useEffect(() => {
    fetch(`${API_V2}/trending`)
      .then((res) => res.json())
      .then((result) => setTrending(result.data || []))
      .catch((err) => console.error("Failed to load trending:", err));
  }, []);

  // ── Stop the loader animation when not loading ───────────────────
  const stopLoader = useCallback(() => {
    if (loaderTweenRef.current) {
      loaderTweenRef.current.kill();
      loaderTweenRef.current = null;
    }
    if (loaderRef.current) {
      gsap.killTweensOf(loaderRef.current.querySelectorAll(".loader-dot"));
      gsap.set(loaderRef.current.querySelectorAll(".loader-dot"), {
        y: 0,
        opacity: 0.4,
      });
    }
  }, []);

  const startLoader = useCallback(() => {
    stopLoader();
    if (!loaderRef.current) return;
    const dots = loaderRef.current.querySelectorAll(".loader-dot");
    gsap.set(dots, { y: 0, opacity: 0.4 });
    loaderTweenRef.current = gsap.timeline({ repeat: -1 }).to(dots, {
      keyframes: [
        { y: 0, opacity: 0.4, duration: 0.25 },
        { y: -8, opacity: 1, duration: 0.25 },
        { y: 0, opacity: 0.4, duration: 0.25 },
        { y: 0, opacity: 0.4, duration: 0.35 },
      ],
      stagger: 0.12,
      ease: "power2.inOut",
    });
  }, [stopLoader]);

  // ── Debounced suggestions fetch with latency measurement ─────
  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    if (!query.trim()) {
      setSuggestions([]);
      setError(null);
      setIsLoading(false);
      setLatencyMs(null);
      setIsCached(null);
      stopLoader();
      return;
    }

    setIsLoading(true);
    setError(null);
    setLatencyMs(null);
    setIsCached(null);
    startLoader();

    debounceTimeout.current = setTimeout(async () => {
      const t0 = performance.now();
      try {
        const response = await fetch(
          `${API_V2}/suggest?q=${encodeURIComponent(query)}`
        );
        const elapsed = Math.round(performance.now() - t0);
        if (!response.ok) throw new Error("Network response was not ok");
        const result = await response.json();
        const data = result.data || [];
        setSuggestions(data);
        setSelectedIndex(-1);
        setLatencyMs(elapsed);
        setIsCached(
          typeof result.message === "string" &&
            result.message.toLowerCase().includes("cache")
        );
      } catch (err) {
        console.error("Failed to fetch suggestions:", err);
        setError("Failed to fetch suggestions. Please try again.");
        setLatencyMs(Math.round(performance.now() - t0));
      } finally {
        setIsLoading(false);
        stopLoader();
      }
    }, 150);

    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [query, startLoader, stopLoader]);

  // Stop loader when dropdown closes (focus lost)
  useEffect(() => {
    if (!isFocused) stopLoader();
  }, [isFocused, stopLoader]);

  // ── Keyboard navigation ─────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSearch(suggestions[selectedIndex].query);
      } else {
        handleSearch(query);
      }
    } else if (e.key === "Escape") {
      setIsFocused(false);
    }
  };

  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  const showDropdown =
    isFocused &&
    (suggestions.length > 0 || isLoading || error);

  // ── Commit a search (logs to backend, closes dropdown) ─────
  const commitSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    try {
      await fetch(`${API_V1}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
    } catch {
      console.error("Failed to save search:");
    }
  };

  // ── Search action (commit + open Google search) ─────────────
  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setQuery(searchQuery);
    setIsFocused(false);
    await commitSearch(searchQuery);
    // Redirect to Google search in a new tab
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // ── "I'm Feeling Lucky" — pick a fun random word (or fallback),
  //    fill the input with it, open the dropdown with its suggestions,
  //    log the search, and open Google results in a new tab.
  const handleFeelingLucky = async () => {
    let luckyTerm = "";
    // 70% chance to use a random fun word, 30% chance to use a trending term
    if (Math.random() < 0.7) {
      luckyTerm = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
    } else if (trending.length) {
      luckyTerm = trending[Math.floor(Math.random() * trending.length)];
    } else {
      luckyTerm = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
    }
    setQuery(luckyTerm);
    setIsFocused(true);
    inputRef.current?.focus();
    await commitSearch(luckyTerm);
    // Redirect to Google search in a new tab
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(luckyTerm)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // Color the latency chip based on speed (neobrutalism palette swap)
  // Thresholds: < 20ms green, < 30ms yellow, < 60ms orange, >= 60ms red
  const latencyTier =
    latencyMs == null
      ? "idle"
      : latencyMs < 20
      ? "green"
      : latencyMs < 30
      ? "yellow"
      : latencyMs < 60
      ? "orange"
      : "red";

  return (
    <>
      {/* GitHub profile circle (top-right) */}
      <a
        className="github-fab"
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`GitHub: ${GITHUB_USERNAME}`}
      >
        <span className="github-fab__avatar">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.05.78 2.12v3.14c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
          </svg>
        </span>
        <span className="github-fab__label">
          <span className="github-fab__name">@{GITHUB_USERNAME}</span>
          <span className="github-fab__sub">View on GitHub ↗</span>
        </span>
      </a>

      <div className="search-container" ref={containerRef}>
        <h1
          className="lazy-logo"
          ref={logoRef}
          onMouseEnter={handleLogoEnter}
          onMouseLeave={handleLogoLeave}
        >
          LAZY SEARCH
        </h1>

        <form
          style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(query);
          }}
        >
          <div className="search-wrapper" ref={wrapperRef}>
            <div className="input-row">
              {isLoading ? (
                <div className="loader" ref={loaderRef} aria-label="Loading">
                  <span className="loader-dot"></span>
                  <span className="loader-dot"></span>
                  <span className="loader-dot"></span>
                </div>
              ) : (
                <svg className="search-icon" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                </svg>
              )}
              <input
                ref={inputRef}
                type="text"
                className="search-input"
                placeholder="Type something cool..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                onKeyDown={handleKeyDown}
              />

              {/* Latency chip — pinned to the right side of the input row */}
              <div
                className={`latency-chip latency-chip--${latencyTier}`}
                ref={latencyRef}
                title={
                  isCached == null
                    ? "Latency of the last suggestion request"
                    : isCached
                    ? `Served from Redis cache in ${latencyMs} ms`
                    : `Fetched from Postgres in ${latencyMs} ms`
                }
              >
                <span className="latency-dot" />
                <span className="latency-text">
                  {latencyMs == null ? "—" : `${latencyMs} ms`}
                </span>
                <span className="latency-tag">
                  {isLoading ? "…" : isCached ? "CACHE" : isCached === false ? "DB" : "PING"}
                </span>
              </div>
            </div>

            {showDropdown && (
              <>
                <div className="dropdown-divider" />
                <ul className="suggestions-dropdown" ref={dropdownRef}>
                  {error && <div className="error-message">{error}</div>}
                  {suggestions.map((item, index) => (
                    <li
                      key={item.id}
                      className={`suggestion-item ${index === selectedIndex ? "selected" : ""}`}
                      onClick={() => handleSearch(item.query)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="suggestion-content">
                        <div className="suggestion-left">
                          <svg
                            className="search-icon-small"
                            focusable="false"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                          >
                            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                          </svg>
                          <span className="suggestion-text">{item.query}</span>
                        </div>
                        <span className="suggestion-count">{(item.count / 1000).toFixed(item.count >= 1000000 ? 0 : 1)}K</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Trending Ticker */}
          {trending.length > 0 && (
            <div className="trending-ticker">
              <span className="trending-label">🔥 TRENDING:</span>
              {trending.map((term, i) => (
                <span
                  key={i}
                  className="trending-term"
                  onClick={() => {
                    // Pre-fill the input with this trending term and focus it,
                    // so the user can review/edit before hitting Search.
                    setQuery(term);
                    setIsFocused(true);
                    inputRef.current?.focus();
                  }}
                >
                  {term}
                  {i < trending.length - 1 && <span className="trending-dot">•</span>}
                </span>
              ))}
            </div>
          )}

          <div className="action-buttons">
            <button type="submit" className="lazy-btn lazy-btn-primary">
              Search Now
            </button>
            <button
              type="button"
              className="lazy-btn lazy-btn-pink"
              onClick={handleFeelingLucky}
            >
              Feeling Lucky!
            </button>
          </div>
        </form>
      </div>
    </>
  );
}