#pragma once

#include <cstddef>

extern "C" {
const char* calculate_hash(const char* input, const char* algorithm, const char* hash_type);
const char* count_candidates(const char* config);
void start_search(const char* target_hash, const char* config);
int search_step();
void pause_search();
void resume_search();
void stop_search();
const char* get_search_result();
}
