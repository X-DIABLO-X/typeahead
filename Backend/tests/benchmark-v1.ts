import autocannon from 'autocannon';

const formatResult = (result: autocannon.Result, name: string) => {
    console.log(`\n==========================================`);
    console.log(`BENCHMARK RESULT: ${name}`);
    console.log(`==========================================`);
    console.log(`Completed Requests:  ${result.requests.total}`);
    console.log(`Req/Sec (Avg):       ${result.requests.average}`);
    console.log(`Latency (Avg):       ${result.latency.average || 0} ms`);
    console.log(`Non-2xx Responses:   ${result.non2xx}`);
    console.log(`Errors:              ${result.errors}`);
    console.log(`Timeouts:            ${result.timeouts}`);
    console.log(`==========================================\n`);
    
    if (result.requests.total > 0) {
        console.log(autocannon.printResult(result));
    } else {
        console.log("[WARNING] No successful requests to generate percentile tables. The server was completely overwhelmed.");
    }
};

async function runBenchmarks() {
    console.log("Starting V1 Benchmark Suite (PostgreSQL Only)...");
    console.log("[WARNING] Make sure your backend server is running on port 5000!\n");

    // --- PHASE 1: The GET Assault (V1 - No Cache) ---
    console.log("[Phase 1/2] Blasting GET /api/v1/suggest (PostgreSQL Only)...");
    const v1Result = await autocannon({
        url: 'http://localhost:5000/api/v1/suggest?q=app',
        connections: 1000,
        pipelining: 20,
        duration: 15
    });
    formatResult(v1Result, "GET /api/v1/suggest (PostgreSQL)");

    // --- PHASE 2: The POST Assault ---
    console.log("[Phase 2/2] Blasting POST /api/v1/search (Database Writes)...");
    const postResult = await autocannon({
        url: 'http://localhost:5000/api/v1/search',
        method: 'POST',
        body: JSON.stringify({ query: 'benchmark_test_word' }),
        headers: {
            'Content-type': 'application/json'
        },
        connections: 1000,
        pipelining: 20,
        duration: 15
    });
    formatResult(postResult, "POST /api/v1/search (Write Speed)");

    console.log("[SUCCESS] V1 Benchmark Complete!");
}

runBenchmarks().catch(console.error);
