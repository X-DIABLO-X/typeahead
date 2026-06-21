# LAZY SEARCH — Distributed TypeAhead System Architecture

> A production-grade, horizontally scalable TypeAhead Search API built with
> Node.js, React, PostgreSQL, and a Consistent-Hash-based 3-node Redis Cluster.

---

## Table of Contents
1. [High-Level System Overview](#1-high-level-system-overview)
2. [Container Topology (Docker Compose)](#2-container-topology-docker-compose)
3. [Request Flow — Suggest (Read Path)](#3-request-flow--suggest-read-path)
4. [Request Flow — Search (Write Path)](#4-request-flow--search-write-path)
5. [Consistent Hash Ring (Distributed Cache)](#5-consistent-hash-ring-distributed-cache)
6. [Write-Behind Batch Worker](#6-write-behind-batch-worker)
7. [Trending Score Algorithm (HN-Style)](#7-trending-score-algorithm-hn-style)
8. [Database Schema](#8-database-schema)
9. [Frontend (PixelQuest) Architecture](#9-frontend-pixelquest-architecture)
10. [API Surface](#10-api-surface)
11. [Performance & Tradeoffs](#11-performance--tradeoffs)

---

## 1. High-Level System Overview

```
                          ┌──────────────────────────────────────────┐
                          │              USER (Browser)              │
                          │         React 19 + Vite + TS             │
                          │       "PixelQuest" Arcade UI             │
                          └──────────────────┬───────────────────────┘
                                             │  HTTP / JSON
                                             │  (debounced 300ms)
                                             ▼
                          ┌──────────────────────────────────────────┐
                          │          EXPRESS API SERVER              │
                          │             (Node 22 / TS)               │
                          │  ┌────────────────────────────────────┐  │
                          │  │  /api/v1   : Direct DB (no cache)  │  │
                          │  │  /api/v2   : Cache-Aside + Ring    │  │
                          │  └────────────────────────────────────┘  │
                          └──┬─────────────┬─────────────┬───────────┘
                             │             │             │
                  read/write │             │ cache       │ analytics
                             ▼             ▼             ▼
              ┌──────────────────┐  ┌──────────────────────────────┐
              │   PostgreSQL 15  │  │  Redis Cluster (3 nodes)     │
              │   (single node)  │  │  ├─ redis-1  : port 6382      │
              │   port 5437      │  │  ├─ redis-2  : port 6383      │
              │                  │  │  └─ redis-3  : port 6384      │
              │  Table:          │  │                              │
              │   SearchQuery    │  │  Keys:                       │
              │  (id,query,count)│  │   ├─ <prefix>  (STRING 60s)  │
              └──────────────────┘  │   └─ trending_searches (ZSET) │
                                   └──────────────────────────────┘
```

---

## 2. Container Topology (Docker Compose)

```
              ┌──────────────── docker host (your machine) ────────────────┐
              │                                                            │
              │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
              │  │   redis-1    │    │   redis-2    │    │   redis-3    │  │
              │  │  6379→6382   │    │  6379→6383   │    │  6379→6384   │  │
              │  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
              │         │                   │                   │          │
              │         └───────────────────┼───────────────────┘          │
              │                             │  (Hash Ring routing)         │
              │                             ▼                              │
              │  ┌────────────────────────────────────────────────────┐    │
              │  │                   backend  (Node)                  │    │
              │  │    Port 5000→5100  (Express + Prisma + redis)      │    │
              │  │    ENVs:  DATABASE_URL, REDIS_URLS (csv)           │    │
              │  └─────────────┬──────────────────────┬───────────────┘     │
              │                │                      │                     │
              │                ▼                      │                     │
              │  ┌──────────────────────┐             │                     │
              │  │      postgres        │             │                     │
              │  │  5432→5437           │             │                     │
              │  │  Healthcheck: pg_isready           │                     │
              │  └────────────┬─────────┘             │                     │
              │               │ (runs once)           │                     │
              │               ▼                       │                     │
              │  ┌──────────────────────┐             │                     │
              │  │   setup container    │             │                     │
              │  │ prisma generate      │             │                     │
              │  │ prisma db push       │             │                     │
              │  │ prisma db seed       │             │                     │
              │  │  (100k Norvig words) │             │                     │
              │  └──────────────────────┘             │                     │
              │                                       │                     │
              │  ┌─────────────────────────────────────▼───────────────┐    │
              │  │              frontend  (Vite dev server)            │    │
              │  │             Port 5173  (React 19 + TS)              │    │
              │  └─────────────────────────────────────────────────────┘    │
              │                                                             │
              └─────────────────────────────────────────────────────────────┘ 

  Boot order (depends_on):  postgres(healthy) → setup(success) → backend → frontend
```

---

## 3. Request Flow — Suggest (Read Path)

This is the hot path. The frontend debounces keystrokes by 300ms before
hitting the API. V2 is cache-first via the Redis Hash Ring.

```
   User types "ap"
        │
        ▼
   ┌────────────────┐  300ms debounce        ┌────────────────────────┐
   │  SearchBox     │ ───────────────────────▶│  GET /api/v2/suggest   │
   │  (React)       │  q=ap                  │       ?q=ap            │
   └────────────────┘                         └───────────┬────────────┘
                                                          │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │  v2/suggestion.route.ts  │
                                            │  ─ lowercases the key    │
                                            │  ─ calls distributedRedis│
                                            └──────────┬───────────────┘
                                                       │
                                  q="ap" ──hash()──▶  │  (MD5, O(log n) bsearch)
                                                       ▼
                                            ┌──────────────────────────┐
                                            │   Hash Ring              │
                                            │   decides OWNER node     │
                                            │   (e.g. redis-2)         │
                                            └──────────┬───────────────┘
                                                       │
                       ┌──────────── cache HIT ─────────┴──────── cache MISS ────────┐
                       │                                                          │
                       ▼                                                          ▼
        ┌─────────────────────────────┐                  ┌─────────────────────────────┐
        │  Parse JSON, return         │                  │  Prisma  query              │
        │  {message:"cache hit",      │                  │   SearchQuery.findMany({    │
        │   data:[...]}               │                  │     where: { query: {       │
        │  (60s TTL on the key)       │                  │       startsWith: "ap"      │
        └─────────────┬───────────────┘                  │     }},                     │
                      │                                  │     orderBy: { count: desc }│
                      │                                  │     take: 10                │
                      │                                  │   })                        │
                      │                                  └────────────┬────────────────┘
                      │                                               │
                      │                                  ┌────────────▼────────────┐
                      │                                  │  setEx("ap", 60, json)  │
                      │                                  │  on the OWNER node      │
                      │                                  └────────────┬────────────┘
                      │                                               │
                       └──────────────────┬────────────────────────────┘
                                         ▼
                              ┌──────────────────────┐
                              │  JSON Response →     │
                              │  Frontend renders    │
                              │  dropdown list       │
                              └──────────────────────┘
```

---

## 4. Request Flow — Search (Write Path)

When a user commits a query (Enter or click), the frontend POSTs to
`/api/v1/search`. The backend returns instantly — the actual DB write is
deferred by the Batch Worker.

```
   User presses ENTER on "apple"
        │
        ▼
   ┌────────────────┐                         ┌────────────────────────┐
   │  SearchBox     │ ───────────────────────▶│  POST /api/v1/search   │
   │  onSubmit      │  body={query:"apple"}   │  (also exposed under   │
   └────────────────┘                         │   /api/v2/search as    │
                                             │   an alias)            │
                                             └───────────┬────────────┘
                                                         │
                                                         ▼
                                            ┌──────────────────────────┐
                                            │  v1/search.route.ts      │
                                            │  ─ validates query       │
                                            │  ─ calls saveSearchQuery │
                                            └──────────┬───────────────┘
                                                       │
                                                       ▼
                                            ┌──────────────────────────┐
                                            │ search.service.ts        │
                                            │ ─ lowercases "apple"     │
                                            │ ─ pushes to searchQueue  │
                                            │   (in-memory Array)      │
                                            │ ─ if length ≥ 1000       │
                                            │   → flushQueue() (early) │
                                            │ ─ returns immediately    │
                                            │   {queued:true}          │
                                            └──────────┬───────────────┘
                                                       │ (every 5s OR ≥1000)
                                                       ▼
                                            ┌──────────────────────────┐
                                            │  flushQueue()  (worker)  │
                                            │  1. drain queue          │
                                            │  2. dedupe + count       │
                                            │  3. build $transaction   │
                                            │  4. execute in Postgres  │
                                            │  5. compute HN score     │
                                            │  6. ZADD trending ZSET   │
                                            └──────────────────────────┘
```

---

## 5. Consistent Hash Ring (Distributed Cache)

The core of the cache layer. Implemented in
`Backend/src/utils/ConsistentHash.ts`.

```
                          Concept of the Hash Ring
                          ────────────────────────

            0°                                              360°
             ┌─────────────────────────────────────────────┐
             │ . . . . . . . . . . . . . . . . . . . . . .│
        330°│                                             │ 30°
             │      ⬤  ⬤  ⬤  ⬤         ⬤  ⬤  ⬤  ⬤         │
             │  r1 v-node  r2 v-node    r3 v-node         │
             │                                             │
             │                  ★ hash("ap") = 142°        │
             │                  (walks clockwise)          │
             │                                             │
       270°  │                                             │  90°
             │                                             │
             │      ⬤  ⬤  ⬤  ⬤         ⬤  ⬤  ⬤  ⬤         │
             │                                             │
             │                                             │
       210°  └─────────────────────────────────────────────┘  150°
                              180°

   Each PHYSICAL redis node spawns 100 VIRTUAL nodes (vnodes)
   placed at pseudo-random positions on the ring.  This smooths
   out the load distribution.


                          Lookup algorithm  (O(log n) bsearch)
                          ───────────────────────────────────

   input  : key = "ap"
   step 1 : hash = MD5("ap")[0..7]  →  integer H
   step 2 : binary-search `keys[]` for the first vnode ≥ H
   step 3 : the OWNER of that vnode owns this key


   Concretely (sample distribution):
   ─────────────────────────────────
   key    | hash bucket | owner node
   ───────|─────────────|────────────
   "ap"   | 0x1a3b…     | redis-2
   "app"  | 0x7f02…     | redis-1
   "apple"| 0xc4e9…     | redis-3
   "ban"  | 0x29ac…     | redis-2
   "cat"  | 0x8d11…     | redis-1
```

### The "Magic Wrapper" (`config/redis.ts`)

```
   ┌──────────────────────────────────────────────────────────┐
   │  distributedRedisClient   (singleton proxy)              │
   │  ────────────────────────────────────────────────────   │
   │                                                          │
   │   getNodeUrlFor(key)  ──▶  hashRing.getNode(key)         │
   │   getClientFor(key)   ──▶  clients.get(ownerUrl)         │
   │   get(key)            ──▶  ownerClient.get(key)          │
   │   setEx(k,ttl,val)    ──▶  ownerClient.setEx(...)        │
   │   zAdd(k,score,m)     ──▶  ownerClient.zAdd(...)         │
   │   zRange(k,s,e,opt)   ──▶  ownerClient.zRange(...)       │
   │                                                          │
   │  App code never sees the per-node clients.               │
   │  Adding a 4th node = re-construct the ring,              │
   │  re-route 1/N keys automatically.                        │
   └──────────────────────────────────────────────────────────┘
```

### Live Debug Endpoint

`GET /api/v2/cache/debug?prefix=apple` — handy for visualising
the ring from the browser or `curl`.

```
   $ curl 'http://localhost:5000/api/v2/cache/debug?prefix=apple'
   {
     "prefix": "apple",
     "target_node": "redis://redis-3:6379",
     "message": "Consistent Hashing assigned prefix 'apple' to node: redis://redis-3:6379"
   }
```

---

## 6. Write-Behind Batch Worker

Implemented in `Backend/src/services/search.service.ts`.
Goal: decouple ingestion from disk I/O to survive 10k+ RPS.

```
   ┌────────────────────── In-Memory searchQueue (Array<string>) ──────────────────────┐
   │                                                                                    │
   │   POST /search ──▶ push("apple")  ──▶ [ "apple" , "banana" , "apple" , ... ]      │
   │   POST /search ──▶ push("banana")                                                │
   │   POST /search ──▶ push("apple")                                                 │
   │                                                                                    │
   └────────────────────┬───────────────────────────────────────────┬───────────────────┘
                        │                                           │
            length ≥ 1000                               every 5000 ms (setInterval)
                        │                                           │
                        └──────────────────┬────────────────────────┘
                                           ▼
                              ┌─────────────────────────┐
                              │  flushQueue()            │
                              │  ─────────────────────── │
                              │  1. snapshot + reset     │
                              │  2. dedupe → counts{}    │
                              │  3. prisma.$transaction( │
                              │       upserts )          │
                              │  4. for each result:     │
                              │      score = log10(count) │
                              │             + now/45000   │
                              │      ZADD trending       │
                              │  5. on error → re-queue   │
                              └─────────────────────────┘

   Timing diagram
   ──────────────
   time   0s          5s          10s         15s
          │           │           │           │
   reqs:  ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░ ░▒▓█▓▒░
   flush:      ▲           ▲           ▲
              1           2           3       ← one bulk tx per flush
          (also: size-triggered flush if queue length hits 1000)
```

---

## 7. Trending Score Algorithm (HN-Style)

A blended recency + popularity score — the same family of formula
used by Hacker News and Reddit.

```
   score(query)  =  log10( count )   +   ( currentTimestampSeconds / 45000 )
                   ─────────────         ─────────────────────────────────────
                       │                              │
                       │                              └─ recency boost
                       │                                 (≈1 unit per 12.5h)
                       └─ logarithmic popularity boost
                          (diminishing returns for very common words)


   Worked example
   ──────────────
   t = 1,716,453,600 s,  count("apple") = 50,000

   score = log10 + (1716453600 / 45000)
         = 4.699         + 38143.4
         = 38148.10


   Why this works
   ──────────────
   • A word with count=1   gets ~0.0 from popularity, so it only
     appears if it was searched very recently.
   • A word with count=1M  gets only +6 from popularity, so a fresh
     new query can still out-rank a stale popular one.
   • The /45000 divisor was chosen so that "recency" dominates the
     score but "popularity" still gives a small tie-breaker boost.


   Storage
   ───────
   Redis ZSET  "trending_searches"
       member : <query string>
       score  : <blended score>

   Read:  ZREVRANGE  trending_searches  0  9
          → top-10 most trending at this instant
```

---

## 8. Database Schema

PostgreSQL, accessed through Prisma 7 with the `pg` adapter.
Only one table — the system is intentionally minimal.

```
   ┌───────────────────────────────────────────────────┐
   │                     SearchQuery                    │
   ├──────────┬───────────────┬────────────────────────┤
   │ Column   │ Type          │ Notes                  │
   ├──────────┼───────────────┼────────────────────────┤
   │ id       │ Int (PK)      │ auto-increment         │
   │ query    │ String (UNIQUE)│ lowercased, indexed    │
   │ count    │ BigInt        │ holds counts > 2³¹     │
   └──────────┴───────────────┴────────────────────────┘

   Why BigInt?
   ──────────
   The seed loads Peter Norvig's Google Web Trillion Word N-Grams
   corpus, where top words ("the", "of", …) have multi-billion
   occurrences.  Int would silently overflow.

   Prisma wire-format workaround:
   ──────────────────────────
   (BigInt.prototype as any).toJSON = function () {
       return Number(this);
   };
   // ↑ in server.ts — converts BigInts to numbers during JSON
   //   serialization.  Loses precision past 2^53, but is fine
   //   for the top-10 UI and the HN score (which only uses
   //   log10 anyway).
```

---

## 9. Frontend (PixelQuest) Architecture

A React 19 + Vite + TypeScript single-page app. The "arcade cabinet"
look is purely CSS (CRT scanlines, marquee, joystick) — the search
behaviour is a standard debounced async typeahead.

```
   index.html
       │
       ▼
   main.tsx  ──▶  <App />          (App.tsx — the cabinet shell)
                       │
                       ▼
                  <SearchBox />   (components/SearchBox.tsx)
                       │
       ┌───────────────┼──────────────────────────┐
       │               │                          │
       ▼               ▼                          ▼
   useEffect         useEffect                  useState
   fetch trending    debounced                  (query, suggestions,
   on mount         suggest fetch               selectedIndex, score,
   (300ms)          (300ms)                     hiScore, shake, …)
       │               │                          │
       └───────────────┴──────────────────────────┘
                       │
                       ▼
                  fetch to /api/v2/*
                  (proxied by Vite in dev — see vite.config.ts)

   Component state machine (simplified)
   ────────────────────────────────────
                       ┌─────────────┐
                       │   IDLE      │ ◀────────────┐
                       │  (no input) │              │
                       └──────┬──────┘              │
                              │ onChange            │ onBlur / Esc
                              ▼                     │
                       ┌─────────────┐              │
                       │  TYPING     │  debounce    │
                       │  + spinner  │ ─────────┐   │
                       └──────┬──────┘          │   │
                              │                 │   │
                              ▼                 ▼   │
                       ┌─────────────┐     ┌────────────┐
                       │  RESULTS    │     │  LOADING   │
                       │  dropdown   │     │  spinner   │
                       └──────┬──────┘     └────────────┘
                              │ onKeyDown(Enter) / click
                              ▼
                       POST /api/v1/search    ──▶ score++, shake anim
                              │
                              ▼
                       returns to IDLE


   Config / proxy
   ──────────────
   Frontend/src/config.ts
       API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ""
       API_V1 = `${API_BASE_URL}/api/v1`
       API_V2 = `${API_BASE_URL}/api/v2`
   In dev, Vite proxies /api/* → backend :5000, so the empty-string
   default works.  For direct curl, set VITE_API_BASE_URL.
```

---

## 10. API Surface

```
   ┌─────────────────────────────────────────────────────────────────────┐
   │  Version 1  (no cache)                                              │
   ├────────────────────┬────────────────────────────────────────────────┤
   │  GET  /api/v1/suggest?q=<p>     │  Prisma startsWith, top-10        │
   │  POST /api/v1/search  {query}   │  Enqueue to in-memory batch       │
   └────────────────────┴────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────────────┐
   │  Version 2  (cache-aside + ring + trending)                         │
   ├────────────────────┬────────────────────────────────────────────────┤
   │  GET  /api/v2/suggest?q=<p>     │  Hash-Ring → Redis → if miss,     │
   │                                 │  query DB then setEx(60s)         │
   │  POST /api/v2/search  {query}   │  Re-export of v1 search route     │
   │  GET  /api/v2/trending          │  ZREVRANGE trending_searches 0 9  │
   │  GET  /api/v2/cache/debug?prefix│  Inspect which node owns a key    │
   └────────────────────┴────────────────────────────────────────────────┘
```

---

## 11. Performance & Tradeoffs

Measured with `autocannon` (100 connections × 10 pipelined, 15s).

```
   ┌──────────────────────────┬────────────┬────────────┬──────────────┐
   │  Endpoint                │  RPS       │  Avg Lat.  │  Note        │
   ├──────────────────────────┼────────────┼────────────┼──────────────┤
   │  POST /api/v1/search     │   6,969    │   237 ms   │  write-behind│
   │  GET  /api/v1/suggest    │     619    │ 6,096 ms   │  no cache    │
   │  GET  /api/v2/suggest    │   6,857    │   614 ms   │  hash ring   │
   └──────────────────────────┴────────────┴────────────┴──────────────┘

   Cached read is ~11× faster and ~10× lower-latency than uncached.


   Design tradeoffs
   ────────────────
   ┌──────────────────────┬──────────────────────────────────┬──────────────────────────────────┐
   │ Decision             │ Pro                              │ Con                              │
   ├──────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
   │ In-memory search     │ +10k RPS, no DB bottleneck       │ − up to 5s of searches lost on   │
   │ queue + batch flush  │   on writes                      │   crash (acceptable for trends)  │
   ├──────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
   │ Consistent hash ring │ + horizontal scale-out, only     │ − no replication → node loss =   │
   │ (no replicas)        │   1/N keys reshuffled on resize  │   cache miss for those keys      │
   ├──────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
   │ 60s cache TTL        │ + simple, bounded staleness      │ − suggestions may lag a burst    │
   │                      │                                  │   for up to a minute             │
   ├──────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
   │ BigInt → Number in   │ + clean JSON wire format         │ − silent precision loss past 2⁵³ │
   │ JSON                 │                                  │   (only used for top-10 UI)      │
   ├──────────────────────┼──────────────────────────────────┼──────────────────────────────────┤
   │ HN-style trending    │ + no decay-job needed, hot       │ − "eternal" hot terms retain a   │
   │ score in ZSET        │   queries naturally outrank cold │   tiny log10 boost forever       │
   └──────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

---

## File Map

```
   typeahead/
   ├── docker-compose.yml             # 6-service stack
   ├── README.md                      # Quick-start
   ├── benchmark_report.md            # autocannon numbers
   ├── architecture.md                # ← this file
   │
   ├── Backend/
   │   ├── prisma/
   │   │   ├── schema.prisma          # SearchQuery model
   │   │   └── seed.ts                # 100k Norvig n-grams
   │   └── src/
   │       ├── server.ts              # Express bootstrap, BigInt JSON
   │       ├── index.ts               # app.listen
   │       ├── config/
   │       │   ├── db.ts              # Prisma + pg pool
   │       │   └── redis.ts           # Hash ring wrapper  ◀ key piece
   │       ├── routes/
   │       │   ├── v1/  {index, suggest, search}
   │       │   └── v2/  {index, suggest, search*, cache, trending}
   │       ├── services/
   │       │   ├── suggestion.service.ts   # Prisma startsWith
   │       │   └── search.service.ts       # Write-behind batcher
   │       └── utils/
   │           └── ConsistentHash.ts       # MD5 ring + bsearch
   │
   └── Frontend/
       ├── vite.config.ts             # /api → :5000 proxy
       └── src/
           ├── App.tsx                # arcade cabinet shell
           ├── components/SearchBox.tsx  # debounced typeahead
           └── config.ts              # API_V1 / API_V2
```

---

*End of architecture document.*
