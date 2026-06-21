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
    console.log("Starting V2 Benchmark Suite (Redis Caching)...");
    console.log("[WARNING] Make sure your backend server is running on port 5000!\n");

    // --- PHASE 1: The GET Assault (V2 - Redis Cache) ---
    console.log("[Phase 1/1] Blasting GET /api/v2/suggest (Redis Cache-Aside)...");
    const v2Result = await autocannon({
        url: 'http://localhost:5000/api/v2/suggest?q=app',
        connections: 1000,
        pipelining: 20,
        duration: 15
    });
    formatResult(v2Result, "GET /api/v2/suggest (Redis)");

    console.log("[SUCCESS] V2 Benchmark Complete!");
}

runBenchmarks().catch(console.error);
