export interface SearchRequest {
    query: string;
}

export interface SuggestionData {
    id: number;
    query: string;
    count: number;
}

export interface SuggestResponse {
    message: string;
    data: SuggestionData[];
}
