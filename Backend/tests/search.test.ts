import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/server.js";

describe("TypeAhead API Tests", () => {
  
  it("GET /suggest - should return suggestions from the DB", async () => {
    // 1. Act: Send a GET request looking for words starting with "app"
    const response = await request(app).get("/suggest?q=app");

    // 2. Assert: Check if the response matches what we expect
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("search suggestions");
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("POST /search - should save a query successfully", async () => {
    // 1. Act: Send a POST request with the query "apple"
    const response = await request(app)
        .post("/search")
        .send({ query: "apple" });

    // 2. Assert: Check if it was saved
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Search saved successfully");
    expect(response.body.data.query).toBe("apple");
  });

});
