# LAZY SEARCH (Distributed TypeAhead System)

A production-grade, highly scalable TypeAhead Search API built with Node.js, React, PostgreSQL, and a distributed Redis Cluster.

## Features & Architecture

### 1. Consistent Hashing (Distributed Cache)
Instead of relying on a single Redis node, this system implements a mathematically perfect **Consistent Hashing Algorithm**.
- A cryptographic MD5 "Hash Ring" distributes search prefixes evenly across a 3-node Redis cluster (`redis-1`, `redis-2`, `redis-3`).
- **100 Virtual Replicas** per node ensure smooth load balancing and prevent "hot-spotting" where one node handles disproportionate traffic.
- A "Magic Wrapper" dynamically routes `get` and `setEx` calls to the correct node based on the prefix using a binary search algorithm in $O(\log n)$ time.

### 2. Write-Behind Batching
To achieve 10,000+ Requests Per Second (RPS) without melting the PostgreSQL database, we decoupled ingestion from disk I/O.
- Incoming searches hit an **In-Memory Queue** (RAM) and return instantly.
- A **Background Aggregator Worker** drains the queue every 5 seconds (or if the queue exceeds 1,000 items) and aggregates duplicates.
- The worker executes a single bulk `prisma.$transaction`, reducing thousands of database calls to just 1.
- *Tradeoff:* In-memory queues trade durability for speed. If the server crashes, up to 5 seconds of search logs could be lost. For a non-financial analytics system like Trending Searches, this is an optimal tradeoff.

### 3. Blended Trending Searches Algorithm
We implemented a Hacker News / Reddit style ranking algorithm to determine "Trending" searches.
- Instead of pure recency (which allows obscure recent words to dominate) or pure popularity (which prevents new words from trending), we use a blended formula:
  $$ \text{Score} = \log_{10}(\text{Historical Count}) + \left(\frac{\text{Current Timestamp Seconds}}{45000}\right) $$
- This creates an exponential decay curve where highly popular words get a small logarithmic boost, but recency allows fresh queries to rise to the top.

### 4. 100k "Defensible" Dataset
The database is seeded with Peter Norvig's N-Grams corpus, featuring the top 100,000 real English words and their exact Google Web frequencies. We migrated the Prisma schema to use `BigInt` to support words with over 2 billion occurrences.

## Running Locally

1. Start the cluster:
```bash
docker compose up --build -d
```
2. The Database will automatically seed the 100k dataset.
3. Access the Frontend at `http://localhost:5173`.
4. Verify the cache distribution at `http://localhost:5000/api/v2/cache/debug?prefix=apple`.